// Instagram Reel resolver.
//
// Given a public Instagram reel/post URL, resolve it to a direct, downloadable
// video URL plus a little metadata (thumbnail, caption, author). We use the
// same logged-out web GraphQL queries Instagram's own website makes for
// anonymous visitors, sent to `/api/graphql` with the page's `lsd` token, and
// fall back to scraping the embed page if those are blocked.
//
// This only works for PUBLIC content — private accounts require a logged-in
// session and are intentionally out of scope.
//
// History: until late 2026 the shortcode query could be POSTed to
// `/graphql/query` with only an anonymous csrftoken. Instagram now answers
// those logged-out calls with 401 `{"require_login": true}` for every post, so
// the queries go to `/api/graphql` instead, which additionally requires the
// `lsd` token embedded in the homepage HTML (header `X-FB-LSD` + form field).

/** Instagram's public web app id — sent as X-IG-App-ID on web API calls. */
const IG_APP_ID = '936619743392459';

/** Sent as X-ASBD-ID by the logged-out web app on `/api/graphql` calls. */
const IG_ASBD_ID = '359341';

// Instagram's persisted GraphQL queries. Instagram rotates these doc_ids
// periodically; if resolution starts failing site-wide, these are the first
// thing to refresh (grab the current values from a logged-out browser's
// network tab, or from an up-to-date scraper like yt-dlp or instaloader).
//
// 1) Post/reel by shortcode → xdt_api__v1__media__shortcode__web_info.items[0]
const SHORTCODE_QUERY = {
  docId: '27128499623469141',
  friendlyName: 'PolarisPostActionLoadPostQueryQuery',
} as const;
// 2) Post/reel by numeric media id → xig_polaris_media.if_not_gated_logged_out
//    (the query the logged-out desktop post page itself runs).
const MEDIA_ID_QUERY = {
  docId: '27130156389949648',
  friendlyName: 'PolarisLoggedOutDesktopWWWPostRootContentQuery',
} as const;

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export interface ReelMedia {
  shortcode: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string;
  author: string | null;
  /** A friendly, filesystem-safe filename (without extension). */
  filename: string;
}

export class ReelError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'ReelError';
    this.status = status;
  }
}

/**
 * Extract the shortcode from any of Instagram's shareable URL shapes:
 *   instagram.com/reel/{code}/          instagram.com/reels/{code}/
 *   instagram.com/p/{code}/             instagram.com/tv/{code}/
 *   instagram.com/{user}/reel/{code}/   (and share/… redirect links)
 */
export function extractShortcode(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  if (!/(^|\.)instagram\.com$/.test(host)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  const kinds = new Set(['reel', 'reels', 'p', 'tv']);
  const idx = segments.findIndex((s) => kinds.has(s));
  if (idx === -1 || !segments[idx + 1]) return null;

  const code = segments[idx + 1];
  // Shortcodes are drawn from the URL-safe base64 alphabet.
  return /^[A-Za-z0-9_-]+$/.test(code) ? code : null;
}

/** CDN hosts we are willing to stream from in the download proxy. */
export function isAllowedMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.endsWith('.cdninstagram.com') ||
    host.endsWith('.fbcdn.net') ||
    host === 'cdninstagram.com'
  );
}

function safeFilename(shortcode: string, author: string | null): string {
  const base = [author, shortcode].filter(Boolean).join('-') || 'reel';
  return base.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

/**
 * Shortcodes are the numeric media id written in a URL-safe base64 alphabet.
 * Longer codes (private/"only followers" shares) carry an extra suffix that is
 * not part of the id.
 */
const SHORTCODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function shortcodeToMediaId(shortcode: string): string | null {
  const code = shortcode.length > 28 ? shortcode.slice(0, -28) : shortcode;
  let id = 0n;
  for (const ch of code) {
    const idx = SHORTCODE_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    id = id * 64n + BigInt(idx);
  }
  return id === 0n ? null : id.toString();
}

interface WebSession {
  cookie: string;
  csrfToken: string;
  lsdToken: string;
}

/**
 * Instagram's logged-out GraphQL endpoint needs two anonymous tokens, both
 * handed out by the homepage: the `csrftoken` cookie (echoed back as the
 * `X-CSRFToken` header) and the `lsd` token embedded in the page's inline
 * JSON (sent as `X-FB-LSD` header AND `lsd` form field). Without the lsd token
 * the endpoint answers "Rate limit exceeded"; without the cookie it returns 403.
 */
async function getWebSession(): Promise<WebSession | null> {
  const res = await fetch('https://www.instagram.com/', {
    headers: {
      'User-Agent': DESKTOP_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    },
    redirect: 'manual',
    cache: 'no-store',
  });
  if (!res.ok) {
    console.warn(`[reels] instagram homepage returned ${res.status}`);
    return null;
  }

  const setCookies = res.headers.getSetCookie?.() ?? [];
  const pairs: string[] = [];
  let csrfToken = '';
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    pairs.push(`${name}=${value}`);
    if (name === 'csrftoken') csrfToken = value;
  }

  const html = await res.text();
  const lsdToken =
    html.match(/\["LSD",\[\],\{"token":"([^"]+)"/)?.[1] ??
    html.match(/"lsd":\{"token":"([^"]+)"/)?.[1] ??
    '';

  if (!csrfToken || !lsdToken) {
    console.warn(
      `[reels] instagram homepage gave no ${!csrfToken ? 'csrftoken' : 'lsd token'}`
    );
    return null;
  }
  return { cookie: pairs.join('; '), csrfToken, lsdToken };
}

/**
 * POST a persisted query to Instagram's logged-out `/api/graphql` endpoint,
 * the way the anonymous web app does. Returns the parsed JSON body (which may
 * still carry an `errors` array) or null on a transport/HTTP failure.
 */
async function postGraphql(
  session: WebSession,
  shortcode: string,
  query: { docId: string; friendlyName: string },
  variables: Record<string, unknown>
): Promise<any | null> {
  const body = new URLSearchParams({
    lsd: session.lsdToken,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: query.friendlyName,
    server_timestamps: 'true',
    doc_id: query.docId,
    variables: JSON.stringify(variables),
  });

  const res = await fetch('https://www.instagram.com/api/graphql', {
    method: 'POST',
    headers: {
      'User-Agent': DESKTOP_UA,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://www.instagram.com',
      Referer: `https://www.instagram.com/reel/${shortcode}/`,
      'X-IG-App-ID': IG_APP_ID,
      'X-ASBD-ID': IG_ASBD_ID,
      'X-IG-WWW-Claim': '0',
      'X-CSRFToken': session.csrfToken,
      'X-FB-LSD': session.lsdToken,
      'X-FB-Friendly-Name': query.friendlyName,
      'X-Requested-With': 'XMLHttpRequest',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      Cookie: session.cookie,
    },
    body,
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) {
    console.warn(
      `[reels] ${query.friendlyName} ${shortcode}: HTTP ${res.status} ${text.slice(0, 200)}`
    );
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`[reels] ${query.friendlyName} ${shortcode}: non-JSON body`);
    return null;
  }
}

/** Pull a downloadable reel out of Instagram's Polaris web-info media item. */
function mediaFromItem(shortcode: string, item: any): ReelMedia {
  // Reels are single videos; carousels nest their media one level down.
  const videoItem =
    item?.video_versions?.length
      ? item
      : item?.carousel_media?.find((m: any) => m?.video_versions?.length);
  const videoUrl: string | undefined = videoItem?.video_versions?.[0]?.url;
  if (!videoUrl) {
    throw new ReelError('That post has no video — reels and video posts only.', 422);
  }

  const author: string | null = item?.user?.username ?? null;
  const thumb =
    (videoItem?.image_versions2?.candidates ?? item?.image_versions2?.candidates)?.[0]?.url ??
    null;
  return {
    shortcode,
    videoUrl,
    thumbnailUrl: thumb,
    caption: item?.caption?.text ?? '',
    author,
    filename: safeFilename(shortcode, author),
  };
}

/**
 * Strategy 1: the shortcode → web_info query. Same persisted query the site
 * used on `/graphql/query`, now sent to `/api/graphql` with the lsd token.
 */
async function resolveViaShortcodeQuery(
  session: WebSession,
  shortcode: string
): Promise<ReelMedia | null> {
  const data = await postGraphql(session, shortcode, SHORTCODE_QUERY, {
    shortcode,
    __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
  });
  const item = data?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];
  if (!item) {
    if (data?.errors) {
      console.warn(`[reels] shortcode query ${shortcode}: ${JSON.stringify(data.errors[0])}`);
    }
    return null;
  }
  return mediaFromItem(shortcode, item);
}

/**
 * Strategy 2: the query the logged-out desktop post page itself runs, keyed by
 * numeric media id. Uses a different doc_id, so it keeps working if Instagram
 * retires the shortcode one (and vice versa).
 */
async function resolveViaMediaIdQuery(
  session: WebSession,
  shortcode: string
): Promise<ReelMedia | null> {
  const mediaId = shortcodeToMediaId(shortcode);
  if (!mediaId) return null;

  const data = await postGraphql(session, shortcode, MEDIA_ID_QUERY, { media_id: mediaId });
  const media = data?.data?.xig_polaris_media;
  const item = media?.if_not_gated_logged_out;
  if (!item) {
    if (media?.gating_ruling) {
      // Age/region/"followers only" gates need a logged-in viewer.
      throw new ReelError(
        'That reel can only be viewed when logged in to Instagram, so it cannot be downloaded here.',
        403
      );
    }
    if (data?.errors) {
      console.warn(`[reels] media_id query ${shortcode}: ${JSON.stringify(data.errors[0])}`);
    }
    return null;
  }
  return mediaFromItem(shortcode, item);
}

/** Strategy 3: scrape the video url / og:video from the public embed page. */
async function resolveViaEmbed(shortcode: string): Promise<ReelMedia | null> {
  const res = await fetch(`https://www.instagram.com/reel/${shortcode}/embed/captioned/`, {
    headers: { 'User-Agent': DESKTOP_UA, Accept: 'text/html' },
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const html = await res.text();

  // The embed page inlines the media as an escaped JSON blob; the video url
  // is the most reliable field to pull out of it.
  const videoUrl =
    matchJsonString(html, 'video_url') ??
    matchMeta(html, 'og:video') ??
    matchMeta(html, 'og:video:secure_url');
  if (!videoUrl) return null;

  const author = matchJsonString(html, 'username');
  return {
    shortcode,
    videoUrl,
    thumbnailUrl: matchJsonString(html, 'display_url') ?? matchMeta(html, 'og:image'),
    caption: '',
    author,
    filename: safeFilename(shortcode, author),
  };
}

function matchMeta(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const m = html.match(re);
  return m ? decodeHtml(m[1]) : null;
}

function matchJsonString(html: string, key: string): string | null {
  // Handles both plain and backslash-escaped JSON found in embed HTML.
  const re = new RegExp(`\\\\?"${key}\\\\?":\\\\?"((?:[^"\\\\]|\\\\.)*?)\\\\?"`);
  const m = html.match(re);
  if (!m) return null;
  return decodeHtml(m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\"/g, '"'));
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Resolve a reel URL to a downloadable video + metadata. */
export async function resolveReel(inputUrl: string): Promise<ReelMedia> {
  const shortcode = extractShortcode(inputUrl);
  if (!shortcode) {
    throw new ReelError('Please paste a valid Instagram reel or post link.', 400);
  }

  // A ReelError thrown by a strategy that *did* reach the post (e.g. "no
  // video", "login required") is more useful than the generic failure, so
  // remember it while still giving the remaining strategies a chance.
  let knownError: ReelError | null = null;
  const attempt = async (fn: () => Promise<ReelMedia | null>) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ReelError) knownError = knownError ?? e;
      else console.warn(`[reels] ${shortcode}: ${(e as Error)?.message ?? e}`);
      return null;
    }
  };

  const session = await getWebSession().catch((e) => {
    console.warn(`[reels] homepage fetch failed: ${(e as Error)?.message ?? e}`);
    return null;
  });

  if (session) {
    const viaShortcode = await attempt(() => resolveViaShortcodeQuery(session, shortcode));
    if (viaShortcode) return viaShortcode;

    const viaMediaId = await attempt(() => resolveViaMediaIdQuery(session, shortcode));
    if (viaMediaId) return viaMediaId;
  }

  const viaEmbed = await attempt(() => resolveViaEmbed(shortcode));
  if (viaEmbed) return viaEmbed;

  if (knownError) throw knownError;
  throw new ReelError(
    'Could not fetch that reel. It may be private, removed, or Instagram is rate-limiting us. Please try again.',
    502
  );
}

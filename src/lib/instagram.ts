// Instagram Reel resolver.
//
// Given a public Instagram reel/post URL, resolve it to a direct, downloadable
// video URL plus a little metadata (thumbnail, caption, author). We try
// Instagram's logged-out web GraphQL query first (structured, works from server
// IPs with only an anonymous csrftoken) and fall back to scraping the embed
// page's og:video tag if that is blocked.
//
// This only works for PUBLIC content — private accounts require a logged-in
// session and are intentionally out of scope.

/** Instagram's public web app id — sent as X-IG-App-ID on web API calls. */
const IG_APP_ID = '936619743392459';

// Instagram's persisted GraphQL query for a post/reel by shortcode
// (PolarisPostRootQuery → xdt_api__v1__media__shortcode__web_info). Instagram
// rotates these doc_ids periodically; if resolution starts failing site-wide,
// this is the first thing to refresh (grab the current value from a logged-out
// browser's network tab, or from an up-to-date scraper like instaloader).
const POST_QUERY_DOC_ID = '27128499623469141';

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
 * Instagram's logged-out web GraphQL endpoint requires a valid csrftoken: a
 * matching `csrftoken` cookie AND `X-CSRFToken` header. We get one for free by
 * hitting the homepage once, then reuse its Set-Cookie on the query. Without
 * this the endpoint returns 403.
 */
async function getWebSession(): Promise<{ cookie: string; csrfToken: string } | null> {
  const res = await fetch('https://www.instagram.com/', {
    headers: { 'User-Agent': DESKTOP_UA, Accept: 'text/html' },
    cache: 'no-store',
  });
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
  if (!csrfToken) return null;
  return { cookie: pairs.join('; '), csrfToken };
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
 * Strategy 1: Instagram's logged-out web GraphQL query by shortcode. This is
 * the method public downloaders rely on — it works from server IPs without a
 * user login (only an anonymous csrftoken), unlike the app media-info API.
 */
async function resolveViaGraphql(shortcode: string): Promise<ReelMedia | null> {
  const session = await getWebSession();
  if (!session) return null;

  const body = new URLSearchParams({
    doc_id: POST_QUERY_DOC_ID,
    server_timestamps: 'true',
    variables: JSON.stringify({
      shortcode,
      __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
    }),
  });

  const res = await fetch('https://www.instagram.com/graphql/query', {
    method: 'POST',
    headers: {
      'User-Agent': DESKTOP_UA,
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-IG-App-ID': IG_APP_ID,
      'X-CSRFToken': session.csrfToken,
      'Sec-Fetch-Site': 'same-origin',
      Cookie: session.cookie,
    },
    body,
    cache: 'no-store',
  });

  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as any;
  const item = data?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];
  if (!item) return null;

  return mediaFromItem(shortcode, item);
}

/** Strategy 2: scrape og:video from the public embed page. */
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

  let apiError: unknown = null;
  try {
    const viaGraphql = await resolveViaGraphql(shortcode);
    if (viaGraphql) return viaGraphql;
  } catch (e) {
    if (e instanceof ReelError && e.status !== 422) throw e;
    apiError = e; // 422 "no video" — remember it, but still try the embed path
  }

  const viaEmbed = await resolveViaEmbed(shortcode).catch(() => null);
  if (viaEmbed) return viaEmbed;

  if (apiError instanceof ReelError) throw apiError;
  throw new ReelError(
    'Could not fetch that reel. It may be private, removed, or Instagram is rate-limiting us. Please try again.',
    502
  );
}

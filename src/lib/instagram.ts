// Instagram Reel resolver.
//
// Given a public Instagram reel/post URL, resolve it to a direct, downloadable
// video URL plus a little metadata (thumbnail, caption, author). We try the
// public web media API first (fast, structured) and fall back to scraping the
// embed page's og:video tag if that is blocked.
//
// This only works for PUBLIC content — private accounts require a logged-in
// session and are intentionally out of scope.

/** Instagram's public web app id — sent as X-IG-App-ID on web API calls. */
const IG_APP_ID = '936619743392459';

/** URL-safe base64 alphabet Instagram uses to encode media ids as shortcodes. */
const SHORTCODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

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

/** Convert a shortcode into the numeric media id the web API expects. */
export function shortcodeToMediaId(shortcode: string): string {
  let id = 0n;
  for (const char of shortcode) {
    const value = SHORTCODE_ALPHABET.indexOf(char);
    if (value === -1) throw new ReelError('That does not look like a valid reel link.', 400);
    id = id * 64n + BigInt(value);
  }
  return id.toString();
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

/** Strategy 1: the structured public web media API. */
async function resolveViaMediaApi(shortcode: string): Promise<ReelMedia | null> {
  const mediaId = shortcodeToMediaId(shortcode);
  const res = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
    headers: {
      'User-Agent':
        'Instagram 219.0.0.12.117 Android (30/11; 480dpi; 1080x2131; ' +
        'unknown/Android; SM-G973F; beyond1; exynos9820; en_US)',
      'X-IG-App-ID': IG_APP_ID,
      Accept: '*/*',
    },
    cache: 'no-store',
  });

  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as any;
  const item = data?.items?.[0];
  if (!item) return null;

  const videoUrl: string | undefined = item.video_versions?.[0]?.url;
  if (!videoUrl) {
    throw new ReelError('That post has no video — reels and video posts only.', 422);
  }

  const author: string | null = item.user?.username ?? null;
  return {
    shortcode,
    videoUrl,
    thumbnailUrl: item.image_versions2?.candidates?.[0]?.url ?? null,
    caption: item.caption?.text ?? '',
    author,
    filename: safeFilename(shortcode, author),
  };
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
    const viaApi = await resolveViaMediaApi(shortcode);
    if (viaApi) return viaApi;
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

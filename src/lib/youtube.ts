// YouTube video resolver.
//
// Given a public YouTube link (long video, Short, youtu.be, embed, live replay
// …), resolve it to metadata plus the list of downloadable qualities, using
// YouTube's own InnerTube player API through youtubei.js.
//
// YouTube no longer serves a combined audio+video file above 360p, so every
// quality is a pair of streams: an H.264 MP4 video track and an AAC audio
// track. The browser downloads both (in small chunks, through
// /api/youtube/stream) and merges them into one MP4 locally — no re-encoding
// and no heavy work on the server.
//
// Stream URLs are signed for the IP that requested them, so the chunk proxy
// resolves them itself (cached per warm server instance) instead of trusting a
// URL handed back by the browser. That also means it can never be used as an
// open proxy: it only accepts a video id + itag.
//
// Only PUBLIC videos work. Private, members-only and age-restricted videos
// need a signed-in account and are out of scope.

import { Innertube, Log } from 'youtubei.js';

Log.setLevel(Log.Level.NONE);

/** Largest byte range the chunk proxy will fetch in a single request. */
export const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

/** Highest video quality offered (keeps files a sane size on phones). */
const MAX_HEIGHT = 1080;

/**
 * Player clients tried in order. These app clients return plain, already
 * signed stream URLs, so no player JavaScript has to be downloaded or run.
 */
const CLIENTS = ['ANDROID_VR', 'IOS', 'VISIONOS'] as const;
type PlayerClient = (typeof CLIENTS)[number];

/** Timeouts so a stalled upstream can never hang a serverless function. */
const API_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 8_000;
const CHUNK_TIMEOUT_MS = 20_000;

const CACHE_TTL_MS = 60 * 60 * 1000; // stream URLs live ~6h; refresh well before
const CACHE_MAX_ENTRIES = 50;

export class YouTubeError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'YouTubeError';
    this.status = status;
  }
}

export interface QualityOption {
  /** Stable key, e.g. "1080p". */
  id: string;
  label: string;
  /** Short side of the frame (1080 for both 1920×1080 and a 1080×1920 Short). */
  height: number;
  fps: number;
  videoItag: number;
  videoSize: number;
  /** Total download size (video + audio) in bytes. */
  size: number;
}

export interface AudioOption {
  itag: number;
  size: number;
  bitrate: number;
}

export interface VideoDetails {
  id: string;
  title: string;
  author: string | null;
  durationSeconds: number;
  thumbnailUrl: string | null;
  isShort: boolean;
  qualities: QualityOption[];
  audio: AudioOption;
  /** A friendly, filesystem-safe filename (without extension). */
  filename: string;
}

interface StreamFormat {
  itag: number;
  url: string;
  size: number;
}

interface ResolvedVideo {
  details: VideoDetails;
  streams: Map<number, StreamFormat>;
  client: PlayerClient;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Link parsing
// ---------------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract the 11-character video id from any of YouTube's link shapes:
 *   youtube.com/watch?v={id}        youtu.be/{id}
 *   youtube.com/shorts/{id}         youtube.com/live/{id}
 *   youtube.com/embed/{id}          youtube.com/v/{id}
 *   m.youtube.com, music.youtube.com, youtube-nocookie.com, or a bare id.
 */
export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const segments = url.pathname.split('/').filter(Boolean);

  let id: string | null | undefined = null;
  if (host === 'youtu.be') {
    id = segments[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (segments[0] === 'watch' || segments.length === 0) {
      id = url.searchParams.get('v');
    } else if (['shorts', 'live', 'embed', 'v', 'e'].includes(segments[0])) {
      id = segments[1];
    }
  } else {
    return null;
  }

  return id && ID_RE.test(id) ? id : null;
}

// ---------------------------------------------------------------------------
// InnerTube session
// ---------------------------------------------------------------------------

let sessionPromise: Promise<Innertube> | null = null;

function getSession(fresh = false): Promise<Innertube> {
  if (fresh || !sessionPromise) {
    // generate_session_locally: false asks YouTube for real visitor data, which
    // gets far fewer "confirm you're not a bot" responses than a local one.
    sessionPromise = Innertube.create({
      retrieve_player: false,
      generate_session_locally: false,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(API_TIMEOUT_MS) }),
    }).catch((e) => {
      sessionPromise = null;
      throw e;
    });
  }
  return sessionPromise;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const cache = new Map<string, ResolvedVideo>();

function cacheSet(id: string, value: ResolvedVideo) {
  cache.delete(id);
  cache.set(id, value);
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function safeFilename(title: string, id: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[^\w\s.-]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 70);
  return (base ? `${base}-${id}` : `youtube-${id}`).replace(/_+/g, '_');
}

function bestThumbnail(thumbs: any[] | undefined, id: string): string {
  const sorted = [...(thumbs ?? [])].sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0));
  const url: string | undefined = sorted[0]?.url;
  // Strip resize params so we get the clean image; fall back to the static CDN.
  return url ? url.split('?')[0] : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Map YouTube's playability status to a friendly error, or null if playable. */
function playabilityError(ps: any): YouTubeError | null {
  const status: string | undefined = ps?.status;
  if (!status || status === 'OK') return null;
  const reason: string = ps?.reason || ps?.error_screen?.reason?.text || '';

  if (/not a bot/i.test(reason)) {
    return new YouTubeError(
      'YouTube is temporarily blocking requests from our server. Please try again in a minute.',
      503
    );
  }
  if (/age|inappropriate/i.test(reason)) {
    return new YouTubeError('This video is age-restricted, so it cannot be downloaded here.', 403);
  }
  if (/private/i.test(reason)) {
    return new YouTubeError('This video is private.', 403);
  }
  if (/members/i.test(reason)) {
    return new YouTubeError('This video is for channel members only.', 403);
  }
  if (status === 'LIVE_STREAM_OFFLINE' || /premiere|live event|scheduled/i.test(reason)) {
    return new YouTubeError("This video hasn't started yet. Try again once it has aired.", 422);
  }
  return new YouTubeError(reason || 'This video is unavailable.', 404);
}

function buildResolved(id: string, info: any, client: PlayerClient): ResolvedVideo | null {
  const basic = info?.basic_info ?? {};
  if (basic.is_live) {
    throw new YouTubeError(
      'Live streams can’t be downloaded while they are live. Try again after it ends.',
      422
    );
  }

  const formats: any[] = (info?.streaming_data?.adaptive_formats ?? []).filter(
    (f: any) => typeof f?.url === 'string' && Number(f?.content_length) > 0
  );
  if (!formats.length) return null;

  const streams = new Map<number, StreamFormat>();
  const remember = (f: any) =>
    streams.set(f.itag, { itag: f.itag, url: f.url, size: Number(f.content_length) });

  // Audio: AAC in MP4 (itag 140 = 128 kbps) so it can sit in an .mp4 file.
  const audioFormats = formats
    .filter((f) => /^audio\/mp4/.test(f.mime_type) && /mp4a/.test(f.mime_type))
    // Skip dubbed / descriptive tracks when the original is available.
    .filter((f, _i, all) =>
      all.some((x) => x.audio_track?.audio_is_default) ? f.audio_track?.audio_is_default ?? true : true
    )
    .sort((a, b) => (a.itag === 140 ? -1 : b.itag === 140 ? 1 : b.bitrate - a.bitrate));
  const audio = audioFormats[0];
  if (!audio) return null;
  remember(audio);

  // Video: MP4 only. Prefer H.264 (plays everywhere, incl. iPhone Photos); use
  // AV1 only for a quality that has no H.264 version.
  const videoFormats = formats.filter(
    (f) => /^video\/mp4/.test(f.mime_type) && /avc1|av01/.test(f.mime_type) && f.width && f.height
  );
  const byQuality = new Map<number, any>();
  for (const f of videoFormats) {
    // Group by YouTube's own label ("1080p60" → 1080) so odd frame sizes such
    // as a 608×1080 Short encode land in the right bucket.
    const shortSide = parseInt(f.quality_label, 10) || Math.min(f.width, f.height);
    if (shortSide > MAX_HEIGHT || shortSide < 144) continue;
    const current = byQuality.get(shortSide);
    const isAvc = /avc1/.test(f.mime_type);
    const currentIsAvc = current && /avc1/.test(current.mime_type);
    if (
      !current ||
      (isAvc && !currentIsAvc) ||
      (isAvc === currentIsAvc && (f.fps ?? 30) > (current.fps ?? 30)) ||
      (isAvc === currentIsAvc && (f.fps ?? 30) === (current.fps ?? 30) && f.bitrate > current.bitrate)
    ) {
      byQuality.set(shortSide, f);
    }
  }
  if (!byQuality.size) return null;

  const audioSize = Number(audio.content_length);
  const qualities: QualityOption[] = [...byQuality.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([height, f]) => {
      remember(f);
      const fps = Math.round(f.fps ?? 30);
      const videoSize = Number(f.content_length);
      return {
        id: `${height}p`,
        label: `${height}p${fps > 30 ? fps : ''}`,
        height,
        fps,
        videoItag: f.itag,
        videoSize,
        size: videoSize + audioSize,
      };
    });

  const top = byQuality.get(qualities[0].height);
  const title: string = basic.title || 'YouTube video';
  const details: VideoDetails = {
    id,
    title,
    author: basic.author ?? basic.channel?.name ?? null,
    durationSeconds: Number(basic.duration) || 0,
    thumbnailUrl: bestThumbnail(basic.thumbnail, id),
    isShort: top.height > top.width,
    qualities,
    audio: { itag: audio.itag, size: audioSize, bitrate: audio.bitrate },
    filename: safeFilename(title, id),
  };

  // Honour the URL's own expiry if it is sooner than our TTL.
  const expireParam = Number(new URL(audio.url).searchParams.get('expire')) * 1000;
  const expiresAt = Math.min(
    Date.now() + CACHE_TTL_MS,
    expireParam ? expireParam - 10 * 60 * 1000 : Infinity
  );

  return { details, streams, client, expiresAt };
}

/** Fetch a byte range of a stream URL (googlevideo prefers the `range` param). */
function fetchRange(
  url: string,
  start: number,
  end: number,
  timeoutMs: number,
  signal?: AbortSignal
) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return fetch(`${url}&range=${start}-${end}`, {
    headers: { Accept: '*/*' },
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch(() => null);
}

/**
 * Check a client's stream URLs really serve data. Some clients' links start
 * returning 403 part-way through a file, so we probe from the middle of both
 * the audio and the top video stream rather than just the first bytes.
 */
async function streamsWork(resolved: ResolvedVideo): Promise<boolean> {
  const { details, streams } = resolved;
  const itags = [details.audio.itag, details.qualities[0]?.videoItag];
  const results = await Promise.all(
    itags.map(async (itag) => {
      const s = itag !== undefined ? streams.get(itag) : undefined;
      if (!s) return false;
      const from = Math.max(0, Math.floor(s.size / 2) - 512);
      const res = await fetchRange(s.url, from, Math.min(s.size - 1, from + 1023), PROBE_TIMEOUT_MS);
      await res?.body?.cancel().catch(() => null);
      return !!res?.ok;
    })
  );
  return results.every(Boolean);
}

async function resolveFresh(id: string, skip: ReadonlySet<PlayerClient>): Promise<ResolvedVideo> {
  let lastError: YouTubeError | null = null;
  let refreshedSession = false;

  for (let i = 0; i < CLIENTS.length; i++) {
    const client = CLIENTS[i];
    if (skip.has(client)) continue;

    let info: any;
    try {
      const yt = await getSession();
      info = await yt.getBasicInfo(id, { client });
    } catch (e) {
      const message = (e as Error)?.message ?? '';
      if (/unavailable|not found|does not exist/i.test(message)) {
        lastError = new YouTubeError('This video is unavailable or has been removed.', 404);
      }
      continue;
    }

    const err = playabilityError(info?.playability_status);
    if (err) {
      // A bot check is tied to the session: get a fresh one and retry once.
      if (err.status === 503 && !refreshedSession) {
        refreshedSession = true;
        await getSession(true).catch(() => null);
        i--;
        continue;
      }
      // Private / members-only / age-restricted won't change with another client.
      if (err.status === 403) throw err;
      lastError = err;
      continue;
    }

    const resolved = buildResolved(id, info, client);
    if (resolved && (await streamsWork(resolved))) return resolved;
    if (resolved) {
      lastError = new YouTubeError(
        'YouTube is refusing downloads for this video right now. Please try again in a few minutes.',
        503
      );
    }
  }

  throw (
    lastError ??
    new YouTubeError(
      'Could not fetch that video right now. YouTube may be rate-limiting us — please try again shortly.',
      502
    )
  );
}

/** Resolve a video id, using the per-instance cache when it is still fresh. */
async function resolveVideoById(
  id: string,
  skip: ReadonlySet<PlayerClient> = new Set()
): Promise<ResolvedVideo> {
  const cached = cache.get(id);
  if (cached && cached.expiresAt > Date.now() && !skip.has(cached.client)) return cached;

  const resolved = await resolveFresh(id, skip);
  cacheSet(id, resolved);
  return resolved;
}

/** Resolve a pasted link to video details and download options. */
export async function resolveVideo(input: string): Promise<VideoDetails> {
  const id = extractVideoId(input);
  if (!id) {
    throw new YouTubeError('Please paste a valid YouTube video or Shorts link.', 400);
  }
  return (await resolveVideoById(id)).details;
}

/**
 * Fetch one byte range of a stream and return the upstream response. If the
 * current client's URL is rejected (expired, or YouTube cut it off), switch to
 * the next client and retry — the same itag is the same file on every client.
 */
export async function fetchStreamRange(
  id: string,
  itag: number,
  start: number,
  end: number,
  signal?: AbortSignal
): Promise<Response> {
  const failed = new Set<PlayerClient>();
  let lastError: unknown = null;

  while (failed.size < CLIENTS.length) {
    let resolved: ResolvedVideo;
    try {
      resolved = await resolveVideoById(id, failed);
    } catch (e) {
      lastError = e;
      break;
    }

    const stream = resolved.streams.get(itag);
    if (stream) {
      if (start >= stream.size) throw new YouTubeError('Requested range is out of bounds.', 416);
      const res = await fetchRange(
        stream.url,
        start,
        Math.min(end, stream.size - 1),
        CHUNK_TIMEOUT_MS,
        signal
      );
      if (res?.ok && res.body) return res;
      await res?.body?.cancel().catch(() => null);
      if (signal?.aborted) break;
    }

    failed.add(resolved.client);
    cache.delete(id);
  }

  if (lastError instanceof YouTubeError) throw lastError;
  throw new YouTubeError('YouTube refused the download. Please try again.', 502);
}

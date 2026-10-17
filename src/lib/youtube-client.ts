// Browser-side helpers for the YouTube downloader: chunked download through
// /api/youtube/stream and a lossless merge of the video + audio tracks into a
// single MP4 using mediabunny (pure TypeScript, no ffmpeg, no re-encoding).

/** Must not exceed MAX_CHUNK_BYTES in src/lib/youtube.ts. */
const CHUNK_BYTES = 4 * 1024 * 1024;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 4;

export interface StreamRequest {
  videoId: string;
  itag: number;
  size: number;
}

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

async function fetchChunk(
  req: StreamRequest,
  start: number,
  end: number,
  signal: AbortSignal
): Promise<Uint8Array> {
  const qs = new URLSearchParams({
    v: req.videoId,
    itag: String(req.itag),
    start: String(start),
    end: String(end),
  });
  const res = await fetch(`/api/youtube/stream?${qs}`, { signal, cache: 'no-store' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new HttpError(data?.error || 'Download failed.', res.status);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength !== end - start + 1) {
    throw new HttpError('Received an incomplete chunk.', 502);
  }
  return bytes;
}

/**
 * Download a whole stream in parallel ranged chunks into one buffer.
 * `onBytes` is called with the number of new bytes as each chunk lands.
 */
export async function downloadStream(
  req: StreamRequest,
  signal: AbortSignal,
  onBytes: (n: number) => void
): Promise<Uint8Array> {
  const out = new Uint8Array(req.size);
  const ranges: Array<[number, number]> = [];
  for (let s = 0; s < req.size; s += CHUNK_BYTES) {
    ranges.push([s, Math.min(req.size, s + CHUNK_BYTES) - 1]);
  }

  let next = 0;
  async function worker() {
    while (next < ranges.length) {
      const [start, end] = ranges[next++];
      for (let attempt = 1; ; attempt++) {
        try {
          out.set(await fetchChunk(req, start, end, signal), start);
          onBytes(end - start + 1);
          break;
        } catch (e) {
          if (signal.aborted) throw e;
          const status = e instanceof HttpError ? e.status : 0;
          // 4xx (other than rate limiting) won't fix itself on retry.
          const retryable = status === 0 || status === 429 || status >= 500;
          if (!retryable || attempt >= MAX_ATTEMPTS) throw e;
          await wait(800 * 2 ** (attempt - 1), signal);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ranges.length) }, worker));
  return out;
}

/**
 * Losslessly remux the given MP4/M4A streams (YouTube serves fragmented DASH
 * files) into one regular, fast-start MP4. Pass a single audio stream to get a
 * clean .m4a.
 */
export async function remuxToMp4(video: Uint8Array | null, audio: Uint8Array): Promise<Blob> {
  const {
    Input,
    BufferSource,
    ALL_FORMATS,
    Output,
    Mp4OutputFormat,
    BufferTarget,
    EncodedPacketSink,
    EncodedVideoPacketSource,
    EncodedAudioPacketSource,
  } = await import('mediabunny');

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });

  const pipes: Array<() => Promise<void>> = [];

  if (video) {
    const input = new Input({ source: new BufferSource(video), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track?.codec) throw new Error('Could not read the video stream.');
    const source = new EncodedVideoPacketSource(track.codec);
    output.addVideoTrack(source, { rotation: track.rotation });
    pipes.push(async () => {
      const decoderConfig = await track.getDecoderConfig();
      let first = true;
      for await (const packet of new EncodedPacketSink(track).packets()) {
        await source.add(packet, first && decoderConfig ? { decoderConfig } : undefined);
        first = false;
      }
      source.close();
    });
  }

  const audioInput = new Input({ source: new BufferSource(audio), formats: ALL_FORMATS });
  const audioTrack = await audioInput.getPrimaryAudioTrack();
  if (!audioTrack?.codec) throw new Error('Could not read the audio stream.');
  const audioSource = new EncodedAudioPacketSource(audioTrack.codec);
  output.addAudioTrack(audioSource);
  pipes.push(async () => {
    const decoderConfig = await audioTrack.getDecoderConfig();
    let first = true;
    for await (const packet of new EncodedPacketSink(audioTrack).packets()) {
      await audioSource.add(packet, first && decoderConfig ? { decoderConfig } : undefined);
      first = false;
    }
    audioSource.close();
  });

  await output.start();
  // Feed both tracks concurrently so the muxer can interleave them.
  await Promise.all(pipes.map((p) => p()));
  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('Merging failed.');
  return new Blob([buffer], { type: video ? 'video/mp4' : 'audio/mp4' });
}

/** Save a Blob to the user's device without leaving the page. */
export function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the save on some mobile browsers.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 100) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

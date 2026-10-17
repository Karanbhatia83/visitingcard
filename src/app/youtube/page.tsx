'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DownloaderTabs } from '@/components/downloader-tabs';
import { cn } from '@/lib/utils';
import {
  downloadStream,
  formatBytes,
  formatDuration,
  remuxToMp4,
  saveBlob,
} from '@/lib/youtube-client';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Download,
  Link2,
  Loader2,
  Music,
  X,
  Youtube,
} from 'lucide-react';

interface QualityOption {
  id: string;
  label: string;
  height: number;
  fps: number;
  videoItag: number;
  videoSize: number;
  size: number;
}

interface VideoDetails {
  id: string;
  title: string;
  author: string | null;
  durationSeconds: number;
  thumbnailUrl: string | null;
  isShort: boolean;
  qualities: QualityOption[];
  audio: { itag: number; size: number; bitrate: number };
  filename: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'downloading'; received: number; total: number }
  | { kind: 'merging' }
  | { kind: 'done' };

const AUDIO_ONLY = 'audio';
/** Warn before downloads that need a lot of memory on a phone. */
const LARGE_FILE_BYTES = 750 * 1024 * 1024;

function defaultQuality(video: VideoDetails): string {
  // 1080p when available — the best quality that still plays everywhere.
  const preferred = video.qualities.find((q) => q.height <= 1080);
  return (preferred ?? video.qualities[0])?.id ?? AUDIO_ONLY;
}

export default function YouTubePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoDetails | null>(null);
  const [choice, setChoice] = useState<string>(AUDIO_ONLY);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const [canPaste, setCanPaste] = useState(false);

  useEffect(() => {
    setCanPaste(typeof navigator !== 'undefined' && !!navigator.clipboard?.readText);
    return () => abortRef.current?.abort();
  }, []);

  const busy = phase.kind === 'downloading' || phase.kind === 'merging';

  async function resolve(e?: React.FormEvent, link = url) {
    e?.preventDefault();
    if (!link.trim() || busy) return;
    setError(null);
    setVideo(null);
    setPhase({ kind: 'idle' });
    setLoading(true);
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not fetch that video.');
      const details = data as VideoDetails;
      setVideo(details);
      setChoice(defaultQuality(details));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setUrl(text);
      resolve(undefined, text);
    } catch {
      // Permission denied — the user can still paste manually.
    }
  }

  async function download() {
    if (!video || busy) return;
    const audioOnly = choice === AUDIO_ONLY;
    const quality = video.qualities.find((q) => q.id === choice);
    if (!audioOnly && !quality) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    const total = audioOnly ? video.audio.size : quality!.size;
    let received = 0;
    let lastPaint = 0;
    const onBytes = (n: number) => {
      received += n;
      const now = performance.now();
      if (now - lastPaint > 120 || received >= total) {
        lastPaint = now;
        setPhase({ kind: 'downloading', received, total });
      }
    };
    setPhase({ kind: 'downloading', received: 0, total });

    try {
      const [videoBytes, audioBytes] = await Promise.all([
        audioOnly
          ? Promise.resolve(null)
          : downloadStream(
              { videoId: video.id, itag: quality!.videoItag, size: quality!.videoSize },
              controller.signal,
              onBytes
            ),
        downloadStream(
          { videoId: video.id, itag: video.audio.itag, size: video.audio.size },
          controller.signal,
          onBytes
        ),
      ]);

      setPhase({ kind: 'merging' });
      // Let the "Finishing up" state paint before the CPU-bound merge.
      await new Promise((r) => setTimeout(r, 50));
      const blob = await remuxToMp4(videoBytes, audioBytes);
      const filename = `${video.filename}${audioOnly ? '' : `-${quality!.label}`}.${
        audioOnly ? 'm4a' : 'mp4'
      }`;
      saveBlob(blob, filename);
      setPhase({ kind: 'done' });
    } catch (err) {
      setPhase({ kind: 'idle' });
      if (controller.signal.aborted) return;
      setError(
        (err as Error)?.message && !(err instanceof TypeError)
          ? (err as Error).message
          : 'Download interrupted. Check your connection and try again.'
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase({ kind: 'idle' });
  }

  const selectedSize =
    video && (choice === AUDIO_ONLY ? video.audio.size : video.qualities.find((q) => q.id === choice)?.size);
  const percent =
    phase.kind === 'downloading' && phase.total > 0
      ? Math.min(100, Math.floor((phase.received / phase.total) * 100))
      : 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-6 pb-12 pt-10">
      <header className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Youtube className="size-7" aria-hidden />
        </span>
        <span className="font-display text-2xl font-bold tracking-tight">YouTube Downloader</span>
      </header>

      <DownloaderTabs active="/youtube" />

      <main className="flex flex-1 flex-col py-8">
        <h1 className="font-display text-[2rem] font-extrabold leading-tight tracking-tight text-foreground">
          Save any video.
          <br />
          <span className="text-primary">Shorts or full length.</span>
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Paste a public YouTube link, pick a quality, and download the MP4 to your device.
        </p>

        <form onSubmit={resolve} className="mt-8 flex flex-col gap-3">
          <label htmlFor="yt-url" className="text-base font-semibold text-foreground">
            YouTube link
          </label>
          <div className="relative">
            <Link2
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="yt-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://youtube.com/shorts/... or watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={cn('pl-11', canPaste && !url && 'pr-14')}
              disabled={busy}
              required
            />
            {canPaste && !url && (
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Paste link from clipboard"
              >
                <ClipboardPaste className="size-5" aria-hidden />
              </button>
            )}
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading || busy || !url.trim()}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Fetching…
              </>
            ) : (
              'Get video'
            )}
          </Button>
        </form>

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-lg border-2 border-destructive/30 bg-destructive/10 p-4 text-destructive"
          >
            <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p className="text-base font-medium">{error}</p>
          </div>
        )}

        {video && (
          <div className="mt-8 overflow-hidden rounded-2xl border-2 border-input bg-card">
            {video.thumbnailUrl && (
              <div className="relative bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  className={cn(
                    'mx-auto w-full object-cover',
                    video.isShort ? 'aspect-[9/16] max-h-[420px] w-auto' : 'aspect-video'
                  )}
                />
                <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-0.5 text-sm font-semibold text-white">
                  {video.isShort ? 'Short' : formatDuration(video.durationSeconds)}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-5 p-5">
              <div>
                <p className="line-clamp-2 text-lg font-semibold leading-snug text-foreground">
                  {video.title}
                </p>
                {video.author && <p className="mt-1 text-base text-muted-foreground">{video.author}</p>}
              </div>

              <fieldset disabled={busy} className="flex flex-col gap-2">
                <legend className="mb-2 text-base font-semibold text-foreground">Quality</legend>
                <div role="radiogroup" aria-label="Quality" className="grid grid-cols-2 gap-2">
                  {video.qualities.map((q) => (
                    <QualityChip
                      key={q.id}
                      selected={choice === q.id}
                      onSelect={() => setChoice(q.id)}
                      title={q.label}
                      subtitle={formatBytes(q.size)}
                      badge={q.height >= 720 ? 'HD' : undefined}
                    />
                  ))}
                  <QualityChip
                    selected={choice === AUDIO_ONLY}
                    onSelect={() => setChoice(AUDIO_ONLY)}
                    title="Audio only"
                    subtitle={`M4A · ${formatBytes(video.audio.size)}`}
                    icon={<Music className="size-4" aria-hidden />}
                  />
                </div>
              </fieldset>

              {selectedSize && selectedSize > LARGE_FILE_BYTES && phase.kind === 'idle' && (
                <p className="rounded-lg bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
                  This is a large file ({formatBytes(selectedSize)}). It may take a while and needs
                  free space on your device — pick a lower quality if it fails.
                </p>
              )}

              {phase.kind === 'downloading' && (
                <div className="flex flex-col gap-2" aria-live="polite">
                  <div className="flex items-baseline justify-between text-base">
                    <span className="font-semibold text-foreground">Downloading… {percent}%</span>
                    <span className="text-sm text-muted-foreground">
                      {formatBytes(phase.received)} of {formatBytes(phase.total)}
                    </span>
                  </div>
                  <div
                    className="h-3 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-150"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )}

              {phase.kind === 'merging' && (
                <p className="flex items-center gap-2 text-base font-semibold text-foreground" aria-live="polite">
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                  Finishing up…
                </p>
              )}

              {phase.kind === 'done' && (
                <p className="flex items-start gap-2 text-base font-medium text-foreground" aria-live="polite">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <span>Download complete — check your downloads folder.</span>
                </p>
              )}

              {phase.kind === 'downloading' ? (
                <Button type="button" variant="outline" size="lg" className="w-full" onClick={cancel}>
                  <X aria-hidden />
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="accent"
                  size="lg"
                  className="w-full"
                  onClick={download}
                  disabled={busy}
                >
                  {phase.kind === 'merging' ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Preparing file…
                    </>
                  ) : (
                    <>
                      <Download aria-hidden />
                      {phase.kind === 'done'
                        ? 'Download again'
                        : choice === AUDIO_ONLY
                          ? 'Download audio'
                          : 'Download video'}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="flex flex-col gap-3">
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Works with public videos and Shorts. Please respect creators&apos; rights and download
          only content you have permission to save.
        </p>
        <p className="text-center text-base">
          <Link href="/" className="font-semibold text-primary underline-offset-4 hover:underline">
            Back to home
          </Link>
        </p>
      </footer>
    </div>
  );
}

function QualityChip({
  selected,
  onSelect,
  title,
  subtitle,
  badge,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  badge?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-14 flex-col items-start justify-center rounded-lg border-2 px-3 py-2 text-left transition-colors disabled:opacity-50',
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-input bg-background text-foreground hover:bg-muted'
      )}
    >
      <span className="flex items-center gap-1.5 text-base font-semibold">
        {icon}
        {title}
        {badge && (
          <span className="rounded bg-primary px-1 text-[0.65rem] font-bold leading-4 text-primary-foreground">
            {badge}
          </span>
        )}
      </span>
      <span className="text-sm text-muted-foreground">{subtitle}</span>
    </button>
  );
}

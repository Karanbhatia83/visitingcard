'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DownloaderTabs } from '@/components/downloader-tabs';
import { Download, Instagram, Loader2, Link2, AlertCircle } from 'lucide-react';

interface ResolvedReel {
  shortcode: string;
  thumbnailUrl: string | null;
  caption: string;
  author: string | null;
  filename: string;
  downloadUrl: string;
}

export default function ReelsPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reel, setReel] = useState<ResolvedReel | null>(null);

  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setReel(null);
    setLoading(true);
    try {
      const res = await fetch('/api/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not fetch that reel.');
      setReel(data as ResolvedReel);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch through our proxy and trigger a real file download (keeps the user
  // on this page instead of navigating away to the video).
  async function download() {
    if (!reel) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(reel.downloadUrl);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Download failed. Please resolve the reel again.');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${reel.filename}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-6 pb-12 pt-10">
      <header className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Instagram className="size-7" aria-hidden />
        </span>
        <span className="font-display text-2xl font-bold tracking-tight">Reel Downloader</span>
      </header>

      <DownloaderTabs active="/reels" />

      <main className="flex flex-1 flex-col py-8">
        <h1 className="font-display text-[2rem] font-extrabold leading-tight tracking-tight text-foreground">
          Save a reel.
          <br />
          <span className="text-primary">Watch it offline.</span>
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Paste a public Instagram reel link and download the video to your device.
        </p>

        <form onSubmit={resolve} className="mt-8 flex flex-col gap-3">
          <label htmlFor="reel-url" className="text-base font-semibold text-foreground">
            Reel link
          </label>
          <div className="relative">
            <Link2
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="reel-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://www.instagram.com/reel/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="pl-11"
              required
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading || !url.trim()}>
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

        {reel && (
          <div className="mt-8 overflow-hidden rounded-2xl border-2 border-input bg-card">
            {reel.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reel.thumbnailUrl}
                alt={reel.author ? `Reel by @${reel.author}` : 'Reel preview'}
                className="aspect-square w-full object-cover"
              />
            )}
            <div className="flex flex-col gap-4 p-5">
              {reel.author && (
                <p className="text-lg font-semibold text-foreground">@{reel.author}</p>
              )}
              {reel.caption && (
                <p className="line-clamp-3 text-base leading-relaxed text-muted-foreground">
                  {reel.caption}
                </p>
              )}
              <Button
                type="button"
                variant="accent"
                size="lg"
                className="w-full"
                onClick={download}
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    Downloading…
                  </>
                ) : (
                  <>
                    <Download aria-hidden />
                    Download video
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className="flex flex-col gap-3">
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Works with public reels only. Please respect creators&apos; rights and download only
          content you have permission to save.
        </p>
        <p className="text-center text-base">
          <Link
            href="/"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Back to home
          </Link>
        </p>
      </footer>
    </div>
  );
}

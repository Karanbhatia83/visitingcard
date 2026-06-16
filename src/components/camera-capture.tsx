'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { prepareCardImage } from '@/lib/image';
import { Camera, Images, Loader2, ScanLine } from 'lucide-react';

type Status = 'idle' | 'working' | 'error';

export function CameraCapture() {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('Reading the card…');

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setStatus('working');
    setMessage('Preparing the photo…');

    try {
      const { dataUrl, mimeType } = await prepareCardImage(file, { enhance: true });
      setPreview(dataUrl);
      setMessage('Reading the card…');

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, mimeType }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || 'Could not read the card. Please try again.';
        setStatus('error');
        setMessage(msg);
        toast.error(msg);
        return;
      }

      toast.success('Card read. Please review the details.');
      router.push(`/review/${data.scanId}`);
    } catch (err) {
      const msg =
        (err as Error)?.message || 'Something went wrong reading the card. Please try again.';
      setStatus('error');
      setMessage(msg);
      toast.error(msg);
    }
  }

  const busy = status === 'working';

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div className="relative flex aspect-[1.6] w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-border bg-muted/40">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Captured business card" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center text-muted-foreground">
            <ScanLine className="size-12" aria-hidden />
            <p className="text-lg">Point your camera at a business card and take a clear photo.</p>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
            <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
            <p className="text-lg font-semibold" aria-live="polite">
              {message}
            </p>
          </div>
        )}
      </div>

      {status === 'error' && !busy && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-center text-base font-medium text-destructive" role="alert">
          {message}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          variant="accent"
          className="w-full"
          disabled={busy}
          onClick={() => cameraInput.current?.click()}
        >
          <Camera aria-hidden />
          {preview ? 'Retake photo' : 'Take photo'}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => galleryInput.current?.click()}
        >
          <Images aria-hidden />
          Choose from gallery
        </Button>
      </div>

      <p className="text-center text-base text-muted-foreground">
        Tip: fill the frame with the card and avoid glare for the best results.
      </p>
    </div>
  );
}

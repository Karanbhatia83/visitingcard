'use client';

import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight">Something went wrong</h1>
          <p className="text-lg text-muted-foreground">
            Please try again. If it keeps happening, restart the app.
          </p>
          <Button size="lg" className="w-full" onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}

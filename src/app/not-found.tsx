import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ScanLine, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
        <ScanLine className="size-9" aria-hidden />
      </span>
      <h1 className="font-display text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="text-lg text-muted-foreground">
        The page you were looking for isn&apos;t here.
      </p>
      <Button asChild size="lg" variant="accent" className="w-full">
        <Link href="/">
          <Home aria-hidden />
          Back to home
        </Link>
      </Button>
    </div>
  );
}

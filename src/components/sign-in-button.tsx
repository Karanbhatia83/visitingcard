'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1S8.69 5.9 12 5.9c1.88 0 3.15.8 3.87 1.49l2.64-2.55C16.9 3.26 14.66 2.3 12 2.3 6.86 2.3 2.7 6.46 2.7 11.6S6.86 20.9 12 20.9c5.6 0 9.3-3.94 9.3-9.48 0-.64-.07-1.13-.16-1.62H12z"
      />
    </svg>
  );
}

export function SignInButton({
  callbackUrl = '/scan',
  label = 'Continue with Google',
  variant = 'default',
}: {
  callbackUrl?: string;
  label?: string;
  variant?: 'default' | 'outline';
}) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      size="lg"
      variant={variant}
      className="w-full bg-white text-[#1f1f1f] hover:bg-white/90 border-2 border-border"
      onClick={() => {
        setLoading(true);
        signIn('google', { callbackUrl });
      }}
      disabled={loading}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : <GoogleMark />}
      {label}
    </Button>
  );
}

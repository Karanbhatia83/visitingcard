'use client';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/sonner';
import { ServiceWorkerRegister } from '@/components/sw-register';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster />
      <ServiceWorkerRegister />
    </SessionProvider>
  );
}

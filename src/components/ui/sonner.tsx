'use client';
import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      richColors
      toastOptions={{
        style: { fontSize: '1.0625rem' },
      }}
    />
  );
}

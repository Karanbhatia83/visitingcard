import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

// Edge middleware enforces the `authorized` callback for protected routes.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    // Run on everything except static assets, the PWA files, and API routes
    // (API routes do their own auth checks).
    '/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|offline.html|robots.txt).*)',
  ],
};

import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

// Edge-safe config (no database adapter). Shared by middleware and the full
// Node config in auth.ts.
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // openid/email/profile for sign-in + contacts for People API writes.
          scope:
            'openid email profile https://www.googleapis.com/auth/contacts',
          access_type: 'offline', // request a refresh token
          prompt: 'consent', // ensure refresh token on re-consent
        },
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin' },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const protectedPaths = ['/scan', '/review', '/contacts', '/settings'];
      const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
      return isProtected ? isLoggedIn : true;
    },
  },
};

import { prisma } from '@/lib/prisma';

// Returns a valid Google access token for the user, refreshing it if expired.
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
  });
  if (!account) throw new Error('No Google account is connected.');

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = account.expires_at ?? 0;
  // 60s safety margin.
  if (account.access_token && expiresAt - 60 > now) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error('Google session expired. Please sign out and sign in again.');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
    }),
  });

  if (!res.ok) {
    throw new Error('Could not refresh Google access. Please reconnect your account.');
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: now + data.expires_in,
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    },
  });

  return data.access_token;
}

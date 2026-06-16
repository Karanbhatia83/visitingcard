import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/session';
import { resyncFromGoogle } from '@/lib/contact-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  try {
    const result = await resyncFromGoogle(userId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || 'Could not sync from Google.' },
      { status: 502 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/session';
import { cardSchema } from '@/lib/validation';
import { findGoogleDuplicates } from '@/lib/google/contacts';
import { findLocalDuplicates } from '@/lib/contact-service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = cardSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ matches: [] });

  const [local, google] = await Promise.all([
    findLocalDuplicates(userId, parsed.data).catch(() => []),
    findGoogleDuplicates(userId, parsed.data).catch(() => []),
  ]);

  return NextResponse.json({ matches: [...local, ...google] });
}

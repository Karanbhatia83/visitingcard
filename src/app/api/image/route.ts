import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/session';
import { getImageUrl } from '@/lib/storage';

export const runtime = 'nodejs';

// Redirects to a (signed or public) URL for a stored card image the user owns.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const key = new URL(req.url).searchParams.get('key') || '';
  // Ownership check: keys are namespaced as cards/{userId}/...
  if (!key.startsWith(`cards/${userId}/`)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let url: string;
  try {
    url = await getImageUrl(key);
  } catch {
    return NextResponse.json({ error: 'Image unavailable' }, { status: 404 });
  }
  return NextResponse.redirect(url);
}

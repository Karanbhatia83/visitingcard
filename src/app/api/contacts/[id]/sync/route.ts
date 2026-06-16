import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/session';
import { syncContactById } from '@/lib/contact-service';

export const runtime = 'nodejs';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    const contact = await syncContactById(userId, params.id);
    return NextResponse.json({ contact: { id: contact.id, syncStatus: contact.syncStatus } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

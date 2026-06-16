import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/session';
import { saveContactSchema } from '@/lib/validation';
import { saveContact } from '@/lib/contact-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = saveContactSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || 'Invalid contact details.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const contact = await saveContact(userId, parsed.data);
    return NextResponse.json({
      contact: { id: contact.id, syncStatus: contact.syncStatus, syncError: contact.syncError },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

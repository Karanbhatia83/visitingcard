import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/session';
import { cardSchema } from '@/lib/validation';
import { updateContactById, deleteContactById } from '@/lib/contact-service';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = cardSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || 'Invalid contact details.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  try {
    const contact = await updateContactById(userId, params.id, parsed.data);
    return NextResponse.json({
      contact: { id: contact.id, syncStatus: contact.syncStatus, syncError: contact.syncError },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    await deleteContactById(userId, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

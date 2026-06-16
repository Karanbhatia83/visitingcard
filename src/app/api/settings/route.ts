import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserId } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getOrCreateSettings } from '@/lib/contact-service';

export const runtime = 'nodejs';

const schema = z.object({
  autoSyncGoogle: z.boolean().optional(),
  deleteFromGoogle: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings.' }, { status: 400 });

  await getOrCreateSettings(userId);
  const settings = await prisma.userSettings.update({
    where: { userId },
    data: parsed.data,
  });
  return NextResponse.json({ settings });
}

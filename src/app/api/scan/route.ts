import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/session';
import { scanRequestSchema } from '@/lib/validation';
import { checkScanRateLimit } from '@/lib/rate-limit';
import { uploadCardImage } from '@/lib/storage';
import { extractBusinessCard } from '@/lib/ai';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const rate = await checkScanRateLimit(userId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Scan limit reached (${rate.limit}/hour). Please try again later.` },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = scanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid card image is required.' }, { status: 400 });
  }

  const { image, mimeType } = parsed.data;
  const base64 = image.includes(',') ? image.split(',')[1] : image;
  const buffer = Buffer.from(base64, 'base64');

  // Store the image first so we keep it even if extraction fails.
  let cardImageKey: string | null = null;
  try {
    cardImageKey = await uploadCardImage(userId, buffer, mimeType);
  } catch {
    cardImageKey = null; // storage misconfigured — continue without the image
  }

  try {
    const result = await extractBusinessCard(base64, mimeType);
    const scan = await prisma.scan.create({
      data: {
        userId,
        status: 'EXTRACTED',
        cardImageKey,
        ocrText: result.rawText,
        aiOutput: result.card as unknown as object,
        aiProvider: result.provider,
        aiModel: result.model,
      },
    });
    await audit({ userId, action: 'SCAN', entity: 'Scan', entityId: scan.id });
    return NextResponse.json({
      scanId: scan.id,
      card: result.card,
      provider: result.provider,
      model: result.model,
    });
  } catch (e) {
    const scan = await prisma.scan.create({
      data: {
        userId,
        status: 'FAILED',
        cardImageKey,
        errorMessage: (e as Error).message,
      },
    });
    return NextResponse.json(
      { error: (e as Error).message || 'Could not read the card.', scanId: scan.id },
      { status: 422 }
    );
  }
}

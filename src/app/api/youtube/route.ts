import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveVideo, YouTubeError } from '@/lib/youtube';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  url: z.string().trim().min(1, 'A YouTube link is required.').max(500),
});

// Resolve a public YouTube link (video or Short) to metadata + download options.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please paste a YouTube link.' }, { status: 400 });
  }

  try {
    const video = await resolveVideo(parsed.data.url);
    return NextResponse.json(video, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof YouTubeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('[youtube] resolve failed', e);
    return NextResponse.json(
      { error: 'Something went wrong fetching that video. Please try again.' },
      { status: 500 }
    );
  }
}

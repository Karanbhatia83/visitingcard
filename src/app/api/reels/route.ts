import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveReel, ReelError } from '@/lib/instagram';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  url: z.string().trim().min(1, 'A reel link is required.').max(500),
});

// Resolve a public Instagram reel link to a downloadable video + metadata.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please paste an Instagram reel link.' }, { status: 400 });
  }

  try {
    const media = await resolveReel(parsed.data.url);
    return NextResponse.json({
      shortcode: media.shortcode,
      thumbnailUrl: media.thumbnailUrl,
      caption: media.caption,
      author: media.author,
      filename: media.filename,
      // Route the actual media through our proxy so the browser downloads it
      // (Instagram's CDN blocks cross-origin fetch and would otherwise stream).
      downloadUrl: `/api/reels/download?u=${encodeURIComponent(media.videoUrl)}&name=${encodeURIComponent(
        media.filename
      )}`,
    });
  } catch (e) {
    if (e instanceof ReelError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: 'Something went wrong resolving that reel. Please try again.' },
      { status: 500 }
    );
  }
}

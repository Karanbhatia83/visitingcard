import { NextResponse } from 'next/server';
import { isAllowedMediaHost } from '@/lib/instagram';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Streams a resolved Instagram CDN video back to the browser as an attachment.
// Necessary because the IG CDN sends no CORS headers and no Content-Disposition,
// so a direct client fetch/link would play the video instead of downloading it.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('u');
  const name = (searchParams.get('name') || 'reel').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);

  if (!target) {
    return NextResponse.json({ error: 'Missing media url.' }, { status: 400 });
  }

  // Restrict to Instagram/Facebook CDN hosts — this endpoint must never become
  // an open proxy for arbitrary URLs.
  let mediaUrl: URL;
  try {
    mediaUrl = new URL(target);
  } catch {
    return NextResponse.json({ error: 'Invalid media url.' }, { status: 400 });
  }
  if (mediaUrl.protocol !== 'https:' || !isAllowedMediaHost(mediaUrl.hostname)) {
    return NextResponse.json({ error: 'That media host is not allowed.' }, { status: 400 });
  }

  const upstream = await fetch(mediaUrl.toString(), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: 'The video link expired. Please resolve the reel again.' },
      { status: 502 }
    );
  }

  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
    'Content-Disposition': `attachment; filename="${name}.mp4"`,
    'Cache-Control': 'no-store',
  });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);

  return new NextResponse(upstream.body, { status: 200, headers });
}

import { NextResponse } from 'next/server';
import { fetchStreamRange, MAX_CHUNK_BYTES, YouTubeError } from '@/lib/youtube';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Returns one byte range (≤ 4 MiB) of a YouTube audio or video stream.
//
// The browser calls this repeatedly to download a whole stream in chunks:
// small responses stay well inside serverless response-size and time limits,
// and googlevideo doesn't throttle ranged requests. Only a video id + itag are
// accepted — the stream URL is resolved server-side — so this can never act as
// an open proxy.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('v') ?? '';
  const itag = Number(searchParams.get('itag'));
  const start = Number(searchParams.get('start'));
  const end = Number(searchParams.get('end'));

  if (
    !/^[A-Za-z0-9_-]{11}$/.test(id) ||
    !Number.isInteger(itag) ||
    itag <= 0 ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start
  ) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (end - start + 1 > MAX_CHUNK_BYTES) {
    return NextResponse.json({ error: 'Chunk too large.' }, { status: 400 });
  }

  try {
    const upstream = await fetchStreamRange(id, itag, start, end, req.signal);
    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    const length = upstream.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (e) {
    if (e instanceof YouTubeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('[youtube] stream failed', e);
    return NextResponse.json({ error: 'Download failed. Please try again.' }, { status: 502 });
  }
}

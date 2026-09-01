import { NextResponse } from 'next/server';
import { readStoredFile, guessMimeType } from '@/lib/file-storage';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await params;
    const storageKey = key.join('/');
    const buffer = await readStoredFile(storageKey);
    const fileName = key[key.length - 1]?.replace(/^\d+__/, '') || 'file';
    const download = new URL(request.url).searchParams.get('download') === '1';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': guessMimeType(fileName),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }
}

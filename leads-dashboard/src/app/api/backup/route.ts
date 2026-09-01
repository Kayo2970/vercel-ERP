import { NextResponse } from 'next/server';
import { createEncryptedBackup } from '@/lib/backup';

export async function POST(request: Request) {
  try {
    const { passphrase } = await request.json();
    if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 8) {
      return NextResponse.json({ error: 'A passphrase of at least 8 characters is required.' }, { status: 400 });
    }

    const { buffer, summary } = await createEncryptedBackup(passphrase);
    const stamp = new Date().toISOString().split('T')[0];

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="leads-backup-${stamp}.leadsbackup"`,
        'X-Backup-Collections': String(summary.collectionCount),
        'X-Backup-Files': String(summary.fileCount),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create backup.' }, { status: 500 });
  }
}

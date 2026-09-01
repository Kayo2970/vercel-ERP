import { NextResponse } from 'next/server';
import { restoreEncryptedBackup, InvalidPassphraseError } from '@/lib/backup';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const passphrase = formData.get('passphrase');
    const file = formData.get('file');

    if (!passphrase || typeof passphrase !== 'string') {
      return NextResponse.json({ error: 'Passphrase is required.' }, { status: 400 });
    }
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Backup file is required.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await restoreEncryptedBackup(buffer, passphrase);
    return NextResponse.json(summary);
  } catch (err: any) {
    if (err instanceof InvalidPassphraseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Failed to restore backup.' }, { status: 500 });
  }
}

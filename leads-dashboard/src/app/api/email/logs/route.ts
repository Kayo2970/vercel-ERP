import { NextResponse } from 'next/server';
import { readCollection } from '@/lib/server-db';
import { EmailLog } from '@/lib/email-service';

export async function GET() {
  try {
    const logs = await readCollection<EmailLog>('emails');
    return NextResponse.json(logs || []);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch email logs' }, { status: 500 });
  }
}

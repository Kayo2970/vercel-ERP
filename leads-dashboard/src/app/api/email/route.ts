import { NextResponse } from 'next/server';
import { readCollection } from '@/lib/server-db';
import { dispatchEmail } from '@/lib/email-service';

export async function GET() {
  try {
    const emails = await readCollection('emails');
    return NextResponse.json(emails);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.to || !body.subject || !body.bodyText) {
      return NextResponse.json({ error: 'to, subject, and bodyText are required.' }, { status: 400 });
    }

    const emailLog = await dispatchEmail({
      to: body.to,
      subject: body.subject,
      bodyText: body.bodyText,
      bodyHtml: body.bodyHtml,
      category: body.category || 'SYSTEM',
    });

    return NextResponse.json(emailLog, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

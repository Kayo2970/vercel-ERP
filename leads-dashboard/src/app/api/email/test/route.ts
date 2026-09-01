import { NextResponse } from 'next/server';
import { testEmailConnection } from '@/lib/email-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { testRecipient, settings } = body;

    if (!testRecipient) {
      return NextResponse.json({ error: 'Test recipient email is required' }, { status: 400 });
    }

    const result = await testEmailConnection(testRecipient, settings);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message || 'SMTP Test failed' }, { status: 500 });
  }
}

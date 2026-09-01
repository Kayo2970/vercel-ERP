import { NextResponse } from 'next/server';
import { getEmailSettings, updateEmailSettings } from '@/lib/email-service';

export async function GET() {
  try {
    const settings = await getEmailSettings();
    return NextResponse.json(settings);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch email settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { settings, actorName } = body;

    if (!settings) {
      return NextResponse.json({ error: 'Settings payload is required' }, { status: 400 });
    }

    const updated = await updateEmailSettings(settings, actorName || 'Super User');
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update email settings' }, { status: 500 });
  }
}

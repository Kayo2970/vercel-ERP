import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';
import { dispatchAnnouncementEmails } from '@/lib/announcement-email';

export async function GET() {
  const items = await readCollection('announcements');
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const item = await request.json();
    const updated = await mutateCollection('announcements', (current) => [item, ...current]);
    const created = updated.find((a: any) => a.id === item.id);

    // Dispatch emails ONLY if created directly with status 'Approved' (e.g. by Centre Head)
    if (created && created.status === 'Approved') {
      await dispatchAnnouncementEmails(created);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

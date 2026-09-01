import { NextResponse } from 'next/server';
import { mutateCollection } from '@/lib/server-db';
import { dispatchAnnouncementEmails } from '@/lib/announcement-email';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await request.json();
    let isNewlyApproved = false;

    const updated = await mutateCollection('announcements', (current) => {
      const idx = current.findIndex((item: any) => item.id === id);
      if (idx === -1) return [...current, { id, ...updates }];

      const existing = current[idx];
      if (updates.status === 'Approved' && existing.status !== 'Approved' && !existing.emailSent) {
        isNewlyApproved = true;
      }

      const next = [...current];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });

    const targetAnnouncement = updated.find((a: any) => a.id === id);

    // If Centre Head just approved the announcement, send automatic emails NOW!
    if (targetAnnouncement && (isNewlyApproved || (targetAnnouncement.status === 'Approved' && !targetAnnouncement.emailSent))) {
      await dispatchAnnouncementEmails(targetAnnouncement);
    }

    return NextResponse.json(targetAnnouncement);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let found = false;
    await mutateCollection('announcements', (current) => {
      const filtered = current.filter((a: any) => a.id !== id);
      found = filtered.length < current.length;
      return filtered;
    });
    if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

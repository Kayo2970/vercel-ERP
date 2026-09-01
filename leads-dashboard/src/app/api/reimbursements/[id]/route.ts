import { NextResponse } from 'next/server';
import { mutateCollection } from '@/lib/server-db';
import { deleteStoredFilesForRecord } from '@/lib/file-storage';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await request.json();
    // Upsert: if this id isn't in the server's collection yet — e.g. it's one of the
    // client-bundled sample/seed records that was never POSTed — create it instead of
    // 404ing and silently dropping the edit (that used to leave the sample data stuck
    // forever, since polling clients would then keep re-hydrating the stale sample).
    const updated = await mutateCollection('reimbursements', (current) => {
      const idx = current.findIndex((item: any) => item.id === id);
      if (idx === -1) return [...current, { id, ...updates }];
      const next = [...current];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
    return NextResponse.json(updated.find((r: any) => r.id === id));
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
    await mutateCollection('reimbursements', (current) => {
      const filtered = current.filter((r: any) => r.id !== id);
      found = filtered.length < current.length;
      return filtered;
    });
    if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await deleteStoredFilesForRecord('reimbursements', id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

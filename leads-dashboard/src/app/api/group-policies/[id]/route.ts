import { NextResponse } from 'next/server';
import { mutateCollection } from '@/lib/server-db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await request.json();
    const updated = await mutateCollection('groupPolicies', (current) => {
      const idx = current.findIndex((item: any) => item.id === id);
      if (idx === -1) return [...current, { id, ...updates }];
      const next = [...current];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
    return NextResponse.json(updated.find((p: any) => p.id === id));
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
    await mutateCollection('groupPolicies', (current) => {
      const filtered = current.filter((p: any) => p.id !== id);
      found = filtered.length < current.length;
      return filtered;
    });
    if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { mutateCollection } from '@/lib/server-db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await request.json();
    // Upsert: if this id isn't in the server's collection yet (e.g. client-bundled
    // sample/seed data never POSTed), create it instead of 404ing and silently
    // dropping the edit.
    const updated = await mutateCollection('forms', (current) => {
      const idx = current.findIndex((item: any) => item.id === id);
      if (idx === -1) return [...current, { id, ...updates }];
      const next = [...current];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
    return NextResponse.json(updated.find((f: any) => f.id === id));
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
    let deletedSlug: string | undefined;
    await mutateCollection('forms', (current) => {
      const target = current.find((f: any) => f.id === id);
      deletedSlug = target?.slug;
      const filtered = current.filter((f: any) => f.id !== id);
      found = filtered.length < current.length;
      return filtered;
    });
    if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // A deleted form used to leave its submissions behind forever — they'd
    // even resurface under a brand-new form later created on the same slug
    // (submissions are matched by slug as a fallback for records predating
    // a reliable formId). Cascade the cleanup here so it applies regardless
    // of which client triggered the delete.
    await mutateCollection('submissions', (current) =>
      current.filter((s: any) => s.formId !== id && s.slug !== deletedSlug)
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { mutateCollection } from '@/lib/server-db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await request.json();

    let updatedItem: any = null;
    await mutateCollection('incomeSources', (current) => {
      const idx = current.findIndex((i: any) => i.id === id);
      if (idx >= 0) {
        current[idx] = { ...current[idx], ...updates };
        updatedItem = current[idx];
      }
      return [...current];
    });

    if (!updatedItem) {
      return NextResponse.json({ error: 'Income source item not found.' }, { status: 404 });
    }

    return NextResponse.json(updatedItem);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await mutateCollection('incomeSources', (current) => current.filter((i: any) => i.id !== id));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

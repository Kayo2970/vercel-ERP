import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';

export async function GET() {
  const items = await readCollection('incomeSources');
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const item = await request.json();
    if (!item.id || !item.name || typeof item.amount !== 'number') {
      return NextResponse.json({ error: 'id, name, and numeric amount are required.' }, { status: 400 });
    }

    const updated = await mutateCollection('incomeSources', (current) => {
      const idx = current.findIndex((i: any) => i.id === item.id);
      if (idx >= 0) {
        current[idx] = item;
        return [...current];
      }
      return [item, ...current];
    });

    const created = updated.find((i: any) => i.id === item.id);
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

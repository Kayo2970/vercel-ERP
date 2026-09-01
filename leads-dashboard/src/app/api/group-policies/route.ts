import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';

export async function GET() {
  const items = await readCollection('groupPolicies');
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const item = await request.json();
    const updated = await mutateCollection('groupPolicies', (current) => {
      const idx = current.findIndex((p: any) => p.id === item.id);
      if (idx >= 0) {
        const copy = [...current];
        copy[idx] = item;
        return copy;
      }
      return [item, ...current];
    });
    const created = updated.find((p: any) => p.id === item.id);
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

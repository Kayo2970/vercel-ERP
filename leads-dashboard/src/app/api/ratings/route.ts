import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';

export async function GET() {
  const items = await readCollection('ratings');
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const item = await request.json();
    const updated = await mutateCollection('ratings', (current) => [item, ...current]);
    const created = updated.find((r: any) => r.id === item.id);
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

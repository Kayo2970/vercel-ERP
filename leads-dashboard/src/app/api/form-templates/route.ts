import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';

export async function GET() {
  const items = await readCollection('formTemplates');
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const item = await request.json();
    const updated = await mutateCollection('formTemplates', (current) => [item, ...current]);
    const created = updated.find((t: any) => t.id === item.id);
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

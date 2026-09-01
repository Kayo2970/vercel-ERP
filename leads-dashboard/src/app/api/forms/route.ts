import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';

export async function GET() {
  const items = await readCollection('forms');
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const item = await request.json();
    const updated = await mutateCollection('forms', (current) => {
      if (item.slug && current.some((f: any) => f.slug?.toLowerCase() === item.slug?.toLowerCase())) {
        throw new Error(`A form with slug "${item.slug}" already exists`);
      }
      return [item, ...current];
    });
    const created = updated.find((f: any) => f.id === item.id);
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

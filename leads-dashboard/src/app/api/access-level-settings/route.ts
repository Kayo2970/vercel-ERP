import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';

export async function GET() {
  const items = await readCollection('accessLevelSettings');
  return NextResponse.json(items);
}

// Always exactly one record — POST replaces it wholesale rather than
// appending, since there's nothing to key multiple records by.
export async function POST(request: Request) {
  try {
    const item = await request.json();
    const updated = await mutateCollection('accessLevelSettings', () => [{ ...item, id: 'default' }]);
    return NextResponse.json(updated[0], { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

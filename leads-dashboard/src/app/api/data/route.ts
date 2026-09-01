import { NextResponse } from 'next/server';
import { readDb } from '@/lib/server-db';

export async function GET() {
  try {
    const db = await readDb();
    return NextResponse.json(db);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to read database' }, { status: 500 });
  }
}

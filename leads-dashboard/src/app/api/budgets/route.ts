import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';

export async function GET() {
  const budgets = await readCollection('budgets');
  return NextResponse.json(budgets);
}

export async function POST(request: Request) {
  try {
    const budget = await request.json();
    if (!budget.id || typeof budget.amount !== 'number') {
      return NextResponse.json({ error: 'Budget id and amount are required.' }, { status: 400 });
    }

    const updated = await mutateCollection('budgets', (current) => {
      const idx = current.findIndex((b: any) => b.id === budget.id);
      if (idx >= 0) {
        current[idx] = budget;
        return [...current];
      }
      return [budget, ...current];
    });

    const created = updated.find((b: any) => b.id === budget.id);
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';

export async function POST(request: Request) {
  try {
    const { taskIds, email } = await request.json();

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json({ error: 'taskIds array is required.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updatedTasks: any[] = [];

    await mutateCollection('tasks', (current: any[]) => {
      const idSet = new Set(taskIds.map(id => String(id).trim()));
      return current.map(task => {
        if (idSet.has(task.id)) {
          const updated = {
            ...task,
            acknowledged: true,
            acknowledgedAt: task.acknowledgedAt || now,
            acknowledgedByEmail: email || task.assigneeEmail || task.acknowledgedByEmail,
          };
          updatedTasks.push(updated);
          return updated;
        }
        return task;
      });
    });

    return NextResponse.json({
      message: `Successfully acknowledged ${updatedTasks.length} task(s).`,
      acknowledgedCount: updatedTasks.length,
      tasks: updatedTasks,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to acknowledge tasks.' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ack = searchParams.get('ack') || searchParams.get('id');
    const email = searchParams.get('email');

    if (!ack) {
      return NextResponse.json({ error: 'No task IDs provided in ack query parameter.' }, { status: 400 });
    }

    const taskIds = ack.split(',').map(id => id.trim()).filter(Boolean);
    const now = new Date().toISOString();
    const updatedTasks: any[] = [];

    await mutateCollection('tasks', (current: any[]) => {
      const idSet = new Set(taskIds);
      return current.map(task => {
        if (idSet.has(task.id)) {
          const updated = {
            ...task,
            acknowledged: true,
            acknowledgedAt: task.acknowledgedAt || now,
            acknowledgedByEmail: email || task.assigneeEmail || task.acknowledgedByEmail,
          };
          updatedTasks.push(updated);
          return updated;
        }
        return task;
      });
    });

    return NextResponse.json({
      message: `Successfully acknowledged ${updatedTasks.length} task(s).`,
      acknowledgedCount: updatedTasks.length,
      tasks: updatedTasks,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to acknowledge tasks.' }, { status: 500 });
  }
}

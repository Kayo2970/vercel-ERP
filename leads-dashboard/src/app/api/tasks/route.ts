import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';
import { enqueueTaskEmailNotification } from '@/lib/task-email-queue';

export async function GET() {
  const items = await readCollection('tasks');
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const item = await request.json();
    const updated = await mutateCollection('tasks', (current) => {
      const idx = current.findIndex((t: any) => t.id === item.id);
      if (idx >= 0) {
        const copy = [...current];
        copy[idx] = item;
        return copy;
      }
      return [item, ...current];
    });
    const created = updated.find((t: any) => t.id === item.id);

    // Queue task email notification with 10-minute quiet buffer
    if (created) {
      try {
        const members = await readCollection('members');
        let targetEmail = created.assigneeEmail;
        let targetName = created.assignee;

        if (!targetEmail && created.assigneeId) {
          const match = members.find((m: any) => m.id === created.assigneeId);
          if (match) {
            targetEmail = match.email;
            targetName = match.name;
          }
        } else if (!targetEmail && created.assignee) {
          const match = members.find((m: any) => m.name.toLowerCase() === created.assignee.toLowerCase());
          if (match) {
            targetEmail = match.email;
            targetName = match.name;
          }
        }

        if (targetEmail) {
          await enqueueTaskEmailNotification({
            id: created.id,
            title: created.title,
            event: created.event || created.eventName,
            dueDate: created.dueDate,
            creatorName: created.creatorName || created.assignerName,
            assigneeEmail: targetEmail,
            assigneeName: targetName || 'Member',
          });
        }
      } catch (emailErr) {
        console.error('[tasks-api] Failed to enqueue task notification:', emailErr);
      }
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

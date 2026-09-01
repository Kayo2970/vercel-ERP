import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';
import { dispatchEmail, generateEventRosterEmailTemplate } from '@/lib/email-service';

export async function GET() {
  const items = await readCollection('events');
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const item = await request.json();
    const updated = await mutateCollection('events', (current) => {
      const idx = current.findIndex((e: any) => e.id === item.id);
      if (idx >= 0) {
        const copy = [...current];
        copy[idx] = item;
        return copy;
      }
      return [item, ...current];
    });
    const created = updated.find((e: any) => e.id === item.id);

    // Automated Email Dispatch for Event Committee Roster
    if (created && Array.isArray(created.committees)) {
      try {
        const members = await readCollection('members');

        for (const committee of created.committees) {
          const memberIds = committee.memberIds || [];
          for (const mId of memberIds) {
            const member = members.find((m: any) => m.id === mId);
            if (member && member.email) {
              const template = generateEventRosterEmailTemplate(
                member.name,
                created.title,
                committee.name,
                created.startDate
              );
              await dispatchEmail({
                to: member.email,
                subject: template.subject,
                bodyText: template.bodyText,
                bodyHtml: template.bodyHtml,
                category: 'EVENT_ROSTER',
              });
            }
          }
        }
      } catch (emailErr) {
        console.error('[events-api] Email dispatch failed:', emailErr);
      }
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { dispatchEmail } from '@/lib/email-service';
import { readCollection } from '@/lib/server-db';
import { Member } from '@/lib/local-data';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scope, recipientEmail, subject, bodyText, bodyHtml, category, badgeText, badgeColor } = body;

    if (!subject || !bodyText) {
      return NextResponse.json({ error: 'Subject and email content are required' }, { status: 400 });
    }

    // 1. Single recipient dispatch
    if (scope === 'SINGLE') {
      if (!recipientEmail) {
        return NextResponse.json({ error: 'Recipient email address is required' }, { status: 400 });
      }
      const log = await dispatchEmail({
        to: recipientEmail,
        subject,
        bodyText,
        bodyHtml,
        badgeText,
        badgeColor,
        category: category || 'DIRECT_MESSAGE',
      });
      return NextResponse.json({ count: 1, dispatched: [log] });
    }

    // 2. Scope broadcast dispatch
    const members = await readCollection<Member>('members');
    let targetMembers = members || [];

    if (scope !== 'ALL' && scope !== 'All Members') {
      targetMembers = targetMembers.filter(m => m.division === scope || m.role === scope);
    }

    const recipientEmails = Array.from(new Set(targetMembers.map(m => m.email).filter(Boolean)));
    if (recipientEmails.length === 0) {
      return NextResponse.json({ error: 'No members found matching the selected target scope' }, { status: 404 });
    }

    const dispatchedLogs = [];
    for (const email of recipientEmails) {
      const log = await dispatchEmail({
        to: email,
        subject,
        bodyText,
        bodyHtml,
        badgeText,
        badgeColor,
        category: category || 'ANNOUNCEMENT',
      });
      dispatchedLogs.push(log);
    }

    return NextResponse.json({ count: dispatchedLogs.length, dispatched: dispatchedLogs });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to send emails' }, { status: 500 });
  }
}

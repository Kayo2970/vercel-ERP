import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';
import { createActivationTokenAndSendEmail } from '@/lib/account-activation';

export async function GET() {
  const members = await readCollection('members');
  return NextResponse.json(members);
}

export async function POST(request: Request) {
  try {
    const member = await request.json();
    const newMemberPayload = {
      ...member,
      mustSetupPassword: true,
    };
    const updated = await mutateCollection('members', (current) => {
      if ((current || []).some((m: any) => m.email?.toLowerCase() === member.email?.toLowerCase())) {
        throw new Error(`Member with email ${member.email} already exists`);
      }
      return [...(current || []), newMemberPayload];
    });
    const created = updated.find((m: any) => m.id === member.id);

    let activationLink = '';
    if (created && created.email) {
      try {
        const host = request.headers.get('host');
        const proto = request.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
        const origin = request.headers.get('origin') || (host ? `${proto}://${host}` : undefined);

        const result = await createActivationTokenAndSendEmail({ id: created.id, name: created.name, email: created.email }, 'Super User', origin, request);
        activationLink = result.activationLink;
      } catch (emailErr) {
        console.error('[members-api] Welcome email dispatch failed:', emailErr);
      }
    }

    return NextResponse.json({ ...created, activationLink }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

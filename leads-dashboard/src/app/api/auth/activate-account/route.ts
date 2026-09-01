import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';
import { hashPassword } from '@/lib/password';

/** Validates an activation token and returns who it belongs to, without consuming it — lets the /activate page greet the member by name before they submit a password. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ valid: false, error: 'No activation token provided.' }, { status: 400 });
  }

  const activations = await readCollection('accountActivations');
  const matched = activations.find((a: any) => a.token === token);

  if (!matched) {
    return NextResponse.json({ valid: false, error: 'This activation link is invalid. It may have already been used — try signing in, or ask an admin to resend it.' }, { status: 404 });
  }

  if (Date.now() > matched.expiresAt) {
    return NextResponse.json({ valid: false, error: 'This activation link has expired. Ask an admin to resend it.' }, { status: 410 });
  }

  const members = await readCollection('members');
  const member = members.find((m: any) => m.id === matched.memberId);
  if (!member) {
    return NextResponse.json({ valid: false, error: 'The account this link belongs to no longer exists.' }, { status: 404 });
  }

  return NextResponse.json({ valid: true, name: member.name, email: member.email });
}

/** Consumes an activation token — sets the member's first real password and deletes the token. */
export async function POST(request: Request) {
  try {
    const { token, newPassword, dateOfBirth } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json({ error: 'Activation token and a new password are required.' }, { status: 400 });
    }
    if (newPassword.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters.' }, { status: 400 });
    }
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return NextResponse.json({ error: 'Date of birth is not in a valid format.' }, { status: 400 });
    }

    const activations = await readCollection('accountActivations');
    const matched = activations.find((a: any) => a.token === token);
    if (!matched) {
      return NextResponse.json({ error: 'This activation link is invalid or has already been used.' }, { status: 404 });
    }
    if (Date.now() > matched.expiresAt) {
      return NextResponse.json({ error: 'This activation link has expired. Ask an admin to resend it.' }, { status: 410 });
    }

    let memberName = 'User';
    let memberFound = false;
    await mutateCollection('members', (current) =>
      (current || []).map((m: any) => {
        if (m.id === matched.memberId) {
          memberFound = true;
          memberName = m.name;
          return {
            ...m,
            passwordHash: hashPassword(newPassword),
            // A new member is always created with mustSetupPassword: true
            // (see /api/members POST) so login knows to route them here
            // instead of straight to a password check. Leaving it true
            // after they successfully set a password here was making
            // login's mustSetupPassword check (checked before passwordHash)
            // send them right back through "set up your password" a
            // second time on their very next sign-in.
            mustSetupPassword: false,
            ...(dateOfBirth ? { dateOfBirth } : {}),
          };
        }
        return m;
      })
    );

    if (!memberFound) {
      return NextResponse.json({ error: 'The account this link belongs to no longer exists.' }, { status: 404 });
    }

    await mutateCollection('accountActivations', (current) => (current || []).filter((a: any) => a.id !== matched.id));

    await mutateCollection('auditLogs', (current) => [
      {
        id: `audit-${Date.now()}`,
        action: 'ACCOUNT_ACTIVATED',
        user: memberName,
        details: `${memberName} activated their account and set a password.`,
        timestamp: new Date().toISOString(),
      },
      ...(current || []),
    ]);

    return NextResponse.json({ success: true, message: 'Account activated! You can now sign in with your new password.' });
  } catch (err: any) {
    console.error('[activate-account-api] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

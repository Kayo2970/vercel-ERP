import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';
import { hashPassword } from '@/lib/password';

/**
 * Super User Admin Override: Consume admin override and set member's new password directly without OTP.
 */
export async function POST(request: Request) {
  try {
    const { email, newPassword } = await request.json();

    if (!email || !newPassword) {
      return NextResponse.json({ error: 'Email address and new password are required.' }, { status: 400 });
    }

    if (newPassword.length < 4) {
      return NextResponse.json({ error: 'New password must be at least 4 characters long.' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const members = await readCollection('members');
    const member = members.find((m: any) => m.email.toLowerCase() === trimmedEmail);

    if (!member) {
      return NextResponse.json({ error: 'Account not found in registered database.' }, { status: 404 });
    }

    if (!member.mustSetupPassword) {
      return NextResponse.json(
        { error: 'Admin override password setup is not active for this account. Use normal login or OTP reset.' },
        { status: 400 }
      );
    }

    let updatedUserRecord: any = null;

    await mutateCollection('members', (current) =>
      (current || []).map((m: any) => {
        if (m.email.toLowerCase() === trimmedEmail) {
          const updated = {
            ...m,
            passwordHash: hashPassword(newPassword),
            mustSetupPassword: false,
          };
          updatedUserRecord = updated;
          return updated;
        }
        return m;
      })
    );

    if (!updatedUserRecord) {
      return NextResponse.json({ error: 'Failed to update user password.' }, { status: 500 });
    }

    // Clean up any stale reset tokens for this user
    await mutateCollection('passwordResets', (current) =>
      (current || []).filter((r: any) => r.email !== trimmedEmail)
    );

    // Audit Log Entry
    await mutateCollection('auditLogs', (current) => [
      {
        id: `audit-${Date.now()}`,
        action: 'ADMIN_OVERRIDE_PASSWORD_RESET',
        user: updatedUserRecord.name,
        details: `${updatedUserRecord.name} (${trimmedEmail}) successfully set a new password via Super User admin override (no OTP required).`,
        timestamp: new Date().toISOString(),
      },
      ...(current || []),
    ]);

    // Strip passwordHash before returning session user object
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safeUser } = updatedUserRecord;

    return NextResponse.json({
      success: true,
      user: safeUser,
      message: 'New password set successfully! Signing you in...',
    });
  } catch (err: any) {
    console.error('[override-password-api] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

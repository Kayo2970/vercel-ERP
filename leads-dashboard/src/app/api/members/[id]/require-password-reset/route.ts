import { NextResponse } from 'next/server';
import { mutateCollection } from '@/lib/server-db';

/**
 * Super User Admin Override: Request or cancel password reset requirement for a member.
 * When set to true, the member will be prompted to set up a new password upon entering
 * their email on the login page, without needing an OTP code.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const mustReset = body.mustReset !== undefined ? Boolean(body.mustReset) : true;

    let memberFound = false;
    let memberName = '';
    let memberEmail = '';

    await mutateCollection('members', (current) =>
      (current || []).map((m: any) => {
        if (m.id === id) {
          memberFound = true;
          memberName = m.name;
          memberEmail = m.email;
          return {
            ...m,
            mustSetupPassword: mustReset,
          };
        }
        return m;
      })
    );

    if (!memberFound) {
      return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    }

    const actionText = mustReset
      ? `Super User requested password reset for member ${memberName} (${memberEmail}). Direct password setup without OTP enabled on login.`
      : `Super User cleared password reset request for member ${memberName} (${memberEmail}).`;

    await mutateCollection('auditLogs', (current) => [
      {
        id: `audit-${Date.now()}`,
        action: 'ADMIN_REQUESTED_PASSWORD_RESET',
        user: 'Super User',
        details: actionText,
        timestamp: new Date().toISOString(),
      },
      ...(current || []),
    ]);

    return NextResponse.json({
      success: true,
      mustSetupPassword: mustReset,
      message: mustReset
        ? `Password setup request set for ${memberName}. They will be prompted to set a new password on their next login attempt without OTP.`
        : `Password setup request cleared for ${memberName}.`,
    });
  } catch (err: any) {
    console.error('[require-password-reset-api] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

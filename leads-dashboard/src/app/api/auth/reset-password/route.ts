import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';
import { hashPassword } from '@/lib/password';

export async function POST(request: Request) {
  try {
    const { email, otp, newPassword } = await request.json();

    if (!email || !otp || !newPassword) {
      return NextResponse.json({ error: 'Email, OTP code, and new password are required.' }, { status: 400 });
    }

    if (newPassword.length < 4) {
      return NextResponse.json({ error: 'New password must be at least 4 characters.' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const resets = await readCollection('passwordResets');
    const matchedReset = resets.find((r: any) => r.email === trimmedEmail && r.otp === otp.trim());

    if (!matchedReset) {
      return NextResponse.json({ error: 'Invalid verification code. Please check your email and try again.' }, { status: 400 });
    }

    // 5-minute validity check
    const now = Date.now();
    if (now > matchedReset.expiresAt) {
      return NextResponse.json(
        { error: 'The 5-minute verification code has expired. Please request a new password reset code.' },
        { status: 400 }
      );
    }

    // Update user password in database
    let memberUpdated = false;
    let memberName = 'User';

    await mutateCollection('members', (current) => {
      return (current || []).map((m: any) => {
        if (m.email.toLowerCase() === trimmedEmail) {
          memberUpdated = true;
          memberName = m.name;
          return {
            ...m,
            passwordHash: hashPassword(newPassword),
          };
        }
        return m;
      });
    });

    if (!memberUpdated) {
      return NextResponse.json({ error: 'Account not found in registered members database.' }, { status: 404 });
    }

    // Remove used reset token
    await mutateCollection('passwordResets', (current) => {
      return (current || []).filter((r: any) => r.id !== matchedReset.id);
    });

    // Add Audit Log Entry
    const auditLog = {
      id: `audit-${Date.now()}`,
      action: 'PASSWORD_RESET',
      user: memberName,
      details: `Password reset successfully via 5-minute OTP for email ${trimmedEmail}`,
      timestamp: new Date().toISOString(),
    };
    await mutateCollection('auditLogs', (current) => [auditLog, ...(current || [])]);

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.',
    });
  } catch (err: any) {
    console.error('[reset-password-api] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

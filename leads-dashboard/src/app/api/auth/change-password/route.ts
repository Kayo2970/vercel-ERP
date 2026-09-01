import { NextResponse } from 'next/server';
import { mutateCollection, readCollection } from '@/lib/server-db';
import { hashPassword, verifyPassword } from '@/lib/password';

/**
 * Self-service password change from Settings. Verifying currentPassword
 * (previously collected in the UI but silently ignored) and hashing
 * newPassword both require Node's crypto, so — like login — this can't run
 * as a client-side check; it has to be a real server round-trip.
 */
export async function POST(request: Request) {
  try {
    const { email, currentPassword, newPassword } = await request.json();
    if (!email || !currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password are required.' }, { status: 400 });
    }
    if (newPassword.length < 4) {
      return NextResponse.json({ error: 'New password must be at least 4 characters.' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const members = await readCollection<any>('members');
    const matchedUser = members.find(m => m.email.toLowerCase() === trimmedEmail);

    if (!matchedUser) {
      return NextResponse.json({ error: 'Could not find your member record.' }, { status: 404 });
    }
    if (!verifyPassword(currentPassword, matchedUser.passwordHash)) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
    }

    await mutateCollection('members', (current) =>
      (current || []).map((m: any) =>
        m.email.toLowerCase() === trimmedEmail
          ? { ...m, passwordHash: hashPassword(newPassword) }
          : m
      )
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[change-password-api] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { readCollection } from '@/lib/server-db';
import { verifyPassword } from '@/lib/password';

/**
 * Real server-side login check. Password verification (scrypt + timing-safe
 * compare) can only run server-side — Node's crypto isn't available in the
 * browser — so this replaces what used to be a client-side-only check
 * against a plaintext field. passwordHash is never included in the response.
 */
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const members = await readCollection<any>('members');
    const matchedUser = members.find(m => m.email.toLowerCase() === trimmedEmail);

    if (!matchedUser) {
      return NextResponse.json(
        { error: "We couldn't find an account with that email. Contact your committee head if you believe this is a mistake." },
        { status: 401 }
      );
    }

    if (matchedUser.status === 'Terminated') {
      const terminatedDate = matchedUser.terminatedAt
        ? new Date(matchedUser.terminatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : null;
      return NextResponse.json(
        {
          error: terminatedDate
            ? `You have been terminated from LEADS Next Gen Centre effective ${terminatedDate}. You have lost access to the portal. Contact your Centre Head if you believe this is a mistake.`
            : 'You have been terminated from LEADS Next Gen Centre and have lost access to the portal. Contact your Centre Head if you believe this is a mistake.',
        },
        { status: 403 }
      );
    }

    if (matchedUser.mustSetupPassword) {
      return NextResponse.json({
        requiresPasswordReset: true,
        email: matchedUser.email,
        name: matchedUser.name,
        message: 'Super User has requested you to set up a new password for your account. Please enter your new password below.',
      });
    }

    if (!matchedUser.passwordHash) {
      return NextResponse.json(
        { error: "This account hasn't been activated yet. Check your email for the \"Set Up My Account\" link, or ask an admin to resend it." },
        { status: 403 }
      );
    }

    if (!verifyPassword(password, matchedUser.passwordHash)) {
      return NextResponse.json(
        { error: "Incorrect password. If you forgot your password, click 'Forgot Password?' below." },
        { status: 401 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stripped from the response on purpose
    const { passwordHash, ...safeUser } = matchedUser;
    return NextResponse.json({ user: safeUser });
  } catch (err: any) {
    console.error('[login-api] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

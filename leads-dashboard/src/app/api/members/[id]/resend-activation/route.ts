import { NextResponse } from 'next/server';
import { readCollection } from '@/lib/server-db';
import { createActivationTokenAndSendEmail } from '@/lib/account-activation';

/** Re-sends the "set up your account" welcome email for a member who hasn't activated yet. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const members = await readCollection('members');
    const member = members.find((m: any) => m.id === id);

    if (!member) {
      return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    }
    if (member.passwordHash) {
      return NextResponse.json({ error: 'This member already has an account — use Forgot Password from the login screen instead.' }, { status: 400 });
    }

    const host = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    const origin = request.headers.get('origin') || (host ? `${proto}://${host}` : undefined);

    const { activationLink } = await createActivationTokenAndSendEmail({ id: member.id, name: member.name, email: member.email }, 'Super User', origin, request);
    return NextResponse.json({
      success: true,
      activationLink,
      message: `Welcome email sent to ${member.email} with password setup link.`,
    });
  } catch (err: any) {
    console.error('[resend-activation-api] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to resend the welcome email.' }, { status: 500 });
  }
}

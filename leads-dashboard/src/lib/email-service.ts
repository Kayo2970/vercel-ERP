import nodemailer, { Transporter } from 'nodemailer';
import path from 'path';
import crypto from 'crypto';
import { mutateCollection, readCollection } from './server-db';
import { DirectSendTransport } from './direct-smtp-transport';

// Referenced as cid:leads-logo in wrapInMasterEmailTemplate — attach this
// to every sendMail() call so the header logo is embedded, not fetched
// from a remote URL.
const EMAIL_LOGO_ATTACHMENT = {
  filename: 'leads-logo.png',
  path: path.join(process.cwd(), 'src', 'assets', 'leads-email-logo.png'),
  cid: 'leads-logo',
};

export interface EmailLog {
  id: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  category: 'AUTH_OTP' | 'ANNOUNCEMENT' | 'TASK_ASSIGNMENT' | 'EVENT_ROSTER' | 'SYSTEM' | 'DIRECT_MESSAGE' | 'GUEST_INVITE' | 'ACCOUNT_ACTIVATION' | 'BIRTHDAY';
  status: 'SENT' | 'FAILED';
  sentAt: string;
  // Diagnostics for "shows SENT but never arrives" — a resolved sendMail()
  // only means the SMTP server ACCEPTED the message for delivery, not that
  // it reached the recipient's inbox. These surface what the server
  // actually said, without needing shell/log access on the VPS.
  errorMessage?: string;       // set when the send itself threw (auth failure, connection refused, timeout, ...)
  smtpResponse?: string;       // the raw final SMTP response line, e.g. "250 2.0.0 OK ..."
  rejectedRecipients?: string[]; // addresses the SMTP server explicitly rejected, if any
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  badgeText?: string;
  badgeColor?: string;
  category: 'AUTH_OTP' | 'ANNOUNCEMENT' | 'TASK_ASSIGNMENT' | 'EVENT_ROSTER' | 'SYSTEM' | 'DIRECT_MESSAGE' | 'GUEST_INVITE' | 'ACCOUNT_ACTIVATION' | 'BIRTHDAY';
}

export interface EmailSettings {
  id: string; // 'default'
  // 'direct_send' is the built-in outbound engine (src/lib/direct-smtp-transport.ts):
  // the app itself resolves each recipient's MX records and delivers straight
  // to their mail server, with no relay/API in between — the other four
  // options stay available and unaffected for whoever prefers a relay.
  provider: 'gmail' | 'outlook' | 'custom' | 'local_postfix' | 'direct_send';
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  authUser: string;
  authPass: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  // HELO/EHLO identity used only by the 'direct_send' provider — must match
  // the reverse-DNS (PTR) record on the VPS's outbound IP, or most receiving
  // mail servers will reject the connection outright.
  heloHostname?: string;
  // Optional DKIM signing (nodemailer signs the message itself, independent
  // of whatever the relay/Postfix does) — the single most effective lever
  // this app can pull for automated mail landing in spam, since a relay
  // often doesn't sign on behalf of a domain that isn't its own. Requires
  // the matching public key published as a DNS TXT record at
  // `<dkimSelector>._domainkey.<dkimDomain>` — signing is skipped entirely
  // unless all three fields are set, so this is a no-op until configured.
  dkimDomain?: string;
  dkimSelector?: string;
  dkimPrivateKey?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  id: 'default',
  provider: 'gmail',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  secure: false,
  authUser: process.env.ANNOUNCEMENT_FROM_EMAIL || 'leads@msruas.ac.in',
  authPass: process.env.SMTP_PASS || '',
  fromName: process.env.ANNOUNCEMENT_FROM_NAME || 'LEADS Next Gen Centre',
  fromEmail: process.env.ANNOUNCEMENT_FROM_EMAIL || 'leads@msruas.ac.in',
  replyTo: process.env.ANNOUNCEMENT_FROM_EMAIL || 'leads@msruas.ac.in',
  updatedAt: new Date().toISOString(),
};

export async function getEmailSettings(): Promise<EmailSettings> {
  try {
    const list = await readCollection<EmailSettings>('emailSettings');
    if (list && list.length > 0) {
      return { ...DEFAULT_EMAIL_SETTINGS, ...list[0] };
    }
  } catch (e) {
    console.error('[email-service] Failed to read emailSettings collection:', e);
  }
  return DEFAULT_EMAIL_SETTINGS;
}

/**
 * Nodemailer's DKIM signer (nodemailer/lib/dkim/sign.js) silently drops the
 * signature — no error, no log — if crypto.createSign().sign() throws on a
 * malformed key, e.g. a paste artifact where real line breaks became
 * literal "\n" text. The message still sends successfully with no
 * DKIM-Signature header at all, which the receiving server (correctly)
 * treats as a failed authentication check — a "config looks right, save
 * succeeded, send succeeded, but signing silently never happened" failure
 * mode that's nearly impossible to diagnose from the outside. Validating
 * here turns that into an immediate, specific error at save time instead.
 */
function normalizeAndValidateDkimKey(rawKey: string): string {
  let key = rawKey.trim();
  if (!key.includes('\n') && key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }
  try {
    crypto.createPrivateKey(key);
  } catch {
    throw new Error(
      'DKIM Private Key is not a valid PEM private key. Make sure you pasted the whole block, ' +
      'including the -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines, with real line breaks.'
    );
  }
  return key;
}

export async function updateEmailSettings(settings: Partial<EmailSettings>, actorName: string): Promise<EmailSettings> {
  const current = await getEmailSettings();
  const updated: EmailSettings = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
    updatedBy: actorName,
  };

  if (updated.dkimPrivateKey) {
    updated.dkimPrivateKey = normalizeAndValidateDkimKey(updated.dkimPrivateKey);
  }

  await mutateCollection<EmailSettings>('emailSettings', () => [updated]);
  return updated;
}

async function buildTransporter(overrideSettings?: EmailSettings): Promise<{ transporter: Transporter; settings: EmailSettings; effectiveHost: string; effectivePort: number }> {
  const settings = overrideSettings || await getEmailSettings();

  const dkim = settings.dkimDomain && settings.dkimSelector && settings.dkimPrivateKey
    ? {
        domainName: settings.dkimDomain.trim(),
        keySelector: settings.dkimSelector.trim(),
        privateKey: settings.dkimPrivateKey,
      }
    : undefined;

  if (settings.provider === 'direct_send') {
    // Built-in engine: no host/port/auth to configure — it connects
    // straight to each recipient's own mail server. DKIM signing (above)
    // still applies here exactly as it does for every other provider,
    // since Nodemailer signs the message before handing it to any
    // transport, not just its own SMTPTransport.
    const heloHostname = (settings.heloHostname || settings.dkimDomain || 'localhost').trim();
    const t = nodemailer.createTransport(
      new DirectSendTransport({ heloHostname }),
      dkim ? { dkim } : undefined,
    );
    return { transporter: t, settings, effectiveHost: `direct-send via ${heloHostname}`, effectivePort: 25 };
  }

  let host = settings.smtpHost;
  let port = settings.smtpPort;
  let secure = settings.secure;
  let auth: { user: string; pass: string } | undefined = undefined;

  const cleanedPass = (settings.authPass || '').replace(/\s+/g, '');

  if (settings.provider === 'gmail') {
    host = 'smtp.gmail.com';
    port = settings.smtpPort || 587;
    if (settings.authUser && settings.authPass) {
      auth = { user: settings.authUser.trim(), pass: cleanedPass };
    }
  } else if (settings.provider === 'outlook') {
    host = 'smtp.office365.com';
    port = settings.smtpPort || 587;
    if (settings.authUser && settings.authPass) {
      auth = { user: settings.authUser.trim(), pass: cleanedPass };
    }
  } else if (settings.provider === 'custom') {
    host = settings.smtpHost || 'smtp.gmail.com';
    port = settings.smtpPort || 587;
    if (settings.authUser && settings.authPass) {
      auth = { user: settings.authUser.trim(), pass: cleanedPass };
    }
  } else if (settings.provider === 'local_postfix') {
    host = process.env.SMTP_HOST || 'localhost';
    port = Number(process.env.SMTP_PORT) || 25;
    secure = false;
    auth = undefined;
  }

  const t = nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
    dkim,
    pool: true,
    maxConnections: 3,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
    family: 4, // Force IPv4 to prevent Microsoft/Gmail IPv6 SPF/DKIM block (Error 450 4.7.26)
  } as any);

  return { transporter: t, settings, effectiveHost: host, effectivePort: port };
}

// Subjects land in <title> verbatim below and can carry user-supplied text
// (an event/task/announcement title) — escape it so that text can't break
// out of the tag and corrupt the rest of the <head>.
function escapeHtmlForTitle(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Master Institutional Email Wrapper Template
 * Clean, standard corporate email layout (inspired by PayPal/Stripe transactional notices) with:
 * 1. Minimalist Institution Header Banner & LEADS Logo
 * 2. Styled Content Area (plain white container, high contrast, clean typography)
 * 3. Optional Badge Header Tag (can be omitted completely for clean direct emails & invites)
 * 4. Standardized Institutional Footer with Copyright & IP Licensing Notice for Kayomarz Pavri
 */
export function wrapInMasterEmailTemplate(options: {
  // The HTML <title> — spam filters (SpamAssassin's HTML_TITLE_SUBJ_DIFF rule)
  // penalize a <title> that doesn't match the email's Subject header, since
  // that mismatch is a common bulk-mail template fingerprint. Every caller
  // should pass its actual subject line here.
  pageTitle: string;
  headerTitle?: string;
  headerSubtitle?: string;
  badgeText?: string;
  badgeColor?: string;
  bodyContentHtml: string;
}): string {
  const isOmittedBadge = !options.badgeText || ['NONE', 'None', 'NO_BADGE', 'none'].includes(options.badgeText.trim());

  const badgeHtml = isOmittedBadge
    ? ''
    : `<span style="font-size: 11px; font-weight: 700; color: ${options.badgeColor || '#0284c7'}; background: #f0f9ff; border: 1px solid #bae6fd; padding: 4px 10px; border-radius: 6px; display: inline-block; margin-bottom: 16px;">${options.badgeText}</span>`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtmlForTitle(options.pageTitle)}</title>
    </head>
    <body style="background-color: #f8fafc; margin: 0; padding: 24px 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; width: 100%; box-sizing: border-box;">
      <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
        
        <!-- Header Banner with Clean Typography Branding -->
        <div style="background-color: #0f172a; padding: 24px 32px; text-align: center;">
          <div style="display: inline-block; padding: 5px 12px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 6px; margin-bottom: 8px;">
            <span style="color: #38bdf8; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">LEADS NEXT GEN CENTRE</span>
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0 0; font-weight: 500;">Ramaiah University of Applied Sciences &middot; Operations Portal</p>
        </div>

        <!-- Main Content Area -->
        <div style="padding: 28px 32px;">
          ${badgeHtml}
          ${options.headerTitle ? `<h3 style="margin-top: 0; color: #0f172a; font-size: 18px; font-weight: 700; margin-bottom: ${options.headerSubtitle ? '4px' : '18px'};">${options.headerTitle}</h3>` : ''}
          ${options.headerSubtitle ? `<p style="color: #64748b; font-size: 13px; margin-top: 0; margin-bottom: 18px; font-weight: 400;">${options.headerSubtitle}</p>` : ''}

          <div style="color: #334155; font-size: 14px; line-height: 1.65;">
            ${options.bodyContentHtml}
          </div>
        </div>

        <!-- Standardized Institutional Footer -->
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: center; font-size: 11px; color: #64748b; line-height: 1.6;">
          <p style="margin: 0 0 6px 0; color: #475569; font-weight: 600;">© 2026 LEADS Next Gen Centre &middot; MSRUAS Internal Operations Portal</p>
          <p style="margin: 0 0 6px 0; color: #94a3b8;">This is an automated operational notice. Authorised recipient access only.</p>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 8px; color: #64748b; font-size: 10px;">
            All Intellectual Property, Copyrights & Licensing belong exclusively to <strong style="color: #0284c7;">Kayomarz Pavri</strong>.
          </div>
        </div>

      </div>
    </body>
    </html>
  `;
}

/**
 * Turns a raw Nodemailer/SMTP failure into a plain-English diagnosis. The
 * #1 real-world cause of "I entered the correct company email and password
 * but it still won't send through Outlook" is that Microsoft 365 disables
 * SMTP AUTH (plain username/password sign-in) tenant-wide by default as of
 * 2023 — no password is ever accepted until an admin re-enables it for that
 * specific mailbox. Nodemailer surfaces Microsoft's own rejection text
 * (e.g. "535 5.7.139 ... SmtpClientAuthenticationDisabled") verbatim, which
 * reads like a generic auth error unless it's translated here.
 */
function diagnoseSmtpFailure(err: any, provider: string): string {
  const raw = err?.message || String(err);
  const code = String(err?.code || err?.responseCode || '');
  let diagnosis = '';

  if (/SmtpClientAuthentication is disabled/i.test(raw) || /5\.7\.139/.test(raw)) {
    diagnosis =
      'Microsoft 365 has SMTP AUTH (plain username/password sign-in) turned OFF for this mailbox by default — ' +
      'this is a tenant setting, not a wrong password. An admin must enable it: Microsoft 365 admin center → ' +
      'Users → Active users → select this mailbox → Mail → "Manage email apps" → turn on Authenticated SMTP ' +
      '(or run Set-CASMailbox -Identity <email> -SmtpClientAuthenticationDisabled $false in Exchange Online PowerShell). ' +
      'No amount of re-entering the password will fix this until that switch is flipped.';
  } else if (provider === 'outlook' && /535|Invalid login|Username and Password not accepted/i.test(raw)) {
    diagnosis =
      'Outlook/Microsoft 365 rejected the sign-in. If this account has multi-factor authentication (MFA) enabled, ' +
      'the regular account password will not work over SMTP — an admin needs to either create an app password ' +
      'for this mailbox or enable SMTP AUTH as described above. Also confirm there is no typo in the email or password.';
  } else if (/535|Invalid login|Username and Password not accepted/i.test(raw)) {
    diagnosis = 'The mail server rejected the username/password combination — double-check for typos, and whether an app-specific password is required.';
  } else if (/ETIMEDOUT|ESOCKET|ECONNREFUSED|EHOSTUNREACH/i.test(code + raw)) {
    diagnosis =
      `Could not reach the ${provider === 'outlook' ? 'Outlook/Microsoft 365' : 'mail'} server at all — this is a network-reachability ` +
      'failure, not a credentials problem. The most common cause is a hosting provider blocking outbound SMTP ports ' +
      '(587/465) by default to prevent spam abuse; contact your VPS/hosting support to have it unblocked, or try the ' +
      '"Direct Send" provider instead.';
  } else if (/STARTTLS/i.test(raw)) {
    diagnosis = 'The server requires STARTTLS but the connection did not negotiate it — confirm the port is 587 with "secure" off (STARTTLS), not 465.';
  }

  return diagnosis ? `${diagnosis}\n\nRaw server response: ${raw}` : raw;
}

/**
 * `draftSettings` lets the caller test whatever is currently typed into the
 * Settings form — including a provider switch or new credentials that
 * haven't been saved yet. Without this, "Test Connection" always verified
 * the last-*saved* config, silently ignoring in-progress edits: selecting
 * Outlook and testing it could report success/failure for a stale Gmail
 * config underneath, with no way to tell the two apart from the result.
 * Fields the draft leaves unset (DKIM, replyTo, ...) still fall back to
 * whatever is already persisted.
 */
export async function testEmailConnection(testRecipient: string, draftSettings?: Partial<EmailSettings>): Promise<{ success: boolean; message: string }> {
  try {
    const persisted = await getEmailSettings();
    const effectiveSettings: EmailSettings = draftSettings ? { ...persisted, ...draftSettings } : persisted;
    const { transporter: t, settings, effectiveHost, effectivePort } = await buildTransporter(effectiveSettings);
    await t.verify();

    const from = `${settings.fromName || 'LEADS Next Gen Centre'} <${settings.fromEmail || 'leads@msruas.ac.in'}>`;

    const bodyHtml = wrapInMasterEmailTemplate({
      pageTitle: `[LEADS Test Email] SMTP Client Verification`,
      headerTitle: `SMTP Connection Verified`,
      headerSubtitle: `Diagnostic Health Check Successful`,
      badgeText: `SMTP Operational`,
      badgeColor: `#15803d`,
      bodyContentHtml: `
        <p style="margin-top: 0; color: #0f172a; font-weight: 600;">Your LEADS Dashboard email client and SMTP server settings are operational.</p>
        <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 14px 18px; border-radius: 10px; margin: 16px 0; font-size: 12px;">
          <p style="margin: 0 0 6px 0; color: #64748b;"><strong>Service Provider:</strong> <span style="color: #0284c7; font-weight: 700;">${settings.provider.toUpperCase()}</span></p>
          <p style="margin: 0 0 6px 0; color: #64748b;"><strong>SMTP Host & Port:</strong> <span style="color: #0f172a; font-family: monospace;">${effectiveHost}:${effectivePort}</span></p>
          <p style="margin: 0; color: #64748b;"><strong>Sender Name:</strong> <span style="color: #0f172a;">${settings.fromName}</span></p>
        </div>
        <p style="color: #64748b; font-size: 11px; margin-bottom: 0;">Diagnostic executed at ${new Date().toLocaleString()}</p>
      `
    });

    const info = await t.sendMail({
      from,
      to: testRecipient,
      subject: `[LEADS Test Email] SMTP Client Verification`,
      text: `Hello,\n\nThis is a test notification verifying that your LEADS Dashboard email client and SMTP server (${settings.provider.toUpperCase()} @ ${effectiveHost}) are properly configured and operational.\n\nSent at: ${new Date().toLocaleString()}`,
      html: bodyHtml,
      xMailer: false,
    });

    if (info.rejected && info.rejected.length > 0) {
      return {
        success: false,
        message: `SMTP server rejected the recipient (${info.rejected.join(', ')}). Server said: ${info.response || 'no response text'}`,
      };
    }

    return {
      success: true,
      message: `SMTP accepted the message for ${testRecipient} (server said: "${info.response || 'OK'}"). This confirms the SMTP handoff worked.`,
    };
  } catch (err: any) {
    console.error('[email-service] SMTP Connection Test Failed:', err);
    const provider = draftSettings?.provider || (await getEmailSettings()).provider;
    return { success: false, message: err ? diagnoseSmtpFailure(err, provider) : 'Failed to establish connection to SMTP server.' };
  }
}

export async function dispatchEmail(payload: SendEmailPayload): Promise<EmailLog> {
  let badgeTextToUse: string | undefined = payload.badgeText;
  if (!badgeTextToUse) {
    if (payload.category === 'ANNOUNCEMENT') badgeTextToUse = 'Official Announcement';
    else if (payload.category === 'TASK_ASSIGNMENT') badgeTextToUse = 'Task Assignment';
    else if (payload.category === 'EVENT_ROSTER') badgeTextToUse = 'Event Roster';
    else if (payload.category === 'ACCOUNT_ACTIVATION') badgeTextToUse = 'Account Notice';
    else if (payload.category === 'BIRTHDAY') badgeTextToUse = 'Greetings';
    else badgeTextToUse = undefined;
  }

  const defaultFormattedHtml = wrapInMasterEmailTemplate({
    pageTitle: payload.subject,
    headerTitle: payload.subject,
    badgeText: badgeTextToUse,
    badgeColor: payload.badgeColor,
    bodyContentHtml: `<div style="white-space: pre-wrap; font-size: 14px; line-height: 1.7; color: #1e293b;">${payload.bodyText}</div>`
  });

  const bodyHtml = payload.bodyHtml || defaultFormattedHtml;
  let status: 'SENT' | 'FAILED' = 'FAILED';
  let errorMessage: string | undefined;
  let smtpResponse: string | undefined;
  let rejectedRecipients: string[] | undefined;

  try {
    const { transporter: t, settings } = await buildTransporter();
    const from = `${settings.fromName || 'LEADS Next Gen Centre'} <${settings.fromEmail || 'leads@msruas.ac.in'}>`;

    const domain = (settings.fromEmail || 'leadsnextgencentre.online').split('@')[1] || 'leadsnextgencentre.online';
    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 9)}@${domain}>`;

    const isBulkCategory = payload.category === 'ANNOUNCEMENT' || payload.category === 'EVENT_ROSTER' || payload.category === 'GUEST_INVITE';
    const unsubscribeAddress = settings.replyTo || settings.fromEmail;
    const headers: Record<string, string> = {
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'OOF, AutoReply, Async, All',
      'Message-ID': messageId,
      'X-Entity-Ref-ID': messageId,
      'X-Priority': '3',
      'Importance': 'normal',
    };
    if (isBulkCategory && unsubscribeAddress) {
      headers['List-Unsubscribe'] = `<mailto:${unsubscribeAddress}?subject=Unsubscribe>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    const info = await t.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.bodyText,
      html: bodyHtml,
      replyTo: settings.replyTo || settings.fromEmail,
      xMailer: false,
      headers,
    });

    smtpResponse = info.response;
    if (info.rejected && info.rejected.length > 0) {
      const rejectedList = info.rejected.map(String);
      rejectedRecipients = rejectedList;
      if (!info.accepted || info.accepted.length === 0) {
        status = 'FAILED';
        errorMessage = `SMTP server rejected all recipients: ${rejectedList.join(', ')}`;
      } else {
        status = 'SENT';
      }
    } else {
      status = 'SENT';
    }
  } catch (err) {
    const provider = (await getEmailSettings()).provider;
    errorMessage = diagnoseSmtpFailure(err, provider);
    console.error(`[email-service] Failed to send to ${payload.to}:`, errorMessage);
  }

  const newEmail: EmailLog = {
    id: `email-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    to: payload.to,
    subject: payload.subject,
    bodyText: payload.bodyText,
    bodyHtml,
    category: payload.category,
    status,
    sentAt: new Date().toISOString(),
    errorMessage,
    smtpResponse,
    rejectedRecipients,
  };

  try {
    await mutateCollection<EmailLog>('emails', (current) => [newEmail, ...(current || [])]);
  } catch (err) {
    console.error('[email-service] Failed to persist email to database:', err);
  }

  return newEmail;
}

export function generateOtpEmailTemplate(name: string, otp: string): { subject: string; bodyText: string; bodyHtml: string } {
  const subject = `LEADS Portal Security Code: ${otp}`;
  const bodyText = `Hello ${name},\n\n` +
    `You requested a password reset for your LEADS Next Gen Dashboard account.\n\n` +
    `Verification Code: ${otp}\n\n` +
    `This code is valid for 5 minutes. If you did not request this code, please ignore this email.\n\n` +
    `Regards,\nLEADS Next Gen Centre, MSRUAS`;

  const bodyHtml = wrapInMasterEmailTemplate({
    pageTitle: subject,
    headerTitle: `Password Reset Request`,
    headerSubtitle: `Security Verification Code`,
    badgeText: `Security Verification`,
    badgeColor: `#0284c7`,
    bodyContentHtml: `
      <p style="margin-top: 0; color: #0f172a; font-size: 14px;">Hello <strong>${name}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">You requested a password reset for your LEADS account. Use the verification code below to complete your password update:</p>

      <div style="text-align: center; margin: 28px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0f172a; background: #f8fafc; border: 1px solid #cbd5e1; padding: 14px 28px; border-radius: 10px; display: inline-block;">
          ${otp}
        </span>
        <p style="color: #64748b; font-size: 12px; margin-top: 10px;">Valid for 5 minutes</p>
      </div>

      <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 0;">If you did not request this code, you can safely ignore this message.</p>
    `
  });

  return { subject, bodyText, bodyHtml };
}

/**
 * Template Generator: Welcome / Account Activation.
 * Sent once, right when a member is first added to the Directory — the
 * account exists (in the members collection) but has no passwordHash yet,
 * so this link is the only way in until the recipient sets their own
 * password. The link carries a long-lived opaque token (see
 * src/lib/account-activation.ts), not a short OTP, since it's meant to be
 * clicked from an inbox rather than typed in.
 */
export function generateWelcomeActivationEmailTemplate(name: string, activationLink: string): { subject: string; bodyText: string; bodyHtml: string } {
  const subject = `LEADS Portal Account Activation: ${name}`;
  const bodyText = `Hello ${name},\n\n` +
    `An account has been created for you on the LEADS Next Gen Centre Operations Dashboard.\n\n` +
    `Set your password and activate your account:\n${activationLink}\n\n` +
    `Regards,\nLEADS Next Gen Centre, MSRUAS`;

  const bodyHtml = wrapInMasterEmailTemplate({
    pageTitle: subject,
    headerTitle: `Account Activation`,
    headerSubtitle: `LEADS Operations Portal`,
    badgeText: `Account Setup`,
    badgeColor: `#0284c7`,
    bodyContentHtml: `
      <p style="margin-top: 0; color: #0f172a; font-size: 14px;">Hello <strong>${name}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">You have been added to the LEADS Next Gen Centre roster. Select the link below to set your account password:</p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${activationLink}" style="display: inline-block; background: #0284c7; color: #ffffff; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
          Set Up My Account
        </a>
      </div>

      <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 0;">If the button does not open, copy and paste this link into your browser:<br /><span style="word-break: break-all; color: #0284c7;">${activationLink}</span></p>
    `
  });

  return { subject, bodyText, bodyHtml };
}

/**
 * Template Generator: Welcome Email when added to Directory
 */
export function generateNewMemberWelcomeTemplate(member: {
  name: string;
  email: string;
  role: string;
  division?: string;
  department?: string;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const roleStr = member.role || 'Member';
  const divisionStr = member.division || 'Core Committee';
  const departmentStr = member.department ? ` (${member.department})` : '';

  const subject = `LEADS Portal Account Created: ${member.name}`;
  const bodyText = `Hello ${member.name},\n\n` +
    `Welcome to LEADS Next Gen Centre. You have officially been registered as a member on the LEADS Operations Dashboard.\n\n` +
    `Account Summary:\n` +
    `• Designation / Role: ${roleStr}\n` +
    `• Division: ${divisionStr}${departmentStr}\n` +
    `• Registered Email: ${member.email}\n\n` +
    `Password Setup:\n` +
    `When you log in for the first time at https://leadsnextgencentre.online using your email (${member.email}), you will be prompted directly to set your password.\n\n` +
    `Regards,\nLEADS Next Gen Centre, MSRUAS`;

  const bodyHtml = wrapInMasterEmailTemplate({
    pageTitle: subject,
    headerTitle: `Welcome to LEADS Next Gen Centre`,
    headerSubtitle: `Member Registration Notice`,
    badgeText: `Official Notice`,
    badgeColor: `#0284c7`,
    bodyContentHtml: `
      <p style="margin-top: 0; color: #0f172a; font-size: 14px;">Hello <strong>${member.name}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">You have officially been registered as a member of <strong>LEADS Next Gen Centre</strong>. Here are your onboarding details:</p>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7; padding: 18px 22px; border-radius: 10px; margin: 20px 0; font-size: 13px;">
        <p style="margin: 0 0 8px 0; color: #64748b;"><strong>Designation / Role:</strong> <span style="color: #0f172a; font-weight: 700; font-size: 14px;">${roleStr}</span></p>
        <p style="margin: 0 0 8px 0; color: #64748b;"><strong>Division:</strong> <span style="color: #0f172a; font-weight: 600;">${divisionStr}${departmentStr}</span></p>
        <p style="margin: 0; color: #64748b;"><strong>Registered Email:</strong> <span style="color: #0284c7; font-family: monospace; font-weight: 600;">${member.email}</span></p>
      </div>

      <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 16px 20px; border-radius: 10px; margin: 20px 0;">
        <h4 style="margin: 0 0 6px 0; color: #0369a1; font-size: 14px; font-weight: 700;">Password Setup Instructions</h4>
        <p style="margin: 0; color: #334155; font-size: 13px; line-height: 1.5;">When you log in for the first time, simply enter your registered email address (<strong>${member.email}</strong>). You will be prompted directly to set up your password.</p>
      </div>

      <div style="text-align: center; margin: 28px 0;">
        <a href="https://leadsnextgencentre.online" style="display: inline-block; background: #0284c7; color: #ffffff; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
          Log In & Set Up Password &rarr;
        </a>
      </div>

      <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 0;">If you have any questions or require assistance, please reach out to your Centre Head or System Administrator.</p>
    `
  });

  return { subject, bodyText, bodyHtml };
}

/**
 * Template Generator: Email Change Confirmation OTP.
 */
export function generateEmailChangeOtpTemplate(name: string, otp: string, newEmail: string): { subject: string; bodyText: string; bodyHtml: string } {
  const subject = `LEADS Portal Email Verification Code: ${otp}`;
  const bodyText = `Hello ${name},\n\n` +
    `A request was made to update your login email to: ${newEmail}\n\n` +
    `Verification Code: ${otp}\n\n` +
    `Valid for 5 minutes. If you did not request this, please ignore this email.\n\n` +
    `Regards,\nLEADS Next Gen Centre, MSRUAS`;

  const bodyHtml = wrapInMasterEmailTemplate({
    pageTitle: subject,
    headerTitle: `Email Address Update`,
    headerSubtitle: `Security Verification Code`,
    badgeText: `Security Verification`,
    badgeColor: `#0284c7`,
    bodyContentHtml: `
      <p style="margin-top: 0; color: #0f172a; font-size: 14px;">Hello <strong>${name}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">A request was made to update your login email to <strong style="color: #0f172a;">${newEmail}</strong>. Use the verification code below to authorize this change:</p>

      <div style="text-align: center; margin: 28px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0f172a; background: #f8fafc; border: 1px solid #cbd5e1; padding: 14px 28px; border-radius: 10px; display: inline-block;">
          ${otp}
        </span>
        <p style="color: #64748b; font-size: 12px; margin-top: 10px;">Valid for 5 minutes</p>
      </div>

      <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 0;">If you did not request this change, you can safely ignore this message.</p>
    `
  });

  return { subject, bodyText, bodyHtml };
}

/**
 * Template Generator: Email Change OTP — step 2 of 2, sent to the NEW
 * address the member is trying to move to, after they've already proven
 * ownership of the old one. Confirms the OLD address in the copy so the
 * recipient has context even if this lands in an inbox they haven't used
 * with this account before.
 */
export function generateNewEmailConfirmationOtpTemplate(name: string, otp: string, oldEmail: string): { subject: string; bodyText: string; bodyHtml: string } {
  const subject = `LEADS Portal — Confirm This Is Your New Email: ${otp}`;
  const bodyText = `Hello ${name},\n\n` +
    `This is the second and final step of moving your LEADS Portal login email away from ${oldEmail} to this address.\n\n` +
    `Verification Code: ${otp}\n\n` +
    `Valid for 5 minutes. If you did not request this, please ignore this email — no change will be made without this code.\n\n` +
    `Regards,\nLEADS Next Gen Centre, MSRUAS`;

  const bodyHtml = wrapInMasterEmailTemplate({
    pageTitle: subject,
    headerTitle: `Confirm Your New Email`,
    headerSubtitle: `Final Step — Security Verification Code`,
    badgeText: `Security Verification`,
    badgeColor: `#0284c7`,
    bodyContentHtml: `
      <p style="margin-top: 0; color: #0f172a; font-size: 14px;">Hello <strong>${name}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">This is the second and final step of moving your LEADS Portal login email away from <strong style="color: #0f172a;">${oldEmail}</strong> to this address. Use the code below to confirm you can receive mail here:</p>

      <div style="text-align: center; margin: 28px 0;">
        <span style="font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0f172a; background: #f8fafc; border: 1px solid #cbd5e1; padding: 14px 28px; border-radius: 10px; display: inline-block;">
          ${otp}
        </span>
        <p style="color: #64748b; font-size: 12px; margin-top: 10px;">Valid for 5 minutes</p>
      </div>

      <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 0;">If you did not request this change, you can safely ignore this message — no change will be made without this code.</p>
    `
  });

  return { subject, bodyText, bodyHtml };
}

/**
 * Template Generator: Announcement Alert
 */
export function generateAnnouncementEmailTemplate(memberName: string, title: string, content: string, author: string): { subject: string; bodyText: string; bodyHtml: string } {
  const subject = `LEADS Notice: ${title}`;
  const bodyText = `Hello ${memberName},\n\nA new announcement has been published on the LEADS Dashboard by ${author}:\n\n` +
    `Title: ${title}\n\n` +
    `Details: ${content}\n\n` +
    `Regards,\nLEADS Next Gen Centre`;

  const bodyHtml = wrapInMasterEmailTemplate({
    pageTitle: subject,
    headerTitle: title,
    headerSubtitle: `Published by ${author}`,
    badgeText: `Official Announcement`,
    badgeColor: `#0369a1`,
    bodyContentHtml: `
      <p style="margin-top: 0; color: #334155;">Hello <strong>${memberName}</strong>,</p>
      <p style="color: #0f172a; white-space: pre-wrap; font-size: 14px; line-height: 1.7;">${content}</p>
      <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center;">
        <a href="https://leadsnextgencentre.online/dashboard/announcements" style="background: #0284c7; color: #ffffff; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 12px; display: inline-block;">View in Dashboard &rarr;</a>
      </div>
    `
  });

  return { subject, bodyText, bodyHtml };
}

/**
 * Template Generator: Task Assignment Alert
 */
export function generateTaskEmailTemplate(memberName: string, taskTitle: string, eventName: string, dueDate: string, creatorName: string): { subject: string; bodyText: string; bodyHtml: string } {
  const subject = `LEADS Task Assignment: ${taskTitle}`;
  const bodyText = `Hello ${memberName},\n\nYou have been assigned a new task on LEADS Dashboard.\n\n` +
    `Task: ${taskTitle}\n` +
    `Context: ${eventName || 'LEADS Operations'}\n` +
    `Due Date: ${dueDate}\n` +
    `Assigned By: ${creatorName || 'Committee Admin'}\n\n` +
    `Please log in to your dashboard to view details and update progress.`;

  const bodyHtml = wrapInMasterEmailTemplate({
    pageTitle: subject,
    headerTitle: taskTitle,
    headerSubtitle: `Assigned by ${creatorName || 'Committee Admin'}`,
    badgeText: `Task Assignment`,
    badgeColor: `#0284c7`,
    bodyContentHtml: `
      <p style="margin-top: 0; color: #334155;">Hello <strong>${memberName}</strong>,</p>
      <p style="color: #334155; font-size: 14px;">You have been assigned a deliverable on the LEADS Dashboard:</p>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; width: 120px;">Context:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #0f172a;">${eventName || 'LEADS Operations'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b;">Due Date:</td>
          <td style="padding: 8px 0; font-weight: 700; color: #0f172a;">${dueDate}</td>
        </tr>
      </table>

      <div style="margin-top: 20px; text-align: center;">
        <a href="https://leadsnextgencentre.online/dashboard/tasks" style="background: #0284c7; color: #ffffff; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 12px; display: inline-block;">Open Tasks Desk &rarr;</a>
      </div>
    `
  });

  return { subject, bodyText, bodyHtml };
}

/**
 * Template Generator: Event Committee Roster Assignment
 */
export function generateEventRosterEmailTemplate(memberName: string, eventTitle: string, committeeName: string, startDate: string): { subject: string; bodyText: string; bodyHtml: string } {
  const subject = `LEADS Event Assignment: ${eventTitle}`;
  const bodyText = `Hello ${memberName},\n\nYou have been added to the "${committeeName}" committee for the upcoming event "${eventTitle}".\n\n` +
    `Event Start Date: ${startDate}\n\n` +
    `Check the LEADS Dashboard for details.`;

  const bodyHtml = wrapInMasterEmailTemplate({
    pageTitle: subject,
    headerTitle: eventTitle,
    headerSubtitle: `Committee Assignment`,
    badgeText: `Event Assignment`,
    badgeColor: `#0284c7`,
    bodyContentHtml: `
      <p style="margin-top: 0; color: #334155;">Hello <strong>${memberName}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">You have been assigned to the <strong>${committeeName}</strong> committee for <strong>${eventTitle}</strong>.</p>
      
      <div style="background: #f8fafc; border-left: 4px solid #0284c7; padding: 14px 18px; margin: 18px 0; border-radius: 6px;">
        <p style="margin: 0; font-size: 13px; color: #0f172a;"><strong>Event Start Date:</strong> ${startDate}</p>
      </div>

      <div style="margin-top: 20px; text-align: center;">
        <a href="https://leadsnextgencentre.online/dashboard/events" style="background: #0284c7; color: #ffffff; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 12px; display: inline-block;">View Event Details &rarr;</a>
      </div>
    `
  });

  return { subject, bodyText, bodyHtml };
}

/**
 * Template Generator: Happy Birthday
 */
export function generateBirthdayEmailTemplate(memberName: string): { subject: string; bodyText: string; bodyHtml: string } {
  const firstName = memberName.split(' ')[0] || memberName;
  const subject = `Happy Birthday, ${firstName}!`;
  const bodyText = `Hello ${memberName},\n\n` +
    `Wishing you a very Happy Birthday from all of us at LEADS Next Gen Centre!\n\n` +
    `Warm regards,\nLEADS Next Gen Centre, MSRUAS`;

  const bodyHtml = wrapInMasterEmailTemplate({
    pageTitle: subject,
    headerTitle: `Happy Birthday, ${firstName}!`,
    headerSubtitle: `From everyone at LEADS Next Gen Centre`,
    badgeText: `Greetings`,
    badgeColor: `#0284c7`,
    bodyContentHtml: `
      <p style="margin-top: 0; color: #0f172a; font-size: 14px;">Dear <strong>${memberName}</strong>,</p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">On behalf of the entire LEADS Next Gen Centre family, we wish you a wonderful birthday! Thank you for your energy and dedication.</p>
      <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin-bottom: 0;">Have a fantastic year ahead!</p>
    `
  });

  return { subject, bodyText, bodyHtml };
}

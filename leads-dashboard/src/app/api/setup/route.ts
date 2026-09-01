import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { readCollection, mutateCollection } from '@/lib/server-db';
import { hashPassword } from '@/lib/password';

const FALLBACK_KEY = 'LEADS_ERP_MASTER_SECRET_KEY_2026';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function writeEncryptionKeyToEnv(key: string) {
  const envPath = path.join(process.cwd(), '.env');
  const envExamplePath = path.join(process.cwd(), '.env.example');

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
    } else {
      fs.writeFileSync(envPath, '', 'utf-8');
    }
  }
  let content = fs.readFileSync(envPath, 'utf-8');
  if (/^DATA_ENCRYPTION_KEY=.*$/m.test(content)) {
    content = content.replace(/^DATA_ENCRYPTION_KEY=.*$/m, 'DATA_ENCRYPTION_KEY=' + key);
  } else {
    if (content.length && !content.endsWith('\n')) content += '\n';
    content += '\nDATA_ENCRYPTION_KEY=' + key + '\n';
  }
  fs.writeFileSync(envPath, content, 'utf-8');
}

/**
 * GET /api/setup — Check if the application requires initial setup
 */
export async function GET() {
  try {
    const members = await readCollection<any>('members');
    const hasAccounts = Array.isArray(members) && members.length > 0;
    const isKeyConfigured = Boolean(
      process.env.DATA_ENCRYPTION_KEY &&
      process.env.DATA_ENCRYPTION_KEY.trim() !== '' &&
      process.env.DATA_ENCRYPTION_KEY !== FALLBACK_KEY
    );

    return NextResponse.json({
      needsSetup: !hasAccounts,
      memberCount: members.length,
      isKeyConfigured,
      suggestedKey: crypto.randomBytes(32).toString('hex'),
    });
  } catch (err: any) {
    console.error('[setup-api] GET Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * POST /api/setup — Perform the initial setup (Super User creation & Database Encryption Key setup)
 */
export async function POST(request: Request) {
  try {
    const members = await readCollection<any>('members');
    if (Array.isArray(members) && members.length > 0) {
      return NextResponse.json(
        { error: 'Initial setup has already been completed. Accounts already exist on this instance.' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, email, password, encryptionKey } = body;

    // Validate inputs
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Please enter a valid full name.' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }

    // Step 2: Resolve or update DATA_ENCRYPTION_KEY
    let finalKey = (process.env.DATA_ENCRYPTION_KEY || '').trim();
    if (encryptionKey && typeof encryptionKey === 'string' && encryptionKey.trim()) {
      finalKey = encryptionKey.trim();
      process.env.DATA_ENCRYPTION_KEY = finalKey;
      writeEncryptionKeyToEnv(finalKey);
    } else if (!finalKey || finalKey === FALLBACK_KEY) {
      // Auto-generate strong key if none provided
      finalKey = crypto.randomBytes(32).toString('hex');
      process.env.DATA_ENCRYPTION_KEY = finalKey;
      writeEncryptionKeyToEnv(finalKey);
    }

    const superUser = {
      id: 'm1',
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'Super User',
      tier: 1,
      division: 'Core Committee',
      department: 'Core Operations',
      status: 'Active',
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    // Save superuser as the one and only account
    await mutateCollection('members', () => [superUser]);

    // Record audit log
    await mutateCollection('auditLogs', (logs) => [
      {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        action: 'SUPER_USER_INITIALIZED',
        actor: superUser.name,
        details: `Initial setup completed. Created root Super User account (${superUser.email}).`,
        targetEmail: superUser.email,
        timestamp: new Date().toISOString(),
      },
      ...logs,
    ]);

    // Strip passwordHash before returning
    const { passwordHash: _, ...safeUser } = superUser;

    return NextResponse.json({
      success: true,
      user: safeUser,
      message: 'Super User account initialized and encryption key configured successfully.',
    });
  } catch (err: any) {
    console.error('[setup-api] POST Error:', err);
    return NextResponse.json({ error: err.message || 'Setup initialization failed' }, { status: 500 });
  }
}

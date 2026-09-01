/**
 * encryption.ts — AES-256-GCM Master Encryption & Decryption Utility
 *
 * Provides authenticated encryption for server data collections, system backups,
 * and sensitive records. Uses Node.js built-in `crypto` module:
 * - Cipher: AES-256-GCM (Authenticated Encryption with Associated Data)
 * - Key Derivation: PBKDF2 with SHA-256 (100,000 iterations)
 * - Salt & IV: Cryptographically secure random bytes
 */
import crypto from 'crypto';

export function getMasterKey(): string {
  return process.env.DATA_ENCRYPTION_KEY || 'LEADS_ERP_MASTER_SECRET_KEY_2026';
}

const FIXED_SALT = Buffer.from('LEADS_NEXT_GEN_CENTRE_MSRUAS_SALT_2026', 'utf-8');

export interface EncryptedPayload {
  _encrypted: true;
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  ciphertext: string;
}

/** Derive a 256-bit (32 byte) key from a passphrase and salt using PBKDF2 */
function deriveKey(passphrase: string, salt: Buffer = FIXED_SALT): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
}

/**
 * Encrypt any plain text string using AES-256-GCM.
 * Returns a JSON-serializable EncryptedPayload object.
 */
export function encryptData(text: string, customPassphrase?: string): EncryptedPayload {
  const passphrase = customPassphrase || getMasterKey();
  const key = deriveKey(passphrase);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(text, 'utf-8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return {
    _encrypted: true,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('hex'),
    authTag,
    ciphertext,
  };
}

/**
 * Decrypt an EncryptedPayload object back to original plain text.
 * Throws an Error if the passphrase is invalid or the data has been tampered with.
 */
export function decryptData(payload: EncryptedPayload, customPassphrase?: string): string {
  if (!payload || !payload._encrypted || !payload.iv || !payload.ciphertext || !payload.authTag) {
    throw new Error('Invalid encrypted payload format.');
  }

  const passphrase = customPassphrase || getMasterKey();
  const key = deriveKey(passphrase);
  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf-8');
  plaintext += decipher.final('utf-8');

  return plaintext;
}

/**
 * Helper to check if a parsed object is an encrypted payload wrapper.
 */
export function isEncryptedPayload(obj: any): obj is EncryptedPayload {
  return typeof obj === 'object' && obj !== null && obj._encrypted === true && typeof obj.ciphertext === 'string';
}

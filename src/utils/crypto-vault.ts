import crypto from 'crypto';
import { ApiError } from '../common/errors/api-error';

// Standard 32-byte default fallback if environment variable is not explicitly provided
const FALLBACK_KEY_HEX = 'e834b6f120c9a92a95c8e2689ef23f87b8089ef0627d3b95a894a86b3df6e3f1';

/**
 * Resolves the 32-byte key buffer for AES-256-CBC encryption.
 */
export function getVaultKey(): Buffer {
  const envKey = process.env.VAULT_ENCRYPTION_KEY || FALLBACK_KEY_HEX;
  
  // If provided as a 64-character hex string (32 bytes)
  if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }

  // If provided as a 32-character utf-8 string
  if (Buffer.byteLength(envKey, 'utf8') === 32) {
    return Buffer.from(envKey, 'utf8');
  }

  // If key length is invalid, hash it with SHA-256 to guarantee exact 32 bytes
  return crypto.createHash('sha256').update(envKey).digest();
}

/**
 * Encrypts plaintext password using AES-256-CBC with a cryptographically randomized 16-byte IV.
 */
export function encryptPassword(plainText: string): { encryptedPassword: string; iv: string } {
  if (typeof plainText !== 'string') {
    throw new ApiError(400, 'Password must be a string to encrypt', 'INVALID_PAYLOAD');
  }

  const key = getVaultKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encryptedPassword: encrypted,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypts hex ciphertext back into plaintext using the stored IV and secret key.
 */
export function decryptPassword(encryptedHex: string, ivHex: string): string {
  if (!encryptedHex || !ivHex) {
    throw new ApiError(400, 'Encrypted password and IV are required for decryption', 'INVALID_PAYLOAD');
  }

  try {
    const key = getVaultKey();
    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== 16) {
      throw new Error('Invalid IV length');
    }
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error: any) {
    throw new ApiError(500, 'Failed to decrypt credential. Key or IV mismatch.', 'DECRYPTION_FAILED');
  }
}

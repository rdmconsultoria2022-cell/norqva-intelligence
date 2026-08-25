import crypto from 'crypto';

const IV_LENGTH = 12;
const ALGORITHM = 'aes-256-gcm';

export function encryptData(text: string, hexKey: string): { encryptedText: string; version: number } {
  // Standardize key size
  let key: Buffer;
  try {
    key = Buffer.from(hexKey, 'hex');
    if (key.length !== 32) {
      // If not a 32-byte hex key, hash it to generate a 32-byte key
      key = crypto.createHash('sha256').update(hexKey).digest();
    }
  } catch {
    key = crypto.createHash('sha256').update(hexKey).digest();
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encrypted
  const encryptedText = `${iv.toString('hex')}:${authTag}:${encrypted}`;
  
  return {
    encryptedText,
    version: 1
  };
}

export function decryptData(encryptedData: string, hexKey: string, version: number): string {
  if (version !== 1) {
    throw new Error(`Unsupported encryption key version: ${version}`);
  }

  let key: Buffer;
  try {
    key = Buffer.from(hexKey, 'hex');
    if (key.length !== 32) {
      key = crypto.createHash('sha256').update(hexKey).digest();
    }
  } catch {
    key = crypto.createHash('sha256').update(hexKey).digest();
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format.');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function generateHmacHash(text: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(text).digest('hex');
}

// NORQVA-0079: guarda segredos (token e App Secret da Meta) criptografados no banco.
// AES-256-GCM com a chave mestra WHATSAPP_SECRETS_KEY (32 bytes em base64 ou 64 caracteres hex).
// Formato gravado: "v1:<iv base64>:<tag base64>:<texto base64>".
import crypto from 'crypto';

export class SecretBoxError extends Error {}

function masterKey(): Buffer {
  const raw = (process.env.WHATSAPP_SECRETS_KEY || '').trim();
  if (!raw) throw new SecretBoxError('Falta configurar WHATSAPP_SECRETS_KEY no servidor (chave para guardar o token da Meta com segurança).');
  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new SecretBoxError('WHATSAPP_SECRETS_KEY precisa ter 32 bytes (64 caracteres hex ou 44 em base64).');
  return key;
}

export function secretsKeyConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

export function sealSecret(plain: string): string {
  const key = masterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function openSecret(sealed: string): string {
  const parts = String(sealed || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new SecretBoxError('Segredo guardado em formato desconhecido.');
  const key = masterKey();
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretBoxError('Não foi possível abrir o segredo guardado (a chave WHATSAPP_SECRETS_KEY mudou?). Cadastre o token de novo.');
  }
}

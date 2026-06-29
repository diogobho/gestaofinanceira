import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const KEY_HEX = process.env.SMTP_ENCRYPTION_KEY || '';

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('SMTP_ENCRYPTION_KEY inválida. Deve ser uma string hex de 64 caracteres (32 bytes).');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const [ivHex, encryptedHex] = encoded.split(':');
  if (!ivHex || !encryptedHex) throw new Error('Formato de dado criptografado inválido.');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

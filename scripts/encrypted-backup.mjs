/** Authenticated, versioned backup envelope. No credentials or plaintext in reports. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, open, stat, link, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
const magic = Buffer.from('AIAGBK01');
function key(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw Error('BACKUP_KEY_INVALID');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 32) throw Error('BACKUP_KEY_INVALID');
  return bytes;
}
async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function encryptBackup(source, destination, keyBase64) {
  const nonce = randomBytes(12);
  const header = Buffer.concat([magic, nonce]);
  const cipher = createCipheriv('aes-256-gcm', key(keyBase64), nonce);
  cipher.setAAD(header);
  let created = false;
  try {
    const output = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
    await once(output, 'open');
    created = true;
    output.write(header);
    await pipeline(createReadStream(source), cipher, output);
    await appendFile(destination, cipher.getAuthTag());
    return {
      format: 'AIAGBK01-AES256GCM',
      sha256: await digest(destination),
      bytes: (await stat(destination)).size,
    };
  } catch {
    if (created) await unlink(destination).catch(() => {});
    throw Error('BACKUP_ENCRYPTION_FAILED');
  }
}
export async function decryptBackup(source, destination, keyBase64) {
  const secret = key(keyBase64);
  const size = (await stat(source)).size;
  if (size < 36) throw Error('BACKUP_ENVELOPE_INVALID');
  const handle = await open(source, 'r');
  const header = Buffer.alloc(20),
    tag = Buffer.alloc(16);
  try {
    await handle.read(header, 0, 20, 0);
    await handle.read(tag, 0, 16, size - 16);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, 8).equals(magic)) throw Error('BACKUP_ENVELOPE_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', secret, header.subarray(8));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const temporary = destination + '.unverified-' + randomUUID();
  try {
    await pipeline(
      createReadStream(source, { start: 20, end: size - 17 }),
      decipher,
      createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
    );
    // Publish only after GCM authentication. Never overwrite an existing restore file.
    await link(temporary, destination);
  } catch {
    throw Error('BACKUP_AUTHENTICATION_OR_DESTINATION_FAILED');
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

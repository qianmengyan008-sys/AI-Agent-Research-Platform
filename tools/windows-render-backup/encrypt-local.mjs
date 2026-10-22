// Local-only optional encryption; secrets arrive through stdin, never argv or logs.
import { readFile, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { encryptBackup, decryptBackup } from '../../scripts/encrypted-backup.mjs';

async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

let input = '';
try {
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 16384) throw Error('INPUT_TOO_LARGE');
  }
  const request = JSON.parse(input);
  input = '';
  if (typeof request.passphrase !== 'string' || request.passphrase.length < 12)
    throw Error('PASSPHRASE_REQUIRED');
  const salt = randomBytes(16);
  const key = scryptSync(request.passphrase, salt, 32).toString('base64');
  request.passphrase = '';
  const original = JSON.parse(await readFile(request.receipt, 'utf8'));
  const plainHash = await fileHash(request.source);
  if (plainHash !== original.sha256 || (await stat(request.source)).size !== original.bytes)
    throw Error('SOURCE_CHANGED');
  const envelope = await encryptBackup(request.source, request.destination, key);
  const check = request.destination + '.verify-' + randomBytes(12).toString('hex');
  try {
    await decryptBackup(request.destination, check, key);
    if (
      createHash('sha256')
        .update(await readFile(check))
        .digest('hex') !== plainHash
    )
      throw Error('ENCRYPTION_ROUNDTRIP_FAILED');
  } finally {
    await unlink(check).catch(() => {});
  }
  process.stdout.write(
    JSON.stringify({
      ...original,
      file: request.output_name,
      bytes: envelope.bytes,
      sha256: envelope.sha256,
      plaintext_bytes: original.bytes,
      plaintext_sha256: plainHash,
      encryption: envelope.format,
      key_derivation: {
        algorithm: 'scrypt',
        salt_base64: salt.toString('base64'),
        N: 16384,
        r: 8,
        p: 1,
      },
      encryption_roundtrip_verified: true,
      full_restore_verified: false,
    }),
  );
} catch {
  process.stderr.write('LOCAL_ENCRYPTION_FAILED: no secret details are logged.\n');
  process.exitCode = 1;
}

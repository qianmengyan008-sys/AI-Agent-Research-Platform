export function encryptBackup(
  source: string,
  destination: string,
  keyBase64: string,
): Promise<{ format: string; sha256: string; bytes: number }>;
export function decryptBackup(
  source: string,
  destination: string,
  keyBase64: string,
): Promise<void>;

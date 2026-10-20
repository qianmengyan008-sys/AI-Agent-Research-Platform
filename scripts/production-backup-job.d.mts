export function runProductionBackup(env?: Record<string, string | undefined>): Promise<{
  status: string;
  backup_id: string;
  encrypted_bytes: number;
  sha256: string;
  restore_verified: boolean;
}>;

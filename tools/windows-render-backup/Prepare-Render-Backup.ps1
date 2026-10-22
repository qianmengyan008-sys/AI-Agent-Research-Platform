[CmdletBinding()]
param([string]$BackupRoot = 'D:\Research-Backups', [string]$PgBin = 'D:\PostgreSQL18\pgsql\bin', [switch]$SyntheticFixture)
. "$PSScriptRoot/RenderBackup.Common.ps1"
try {
    $root = Assert-BackupRoot $BackupRoot -SyntheticFixture:$SyntheticFixture
    $tools = Get-PgTools $PgBin
    Write-Host 'PREPARE_OK: PG18 tools verified; backup root is outside the project. No database connection made.'
    Write-Host ('Dump client: ' + $tools.DumpVersion)
    Write-Host ('Restore client: ' + $tools.RestoreVersion)
} catch { Write-Host 'PREPARE_FAILED: check Windows, local D drive >=1GB, directory and PostgreSQL18 tools. Stop here.'; exit 1 }

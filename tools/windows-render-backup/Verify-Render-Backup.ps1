[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$DumpFile, [string]$PgBin = 'D:\PostgreSQL18\pgsql\bin', [switch]$SyntheticFixture)
. "$PSScriptRoot/RenderBackup.Common.ps1"
try {
    [void](Assert-BackupRoot ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($DumpFile))) -SyntheticFixture:$SyntheticFixture)
    $receiptPath = Join-Path ([IO.Path]::GetDirectoryName($DumpFile)) 'staging.receipt.json'
    if (-not (Test-Path -LiteralPath $receiptPath)) { throw 'ORIGINAL_RECEIPT_REQUIRED' }
    $original = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-OriginalReceipt $original
    if ((Get-Item -LiteralPath $DumpFile).Length -ne $original.bytes) { throw 'SIZE_MISMATCH' }
    $tools = Get-PgTools $PgBin
    $verified = Get-BackupVerification $DumpFile $tools $original.sha256 -SyntheticFixture:$SyntheticFixture
    if ($verified.bytes -ne $original.bytes) { throw 'SIZE_MISMATCH' }
    Write-Host 'VERIFY_OK: original receipt SHA256, size and pg_restore list match. This is not a full restore drill.'
} catch { Write-Host 'VERIFY_FAILED: missing receipt, changed file, invalid archive or wrong tools. Stop; keep evidence private.'; exit 1 }

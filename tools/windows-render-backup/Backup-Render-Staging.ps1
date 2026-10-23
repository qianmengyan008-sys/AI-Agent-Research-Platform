[CmdletBinding()]
param([string]$BackupRoot = 'D:\Research-Backups', [string]$PgBin = 'D:\PostgreSQL18\pgsql\bin',
    [Security.SecureString]$ConnectionUrl, [switch]$InternalTestOnly, [switch]$SyntheticFixture)
. "$PSScriptRoot/RenderBackup.Common.ps1"
$connection = $null; $dump = $null; $run = $null
$receiptState = @{}
try {
    if (-not $InternalTestOnly) { throw 'INTERNAL_TEST_ONLY_CONFIRMATION_REQUIRED' }
    $root = Assert-BackupRoot $BackupRoot -SyntheticFixture:$SyntheticFixture
    $tools = Get-PgTools $PgBin
    if (-not $ConnectionUrl) { $ConnectionUrl = Read-Host 'Paste External Database URL privately (hidden input; never send it to chat)' -AsSecureString }
    $connection = ConvertFrom-PrivateUrl $ConnectionUrl -SyntheticFixture:$SyntheticFixture
    $run = New-PrivateRunDirectory $root -SyntheticFixture:$SyntheticFixture
    $dump = Join-Path $run 'staging.dump'
    $started = [DateTime]::UtcNow.ToString('o')
    $result = Invoke-PrivateProcess $tools.Dump @('--format=custom', '--no-owner', '--no-acl', '--no-password', '--lock-wait-timeout=10s', '--file', $dump) $connection
    if ($result.ExitCode -ne 0) { throw 'PG_DUMP_FAILED' }
    $receipt = Get-BackupVerification $dump $tools -SyntheticFixture:$SyntheticFixture
    $receipt['backup_started_at_utc'] = $started
    Write-PrivateReceipt (Join-Path $run 'staging.receipt.json') $receipt $receiptState
    Write-Host 'BACKUP_OK: dump and receipt verified. UNENCRYPTED INTERNAL TEST ONLY. Keep private; do not upload.'
    Write-Host ('Private run folder: ' + $run)
} catch {
    $failure = $_
    $clean = Remove-OwnedReceiptFiles $receiptState
    if ($dump) {
        try { if (Test-Path -LiteralPath $dump) { Remove-Item -LiteralPath $dump -Force } } catch { $clean = $false }
    }
    if ($SyntheticFixture) { Write-Host ('FIXTURE_ERROR_CODE: ' + $failure.Exception.Message) }
    if (-not $clean -or ($receiptState.ContainsKey('CleanupFailed') -and $receiptState.CleanupFailed)) {
        Write-Host 'BACKUP_CLEANUP_INCOMPLETE: files from this attempt may remain private. Stop; do not treat any residual receipt as successful.'
    }
    Write-Host 'BACKUP_FAILED: this attempt did not succeed. Stop; check network/TLS/PG18 privately. Do not resend credentials or change rules automatically.'
    exit 1
} finally {
    if ($connection) { $connection.Clear() }
    $ConnectionUrl = $null
}

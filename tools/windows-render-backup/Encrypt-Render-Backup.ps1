[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$DumpFile, [Security.SecureString]$Passphrase,
    [Security.SecureString]$PassphraseAgain, [string]$NodePath = 'node', [switch]$SyntheticFixture)
. "$PSScriptRoot/RenderBackup.Common.ps1"
$first = [IntPtr]::Zero; $second = [IntPtr]::Zero; $payload = $null
try {
    [void](Assert-BackupRoot ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($DumpFile))) -SyntheticFixture:$SyntheticFixture)
    $node = (Get-Command $NodePath -CommandType Application -ErrorAction Stop).Source
    $version = Invoke-PrivateProcess $node @('--version')
    if ($version.ExitCode -ne 0 -or $version.Output -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 18) { throw 'NODE18_REQUIRED' }
    $receiptPath = Join-Path ([IO.Path]::GetDirectoryName($DumpFile)) 'staging.receipt.json'
    if (-not (Test-Path -LiteralPath $receiptPath)) { throw 'ORIGINAL_RECEIPT_REQUIRED' }
    $destination = $DumpFile + '.enc'
    if ((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath ($destination + '.receipt.json'))) { throw 'DESTINATION_EXISTS' }
    if (-not $Passphrase) { $Passphrase = Read-Host 'New encryption passphrase (12+ characters; keep separately)' -AsSecureString }
    if (-not $PassphraseAgain) { $PassphraseAgain = Read-Host 'Repeat encryption passphrase' -AsSecureString }
    $first = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Passphrase)
    $second = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($PassphraseAgain)
    $a = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($first)
    $b = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($second)
    if ($a -ne $b -or $a.Length -lt 12) { throw 'PASSPHRASE_MISMATCH' }
    $payload = @{ source = [IO.Path]::GetFullPath($DumpFile); destination = [IO.Path]::GetFullPath($destination); receipt = [IO.Path]::GetFullPath($receiptPath); output_name = [IO.Path]::GetFileName($destination); passphrase = $a } | ConvertTo-Json -Compress
    # ASCII JSON avoids legacy Windows console code-page corruption of paths/passphrases.
    $wire = New-Object Text.StringBuilder
    foreach ($character in $payload.ToCharArray()) {
        if ([int]$character -gt 127) {
            [void]$wire.Append('\u'); [void]$wire.Append(([int]$character).ToString('x4'))
        } else { [void]$wire.Append($character) }
    }
    $payload = $wire.ToString()
    $result = Invoke-PrivateProcess $node @((Join-Path $PSScriptRoot 'encrypt-local.mjs')) -PrivateInput $payload
    if ($result.ExitCode -ne 0) { throw 'ENCRYPTION_FAILED' }
    $receipt = $result.Output | ConvertFrom-Json
    if ($receipt.encryption -ne 'AIAGBK01-AES256GCM' -or -not $receipt.encryption_roundtrip_verified) { throw 'ENCRYPTION_NOT_VERIFIED' }
    Write-PrivateReceipt ($destination + '.receipt.json') $receipt
    Write-Host 'ENCRYPT_OK: AES256GCM and decrypt/hash roundtrip verified. Original plaintext remains private; passphrase is not saved.'
} catch { Write-Host 'ENCRYPT_FAILED: do not claim encryption. Original dump remains private internal-test-only. Stop here.'; exit 1 }
finally {
    $a = $null; $b = $null; $payload = $null; $wire = $null
    if ($first -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($first) }
    if ($second -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($second) }
}

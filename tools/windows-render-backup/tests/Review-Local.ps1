# Read-only source review with disposable local mocks. No database or Render access.
# Nonzero exit means a required negative check failed; do not treat this as acceptance.
param([string]$EvidenceFile, [string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
$base = Split-Path $PSScriptRoot -Parent
. "$base/RenderBackup.Common.ps1"
$results = New-Object Collections.ArrayList
$temp = Join-Path ([IO.Path]::GetTempPath()) ('windows-preflight-review-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($temp)
function Record-Check {
    param([string]$Name, [bool]$Passed, [string]$Evidence)
    [void]$results.Add([ordered]@{ check = $Name; passed = $Passed; evidence = $Evidence })
}
try {
    $parseErrors = @()
    foreach ($file in @(Get-ChildItem -LiteralPath $base -Filter '*.ps1') + @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1')) {
        $tokens = $null; $errors = $null
        [void][Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
        $parseErrors += @($errors)
    }
    Record-Check 'PowerShell parser (running engine only, not PS5.1)' ($parseErrors.Count -eq 0) ('parse_errors=' + $parseErrors.Count)
    $nonAscii = @()
    foreach ($file in Get-ChildItem -LiteralPath $base -Filter '*.ps1') {
        if ([IO.File]::ReadAllText($file.FullName) -match '[^\x00-\x7f]') { $nonAscii += $file.Name }
    }
    Record-Check 'Production PS1 has no UTF8-without-BOM non-ASCII ambiguity' ($nonAscii.Count -eq 0) ('non_ascii_files=' + $nonAscii.Count)
    $node = (Get-Command $NodePath -CommandType Application -ErrorAction Stop).Source
    $values = @('path with spaces', 'quote"inside', 'trailing\', '', 'unicode-' + [char]0x4e2d)
    $r = Invoke-PrivateProcess $node (@('-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--') + $values)
    $decoded = @($r.Output | ConvertFrom-Json)
    $same = $r.ExitCode -eq 0 -and $decoded.Count -eq $values.Count
    for ($i = 0; $same -and $i -lt $values.Count; $i++) { $same = $decoded[$i] -ceq $values[$i] }
    Record-Check 'Native argument roundtrip (running OS only)' $same 'Spaces, quote, trailing slash, empty string, Unicode; not Windows CRT proof.'
    $parentPg = [Environment]::GetEnvironmentVariable('PGREVIEW_SENTINEL')
    try {
        [Environment]::SetEnvironmentVariable('PGREVIEW_SENTINEL', 'SYNTHETIC_PARENT_ONLY')
        $r = Invoke-PrivateProcess $node @('-e', 'process.stdout.write(JSON.stringify({parent:process.env.PGREVIEW_SENTINEL??null,child:process.env.PGAPPNAME}));process.stderr.write("SYNTHETIC_PRIVATE_ERROR");process.exitCode=7') @{ PGAPPNAME = 'LOCAL_REVIEW' }
        $v = $r.Output | ConvertFrom-Json
        Record-Check 'Child-only PG environment, exit7 and stderr suppression' ($r.ExitCode -eq 7 -and $null -eq $v.parent -and $v.child -eq 'LOCAL_REVIEW' -and $r.Output -notmatch 'PRIVATE_ERROR' -and $env:PGREVIEW_SENTINEL -eq 'SYNTHETIC_PARENT_ONLY') 'Parent PG sentinel removed only from child; native stderr not returned.'
    } finally { [Environment]::SetEnvironmentVariable('PGREVIEW_SENTINEL', $parentPg) }
    $timeout = $false
    try { [void](Invoke-PrivateProcess $node @('-e', 'setInterval(()=>{},1000)') -TimeoutSeconds 1) } catch { $timeout = $_.Exception.Message -eq 'PROCESS_TIMEOUT' }
    Record-Check 'Native process timeout' $timeout 'Disposable local Node process, timeout=1s.'
    $u = ConvertTo-SecureString 'postgresql://fixture:FAKE_ONLY@dpg-review.singapore-postgres.render.com/ai_agent_research?sslmode=require' -AsPlainText -Force
    $parsed = ConvertFrom-PrivateUrl $u
    Record-Check 'URL parsing forces strict TLS without connection' ($parsed.PGSSLMODE -eq 'verify-full' -and $parsed.PGSSLROOTCERT -eq 'system') 'Invented host and credentials, parser only; no child PG process.'
    $parsed.Clear()

    # Use the unchanged entry scripts in a temporary sandbox; replace only native
    # tools with local mocks. These fixtures do not create a valid database archive.
    $sandbox = Join-Path $temp 'copied-scripts'
    $backups = Join-Path $temp 'private-fixture'
    [void][IO.Directory]::CreateDirectory($sandbox)
    [void][IO.Directory]::CreateDirectory($backups)
    $common = [IO.File]::ReadAllText((Join-Path $base 'RenderBackup.Common.ps1'))
    $mocks = @'
function Assert-BackupRoot {
    param([string]$Root, [switch]$SyntheticFixture)
    if (-not $SyntheticFixture -or $Root -notmatch 'windows-preflight-review-') { throw 'LOCAL_REVIEW_ONLY' }
    return [IO.Path]::GetFullPath($Root)
}
function Get-PgTools { return @{ Dump = 'LOCAL_MOCK'; Restore = 'LOCAL_MOCK'; DumpVersion = 'pg_dump (PostgreSQL) 18.6'; RestoreVersion = 'pg_restore (PostgreSQL) 18.6' } }
function Invoke-PrivateProcess {
    param([string]$Executable, [string[]]$Arguments, [hashtable]$PgEnvironment = @{})
    if ($Arguments[0] -eq '--list') {
        return @{ ExitCode = 0; Output = "; Dumped from database version: 18.6`n1; TABLE DATA research participant x`n2; TABLE DATA research experiment_assignment x`n3; TABLE DATA research message x`n4; TABLE DATA research_meta schema_migration x" }
    }
    if ($Arguments[0] -eq '--format=custom') {
        [IO.File]::WriteAllText($Arguments[-1], 'PGDMP-SYNTHETIC-REVIEW-NOT-A-REAL-DUMP')
    }
    return @{ ExitCode = 0; Output = '' }
}
'@
    [IO.File]::WriteAllText((Join-Path $sandbox 'RenderBackup.Common.ps1'), $common + "`n" + $mocks)
    foreach ($name in @('Verify-Render-Backup.ps1', 'Backup-Render-Staging.ps1')) { Copy-Item -LiteralPath (Join-Path $base $name) -Destination (Join-Path $sandbox $name) }
    $dump = Join-Path $backups 'staging.dump'
    [IO.File]::WriteAllText($dump, 'PGDMP-SYNTHETIC-REVIEW-NOT-A-REAL-DUMP')
    $receiptPath = Join-Path $backups 'staging.receipt.json'
    [IO.File]::WriteAllText($receiptPath, ('{"pg_dump_exit_code":0,"sha256":"","bytes":' + (Get-Item -LiteralPath $dump).Length + '}'))
    $engine = (Get-Process -Id $PID).Path
    $r = Invoke-PrivateProcess $engine @('-NoProfile', '-File', (Join-Path $sandbox 'Verify-Render-Backup.ps1'), '-DumpFile', $dump, '-PgBin', $temp, '-SyntheticFixture')
    Record-Check 'Verify rejects empty original SHA256' ($r.ExitCode -ne 0 -and $r.Output -notmatch 'VERIFY_OK') ('actual_exit=' + $r.ExitCode + '; VERIFY_OK=' + ($r.Output -match 'VERIFY_OK') + '; mocked list only, no real archive')
    $fault = @'
function Write-PrivateReceipt {
    param([string]$Path, $Receipt)
    [IO.File]::WriteAllText($Path, ($Receipt | ConvertTo-Json -Depth 6))
    throw 'SYNTHETIC_RECEIPT_WRITE_FAILURE_AFTER_WRITE'
}
'@
    [IO.File]::AppendAllText((Join-Path $sandbox 'RenderBackup.Common.ps1'), "`n" + $fault)
    $driver = Join-Path $temp 'run-fault.ps1'
    [IO.File]::WriteAllText($driver, @'
param([string]$Script, [string]$Root)
$url = ConvertTo-SecureString 'postgresql://fixture:FAKE_ONLY@127.0.0.1/ai_agent_research' -AsPlainText -Force
& $Script -BackupRoot $Root -PgBin $Root -ConnectionUrl $url -InternalTestOnly -SyntheticFixture
exit $LASTEXITCODE
'@)
    $r = Invoke-PrivateProcess $engine @('-NoProfile', '-File', $driver, '-Script', (Join-Path $sandbox 'Backup-Render-Staging.ps1'), '-Root', $backups)
    $left = @(Get-ChildItem -LiteralPath $backups -Directory | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Filter 'staging.receipt.json' })
    Record-Check 'Receipt write failure leaves no success-looking receipt' ($r.ExitCode -ne 0 -and $left.Count -eq 0) ('actual_exit=' + $r.ExitCode + '; remaining_generated_receipts=' + $left.Count + '; local fault injection only')
    $output = [ordered]@{ scope = 'local mocks only; no Render, database, real encryption or restore'; engine = $PSVersionTable.PSVersion.ToString(); os = [Environment]::OSVersion.Platform.ToString(); native_windows_51 = 'NOT RUN'; checks = @($results.ToArray()) }
    if ($EvidenceFile) { [IO.File]::WriteAllText($EvidenceFile, ($output | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false))) }
    foreach ($check in $results) { Write-Host (($check.passed.ToString()) + ': ' + $check.check + ' - ' + $check.evidence) }
    if (@($results | Where-Object { -not $_.passed }).Count -gt 0) { exit 1 }
} finally {
    # Remove only the GUID directory created by this probe, never a backup root.
    if ($temp -and (Test-Path -LiteralPath $temp)) { Remove-Item -LiteralPath $temp -Recurse -Force }
}

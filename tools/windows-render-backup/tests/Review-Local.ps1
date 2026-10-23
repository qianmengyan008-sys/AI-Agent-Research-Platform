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
function Get-PgTools { [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'native-tool-called.marker'), 'LOCAL_TOOL_CALLED'); return @{ Dump = 'LOCAL_MOCK'; Restore = 'LOCAL_MOCK'; DumpVersion = 'pg_dump (PostgreSQL) 18.6'; RestoreVersion = 'pg_restore (PostgreSQL) 18.6' } }
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
    $engine = (Get-Process -Id $PID).Path
    $valid = @{ sha256 = (Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash; bytes = (Get-Item -LiteralPath $dump).Length; pg_dump_exit_code = 0; pg_restore_list_exit_code = 0 }
    $marker = Join-Path $sandbox 'native-tool-called.marker'
    function Invoke-VerifyReview {
        return Invoke-PrivateProcess $engine @('-NoProfile', '-File', (Join-Path $sandbox 'Verify-Render-Backup.ps1'), '-DumpFile', $dump, '-PgBin', $temp, '-SyntheticFixture')
    }
    foreach ($style in @('uppercase', 'lowercase')) {
        $valid.sha256 = $valid.sha256.ToString().ToLowerInvariant()
        if ($style -eq 'uppercase') { $valid.sha256 = $valid.sha256.ToUpperInvariant() }
        [IO.File]::WriteAllText($receiptPath, ($valid | ConvertTo-Json))
        $r = Invoke-VerifyReview
        Record-Check ('Valid original receipt accepted: ' + $style) ($r.ExitCode -eq 0 -and $r.Output -match 'VERIFY_OK') ('actual_exit=' + $r.ExitCode + '; local mock list only')
    }
    $cases = @(
        @{ Name = 'empty original SHA256'; Field = 'sha256'; Value = '' },
        @{ Name = 'whitespace SHA256'; Field = 'sha256'; Value = '   ' },
        @{ Name = 'null SHA256'; Field = 'sha256'; Value = $null },
        @{ Name = 'short SHA256'; Field = 'sha256'; Value = ('a' * 63) },
        @{ Name = 'long SHA256'; Field = 'sha256'; Value = ('a' * 65) },
        @{ Name = 'non-hex SHA256'; Field = 'sha256'; Value = ('g' * 64) },
        @{ Name = 'numeric SHA256'; Field = 'sha256'; Value = 42 },
        @{ Name = 'newline SHA256'; Field = 'sha256'; Value = ($valid.sha256 + "`n") },
        @{ Name = 'missing SHA256'; Field = 'sha256'; Missing = $true },
        @{ Name = 'missing bytes'; Field = 'bytes'; Missing = $true },
        @{ Name = 'null bytes'; Field = 'bytes'; Value = $null },
        @{ Name = 'zero bytes'; Field = 'bytes'; Value = 0 },
        @{ Name = 'negative bytes'; Field = 'bytes'; Value = -1 },
        @{ Name = 'string bytes'; Field = 'bytes'; Value = $valid.bytes.ToString() },
        @{ Name = 'floating bytes'; Field = 'bytes'; Value = 1.5 },
        @{ Name = 'boolean bytes'; Field = 'bytes'; Value = $true },
        @{ Name = 'huge bytes'; Field = 'bytes'; Value = 1e30 },
        @{ Name = 'missing dump exit'; Field = 'pg_dump_exit_code'; Missing = $true },
        @{ Name = 'null dump exit'; Field = 'pg_dump_exit_code'; Value = $null },
        @{ Name = 'wrong dump exit'; Field = 'pg_dump_exit_code'; Value = 1 },
        @{ Name = 'string dump exit'; Field = 'pg_dump_exit_code'; Value = '0' },
        @{ Name = 'boolean dump exit'; Field = 'pg_dump_exit_code'; Value = $false },
        @{ Name = 'floating dump exit'; Field = 'pg_dump_exit_code'; Value = 0.5 },
        @{ Name = 'missing list exit'; Field = 'pg_restore_list_exit_code'; Missing = $true },
        @{ Name = 'wrong list exit'; Field = 'pg_restore_list_exit_code'; Value = 1 },
        @{ Name = 'string list exit'; Field = 'pg_restore_list_exit_code'; Value = '0' },
        @{ Name = 'size mismatch'; Field = 'bytes'; Value = ($valid.bytes + 1) }
    )
    foreach ($case in $cases) {
        $candidate = @{} + $valid
        if ($case.ContainsKey('Missing')) { $candidate.Remove($case.Field) } else { $candidate[$case.Field] = $case.Value }
        [IO.File]::WriteAllText($receiptPath, ($candidate | ConvertTo-Json))
        if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
        $r = Invoke-VerifyReview
        $toolCalled = Test-Path -LiteralPath $marker
        Record-Check ('Verify rejects ' + $case.Name) ($r.ExitCode -ne 0 -and $r.Output -match 'VERIFY_FAILED' -and $r.Output -notmatch 'VERIFY_OK' -and -not $toolCalled) ('actual_exit=' + $r.ExitCode + '; VERIFY_OK=' + ($r.Output -match 'VERIFY_OK') + '; tools_called=' + $toolCalled)
    }
    foreach ($json in @('null', '[]', '42', '"not-an-object"', '{')) {
        [IO.File]::WriteAllText($receiptPath, $json)
        $r = Invoke-VerifyReview
        Record-Check ('Verify rejects invalid JSON structure: ' + $json) ($r.ExitCode -ne 0 -and $r.Output -match 'VERIFY_FAILED' -and $r.Output -notmatch 'VERIFY_OK') ('actual_exit=' + $r.ExitCode)
    }
    $badHash = @{} + $valid; $badHash.sha256 = '0' * 64
    [IO.File]::WriteAllText($receiptPath, ($badHash | ConvertTo-Json))
    $r = Invoke-VerifyReview
    Record-Check 'Verify rejects mismatching valid-format SHA256' ($r.ExitCode -ne 0 -and $r.Output -match 'VERIFY_FAILED' -and $r.Output -notmatch 'VERIFY_OK') ('actual_exit=' + $r.ExitCode)

    $driver = Join-Path $temp 'run-fault.ps1'
    [IO.File]::WriteAllText($driver, @'
param([string]$Script, [string]$Root)
$url = ConvertTo-SecureString 'postgresql://fixture:FAKE_ONLY@127.0.0.1/ai_agent_research' -AsPlainText -Force
& $Script -BackupRoot $Root -PgBin $Root -ConnectionUrl $url -InternalTestOnly -SyntheticFixture
exit $LASTEXITCODE
'@)
    # Inject at IO boundaries, not by replacing Write-PrivateReceipt itself: the
    # original ownership/atomic publication/cleanup code must actually execute.
    $faults = @{
        'partial-write' = @'
function Write-ReceiptTemporaryFile {
    param([IO.FileStream]$Stream, [byte[]]$Bytes)
    $Stream.Write($Bytes, 0, 8)
    throw 'SYNTHETIC_PARTIAL_WRITE'
}
'@
        'flush' = @'
function Flush-ReceiptTemporaryFile { param([IO.FileStream]$Stream); throw 'SYNTHETIC_FLUSH_FAILURE' }
'@
        'close' = @'
function Close-ReceiptTemporaryFile { param([IO.FileStream]$Stream); throw 'SYNTHETIC_CLOSE_FAILURE' }
'@
        'publish' = @'
function Publish-ReceiptTemporaryFile { param([string]$TemporaryPath, [string]$FinalPath, [hashtable]$State); throw 'SYNTHETIC_PUBLISH_FAILURE' }
'@
        'after-publish' = @'
$script:ActualPublish = ${function:Publish-ReceiptTemporaryFile}
function Publish-ReceiptTemporaryFile {
    param([string]$TemporaryPath, [string]$FinalPath, [hashtable]$State)
    & $script:ActualPublish $TemporaryPath $FinalPath $State
    throw 'SYNTHETIC_RECEIPT_WRITE_FAILURE_AFTER_WRITE'
}
'@
        'existing-at-publish' = @'
$script:ActualPublish = ${function:Publish-ReceiptTemporaryFile}
function Publish-ReceiptTemporaryFile {
    param([string]$TemporaryPath, [string]$FinalPath, [hashtable]$State)
    [IO.File]::WriteAllText($FinalPath, 'OLD_PUBLICATION_TARGET_DO_NOT_DELETE')
    & $script:ActualPublish $TemporaryPath $FinalPath $State
}
'@
        'existing-before-write' = @'
$script:ActualRunDirectory = ${function:New-PrivateRunDirectory}
function New-PrivateRunDirectory {
    param([string]$Root, [switch]$SyntheticFixture)
    $path = & $script:ActualRunDirectory $Root -SyntheticFixture:$SyntheticFixture
    [IO.File]::WriteAllText((Join-Path $path 'staging.receipt.json'), 'OLD_PUBLICATION_TARGET_DO_NOT_DELETE')
    return $path
}
'@
        'cleanup-failure' = @'
function Write-ReceiptTemporaryFile {
    param([IO.FileStream]$Stream, [byte[]]$Bytes)
    $Stream.Write($Bytes, 0, 8)
    throw 'SYNTHETIC_ORIGINAL_WRITE_FAILURE'
}
function Remove-ReceiptOwnedFile { param([string]$Path); throw 'SYNTHETIC_CLEANUP_FAILURE' }
'@
    }
    foreach ($name in @('partial-write', 'flush', 'close', 'publish', 'after-publish', 'existing-at-publish', 'existing-before-write', 'cleanup-failure')) {
        $caseRoot = Join-Path $temp ('fault-' + $name)
        $old = Join-Path $caseRoot 'previous-backup'
        [void][IO.Directory]::CreateDirectory($old)
        $oldDump = Join-Path $old 'staging.dump'; $oldReceipt = Join-Path $old 'staging.receipt.json'
        [IO.File]::WriteAllText($oldDump, 'OLD_SYNTHETIC_BACKUP_DO_NOT_TOUCH')
        [IO.File]::WriteAllText($oldReceipt, 'OLD_SYNTHETIC_RECEIPT_DO_NOT_TOUCH')
        $oldDumpHash = (Get-FileHash -LiteralPath $oldDump -Algorithm SHA256).Hash
        $oldReceiptHash = (Get-FileHash -LiteralPath $oldReceipt -Algorithm SHA256).Hash
        [IO.File]::WriteAllText((Join-Path $sandbox 'RenderBackup.Common.ps1'), $common + "`n" + $mocks + "`n" + $faults[$name])
        $r = Invoke-PrivateProcess $engine @('-NoProfile', '-File', $driver, '-Script', (Join-Path $sandbox 'Backup-Render-Staging.ps1'), '-Root', $caseRoot)
        $run = @(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter 'RenderStaging-*')
        $files = @($run | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Force })
        $finals = @($files | Where-Object { $_.Name -eq 'staging.receipt.json' })
        $partials = @($files | Where-Object { $_.Extension -eq '.tmp' })
        $dumps = @($files | Where-Object { $_.Name -eq 'staging.dump' })
        $oldUnchanged = (Get-FileHash -LiteralPath $oldDump -Algorithm SHA256).Hash -eq $oldDumpHash -and (Get-FileHash -LiteralPath $oldReceipt -Algorithm SHA256).Hash -eq $oldReceiptHash
        $ok = $r.ExitCode -ne 0 -and $r.Output -match 'BACKUP_FAILED' -and $r.Output -notmatch 'BACKUP_OK' -and $dumps.Count -eq 0 -and $oldUnchanged
        if ($name -like 'existing-*') {
            $ok = $ok -and $finals.Count -eq 1 -and [IO.File]::ReadAllText($finals[0].FullName) -eq 'OLD_PUBLICATION_TARGET_DO_NOT_DELETE' -and $partials.Count -eq 0
        } elseif ($name -eq 'cleanup-failure') {
            $ok = $ok -and $finals.Count -eq 0 -and $partials.Count -eq 1 -and $r.Output -match 'BACKUP_CLEANUP_INCOMPLETE' -and $r.Output -match 'FIXTURE_ERROR_CODE: SYNTHETIC_ORIGINAL_WRITE_FAILURE'
        } else { $ok = $ok -and $finals.Count -eq 0 -and $partials.Count -eq 0 }
        $check = 'Receipt failure safely cleaned: ' + $name
        if ($name -eq 'after-publish') { $check = 'Receipt write failure leaves no success-looking receipt' }
        Record-Check $check $ok ('actual_exit=' + $r.ExitCode + '; final_receipts=' + $finals.Count + '; temporary_receipts=' + $partials.Count + '; dumps=' + $dumps.Count + '; old_backup_unchanged=' + $oldUnchanged + '; cleanup_warning=' + ($r.Output -match 'BACKUP_CLEANUP_INCOMPLETE'))
    }
    $output = [ordered]@{ scope = 'local mocks only; no Render, database, real encryption or restore'; engine = $PSVersionTable.PSVersion.ToString(); os = [Environment]::OSVersion.Platform.ToString(); native_windows_51 = 'NOT RUN'; checks = @($results.ToArray()) }
    if ($EvidenceFile) { [IO.File]::WriteAllText($EvidenceFile, ($output | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false))) }
    foreach ($check in $results) { Write-Host (($check.passed.ToString()) + ': ' + $check.check + ' - ' + $check.evidence) }
    if (@($results | Where-Object { -not $_.passed }).Count -gt 0) { exit 1 }
} finally {
    # Remove only the GUID directory created by this probe, never a backup root.
    if ($temp -and (Test-Path -LiteralPath $temp)) { Remove-Item -LiteralPath $temp -Recurse -Force }
}

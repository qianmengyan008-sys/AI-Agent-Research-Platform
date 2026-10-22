Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-BackupRoot {
    param([string]$Root, [switch]$SyntheticFixture)
    if (-not [IO.Path]::IsPathRooted($Root)) { throw 'ABSOLUTE_BACKUP_PATH_REQUIRED' }
    if (-not $SyntheticFixture) {
        if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'WINDOWS_REQUIRED' }
        if ($Root -notmatch '^[dD]:\\') { throw 'D_DRIVE_REQUIRED' }
    }
    $full = [IO.Path]::GetFullPath($Root)
    if ($full.IndexOfAny([char[]]"`r`n") -ge 0) { throw 'INVALID_PATH' }
    $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    if ($full.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'BACKUP_OUTSIDE_PROJECT_REQUIRED' }
    $walk = $full
    while ($walk) {
        if (Test-Path -LiteralPath $walk) {
            $item = Get-Item -LiteralPath $walk -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'LINKED_DIRECTORY_REJECTED' }
        }
        $parent = [IO.Path]::GetDirectoryName($walk)
        if ($parent -eq $walk) { break }
        $walk = $parent
    }
    if (-not $SyntheticFixture) {
        $drive = New-Object IO.DriveInfo('D:\')
        if ($drive.DriveType -ne [IO.DriveType]::Fixed) { throw 'LOCAL_D_DRIVE_REQUIRED' }
        if ($drive.AvailableFreeSpace -lt 1GB) { throw 'AT_LEAST_1GB_FREE_REQUIRED' }
    }
    return $full
}

function ConvertTo-NativeArgument {
    param([string]$Value)
    $b = New-Object Text.StringBuilder
    [void]$b.Append('"'); $slashes = 0
    foreach ($c in $Value.ToCharArray()) {
        if ($c -eq '\') { $slashes++; continue }
        if ($c -eq '"') {
            [void]$b.Append(('\' * (2 * $slashes + 1))); [void]$b.Append('"')
        } else {
            [void]$b.Append(('\' * $slashes)); [void]$b.Append($c)
        }
        $slashes = 0
    }
    [void]$b.Append(('\' * (2 * $slashes))); [void]$b.Append('"')
    return $b.ToString()
}

function Invoke-PrivateProcess {
    param([string]$Executable, [string[]]$Arguments, [hashtable]$PgEnvironment = @{}, [int]$TimeoutSeconds = 180, [string]$PrivateInput = '')
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Executable
    $info.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
    $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    $info.RedirectStandardInput = [bool]$PrivateInput
    foreach ($key in @($info.EnvironmentVariables.Keys)) {
        if ([string]$key -like 'PG*') { $info.EnvironmentVariables.Remove([string]$key) }
    }
    foreach ($key in $PgEnvironment.Keys) { $info.EnvironmentVariables[$key] = [string]$PgEnvironment[$key] }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        if ($PrivateInput) { $process.StandardInput.Write($PrivateInput); $process.StandardInput.Close() }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill(); $process.WaitForExit(); throw 'PROCESS_TIMEOUT'
        }
        $out = $stdout.GetAwaiter().GetResult()
        [void]$stderr.GetAwaiter().GetResult() # Never publish raw native errors (may contain credentials).
        return @{ ExitCode = $process.ExitCode; Output = $out }
    } finally {
        $info.EnvironmentVariables.Clear(); $process.Dispose()
    }
}

function Assert-Pg18 {
    param([string]$VersionOutput)
    if ($VersionOutput -notmatch '(?m)\bPostgreSQL\) 18(?:\.|\s|$)') { throw 'POSTGRESQL_18_CLIENT_REQUIRED' }
}

function Get-PgTools {
    param([string]$PgBin)
    $suffix = if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { '.exe' } else { '' }
    $dump = Join-Path $PgBin ('pg_dump' + $suffix)
    $restore = Join-Path $PgBin ('pg_restore' + $suffix)
    foreach ($tool in @($dump, $restore)) { if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw 'PG18_TOOLS_NOT_FOUND' } }
    $dv = Invoke-PrivateProcess $dump @('--version')
    $rv = Invoke-PrivateProcess $restore @('--version')
    if ($dv.ExitCode -ne 0 -or $rv.ExitCode -ne 0) { throw 'CLIENT_VERSION_CHECK_FAILED' }
    Assert-Pg18 $dv.Output; Assert-Pg18 $rv.Output
    return @{ Dump = $dump; Restore = $restore; DumpVersion = $dv.Output.Trim(); RestoreVersion = $rv.Output.Trim() }
}

function ConvertFrom-PrivateUrl {
    param([Security.SecureString]$ConnectionUrl, [switch]$SyntheticFixture)
    $ptr = [IntPtr]::Zero; $plain = $null
    try {
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ConnectionUrl)
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        $uri = $null
        if (-not [Uri]::TryCreate($plain, [UriKind]::Absolute, [ref]$uri)) { throw 'INVALID_PRIVATE_URL' }
        if ($uri.Scheme -notin @('postgres', 'postgresql') -or $uri.Fragment) { throw 'INVALID_PRIVATE_URL' }
        $db = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
        if ($db -ne 'ai_agent_research') { throw 'EXPECTED_DATABASE_REQUIRED' }
        if ($SyntheticFixture) {
            if ($uri.Host -notin @('127.0.0.1', 'localhost', '::1')) { throw 'FIXTURE_LOOPBACK_ONLY' }
        } elseif ($uri.Host -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]*\.render\.com$') { throw 'RENDER_EXTERNAL_HOSTNAME_REQUIRED' }
        if ($uri.Query -and $uri.Query -notmatch '^\?sslmode=(require|verify-full)$') { throw 'URL_QUERY_NOT_ALLOWED' }
        $parts = $uri.UserInfo.Split(@(':'), 2)
        if ($parts.Count -ne 2 -or -not $parts[0] -or -not $parts[1]) { throw 'PRIVATE_CREDENTIALS_REQUIRED' }
        return @{
            PGHOST = $uri.Host; PGPORT = $(if ($uri.Port -gt 0) { [string]$uri.Port } else { '5432' })
            PGDATABASE = $db; PGUSER = [Uri]::UnescapeDataString($parts[0]); PGPASSWORD = [Uri]::UnescapeDataString($parts[1])
            PGSSLMODE = $(if ($SyntheticFixture) { 'disable' } else { 'verify-full' })
            PGSSLROOTCERT = $(if ($SyntheticFixture) { '' } else { 'system' }); PGCONNECT_TIMEOUT = '10'; PGAPPNAME = 'researcher-private-pg18-backup'
            PGOPTIONS = '-c default_transaction_read_only=on'
        }
    } catch { throw 'PRIVATE_URL_REJECTED' }
    finally {
        $plain = $null
        if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    }
}

function New-PrivateRunDirectory {
    param([string]$Root, [switch]$SyntheticFixture)
    [void][IO.Directory]::CreateDirectory($Root)
    $path = Join-Path $Root ('RenderStaging-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($path)
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        $result = Invoke-PrivateProcess (Join-Path $env:SystemRoot 'System32/icacls.exe') @($path, '/inheritance:r', '/grant:r', ($identity + ':(OI)(CI)F'))
        if ($result.ExitCode -ne 0) { throw 'PRIVATE_DIRECTORY_ACL_FAILED' }
    } elseif ($SyntheticFixture) {
        $result = Invoke-PrivateProcess '/bin/chmod' @('700', $path)
        if ($result.ExitCode -ne 0) { throw 'PRIVATE_DIRECTORY_ACL_FAILED' }
    }
    return $path
}

function Get-BackupVerification {
    param([string]$DumpFile, [hashtable]$Tools, [string]$ExpectedSha256 = '', [switch]$SyntheticFixture)
    $file = Get-Item -LiteralPath $DumpFile
    if ($file.Length -le 5) { throw 'EMPTY_OR_INVALID_DUMP' }
    $stream = [IO.File]::OpenRead($file.FullName)
    try { $magic = New-Object byte[] 5; [void]$stream.Read($magic, 0, 5) } finally { $stream.Dispose() }
    if ([Text.Encoding]::ASCII.GetString($magic) -ne 'PGDMP') { throw 'CUSTOM_FORMAT_REQUIRED' }
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ExpectedSha256 -and $ExpectedSha256.ToLowerInvariant() -ne $hash) { throw 'CHECKSUM_MISMATCH' }
    $listing = Invoke-PrivateProcess $Tools.Restore @('--list', $file.FullName)
    if ($listing.ExitCode -ne 0) { throw 'RESTORE_LIST_FAILED' }
    if ($listing.Output -notmatch '(?m)Dumped from database version: 18(?:\.|\s|$)') { throw 'PG18_SOURCE_REQUIRED' }
    $entries = @($listing.Output -split "`r?`n" | Where-Object { $_ -match '^\d+; ' })
    foreach ($required in @('TABLE DATA research participant ', 'TABLE DATA research experiment_assignment ', 'TABLE DATA research message ', 'TABLE DATA research_meta schema_migration ')) {
        if ($listing.Output -notmatch [Regex]::Escape($required)) { throw 'RESEARCH_OBJECTS_MISSING' }
    }
    return [ordered]@{
        receipt_version = 1; source_postgres_major = 18; scope = $(if ($SyntheticFixture) { 'synthetic-local-pg18' } else { 'internal-staging-test-data-only' })
        created_at_utc = [DateTime]::UtcNow.ToString('o'); database_alias = 'ai-agent-research-staging-db'
        database_name = 'ai_agent_research'; pg_dump_version = $Tools.DumpVersion; pg_restore_version = $Tools.RestoreVersion
        pg_dump_exit_code = 0; pg_restore_list_exit_code = 0; bytes = $file.Length; sha256 = $hash
        object_summary = @{ archive_entries = $entries.Count; research_data_present = $true; migration_ledger_data_present = $true }
        file = $file.Name; encryption = 'UNENCRYPTED_INTERNAL_TEST_ONLY'; full_restore_verified = $false
    }
}

function Write-PrivateReceipt {
    param([string]$Path, $Receipt)
    if (Test-Path -LiteralPath $Path) { throw 'RECEIPT_ALREADY_EXISTS' }
    $json = $Receipt | ConvertTo-Json -Depth 6
    [IO.File]::WriteAllText($Path, $json, (New-Object Text.UTF8Encoding($false)))
}

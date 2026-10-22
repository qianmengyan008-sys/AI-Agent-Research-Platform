# Synthetic localhost-only test driver. Never accepts a real database credential.
param([string]$Operation, [string]$PgBin, [string]$Root, [int]$Port, [string]$DumpFile = '', [string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
$global:LASTEXITCODE = 0
$base = Split-Path $PSScriptRoot -Parent
$url = ConvertTo-SecureString ("postgresql://postgres:SYNTHETIC_DUMP_PASSWORD@127.0.0.1:" + $Port + '/ai_agent_research') -AsPlainText -Force
switch ($Operation) {
    'prepare' { & "$base/Prepare-Render-Backup.ps1" -BackupRoot $Root -PgBin $PgBin -SyntheticFixture }
    'backup' { & "$base/Backup-Render-Staging.ps1" -BackupRoot $Root -PgBin $PgBin -ConnectionUrl $url -InternalTestOnly -SyntheticFixture }
    'bad-connection' {
        $bad = ConvertTo-SecureString 'postgresql://postgres:SYNTHETIC_DUMP_PASSWORD@127.0.0.1:1/ai_agent_research' -AsPlainText -Force
        & "$base/Backup-Render-Staging.ps1" -BackupRoot $Root -PgBin $PgBin -ConnectionUrl $bad -InternalTestOnly -SyntheticFixture
    }
    'verify' { & "$base/Verify-Render-Backup.ps1" -DumpFile $DumpFile -PgBin $PgBin -SyntheticFixture }
    'encrypt' {
        $pass = ConvertTo-SecureString 'SYNTHETIC_ENCRYPTION_ONLY_45_中文' -AsPlainText -Force
        & "$base/Encrypt-Render-Backup.ps1" -DumpFile $DumpFile -Passphrase $pass -PassphraseAgain $pass -NodePath $NodePath -SyntheticFixture
    }
    'guards' {
        . "$base/RenderBackup.Common.ps1"
        foreach ($v in @('pg_dump (PostgreSQL) 17.7', 'pg_restore (PostgreSQL) 16.3', 'invalid')) {
            $rejected = $false
            try { Assert-Pg18 $v } catch { $rejected = $true }
            if (-not $rejected) { throw 'WRONG_VERSION_ACCEPTED' }
        }
        Assert-Pg18 'pg_dump (PostgreSQL) 18.6'
        foreach ($s in @('postgresql://x:y@127.0.0.1/ai_agent_research', 'postgresql://x:y@not-render.example/ai_agent_research')) {
            $rejected = $false
            try { [void](ConvertFrom-PrivateUrl (ConvertTo-SecureString $s -AsPlainText -Force)) } catch { $rejected = $true }
            if (-not $rejected) { throw 'EXTERNAL_IP_OR_WRONG_HOST_ACCEPTED' }
        }
        $rejected = $false
        try { [void](ConvertFrom-PrivateUrl (ConvertTo-SecureString 'postgresql://x:y@dpg-fixture.singapore-postgres.render.com/ai_agent_research' -AsPlainText -Force) -SyntheticFixture) } catch { $rejected = $true }
        if (-not $rejected) { throw 'FIXTURE_RENDER_HOST_ACCEPTED' }
        $uri = ConvertTo-SecureString 'postgresql://x:y@dpg-fixture.singapore-postgres.render.com/ai_agent_research?sslmode=require' -AsPlainText -Force
        $envs = ConvertFrom-PrivateUrl $uri
        if ($envs.PGSSLMODE -ne 'verify-full' -or $envs.PGSSLROOTCERT -ne 'system') { throw 'TLS_NOT_ENFORCED' }
        $envs.Clear()
        Write-Host 'GUARDS_OK'
    }
    default { throw 'UNKNOWN_SYNTHETIC_OPERATION' }
}
exit $LASTEXITCODE

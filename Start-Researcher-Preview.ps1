[CmdletBinding()]
param([ValidateSet('Start','Stop','Restart','NewRound','Export','Accounts')][string]$Action = 'Start')
$ErrorActionPreference = 'Stop'
$ResearchRoot = $PSScriptRoot
Set-Location -LiteralPath $ResearchRoot
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) { Write-Host '缺少 Node.js。请安装 Node.js 24 后重新打开本窗口。' -ForegroundColor Red; exit 1 }
$NodeVersion = & node -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or $NodeVersion.Split('.')[0] -ne '24') { Write-Host '需要 Node.js 24，当前版本不符合要求。' -ForegroundColor Red; exit 1 }
$ActionMap = @{Start='start'; Stop='stop'; Restart='restart'; NewRound='new-round'; Export='export'; Accounts='accounts'}
$EnteredSecret = $false
try {
    if ($Action -in @('Start','Restart')) {
        if ($Action -eq 'Start') {
            $CurrentStatus = & node scripts/local-researcher-preview.mjs status 2>$null
            if ($LASTEXITCODE -eq 0 -and (($CurrentStatus | ConvertFrom-Json).status -eq 'running')) { Write-Host ('服务已启动：' + (($CurrentStatus | ConvertFrom-Json).url)); exit 0 }
        }
        $NpmCommand = if ($env:OS -eq 'Windows_NT') { 'npm.cmd' } else { 'npm' }
        if (-not (Get-Command $NpmCommand -ErrorAction SilentlyContinue)) { throw '缺少 npm，请安装 Node.js 24 随附的 npm 11。' }
        $NpmVersion = & $NpmCommand --version
        if ($LASTEXITCODE -ne 0 -or $NpmVersion.Split('.')[0] -ne '11') { throw '需要 npm 11。' }
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw '缺少 Docker，请安装 Docker Desktop 并启用 Linux containers。' }
        & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Docker 未启动或无权限，请打开 Docker Desktop，等待其就绪后重试。' }
        $PrivateDirectory = Join-Path $ResearchRoot '.researcher-preview-private'
        New-Item -ItemType Directory -Path $PrivateDirectory -Force | Out-Null
        if ($env:OS -eq 'Windows_NT') {
            $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
            $Acl = New-Object System.Security.AccessControl.DirectorySecurity
            $Acl.SetAccessRuleProtection($true, $false)
            $Rule = New-Object System.Security.AccessControl.FileSystemAccessRule($Identity.User, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
            $Acl.AddAccessRule($Rule)
            $SystemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
            $SystemRule = New-Object System.Security.AccessControl.FileSystemAccessRule($SystemSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
            $Acl.AddAccessRule($SystemRule)
            Set-Acl -LiteralPath $PrivateDirectory -AclObject $Acl
        }
        if (-not (Test-Path -LiteralPath 'node_modules')) {
            Write-Host '首次启动：按锁定版本安装依赖，请等待。'
            & $NpmCommand ci
            if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。请检查 npm 网络连接，不能跳过安装。' }
        }
        Write-Host '构建已有 Web/API，请等待；不会重置记录。'
        & $NpmCommand run build
        if ($LASTEXITCODE -ne 0) { throw '构建失败，请保留错误信息，不要继续体验。' }
        & docker image inspect 'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2' 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host '下载固定 PostgreSQL 镜像，保留官方摘要校验。'
            & docker pull 'postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2'
            if ($LASTEXITCODE -ne 0) { throw '数据库镜像下载失败，请检查 Docker 网络。' }
        }
        if ([string]::IsNullOrWhiteSpace($env:DEEPSEEK_API_KEY)) {
            $SecureKey = Read-Host '安全输入 DEEPSEEK_API_KEY（输入不会回显，只在本次运行内存中使用）' -AsSecureString
            $Pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureKey)
            try { $env:DEEPSEEK_API_KEY = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer) }
            finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer); $SecureKey.Dispose() }
            $EnteredSecret = $true
            if ([string]::IsNullOrWhiteSpace($env:DEEPSEEK_API_KEY)) { throw '密钥未输入，服务未启动。' }
        }
    }
    if ($Action -in @('Stop','NewRound','Export')) {
        $OperationOutput = & node --use-env-proxy scripts/local-researcher-preview.mjs $ActionMap[$Action]
        if ($LASTEXITCODE -ne 0) { throw '本地操作失败。请先启动服务；锁文件问题按中文指南处理，不能删除旧数据库。' }
        $Operation = $OperationOutput | ConvertFrom-Json
        if ($Action -eq 'Stop') { Write-Host '本地 Web/API 已停止，数据库和旧记录保留。' }
        if ($Action -eq 'NewRound') { Write-Host ('已创建新轮次：' + $Operation.round + '。双击 View-Researcher-Accounts.bat 查看新账号。') }
        if ($Action -eq 'Export') { Write-Host ('完整 JSON 已保存：' + $Operation.file) }
    } else {
        & node --use-env-proxy scripts/local-researcher-preview.mjs $ActionMap[$Action]
        if ($LASTEXITCODE -ne 0) { throw '本地操作失败。请先启动服务；锁文件问题按中文指南处理，不能删除旧数据库。' }
    }
}
catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
finally { if ($EnteredSecret) { Remove-Item Env:DEEPSEEK_API_KEY -ErrorAction SilentlyContinue } }

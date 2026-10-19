# 需要 .NET / 外部程式，避免受限模式下的型別限制
#Requires -Version 5.1

<#
.SYNOPSIS
    把 industry-dynasty 的靜態網站部署到遠端伺服器。

.DESCRIPTION
    流程：本機建置 → 打包 dist → 上傳 → 遠端解開 → （可選）容器化 nginx。

    密碼不會出現在命令列或日誌：腳本用 SSH_ASKPASS 機制，讓 ssh 自己從
    `.deploy/pw` 檔案讀取。這在 Windows 內建 OpenSSH（8.4+）支援
    `SSH_ASKPASS_REQUIRE=force`，因此可以非互動登入。

    連線資訊讀 `.deploy/target.env`（非機密），密碼讀 `.deploy/pw`。

.EXAMPLE
    pwsh -File deploy\server-deploy.ps1 -DryRun
    pwsh -File deploy\server-deploy.ps1
#>
[CmdletBinding()]
param(
    # 只做本機建置與打包，不連線
    [switch]$DryRun,
    # 跳過本機建置（dist 已是最新時）
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$deployDir = Join-Path $repoRoot '.deploy'
$envFile = Join-Path $deployDir 'target.env'
$pwFile = Join-Path $deployDir 'pw'
$distDir = Join-Path $repoRoot 'apps/web/dist'

function Write-Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Write-Ok($message) { Write-Host "    $message" -ForegroundColor Green }
function Fail($message) { Write-Host "ERROR: $message" -ForegroundColor Red; exit 1 }

# ---------- 1. 讀設定 ----------
if (-not (Test-Path $envFile)) {
    New-Item -ItemType Directory -Force -Path $deployDir | Out-Null
    Copy-Item (Join-Path $PSScriptRoot 'target.env.example') $envFile
    Fail "已建立設定檔範本：$envFile`n      請填入 HOST 與 USER_NAME 後重跑。"
}

$config = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#') { return }
    if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') {
        $config[$Matches[1]] = $Matches[2]
    }
}

$hostName = $config['HOST']
$userName = $config['USER_NAME']
$port = if ($config['PORT']) { $config['PORT'] } else { '22' }
$remoteDir = if ($config['REMOTE_DIR']) { $config['REMOTE_DIR'] } else { '/var/www/industry-dynasty' }
$useDocker = ($config['USE_DOCKER'] -eq '1')
$sitePort = if ($config['SITE_PORT']) { $config['SITE_PORT'] } else { '8080' }

if ([string]::IsNullOrWhiteSpace($hostName) -or [string]::IsNullOrWhiteSpace($userName)) {
    Fail "請先在 $envFile 填入 HOST 與 USER_NAME。"
}

$target = "$userName@$hostName"

# ---------- 2. 建置 ----------
if (-not $SkipBuild) {
    Write-Step '本機建置'
    Push-Location $repoRoot
    try {
        & pnpm build
        if ($LASTEXITCODE -ne 0) { Fail 'pnpm build 失敗' }
    } finally { Pop-Location }
    Write-Ok 'build 完成'
}

if (-not (Test-Path (Join-Path $distDir 'index.html'))) {
    Fail "找不到 $distDir\index.html，建置可能失敗。"
}

$files = Get-ChildItem $distDir -Recurse -File
$totalMb = [math]::Round((($files | Measure-Object Length -Sum).Sum) / 1MB, 2)
Write-Ok "dist: $($files.Count) 個檔案、$totalMb MB"

# ---------- 3. 打包 ----------
Write-Step '打包 dist'
$tarball = Join-Path ([System.IO.Path]::GetTempPath()) 'industry-dynasty-web.tar.gz'
if (Test-Path $tarball) { Remove-Item $tarball -Force }
Push-Location $distDir
try {
    & tar -czf $tarball .
    if ($LASTEXITCODE -ne 0) { Fail 'tar 打包失敗（需要 Windows 內建 tar）' }
} finally { Pop-Location }
Write-Ok "已打包：$([math]::Round((Get-Item $tarball).Length/1MB,2)) MB"

if ($DryRun) {
    Write-Host ''
    Write-Step 'DryRun：以下是指令預覽，未連線'
    Write-Host "    目標      : $target (port $port)"
    Write-Host "    遠端目錄  : $remoteDir"
    Write-Host "    Docker    : $useDocker"
    Write-Host "    密碼檔    : $pwFile $([bool](Test-Path $pwFile))"
    exit 0
}

# ---------- 4. 準備非互動認證 ----------
if (-not (Test-Path $pwFile)) {
    Fail "找不到密碼檔 $pwFile`n      請把 SSH 密碼寫進該檔案（單一行），或改用金鑰登入。"
}

# SSH_ASKPASS 需要一個「輸出密碼」的程式。用 cmd 的 type 讀檔，密碼不會進命令列。
$askpass = Join-Path $deployDir 'askpass.cmd'
$askpassBody = "@echo off`r`ntype `"$pwFile`"`r`n"
[System.IO.File]::WriteAllText($askpass, $askpassBody, [System.Text.ASCIIEncoding]::new())
$env:SSH_ASKPASS = $askpass
$env:SSH_ASKPASS_REQUIRE = 'force'
# 部分版本的 OpenSSH 需要 DISPLAY 才會走 askpass 路徑
if (-not $env:DISPLAY) { $env:DISPLAY = 'localhost:0' }

$sshCommon = @('-p', $port, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'UserKnownHostsFile=NUL')

function Invoke-Remote([string]$command) {
    & ssh @sshCommon $target $command
    if ($LASTEXITCODE -ne 0) { Fail "遠端指令失敗：$command" }
}

# ---------- 5. 遠端準備目錄 ----------
Write-Step "連線 $target"
Invoke-Remote "mkdir -p '$remoteDir'"
Write-Ok "遠端目錄就緒：$remoteDir"

# ---------- 6. 上傳 ----------
Write-Step '上傳'
& scp -P $port -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=NUL $tarball "${target}:/tmp/industry-dynasty-web.tar.gz"
if ($LASTEXITCODE -ne 0) { Fail 'scp 上傳失敗' }
Write-Ok '上傳完成'

# ---------- 7. 解開並切換 ----------
Write-Step '遠端解開'
Invoke-Remote "tar -xzf /tmp/industry-dynasty-web.tar.gz -C '$remoteDir' && rm -f /tmp/industry-dynasty-web.tar.gz"
Write-Ok "已解開到 $remoteDir"

# ---------- 8. 服務 ----------
if ($useDocker) {
    Write-Step '以容器啟動 nginx'
    # 直接把靜態目錄掛進官方 nginx 映像；容器名固定，重跑即更新
    Invoke-Remote "docker rm -f industry-dynasty-web >/dev/null 2>&1 || true"
    Invoke-Remote "docker run -d --name industry-dynasty-web --restart unless-stopped -p $sitePort`:80 -v '$remoteDir':/usr/share/nginx/html:ro nginx:1.27-alpine"
    Write-Ok "容器已啟動（port $sitePort）"
    Write-Host "    http://$hostName`:$sitePort" -ForegroundColor Green
} else {
    Write-Step '非容器模式：只放好檔案'
    $hint = @()

    $hint += ''
    $hint += "    靜態檔已就位：$remoteDir"
    $hint += ''
    $hint += '    若伺服器已有 nginx，把該目錄設為網站根目錄即可。可直接執行：'
    $hint += ''
    $hint += "      sudo tee /etc/nginx/conf.d/industry-dynasty.conf >/dev/null <<'EOF'"
    $hint += '      server {'
    $hint += '          listen 80;'
    $hint += '          server_name _;'
    $hint += "          root $remoteDir;"
    $hint += '          index index.html;'
    $hint += '          location / { try_files $uri $uri/ /index.html; }'
    $hint += '          location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {'
    $hint += '              expires 7d;'
    $hint += '              add_header Cache-Control "public, immutable";'
    $hint += '          }'
    $hint += '      }'
    $hint += '      EOF'
    $hint += '      sudo nginx -t && sudo systemctl reload nginx'
    $hint += ''
    $hint += '    或改用容器模式：把 .deploy/target.env 的 USE_DOCKER 改成 1 再重跑。'
    $hint += ''

    foreach ($line in $hint) { Write-Host $line -ForegroundColor Yellow }
}

Write-Host ''
Write-Ok '部署完成'

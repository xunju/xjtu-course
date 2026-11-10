param([int]$ServicePort = 8765, [int]$CdpPort = 9333)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $env:LOCALAPPDATA 'XJTU-Course-PDF'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = Join-Path $root 'runtime\node.exe' }
if (-not (Test-Path -LiteralPath $node)) { throw '未找到 Node.js，请先运行 install-xjtu.ps1。' }
New-Item -ItemType Directory -Force -Path (Join-Path $dataRoot 'output'), (Join-Path $dataRoot 'cache'), (Join-Path $dataRoot 'logs') | Out-Null
$log = Join-Path $dataRoot 'logs\service.log'
$serverArgs = @((Join-Path $root 'bin\xjtu-extension-server.mjs'), '--port', $ServicePort, '--cdp-port', $CdpPort, '--out', (Join-Path $dataRoot 'output'), '--cache', (Join-Path $dataRoot 'cache'))
Start-Process -FilePath $node -ArgumentList $serverArgs -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError (Join-Path $dataRoot 'logs\service.err.log') -WindowStyle Hidden
$browserScript = Join-Path $root 'scripts\start-xjtu-cdp.ps1'
if (Test-Path -LiteralPath $browserScript) { & powershell.exe -ExecutionPolicy Bypass -File $browserScript -Port $CdpPort }
Write-Output "XJTU Course PDF 服务已启动：http://127.0.0.1:$ServicePort"

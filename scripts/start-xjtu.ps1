param([int]$ServicePort = 8765, [int]$CdpPort = 9333)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dataRoot = $root
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = Join-Path $root 'runtime\node.exe' }
if (-not (Test-Path -LiteralPath $node)) { throw 'Node.js not found. Run install-xjtu.ps1 first.' }
New-Item -ItemType Directory -Force -Path (Join-Path $dataRoot 'xjtu-course-output'), (Join-Path $dataRoot 'xjtu-course-cache'), (Join-Path $dataRoot 'logs') | Out-Null
$log = Join-Path $dataRoot 'logs\service.log'
$server = Join-Path $root 'bin\xjtu-extension-server.mjs'
$args = @($server, '--port', $ServicePort, '--cdp-port', $CdpPort, '--out', (Join-Path $dataRoot 'xjtu-course-output'), '--cache', (Join-Path $dataRoot 'xjtu-course-cache'))
Start-Process -FilePath $node -ArgumentList $args -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError (Join-Path $dataRoot 'logs\service.err.log') -WindowStyle Hidden
$browserScript = Join-Path $root 'scripts\start-xjtu-cdp.ps1'
if (Test-Path -LiteralPath $browserScript) { & powershell.exe -ExecutionPolicy Bypass -File $browserScript -Port $CdpPort }
Write-Output "Service started at http://127.0.0.1:$ServicePort"


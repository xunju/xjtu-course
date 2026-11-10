param(
  [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$SkipNpm
)
$ErrorActionPreference = 'Stop'
$dataRoot = Join-Path $env:LOCALAPPDATA 'XJTU-Course-PDF'
New-Item -ItemType Directory -Force -Path $dataRoot, (Join-Path $dataRoot 'output'), (Join-Path $dataRoot 'cache'), (Join-Path $dataRoot 'logs') | Out-Null

function Find-CommandPath([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $bundled = Join-Path $InstallRoot "runtime\$Name.exe"
  if (Test-Path -LiteralPath $bundled) { return $bundled }
  return $null
}

$nodePath = Find-CommandPath 'node'
$pythonPath = Find-CommandPath 'python'
$ffmpegPath = Find-CommandPath 'ffmpeg'
if (-not $nodePath) { throw '未找到 Node.js。请安装 Node.js 20+，或使用包含 runtime 的安装包。' }
if (-not $pythonPath) { throw '未找到 Python。请安装 Python 3，或使用包含 runtime 的安装包。' }
if (-not $ffmpegPath) { throw '未找到 ffmpeg。请安装 ffmpeg，或使用包含 runtime 的安装包。' }
if (-not (Find-CommandPath 'ffprobe')) { throw '未找到 ffprobe。请确认 ffmpeg 发行包包含 ffprobe。' }

if (-not $SkipNpm -and (Test-Path (Join-Path $InstallRoot 'package.json'))) {
  Push-Location $InstallRoot
  try {
    $npm = (Get-Command npm -ErrorAction SilentlyContinue).Source
    if (-not $npm) { $npm = Join-Path (Split-Path $nodePath) 'npm.cmd' }
    if (-not (Test-Path -LiteralPath $npm) -and -not (Get-Command $npm -ErrorAction SilentlyContinue)) { throw '未找到 npm。请安装完整 Node.js 发行版。' }
    & $npm install --omit=dev
  } finally { Pop-Location }
}

$config = [ordered]@{ servicePort = 8765; cdpPort = 9333; outputDir = (Join-Path $dataRoot 'output'); cacheDir = (Join-Path $dataRoot 'cache'); installedAt = (Get-Date).ToUniversalTime().ToString('o') }
$config | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $dataRoot 'config.json')
Write-Output "安装检查完成。数据目录：$dataRoot"

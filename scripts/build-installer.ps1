param([string]$Iscc = 'ISCC.exe', [string]$Version = '1.0.0')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$iss = Join-Path $root 'installer\XJTU-Course-PDF.iss'
if (-not (Get-Command $Iscc -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath $Iscc)) { throw '未找到 Inno Setup 编译器 ISCC.exe。请先安装 Inno Setup 6。' }
& $Iscc $iss "/DAppVersion=$Version"

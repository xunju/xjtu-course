param([string]$Output = (Join-Path (Split-Path -Parent $PSScriptRoot) 'release\portable'))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (Test-Path -LiteralPath $Output) { [System.IO.Directory]::Delete($Output, $true) }
New-Item -ItemType Directory -Force -Path $Output | Out-Null
$exclude = @('.git','node_modules','.ocr-venv','release','tmp-test-out','tmp-test-cache')
Get-ChildItem -LiteralPath $root -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object { Copy-Item $_.FullName (Join-Path $Output $_.Name) -Recurse -Force }
Write-Output "Portable tree created at $Output"
Write-Output 'For a dependency-free release, place portable Node/Python/ffmpeg under runtime before running Inno Setup.'

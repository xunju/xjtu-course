param(
  [int]$Port = 9333,
  [string]$Profile = (Join-Path $env:TEMP 'xjtu-cdp')
)

$candidates = @(@(
  (Get-Command msedge.exe -ErrorAction SilentlyContinue).Source,
  (Get-Command chrome.exe -ErrorAction SilentlyContinue).Source,
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) })

$versionedEdge = Get-ChildItem -LiteralPath "${env:ProgramFiles(x86)}\Microsoft\Edge\Application" -Filter msedge.exe -File -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.DirectoryName -ne "${env:ProgramFiles(x86)}\Microsoft\Edge\Application" } |
  Select-Object -First 1 -ExpandProperty FullName
if ($versionedEdge -and ($candidates -notcontains $versionedEdge)) { $candidates = @($candidates + $versionedEdge) }

if (-not $candidates) {
  throw 'Edge or Chrome was not found. Start a Chromium browser with --remote-debugging-port manually.'
}
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535.' }

$browser = [string]$candidates[0]
New-Item -ItemType Directory -Force -Path $Profile | Out-Null
Start-Process -FilePath $browser -ArgumentList @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$Profile",
  '--autoplay-policy=no-user-gesture-required',
  'https://lms.xjtu.edu.cn/user/courses#/'
) -WindowStyle Normal
Write-Output "Started: $browser"
Write-Output "CDP: http://127.0.0.1:$Port"
Write-Output 'Complete SSO in the new window, open the player, then run dsh-xjtu-capture.'

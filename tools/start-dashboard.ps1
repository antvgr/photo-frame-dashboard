# Démarre ce dont le cadre a besoin côté PC : le serveur du dashboard (port 4173) + le relais USB (adb reverse).
# Le cadre lance le kiosque tout seul au démarrage ; sa page d'attente réessaie toutes les 5 s, donc l'ordre n'a pas d'importance.
#
#   powershell -ExecutionPolicy Bypass -File tools\start-dashboard.ps1
#
# Laissez la fenêtre ouverte : le script réapplique le relais USB si le câble est rebranché ou si le cadre redémarre.
# Options : -Rebuild  reconstruit le dashboard avant de le servir (après une modification du code).

param([switch]$Rebuild)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here

$adb = $(if ($env:ADB) { $env:ADB } else { 'adb' })
$dash = Join-Path $repo 'dashboard'
$port = 4173

function Test-Server { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$port/").StatusCode -eq 200 } catch { $false } }

if (-not (Test-Path $adb)) { Write-Host "adb introuvable : $adb" -ForegroundColor Red; exit 1 }

if ($Rebuild -or -not (Test-Path "$dash\dist\index.html")) {
  Write-Host 'Construction du dashboard...'
  Push-Location $dash; npm run build; Pop-Location
}

if (Test-Server) {
  Write-Host "Serveur déjà actif sur 127.0.0.1:$port" -ForegroundColor Green
} else {
  Write-Host 'Démarrage du serveur du dashboard...'
  Start-Process -WindowStyle Hidden -WorkingDirectory $dash -FilePath cmd.exe -ArgumentList "/c npm run preview -- --host 127.0.0.1 --port $port --strictPort"
  for ($i = 0; $i -lt 20 -and -not (Test-Server); $i++) { Start-Sleep 1 }
  if (-not (Test-Server)) { Write-Host 'Le serveur ne répond pas.' -ForegroundColor Red; exit 1 }
  Write-Host 'Serveur démarré.' -ForegroundColor Green
}

Write-Host 'Surveillance du relais USB (Ctrl+C pour arrêter)...'
$last = ''
while ($true) {
  $dev = ((& $adb devices) -join "`n") -match "`tdevice"
  if ($dev) {
    $maps = (& $adb -d reverse --list) -join ' '
    if ($maps -notmatch "tcp:$port") {
      & $adb -d reverse "tcp:$port" "tcp:$port" | Out-Null
      $state = 'relais USB rétabli'
    } else { $state = 'cadre connecté, relais OK' }
  } else { $state = 'cadre non détecté (câble USB ?)' }
  if ($state -ne $last) { Write-Host ("{0:HH:mm:ss}  {1}" -f (Get-Date), $state); $last = $state }
  Start-Sleep 10
}

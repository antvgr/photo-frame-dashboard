# Donne au dashboard du cadre le jeton Home Assistant et relance l'affichage.
# Lancez-le VOUS-MÊME dans un terminal PowerShell : il vous demande le jeton (saisie masquée).
# Le jeton n'est écrit dans aucun fichier du PC. Il est enregistré dans le stockage du kiosque sur le cadre.
#
#   powershell -ExecutionPolicy Bypass -File tools\set-ha-token.ps1
#
# Prérequis : le câble USB est branché et le dashboard est publié dans Home Assistant (deploy-to-ha.ps1).
# Option -Pc : ancien mode, le dashboard est servi par le PC (port 4173).

param([switch]$Pc)

$adb = $(if ($env:ADB) { $env:ADB } else { 'adb' })
function Fail($m) { Write-Host "ERREUR : $m" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $adb)) { Fail "adb introuvable : $adb" }
if (((& $adb devices) -join "`n") -notmatch "`tdevice") { Fail 'Cadre non détecté par ADB (câble USB branché ?).' }
$haPage = 'http://homeassistant.local:8123/local/cadre/index.html'
if ($Pc) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:4173/ | Out-Null }
  catch { Fail 'Le serveur du dashboard ne répond pas sur 127.0.0.1:4173 (npm run preview).' }
} else {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 $haPage | Out-Null }
  catch { Fail "La page du dashboard ne répond pas : $haPage (deploy-to-ha.ps1 lancé ? Home Assistant redémarré ?)" }
}

$sec = Read-Host 'Jeton Home Assistant (saisie masquée)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
$tok = $tok.Trim()
if ($tok -notmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') { Fail 'Ce n''est pas un jeton valide (3 parties séparées par des points).' }

if ($Pc) { & $adb -d reverse tcp:4173 tcp:4173 | Out-Null; $url = "http://127.0.0.1:4173/?ha_token=$tok#home" }
else { $url = "$haPage`?ha_token=$tok#home" }
& $adb -d shell "am start -a android.intent.action.VIEW -d `"$url`" -n com.wesbos.homehq/.MainActivity" | Out-Null
$tok = $null; $url = $null

# Le jeton apparaît le temps d'un instant dans le journal Android : on le vide.
Start-Sleep 3
& $adb -d shell 'logcat -c' | Out-Null
Write-Host 'Jeton envoyé. Regardez le cadre : les données doivent apparaître en quelques secondes.' -ForegroundColor Green
Write-Host 'Puis ouvrez Réglages (appui long sur l''heure) : Home Assistant doit indiquer "Connecté".'

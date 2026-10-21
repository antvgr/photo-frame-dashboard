# Connecte le cadre PF1007L à votre Wi-Fi (WPA/WPA2-PSK), via ADB root.
# Lancez-le VOUS-MÊME dans un terminal PowerShell : il vous demande le nom du réseau et le mot de passe.
# Le mot de passe n'est ni affiché, ni écrit dans un fichier, ni envoyé ailleurs : le cadre ne reçoit que la clé dérivée (PSK).
#
#   powershell -ExecutionPolicy Bypass -File tools\connect-wifi.ps1

$adb = $(if ($env:ADB) { $env:ADB } else { 'adb' })
$wpa = 'wpa_cli -p /data/misc/wifi/sockets -i wlan0'

function Get-WpaPsk([string]$pass, [string]$ssid) {
  $p = [Text.Encoding]::UTF8.GetBytes($pass); $s = [Text.Encoding]::UTF8.GetBytes($ssid)
  $h = New-Object Security.Cryptography.HMACSHA1 -ArgumentList (, $p)
  $out = @()
  foreach ($i in 1, 2) {
    $u = $h.ComputeHash([byte[]]($s + [byte[]](0, 0, 0, $i))); $t = [byte[]]$u.Clone()
    for ($n = 1; $n -lt 4096; $n++) { $u = $h.ComputeHash($u); for ($k = 0; $k -lt 20; $k++) { $t[$k] = $t[$k] -bxor $u[$k] } }
    $out += $t
  }
  (($out[0..31] | ForEach-Object { $_.ToString('x2') }) -join '')
}
function ToHex([string]$s) { (([Text.Encoding]::UTF8.GetBytes($s) | ForEach-Object { $_.ToString('x2') }) -join '') }
function Fail($m) { Write-Host "ERREUR : $m" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $adb)) { Fail "adb introuvable : $adb" }
if (((& $adb devices) -join "`n") -notmatch "`tdevice") { Fail 'Cadre non détecté par ADB (câble USB branché ?).' }

$ssid = Read-Host 'Nom du réseau Wi-Fi (SSID)'
$sec = Read-Host 'Mot de passe Wi-Fi' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
if ($pass.Length -lt 8 -or $pass.Length -gt 63) { Fail 'Un mot de passe WPA fait entre 8 et 63 caractères.' }

Write-Host 'Calcul de la clé (quelques secondes)...'
$psk = Get-WpaPsk $pass $ssid
$pass = $null

$id = (& $adb -d shell "$wpa add_network").Trim()
if ($id -notmatch '^\d+$') { Fail "add_network a échoué : $id" }
$steps = @(
  "$wpa set_network $id ssid $(ToHex $ssid)",
  "$wpa set_network $id psk $psk",
  "$wpa set_network $id key_mgmt WPA-PSK",
  "$wpa set_network $id scan_ssid 1",
  "$wpa enable_network $id",
  "$wpa save_config"
)
foreach ($c in $steps) {
  $r = (& $adb -d shell $c).Trim()
  if ($r -notmatch 'OK') { Fail "Une étape a échoué ($r). Le réseau $id a été créé mais non finalisé." }
}

# Relance le Wi-Fi pour que le système relise ses réseaux.
& $adb -d shell 'svc wifi disable; sleep 2; svc wifi enable' | Out-Null
Write-Host 'Connexion en cours...'
$ip = ''
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep 2
  $ip = (& $adb -d shell "ip addr show wlan0 | grep 'inet '").Trim()
  if ($ip) { break }
}
if (-not $ip) { Fail 'Pas d''adresse IP après 60 s : SSID, mot de passe ou portée du Wi-Fi à vérifier.' }
Write-Host "Connecté : $ip" -ForegroundColor Green

$ping = (& $adb -d shell 'ping -c 1 -W 2 homeassistant.local 2>&1 | grep -E "bytes from|100% packet loss"')
Write-Host "Home Assistant (homeassistant.local) : $ping"
Write-Host 'Étape suivante : set-ha-token.ps1'

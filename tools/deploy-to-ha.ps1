# Publie le dashboard dans Home Assistant (dossier www\cadre) : le cadre n'a plus besoin du PC pour afficher l'interface.
#
#   powershell -ExecutionPolicy Bypass -File tools\deploy-to-ha.ps1
#
# A lancer VOUS-MEME : le script demande l'identifiant et le mot de passe du partage Samba de Home Assistant
# (add-on "Samba share" -> onglet Configuration). Rien n'est enregistre, ni dans ce fichier ni sur le disque.
# Resultat : http://homeassistant.local:8123/local/cadre/index.html
#
# Premiere fois seulement : si le dossier www n'existait pas, redemarrez Home Assistant une fois
# (Parametres -> Systeme -> Redemarrer) pour que l'adresse /local/ soit servie.

param(
  [string]$Share = '\\homeassistant.local\config',
  [string]$Target = 'www\cadre'
)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here

$dash = Join-Path $repo 'dashboard'
$out = Join-Path $dash 'dist-ha'

Write-Host 'Construction du dashboard (chemins relatifs, pour etre servi depuis /local/cadre/)...'
Push-Location $dash
try {
  & npx vite build --base=./ --outDir dist-ha
  if ($LASTEXITCODE -ne 0) { throw 'La construction a echoue.' }
} finally { Pop-Location }
if (-not (Test-Path (Join-Path $out 'index.html'))) { Write-Host 'dist-ha\index.html introuvable.' -ForegroundColor Red; exit 1 }

$cred = Get-Credential -Message 'Identifiants du partage Samba de Home Assistant'
if (-not $cred) { Write-Host 'Annule.'; exit 1 }
try {
  New-PSDrive -Name HAcfg -PSProvider FileSystem -Root $Share -Credential $cred -ErrorAction Stop | Out-Null
} catch {
  Write-Host "Connexion au partage impossible : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

try {
  $dest = "HAcfg:\$Target"
  # on supprime les anciens fichiers mais on garde les dossiers (le partage Samba supprime les dossiers avec retard, ce qui faisait echouer la copie)
  if (Test-Path $dest) { Get-ChildItem $dest -Recurse -File -Force | Remove-Item -Force }   # ne vide que le dossier cadre
  else { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
  # fichier par fichier : Copy-Item -Recurse echoue quand un sous-dossier (fonts, meteocons...) n'existe pas encore sur le partage
  $base = (Resolve-Path $out).Path.TrimEnd('\')
  foreach ($f in Get-ChildItem $out -Recurse -File) {
    $rel = $f.FullName.Substring($base.Length).TrimStart('\')
    $to = Join-Path $dest $rel
    $ok = $false
    for ($try = 1; $try -le 5 -and -not $ok; $try++) {
      try {
        New-Item -ItemType Directory -Path (Split-Path $to -Parent) -Force -ErrorAction Stop | Out-Null
        Copy-Item -LiteralPath $f.FullName -Destination $to -Force -ErrorAction Stop
        $ok = $true
      } catch { Start-Sleep -Milliseconds (400 * $try) }
    }
    if (-not $ok) { Write-Host "Echec : $rel" -ForegroundColor Red; exit 1 }
  }
  $n = (Get-ChildItem $dest -Recurse -File).Count
  Write-Host "$n fichiers copies dans $Share\$Target" -ForegroundColor Green
  Write-Host 'Adresse : http://homeassistant.local:8123/local/cadre/index.html'
} finally {
  Remove-PSDrive -Name HAcfg -ErrorAction SilentlyContinue
}

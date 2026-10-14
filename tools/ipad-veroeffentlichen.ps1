# Uebertraegt den letzten Commit als neuen Stand ins oeffentliche Repo CoolzeroX66/mg-racing (GitHub Pages).
# Ohne Historie und mit anonymer GitHub-Adresse als Autor, damit die private E-Mail nicht oeffentlich wird.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$publicRepo = 'https://github.com/CoolzeroX66/mg-racing.git'
$author = 'CoolzeroX66 <280033229+CoolzeroX66@users.noreply.github.com>'
$work = Join-Path $env:TEMP "mg-racing-veroeffentlichen-$(Get-Random)"

$dirty = git -C $repoRoot status --porcelain
if ($dirty) { Write-Host "Hinweis: Nicht committete Aenderungen werden NICHT veroeffentlicht:`n$($dirty -join "`n")" -ForegroundColor Yellow }
$commit = git -C $repoRoot log -1 --format='%h %s'

git clone --quiet --depth 1 $publicRepo $work
if ($LASTEXITCODE -ne 0) { throw 'Oeffentliches Repo konnte nicht geladen werden.' }
Get-ChildItem $work -Force | Where-Object Name -ne '.git' | Remove-Item -Recurse -Force
$archive = Join-Path $work 'stand.zip'
git -C $repoRoot archive --format=zip -o $archive HEAD
Expand-Archive $archive -DestinationPath $work -Force
Remove-Item $archive
# Leere Datei: GitHub Pages liefert alle Dateien unveraendert aus
New-Item -ItemType File (Join-Path $work '.nojekyll') -Force | Out-Null

git -C $work add -A
git -C $work diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Host 'Keine Aenderungen - die Seite ist bereits aktuell.'; Remove-Item $work -Recurse -Force; exit 0 }
git -C $work -c user.name='CoolzeroX66' -c user.email='280033229+CoolzeroX66@users.noreply.github.com' commit --quiet --author=$author -m "Stand: $commit"
git -C $work push --quiet origin HEAD:main
if ($LASTEXITCODE -ne 0) { throw 'Hochladen fehlgeschlagen.' }
Remove-Item $work -Recurse -Force
Write-Host "Veroeffentlicht: $commit" -ForegroundColor Green
Write-Host 'In 1-2 Minuten unter https://coolzerox66.github.io/mg-racing/ verfuegbar.'

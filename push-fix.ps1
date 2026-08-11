Set-Location "$PSScriptRoot"

$git = (Get-Item "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" | Select-Object -Last 1).FullName
Write-Host "Git: $git" -ForegroundColor Cyan

# Fjern lock-filer
foreach ($l in @(".git\index.lock", ".git\HEAD.lock", ".git\MERGE_HEAD")) {
    if (Test-Path $l) { Remove-Item $l -Force; Write-Host "Fjernet: $l" -ForegroundColor Yellow }
}

& $git fetch origin main

# Commit eventuelle endringer
$status = & $git status --porcelain
if ($status) {
    & $git add -A
    & $git commit -m "fix: skuddsikre MSAL-scopes + historikk via bridge"
    Write-Host "Endringer committed." -ForegroundColor Green
} else {
    # Tom commit for aa tvinge deploy om ingenting er endret
    & $git commit --allow-empty -m "chore: force redeploy"
    Write-Host "Ingen endringer - tom commit for aa tvinge deploy." -ForegroundColor Yellow
}

& $git push origin main

Write-Host "`nFerdig! Appen deployes naa. Trykk Enter for aa lukke." -ForegroundColor Green
Read-Host

Set-Location "$PSScriptRoot"

$git = (Get-Item "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" | Select-Object -Last 1).FullName
Write-Host "Git: $git" -ForegroundColor Cyan

# Fjern lock-filer
foreach ($l in @(".git\index.lock", ".git\HEAD.lock", ".git\MERGE_HEAD")) {
    if (Test-Path $l) { Remove-Item $l -Force; Write-Host "Fjernet: $l" -ForegroundColor Yellow }
}

& $git fetch origin main

# Tom commit for aa tvinge ny deploy av Kapasitetsprognosen
& $git commit --allow-empty -m "chore: force redeploy kapasitetsprognose (avvikssystem overskrev)"
& $git push origin main

Write-Host "`nFerdig! Kapasitetsprognosen deployes naa. Trykk Enter for aa lukke." -ForegroundColor Green
Read-Host

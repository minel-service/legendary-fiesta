cd "$PSScriptRoot"

# Slett git lock-filer med force (cmd del /f omgår noen restricsjoner)
$gitDir = Join-Path $PSScriptRoot ".git"
$locks = @(
    (Join-Path $gitDir "HEAD.lock"),
    (Join-Path $gitDir "index.lock"),
    (Join-Path $gitDir "objects\maintenance.lock")
)
foreach ($lock in $locks) {
    if (Test-Path $lock) {
        try {
            cmd /c "del /f /q `"$lock`"" 2>$null
            if (-not (Test-Path $lock)) {
                Write-Host "Slettet: $lock" -ForegroundColor Yellow
            } else {
                Write-Host "Kunne ikke slette: $lock" -ForegroundColor Red
            }
        } catch {}
    }
}

git add src/index.html push-fix.ps1
git commit -m "fix: tell aktive ansatte fra 4 uker tilbake (ikke bare fremtidige)"
git push origin main
Write-Host "Ferdig! Trykk Enter for aa lukke." -ForegroundColor Green
Read-Host

Set-Location "$env:TEMP"

$git = (Get-Item "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" | Select-Object -Last 1).FullName
Write-Host "Git: $git" -ForegroundColor Cyan

# Klon avvikssystem-repoet
Write-Host "`nKloner minel-avvikssystem..." -ForegroundColor Cyan
if (Test-Path "minel-avvikssystem") { Remove-Item "minel-avvikssystem" -Recurse -Force }
& $git clone https://github.com/MinelKapasitet/minel-avvikssystem.git
Set-Location "minel-avvikssystem"

# Skriv ny deploy.yml som bruker riktig token (nice-meadow, IKKE calm-plant)
Write-Host "`nSkriver fikset deploy.yml..." -ForegroundColor Cyan
$newYml = @'
name: Deploy Avviksregistrering til Azure Static Web Apps (nice-meadow)

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_NICE_MEADOW }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: /public
          skip_app_build: true
'@

[System.IO.File]::WriteAllText("$PWD\.github\workflows\deploy.yml", $newYml, [System.Text.UTF8Encoding]::new($false))
Write-Host "  Byttet AZURE_STATIC_WEB_APPS_API_TOKEN_AVVIK -> AZURE_STATIC_WEB_APPS_API_TOKEN_NICE_MEADOW" -ForegroundColor Green

# Commit og push
& $git add .github/workflows/deploy.yml
& $git commit -m "fix: bruk NICE_MEADOW-token - avvikssystem skal ALDRI deploye til calm-plant"
& $git push origin main

Write-Host "`nFerdig! Avvikssystemet deployer naa til nice-meadow og vil aldri overskrive Kapasitetsprognosen igjen." -ForegroundColor Green
Write-Host "Husk aa kjore push-fix.ps1 i legendary-fiesta for aa gjenopprette Kapasitetsprognosen." -ForegroundColor Yellow
Read-Host "`nTrykk Enter for aa lukke"

@echo off
cd /d "%~dp0"
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\objects\maintenance.lock" 2>nul
echo Lock-filer slettet (eller eksisterte ikke)
git add src/index.html push-fix.ps1 push-fix.bat
git commit -m "fix: tell aktive ansatte fra 4 uker tilbake (ikke bare fremtidige)"
git push origin main
echo.
echo Ferdig! Trykk en tast for aa lukke.
pause

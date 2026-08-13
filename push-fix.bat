@echo off
cd /d "%~dp0"
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\objects\maintenance.lock" 2>nul
echo Lock-filer slettet (eller eksisterte ikke)
echo Bruk GitHub Desktop for aa committe og pushe.
pause

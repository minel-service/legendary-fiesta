@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo Rydder lock-filer og OneDrive-rester...
del /f /q ".git\HEAD.lock" 2>nul
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\refs\heads\main.lock" 2>nul
del /f /q ".git\objects\maintenance.lock" 2>nul

REM ── OneDrive-rester ──────────────────────────────────────────────
REM Repoet ligger i en OneDrive-synket mappe. OneDrive lager .bak-kopier
REM av filer den tror er i konflikt, ogsaa inne i .git. Git leser ALT i
REM refs\heads som en referanse, og kveler paa filer som
REM "main.lock.bak" med: fatal: bad object refs/heads/main.lock.bak
REM Slett dem, ellers stopper hver eneste henting.
del /f /q ".git\refs\heads\*.bak" 2>nul
del /f /q ".git\refs\heads\*.lock" 2>nul
del /f /q ".git\refs\remotes\origin\*.bak" 2>nul
del /f /q ".git\*.bak" 2>nul
for /d %%D in (".git\refs\heads\*") do del /f /q "%%D\*.bak" 2>nul
echo Opprydding ferdig.

echo.
echo Leter etter GitHub Desktop git...
set GIT_EXE=
for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" (
        set GIT_EXE=%%D\resources\app\git\cmd\git.exe
    )
)

if "!GIT_EXE!"=="" (
    echo FEIL: Fant ikke GitHub Desktop git.exe
    echo Aapne GitHub Desktop og klikk Push origin manuelt.
    pause
    exit /b 1
)

echo Bruker: !GIT_EXE!
echo.

echo Legger til endringer i src/, api/ og denne fila...
REM push-fix.bat maa vaere med. Endrer den seg uten aa bli commitet, ligger
REM den som en ulagret endring og blokkerer "pull --rebase" hver gang.
"!GIT_EXE!" add src/index.html src/staticwebapp.config.json src/ingen-tilgang.html api .github push-fix.bat

echo Sjekker om det er noe aa committe...
"!GIT_EXE!" diff --cached --quiet
if errorlevel 1 (
    "!GIT_EXE!" commit -m "sikkerhet: fjern ni OS-nokler fra klientkoden + mutasjonssperre i proxyen"
    echo Commit OK.
) else (
    echo Ingen nye endringer å committe.
)

echo.
echo Henter endringer fra GitHub foerst...
REM Andre oekter og andre repo skriver ogsaa til main. Uten dette blir
REM push avvist med "fetch first" hver gang noen andre har commitet.
REM --autostash legger bort eventuelle ulagrede endringer under hentingen
REM og setter dem tilbake etterpaa. Uten den stopper rebase paa alt som
REM ikke er commitet.
"!GIT_EXE!" pull --rebase --autostash origin main
if errorlevel 1 (
    echo.
    echo ============================================================
    echo  KONFLIKT ved henting - ingenting er pushet.
    echo  Dine endringer ligger trygt i commiten din.
    echo ============================================================
    REM Avbryt kun hvis en rebase faktisk paagaar
    "!GIT_EXE!" rebase --abort 2>nul
    echo.
    echo  Aapne GitHub Desktop og loes konflikten der, eller si fra.
    pause
    exit /b 1
)
echo Henting OK.

echo.
echo Pusher til origin/main...
"!GIT_EXE!" push origin main
if errorlevel 1 (
    echo.
    echo FEIL: push feilet likevel. Sjekk GitHub Desktop.
) else (
    echo Push OK.
)
echo.
echo Ferdig! Sjekk GitHub Desktop for bekreftelse.
pause

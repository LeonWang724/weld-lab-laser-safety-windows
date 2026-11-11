@echo off
cd /d "%~dp0"
if exist "%~dp0runtime\python.exe" goto bundled
where py >nul 2>nul
if errorlevel 1 goto usepython
py -3 "%~dp0launch.py" --install-startup
goto done
:bundled
"%~dp0runtime\python.exe" "%~dp0launch.py" --install-startup
goto done
:usepython
python "%~dp0launch.py" --install-startup
:done
if errorlevel 1 pause

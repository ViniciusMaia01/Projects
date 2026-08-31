@echo off
cd /d "%~dp0"
echo Abrindo http://localhost:8765
set PYTHONUNBUFFERED=1
python servidor.py
pause

@echo off
set PYTHON=C:\Users\kiosk\AppData\Local\Programs\Python\Python311\python.exe
cd /d "%~dp0"
:loop
"%PYTHON%" hikvision_bridge.py
echo [%date% %time%] restart >> bridge_wrapper.log
timeout /t 5 /nobreak
goto loop

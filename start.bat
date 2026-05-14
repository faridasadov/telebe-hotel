@echo off
echo StudentStay serveri bashladilir...
cd server
start /b npm start
timeout /t 3 /nobreak > nul
start http://localhost:8080
echo Sayt brauzerde achildi. Server arxa planda ishleyir.
pause

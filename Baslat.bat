@echo off
cd /d "%~dp0"

echo =======================================================
echo Illumina Browser sifirdan kaynak modunda baslatiliyor...
echo =======================================================

echo [BILGI] Acik tarayici surecleri kapatiliyor...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\\Zen Tarayici.exe' -or $_.Path -like '*\\Illumina Browser.exe' -or $_.Path -like '*\\browser\\node_modules\\electron\\dist\\electron.exe' -or $_.MainWindowTitle -eq 'Illumina Browser' }; " ^
  "if ($procs) { $procs | Stop-Process -Force }" >nul 2>nul

echo [BILGI] Kaynak uygulama aciliyor...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process -FilePath '%~dp0node_modules\electron\dist\electron.exe' -ArgumentList '.' -WorkingDirectory '%~dp0'"

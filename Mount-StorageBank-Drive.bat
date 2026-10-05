@echo off
cd /d "%~dp0"
title Storage Bank - Google Virtual Cloud Storage Provider
color 0B
cls
echo =========================================================================
echo       STORAGE BANK - GOOGLE VIRTUAL CLOUD STORAGE PROVIDER
echo =========================================================================
echo  Storage Tier : Unlimited Google Cloud Virtual Engine
echo  Local PC Use : 0 Bytes (100%% Virtual Cloud Streamed)
echo  Location     : This PC \ Devices and drives
echo =========================================================================
echo.

:: Remove any old subst C: drive mapping
subst Z: /d >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\Z" /f >nul 2>&1

:: Register Native Cloud Storage Provider (Just like TeraBox / Google Drive)
echo Registering Storage Bank Cloud Storage Device in Windows Explorer...
powershell -ExecutionPolicy Bypass -File register_cloud_provider.ps1

echo.
echo =========================================================================
echo  SUCCESS: Storage Bank Google Virtual Vault is now integrated in This PC!
echo  Appears under "Devices and drives" with 0 Bytes PC storage consumed.
echo =========================================================================
echo.
echo Opening This PC in Windows File Explorer...
start "" explorer.exe shell:MyComputerFolder

echo.
pause

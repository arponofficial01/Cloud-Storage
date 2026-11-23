@echo off
cd /d "%~dp0"
title StorageBank Cloud Drive (Z:)
color 0B
cls
echo =========================================================================
echo       STORAGEBANK CLOUD DRIVE (Z:)
echo =========================================================================
echo  Drive Name   : StorageBank Cloud (Z:)
echo  Capacity     : 512 GB Cloud Vault
echo  Location     : This PC \ Devices and drives
echo =========================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Mount-StorageBank-Drive.ps1"
pause

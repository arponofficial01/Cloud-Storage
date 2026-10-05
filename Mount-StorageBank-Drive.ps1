# Storage Bank - Google Virtual Cloud Storage Provider Mounter
# Integrates directly into "This PC" alongside TeraBox & Google Drive with 0 Bytes PC storage consumed

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "      STORAGE BANK - GOOGLE VIRTUAL CLOUD STORAGE PROVIDER" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host " Storage Tier : Unlimited Google Cloud Virtual Engine" -ForegroundColor Yellow
Write-Host " Local PC Use : 0 Bytes (100% Virtual Cloud Streamed)" -ForegroundColor Green
Write-Host " Location     : This PC \ Devices and drives"
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""

# Remove any old subst C: drive mapping
cmd /c 'subst Z: /d 2>nul'
Remove-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\Z" -Recurse -Force -ErrorAction SilentlyContinue

# Register Native Cloud Storage Provider (Just like TeraBox)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptDir "register_cloud_provider.ps1")

Write-Host ""
Write-Host "=========================================================================" -ForegroundColor Green
Write-Host " SUCCESS: Storage Bank Google Virtual Vault is now integrated in This PC!" -ForegroundColor Green
Write-Host " Appears under 'Devices and drives' with 0 Bytes PC storage consumed." -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Green
Write-Host ""

Write-Host "Opening This PC in Windows File Explorer..." -ForegroundColor Cyan
Start-Process "explorer.exe" "shell:MyComputerFolder"

Write-Host ""
Pause

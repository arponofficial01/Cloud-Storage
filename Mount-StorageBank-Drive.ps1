# StorageBank - Windows "This PC > Devices and drives" Cloud Drive Mounter
# Integrates directly under "Devices and drives" alongside TeraBox with custom Name, Logo & Web Storage Quota

$ErrorActionPreference = "SilentlyContinue"
$Letter = "Z:"
$LetterClean = "Z"
$DriveName = "StorageBank Cloud ($Letter)"
$StorageStatus = "512 GB free of 512 GB"
$UncTarget = "\\127.0.0.1@8080\DavWWWRoot\vault"
$Clsid = "{B9E83A14-46C1-4D56-8A33-87E7BC85285A}"

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "      STORAGEBANK CLOUD DRIVE ($Letter)" -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host " Drive Name     : $DriveName"
Write-Host " Cloud Capacity : $StorageStatus" -ForegroundColor Green
Write-Host " Location       : This PC \ Devices and drives"
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host ""

# Remove any old network location mapping or subst mapping
cmd /c "net use $Letter /delete /y >nul 2>&1"
cmd /c "subst $Letter /d >nul 2>&1"
Remove-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\DriveIcons\$LetterClean" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\MyComputer\NameSpace\{B9E83A14-46C1-4D56-8A33-87E7BC852899}" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Classes\CLSID\{B9E83A14-46C1-4D56-8A33-87E7BC852899}" -Recurse -Force -ErrorAction SilentlyContinue

try { Start-Service -Name WebClient -ErrorAction SilentlyContinue } catch {}

# Ensure StorageBank Cloud Drive daemon is active
$bridgeActive = Test-NetConnection -ComputerName 127.0.0.1 -Port 8080 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $bridgeActive) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $bridgeFile = Join-Path $scriptDir "virtual-cloud-bridge.cjs"
    if (Test-Path $bridgeFile) {
        Start-Process -FilePath "node" -ArgumentList "`"$bridgeFile`"" -WindowStyle Hidden
        Start-Sleep -Seconds 2
    }
}

# Save StorageBank 64x64 Cloud Logo Icon
$appDir = Join-Path $env:APPDATA "StorageBank"
if (!(Test-Path $appDir)) { New-Item -ItemType Directory -Path $appDir -Force | Out-Null }
$icoFile = Join-Path $appDir "storagebank_logo.ico"
try {
    Invoke-WebRequest -Uri "http://127.0.0.1:8080/logo.ico" -OutFile $icoFile -UseBasicParsing
} catch {}

# Register under "This PC > Devices and drives"
$clsidPath = "HKCU:\Software\Classes\CLSID\$Clsid"
New-Item -Path $clsidPath -Force | Out-Null
Set-ItemProperty -Path $clsidPath -Name "(default)" -Value $DriveName -Force
Set-ItemProperty -Path $clsidPath -Name "LocalizedString" -Value $DriveName -Force
Set-ItemProperty -Path $clsidPath -Name "TileInfo" -Value "prop:System.ItemAuthors" -Force
Set-ItemProperty -Path $clsidPath -Name "System.ItemAuthors" -Value $StorageStatus -Force
Set-ItemProperty -Path $clsidPath -Name "InfoTip" -Value "$DriveName • $StorageStatus" -Force

New-Item -Path "$clsidPath\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$clsidPath\DefaultIcon" -Name "(default)" -Value $icoFile -Force

New-Item -Path "$clsidPath\InprocServer32" -Force | Out-Null
Set-ItemProperty -Path "$clsidPath\InprocServer32" -Name "(default)" -Value "$env:SystemRoot\system32\shdocvw.dll" -Force
Set-ItemProperty -Path "$clsidPath\InprocServer32" -Name "ThreadingModel" -Value "Apartment" -Force

New-Item -Path "$clsidPath\Instance" -Force | Out-Null
Set-ItemProperty -Path "$clsidPath\Instance" -Name "CLSID" -Value "{0E5AAE11-A475-4c5b-AB00-C66DE400274E}" -Force

New-Item -Path "$clsidPath\Instance\InitPropertyBag" -Force | Out-Null
Set-ItemProperty -Path "$clsidPath\Instance\InitPropertyBag" -Name "TargetFolderPath" -Value $UncTarget -Force

New-Item -Path "$clsidPath\Shell\Open\Command" -Force | Out-Null
Set-ItemProperty -Path "$clsidPath\Shell\Open\Command" -Name "(default)" -Value "explorer.exe `"$UncTarget`"" -Force

New-Item -Path "$clsidPath\ShellFolder" -Force | Out-Null
Set-ItemProperty -Path "$clsidPath\ShellFolder" -Name "Attributes" -Value ([int]0x48800108) -Type DWord -Force
Set-ItemProperty -Path "$clsidPath\ShellFolder" -Name "PinToNameSpaceTree" -Value "" -Force
Set-ItemProperty -Path "$clsidPath\ShellFolder" -Name "QueryForOverlay" -Value "" -Force
Set-ItemProperty -Path "$clsidPath\ShellFolder" -Name "wantsFORPARSING" -Value "" -Force

$nsPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\MyComputer\NameSpace\$Clsid"
New-Item -Path $nsPath -Force | Out-Null
Set-ItemProperty -Path $nsPath -Name "(default)" -Value $DriveName -Force

Write-Host "SUCCESS: $DriveName is now mounted under 'This PC > Devices and drives'!" -ForegroundColor Green
Start-Process "explorer.exe" "shell:MyComputerFolder"

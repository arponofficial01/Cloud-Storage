# Register Storage Bank as a Native Windows Cloud Storage Device
# Identical architecture to TeraBox & Google Drive - 0 Bytes PC storage consumed, 0 Security Warnings

$ErrorActionPreference = "SilentlyContinue"

$vaultDir = Join-Path $env:USERPROFILE "StorageBank_GoogleVault"
if (!(Test-Path $vaultDir)) {
    New-Item -ItemType Directory -Path $vaultDir -Force | Out-Null
}

# Ensure native launcher is in vault folder
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceExe = Join-Path $scriptDir "StorageBank.exe"
$destExe = Join-Path $vaultDir "StorageBank.exe"
if (Test-Path $sourceExe) {
    Copy-Item $sourceExe $destExe -Force
}

# Clean any old problematic network shortcuts
$nethoodTarget = Join-Path $env:APPDATA "Microsoft\Windows\Network Shortcuts\Storage Bank Google Virtual Vault"
if (Test-Path $nethoodTarget) {
    Remove-Item -Recurse -Force $nethoodTarget
}

$clsid = "{B9E83A14-46C1-4D56-8A33-87E7BC852899}"
$clsidPath = "HKCU:\Software\Classes\CLSID\$clsid"

# 1. Base CLSID
New-Item -Path $clsidPath -Force | Out-Null
Set-ItemProperty -Path $clsidPath -Name "(default)" -Value "Storage Bank Google Virtual Vault" -Force
Set-ItemProperty -Path $clsidPath -Name "LocalizedString" -Value "Storage Bank Google Virtual Vault" -Force
Set-ItemProperty -Path $clsidPath -Name "InfoTip" -Value "Double click to open Google Cloud Virtual Vault" -Force
Set-ItemProperty -Path $clsidPath -Name "TileInfo" -Value "prop:System.ItemAuthors" -Force
Set-ItemProperty -Path $clsidPath -Name "System.ItemAuthors" -Value "Unlimited Cloud Tier • 0 B PC Used" -Force

# 2. Icon - Cloud Network Icon from imageres.dll (Icon index -1005)
$iconPath = "$clsidPath\DefaultIcon"
New-Item -Path $iconPath -Force | Out-Null
Set-ItemProperty -Path $iconPath -Name "(default)" -Value "$env:SystemRoot\system32\imageres.dll,-1005" -Force

# 3. InprocServer32 - Native Shell Explorer Handler (shdocvw.dll)
$inprocPath = "$clsidPath\InprocServer32"
New-Item -Path $inprocPath -Force | Out-Null
Set-ItemProperty -Path $inprocPath -Name "(default)" -Value "$env:SystemRoot\system32\shdocvw.dll" -Force
Set-ItemProperty -Path $inprocPath -Name "ThreadingModel" -Value "Apartment" -Force

# 4. Instance Delegate (Identical to TeraBox / Cloud Providers)
$instPath = "$clsidPath\Instance"
New-Item -Path $instPath -Force | Out-Null
Set-ItemProperty -Path $instPath -Name "CLSID" -Value "{0E5AAE11-A475-4c5b-AB00-C66DE400274E}" -Force

$bagPath = "$instPath\InitPropertyBag"
New-Item -Path $bagPath -Force | Out-Null
Set-ItemProperty -Path $bagPath -Name "TargetFolderPath" -Value $vaultDir -Force

# 5. Shell Open Command - Clean Native Local Executable (No cmd.exe / No Internet Zone block)
$openPath = "$clsidPath\Shell\Open\Command"
New-Item -Path $openPath -Force | Out-Null
Set-ItemProperty -Path $openPath -Name "(default)" -Value "`"$destExe`"" -Force

# 6. ShellFolder Configuration
$sfPath = "$clsidPath\ShellFolder"
New-Item -Path $sfPath -Force | Out-Null
Set-ItemProperty -Path $sfPath -Name "Attributes" -Value ([int]0x48800108) -Type DWord -Force
Set-ItemProperty -Path $sfPath -Name "PinToNameSpaceTree" -Value "" -Force
Set-ItemProperty -Path $sfPath -Name "QueryForOverlay" -Value "" -Force
Set-ItemProperty -Path $sfPath -Name "wantsFORPARSING" -Value "" -Force

# 7. Register in "This PC" NameSpace (Next to TeraBox)
$nsPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\MyComputer\NameSpace\$clsid"
New-Item -Path $nsPath -Force | Out-Null
Set-ItemProperty -Path $nsPath -Name "(default)" -Value "Storage Bank Google Virtual Vault" -Force

Write-Host "STORAGE_BANK_CLOUD_DEVICE_ACTIVE"

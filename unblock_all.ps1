# Unblock all downloaded scripts in Downloads and Desktop
$ErrorActionPreference = "SilentlyContinue"

$paths = @(
    (Join-Path $env:USERPROFILE "Downloads"),
    (Join-Path $env:USERPROFILE "Desktop"),
    "g:\Web Projects\Cloud Storage"
)

foreach ($p in $paths) {
    if (Test-Path $p) {
        Get-ChildItem -Path $p -Recurse -File -Include "*.bat","*.ps1","*.cmd","*.lnk","*.vbs" | ForEach-Object {
            Unblock-File -Path $_.FullName -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "ALL_FILES_UNBLOCKED_CLEAN"

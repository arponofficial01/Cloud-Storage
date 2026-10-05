$sh = New-Object -ComObject Shell.Application
$folder = $sh.Namespace('C:\Users\ITZAR\Storage Bank Cloud Vault')
if ($folder) {
    $folder.Self.InvokeVerb('pintohome')
    Write-Host "PINNED_TO_EXPLORER_SIDEBAR"
}

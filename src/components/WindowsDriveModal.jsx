import React, { useState, useEffect, useCallback } from 'react';
import { useStorage } from '../context/StorageContext';
import { useAuth } from '../context/AuthContext';
import { getPlanQuota, formatBytes } from '../utils/planQuotas';
import {
  X,
  Trash2,
  Monitor,
  Download,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Cloud,
  RefreshCw,
  Zap,
  Loader2
} from 'lucide-react';

const BRIDGE_API = 'http://127.0.0.1:8080';

export function WindowsDriveModal() {
  const {
    isDriveModalOpen,
    setIsDriveModalOpen,
    mountedDrives,
    unmountDrive,
    registerDrive,
    storageStats,
    files,
    folders,
    addToast
  } = useStorage();
  const { user } = useAuth();

  const [driveName, setDriveName] = useState('StorageBank Cloud');
  const [selectedLetter, setSelectedLetter] = useState('Z:');
  const [justMounted, setJustMounted] = useState(null);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [mountingLive, setMountingLive] = useState(false);
  const [syncingBridge, setSyncingBridge] = useState(false);

  const planInfo = getPlanQuota(user?.plan);
  const usedBytes = storageStats?.totalBytes || 0;
  const quotaBytes = planInfo.quotaBytes;
  const freeBytes = Math.max(0, quotaBytes - usedBytes);
  const activeFilesCount = (files || []).filter(f => !f.inTrash).length;
  const activeFoldersCount = (folders || []).filter(f => !f.inTrash).length;

  const checkAndSyncBridge = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_API}/api/status`);
      if (!res.ok) throw new Error('Offline');
      setBridgeOnline(true);

      const cleanFiles = (files || [])
        .filter(f => !f.inTrash)
        .map(f => ({
          id: f.id,
          name: f.name,
          size: f.size || 0,
          type: f.type || 'application/octet-stream',
          category: f.category || 'document',
          folderId: f.folderId || null,
          telegramFileId: f.telegramFileId || null,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt
        }));

      const cleanFolders = (folders || [])
        .filter(f => !f.inTrash)
        .map(f => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId || null,
          category: f.category || 'all',
          createdAt: f.createdAt,
          updatedAt: f.updatedAt
        }));

      await fetch(`${BRIDGE_API}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: cleanFiles,
          folders: cleanFolders,
          quotaBytes,
          usedBytes,
          planName: planInfo.displayName
        })
      });
    } catch {
      setBridgeOnline(false);
    }
  }, [files, folders, quotaBytes, usedBytes, planInfo.displayName]);

  useEffect(() => {
    if (isDriveModalOpen) {
      checkAndSyncBridge();
    }
  }, [isDriveModalOpen, checkAndSyncBridge]);

  if (!isDriveModalOpen) return null;

  const driveLetters = ['Z:', 'Y:', 'X:', 'W:', 'V:', 'U:', 'T:', 'S:', 'R:', 'P:', 'O:', 'N:', 'M:', 'L:'];
  const usedLetters = mountedDrives.map(d => d.driveLetter);
  const isSelectedLetterUsed = usedLetters.includes(selectedLetter);

  const handleLiveMountNow = async () => {
    const cleanName = driveName.trim() || 'StorageBank Cloud';
    setMountingLive(true);
    try {
      await checkAndSyncBridge();

      const activeWithBlobs = (files || [])
        .filter(f => !f.inTrash && f.blob instanceof Blob && f.blob.size <= 15 * 1024 * 1024)
        .slice(0, 15);
      for (const f of activeWithBlobs) {
        try {
          await fetch(`${BRIDGE_API}/api/cache-file`, {
            method: 'POST',
            headers: { 'X-File-Name': encodeURIComponent(f.name) },
            body: f.blob
          });
        } catch {}
      }

      const res = await fetch(`${BRIDGE_API}/api/mount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driveLetter: selectedLetter,
          driveName: cleanName,
          quotaBytes,
          usedBytes,
          planName: planInfo.displayName,
          openExplorer: true
        })
      });

      if (!res.ok) throw new Error('Bridge mount endpoint did not respond');
      await res.json();

      registerDrive(cleanName, selectedLetter);
      setJustMounted({ name: cleanName, letter: selectedLetter, mode: 'live' });
      addToast(`Mounted "${cleanName} (${selectedLetter})" under This PC > Devices and drives!`, 'success');
    } catch {
      handleGenerateBat();
    } finally {
      setMountingLive(false);
    }
  };

  const handleManualSyncBridge = async () => {
    setSyncingBridge(true);
    await checkAndSyncBridge();
    setSyncingBridge(false);
    addToast('Synchronized vault files & storage quota with Windows Cloud Drive', 'success');
  };

  const handleUnmountDrive = async (drive) => {
    if (bridgeOnline) {
      try {
        await fetch(`${BRIDGE_API}/api/unmount`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveLetter: drive.driveLetter })
        });
      } catch {}
    }
    unmountDrive(drive.id);
  };

  const getClsidForLetter = (letter) => {
    const clean = (letter || 'Z').replace(':', '').trim().toUpperCase();
    const hexCode = clean.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    return `{B9E83A14-46C1-4D56-8A33-87E7BC8528${hexCode}}`;
  };

  const buildPs1 = (letter, name) => {
    const safeName = (name || 'StorageBank Cloud').trim().replace(/'/g, '');
    const letterClean = letter.replace(':', '').trim().toUpperCase();
    const clsid = getClsidForLetter(letterClean);
    const statusStr = `${formatBytes(freeBytes)} free of ${formatBytes(quotaBytes)}`;
    const projectDir = 'g:\\Web Projects\\Cloud Storage';

    return [
      `# StorageBank Cloud Drive Mounter (${letter})`,
      `$ErrorActionPreference = "SilentlyContinue"`,
      `$Letter = "${letter}"`,
      `$LetterClean = "${letterClean}"`,
      `$DriveName = "${safeName} (${letter})"`,
      `$StorageStatus = "${statusStr}"`,
      `$UncTarget = "\\\\127.0.0.1@8080\\DavWWWRoot\\vault"`,
      `$Clsid = "${clsid}"`,
      ``,
      `cmd /c "net use $Letter /delete /y >nul 2>&1"`,
      `cmd /c "subst $Letter /d >nul 2>&1"`,
      `Remove-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\$LetterClean" -Recurse -Force -ErrorAction SilentlyContinue`,
      `try { Start-Service -Name WebClient -ErrorAction SilentlyContinue } catch {}`,
      ``,
      `$bridgeActive = Test-NetConnection -ComputerName 127.0.0.1 -Port 8080 -InformationLevel Quiet -WarningAction SilentlyContinue`,
      `if (-not $bridgeActive) {`,
      `    $localBridge = Join-Path $PSScriptRoot "virtual-cloud-bridge.cjs"`,
      `    $projBridge = "${projectDir}\\virtual-cloud-bridge.cjs"`,
      `    if (Test-Path $localBridge) {`,
      `        Start-Process -FilePath "node" -ArgumentList "\`"$localBridge\`"" -WindowStyle Hidden`,
      `    } elseif (Test-Path $projBridge) {`,
      `        Start-Process -FilePath "node" -ArgumentList "\`"$projBridge\`"" -WindowStyle Hidden`,
      `    }`,
      `    Start-Sleep -Seconds 2`,
      `}`,
      ``,
      `$appDir = Join-Path $env:APPDATA "StorageBank"`,
      `if (!(Test-Path $appDir)) { New-Item -ItemType Directory -Path $appDir -Force | Out-Null }`,
      `$icoFile = Join-Path $appDir "storagebank_logo.ico"`,
      `try { Invoke-WebRequest -Uri "http://127.0.0.1:8080/logo.ico" -OutFile $icoFile -UseBasicParsing } catch {}`,
      `$iconTarget = if (Test-Path $icoFile) { $icoFile } else { "$env:SystemRoot\\System32\\imageres.dll,-1043" }`,
      ``,
      `$clsidPath = "HKCU:\\Software\\Classes\\CLSID\\$Clsid"`,
      `New-Item -Path $clsidPath -Force | Out-Null`,
      `Set-ItemProperty -Path $clsidPath -Name "(default)" -Value $DriveName -Force`,
      `Set-ItemProperty -Path $clsidPath -Name "LocalizedString" -Value $DriveName -Force`,
      `Set-ItemProperty -Path $clsidPath -Name "TileInfo" -Value "prop:System.ItemAuthors" -Force`,
      `Set-ItemProperty -Path $clsidPath -Name "System.ItemAuthors" -Value $StorageStatus -Force`,
      `Set-ItemProperty -Path $clsidPath -Name "InfoTip" -Value "$DriveName • $StorageStatus" -Force`,
      `New-Item -Path "$clsidPath\\DefaultIcon" -Force | Out-Null`,
      `Set-ItemProperty -Path "$clsidPath\\DefaultIcon" -Name "(default)" -Value $iconTarget -Force`,
      `New-Item -Path "$clsidPath\\InprocServer32" -Force | Out-Null`,
      `Set-ItemProperty -Path "$clsidPath\\InprocServer32" -Name "(default)" -Value "$env:SystemRoot\\system32\\shdocvw.dll" -Force`,
      `Set-ItemProperty -Path "$clsidPath\\InprocServer32" -Name "ThreadingModel" -Value "Apartment" -Force`,
      `New-Item -Path "$clsidPath\\Instance" -Force | Out-Null`,
      `Set-ItemProperty -Path "$clsidPath\\Instance" -Name "CLSID" -Value "{0E5AAE11-A475-4c5b-AB00-C66DE400274E}" -Force`,
      `New-Item -Path "$clsidPath\\Instance\\InitPropertyBag" -Force | Out-Null`,
      `Set-ItemProperty -Path "$clsidPath\\Instance\\InitPropertyBag" -Name "TargetFolderPath" -Value $UncTarget -Force`,
      `New-Item -Path "$clsidPath\\Shell\\Open\\Command" -Force | Out-Null`,
      `Set-ItemProperty -Path "$clsidPath\\Shell\\Open\\Command" -Name "(default)" -Value "explorer.exe \`"$UncTarget\`"" -Force`,
      `New-Item -Path "$clsidPath\\ShellFolder" -Force | Out-Null`,
      `Set-ItemProperty -Path "$clsidPath\\ShellFolder" -Name "Attributes" -Value ([int]0x48800108) -Type DWord -Force`,
      `Set-ItemProperty -Path "$clsidPath\\ShellFolder" -Name "PinToNameSpaceTree" -Value "" -Force`,
      `Set-ItemProperty -Path "$clsidPath\\ShellFolder" -Name "QueryForOverlay" -Value "" -Force`,
      `Set-ItemProperty -Path "$clsidPath\\ShellFolder" -Name "wantsFORPARSING" -Value "" -Force`,
      `$nsPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\$Clsid"`,
      `New-Item -Path $nsPath -Force | Out-Null`,
      `Set-ItemProperty -Path $nsPath -Name "(default)" -Value $DriveName -Force`,
      `Start-Process explorer.exe -ArgumentList "shell:MyComputerFolder"`
    ].join('\r\n');
  };

  const buildBat = (letter, name) => {
    const safeName = (name || 'StorageBank Cloud').trim().replace(/["()]/g, '');
    const letterClean = letter.replace(':', '').trim().toUpperCase();
    const clsid = getClsidForLetter(letterClean);
    const statusStr = `${formatBytes(freeBytes)} free of ${formatBytes(quotaBytes)}`;
    const projectDir = 'g:\\Web Projects\\Cloud Storage';

    return [
      `@echo off`,
      `title ${safeName} (${letter})`,
      `cls`,
      `echo =========================================================================`,
      `echo       STORAGEBANK CLOUD DRIVE (${letter})`,
      `echo =========================================================================`,
      `echo  Drive Name   : ${safeName} (${letter})`,
      `echo  Capacity     : ${statusStr} (${planInfo.displayName})`,
      `echo  Location     : This PC ^> Devices and drives`,
      `echo =========================================================================`,
      `echo.`,
      `net use ${letter} /delete /y >nul 2>&1`,
      `subst ${letter} /d >nul 2>&1`,
      `net start webclient >nul 2>&1`,
      `netstat -ano | findstr :8080 >nul 2>&1`,
      `if errorlevel 1 (`,
      `    if exist "%~dp0virtual-cloud-bridge.cjs" (`,
      `        start /min "" node "%~dp0virtual-cloud-bridge.cjs"`,
      `    ) else if exist "${projectDir}\\virtual-cloud-bridge.cjs" (`,
      `        start /min "" node "${projectDir}\\virtual-cloud-bridge.cjs"`,
      `    )`,
      `    timeout /t 2 /nobreak >nul 2>&1`,
      `)`,
      `if not exist "%APPDATA%\\StorageBank" mkdir "%APPDATA%\\StorageBank"`,
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:8080/logo.ico' -OutFile '$env:APPDATA\\StorageBank\\storagebank_logo.ico' -UseBasicParsing } catch {}" >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}" /ve /d "${safeName} (${letter})" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}" /v "LocalizedString" /d "${safeName} (${letter})" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}" /v "TileInfo" /d "prop:System.ItemAuthors" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}" /v "System.ItemAuthors" /d "${statusStr}" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}" /v "InfoTip" /d "${safeName} (${letter}) • ${statusStr}" /f >nul 2>&1`,
      `if exist "%APPDATA%\\StorageBank\\storagebank_logo.ico" (`,
      `    reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\DefaultIcon" /ve /d "%APPDATA%\\StorageBank\\storagebank_logo.ico" /f >nul 2>&1`,
      `) else (`,
      `    reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\DefaultIcon" /ve /d "%SystemRoot%\\System32\\imageres.dll,-1043" /f >nul 2>&1`,
      `)`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\InprocServer32" /ve /d "%SystemRoot%\\system32\\shdocvw.dll" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\InprocServer32" /v "ThreadingModel" /d "Apartment" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\Instance" /v "CLSID" /d "{0E5AAE11-A475-4c5b-AB00-C66DE400274E}" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\Instance\\InitPropertyBag" /v "TargetFolderPath" /d "\\\\127.0.0.1@8080\\DavWWWRoot\\vault" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\Shell\\Open\\Command" /ve /d "explorer.exe \\"\\\\127.0.0.1@8080\\DavWWWRoot\\vault\\"" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\ShellFolder" /v "Attributes" /t REG_DWORD /d 1216348424 /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\ShellFolder" /v "PinToNameSpaceTree" /d "" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\ShellFolder" /v "QueryForOverlay" /d "" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Classes\\CLSID\\${clsid}\\ShellFolder" /v "wantsFORPARSING" /d "" /f >nul 2>&1`,
      `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\${clsid}" /ve /d "${safeName} (${letter})" /f >nul 2>&1`,
      `echo SUCCESS: ${safeName} (${letter}) is now available in This PC ^> Devices and drives!`,
      `start "" explorer.exe "shell:MyComputerFolder"`,
      `pause`
    ].join('\r\n');
  };

  const downloadBat = (letter, name) => {
    const content = buildBat(letter, name);
    const blob = new Blob([content], { type: 'application/x-bat' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mount-StorageBank-${letter.replace(':', '')}.bat`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPs1 = (letter, name) => {
    const content = buildPs1(letter, name);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mount-StorageBank-${letter.replace(':', '')}.ps1`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateBat = () => {
    const cleanName = driveName.trim() || 'StorageBank Cloud';
    registerDrive(cleanName, selectedLetter);
    downloadBat(selectedLetter, cleanName);
    setJustMounted({ name: cleanName, letter: selectedLetter, mode: 'script' });
  };

  const handleGeneratePs1 = () => {
    const cleanName = driveName.trim() || 'StorageBank Cloud';
    registerDrive(cleanName, selectedLetter);
    downloadPs1(selectedLetter, cleanName);
    setJustMounted({ name: cleanName, letter: selectedLetter, mode: 'script' });
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3500 }} onClick={() => setIsDriveModalOpen(false)}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '560px',
          width: '94vw',
          borderRadius: '11px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: 0,
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-subtle)'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff'
            }}>
              <Cloud size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  Desktop Cloud Drive
                </h3>
                <span style={{
                  fontSize: '0.64rem',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '4px',
                  background: bridgeOnline ? 'rgba(16, 185, 129, 0.14)' : 'var(--bg-input)',
                  color: bridgeOnline ? 'var(--accent-emerald)' : 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  {bridgeOnline ? '● Connected' : 'Ready'}
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Mounts directly in This PC &gt; Devices and drives with your custom name, logo &amp; storage quota
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setIsDriveModalOpen(false)}
            style={{ padding: '4px', height: '28px', width: '28px' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Live Windows Explorer "Devices and drives" Preview Tile */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '9px',
            padding: '14px 16px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase'
            }}>
              <span>This PC &gt; Devices and drives Preview</span>
              <span style={{ color: 'var(--accent-primary)' }}>{planInfo.displayName}</span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-strong)'
            }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
              }}>
                <Cloud size={22} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(driveName || 'StorageBank Cloud').trim()} ({selectedLetter})
                </div>

                <div style={{
                  width: '100%',
                  height: '8px',
                  borderRadius: '3px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  overflow: 'hidden',
                  margin: '6px 0'
                }}>
                  <div style={{
                    width: `${Math.max(2, Math.min(100, (usedBytes / quotaBytes) * 100))}%`,
                    height: '100%',
                    background: 'var(--accent-primary)'
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                  <span><strong>{formatBytes(freeBytes)}</strong> free of <strong>{formatBytes(quotaBytes)}</strong></span>
                  <span>{activeFilesCount} files &bull; {activeFoldersCount} folders</span>
                </div>
              </div>
            </div>
          </div>

          {justMounted && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={15} color="var(--accent-emerald)" />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-emerald)' }}>
                  {justMounted.mode === 'live'
                    ? `${justMounted.name} (${justMounted.letter}) Mounted in This PC!`
                    : `Mounter Script Ready for ${justMounted.name} (${justMounted.letter})`}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                {justMounted.mode === 'live'
                  ? `Added under "This PC > Devices and drives" with ${formatBytes(freeBytes)} free of ${formatBytes(quotaBytes)}. Double-click it in File Explorer to browse your cloud files.`
                  : `Run the downloaded installer to add ${justMounted.name} (${justMounted.letter}) under "This PC > Devices and drives".`}
              </div>
            </div>
          )}

          {/* Setup Form */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '9px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                DRIVE NAME
              </label>
              <input
                type="text"
                className="input-text"
                placeholder="e.g. StorageBank Cloud"
                value={driveName}
                onChange={e => setDriveName(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.84rem', borderRadius: '7px' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                DRIVE LETTER
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {driveLetters.map(letter => {
                  const isUsed = usedLetters.includes(letter);
                  const isSelected = selectedLetter === letter;
                  return (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => setSelectedLetter(letter)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        background: isSelected ? 'var(--accent-primary)' : isUsed ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-input)',
                        color: isSelected ? '#ffffff' : isUsed ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      {letter} {isUsed ? '●' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {isSelectedLetterUsed && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: '6px',
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.74rem',
                color: 'var(--accent-amber)'
              }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>Drive <strong>{selectedLetter}</strong> is already active. Mounting again will refresh its label and quota.</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleLiveMountNow}
                disabled={mountingLive}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  borderRadius: '7px',
                  justifyContent: 'center',
                  gap: '7px'
                }}
              >
                {mountingLive ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
                <span>
                  {mountingLive
                    ? `Mounting ${selectedLetter} in This PC...`
                    : `Mount "${(driveName || 'StorageBank Cloud').trim()} (${selectedLetter})" in This PC`}
                </span>
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleGenerateBat}
                  style={{ flex: 1, padding: '7px 10px', fontSize: '0.76rem', borderRadius: '7px', gap: '5px', justifyContent: 'center' }}
                >
                  <Download size={13} />
                  <span>Download .BAT</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleGeneratePs1}
                  style={{ flex: 1, padding: '7px 10px', fontSize: '0.76rem', borderRadius: '7px', gap: '5px', justifyContent: 'center' }}
                >
                  <Terminal size={13} />
                  <span>Download .PS1</span>
                </button>

                {bridgeOnline && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleManualSyncBridge}
                    disabled={syncingBridge}
                    title="Sync files & quota"
                    style={{ padding: '7px 10px', fontSize: '0.76rem', borderRadius: '7px', gap: '5px' }}
                  >
                    <RefreshCw size={13} className={syncingBridge ? 'spin' : ''} />
                    <span>Sync</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {mountedDrives.length > 0 && (
            <div>
              <div style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '8px'
              }}>
                Mounted Cloud Drives ({mountedDrives.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {mountedDrives.map(drive => (
                  <div
                    key={drive.id}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '7px',
                        background: 'var(--accent-primary)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Monitor size={14} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {drive.name} <span style={{ color: 'var(--accent-primary)' }}>({drive.driveLetter})</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {formatBytes(freeBytes)} free of {formatBytes(quotaBytes)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => downloadBat(drive.driveLetter, drive.name)}
                        style={{ padding: '4px 8px', fontSize: '0.72rem', borderRadius: '6px' }}
                      >
                        .BAT
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleUnmountDrive(drive)}
                        title="Unmount Drive"
                        style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--accent-rose)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

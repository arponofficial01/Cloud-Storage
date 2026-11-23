import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { getPlanQuota } from '../utils/planQuotas';
import { inspectFileSecurity, computeFileSha256, recordSecurityEvent } from '../utils/securityEngine';
import {
  initDB,
  getAllFiles,
  saveFile as dbSaveFile,
  deleteFile as dbDeleteFile,
  getAllFolders,
  saveFolder as dbSaveFolder,
  deleteFolder as dbDeleteFolder,
  logActivityDB,
  getActivityLogsDB,
  inferMimeType
} from '../services/dbService';

import {
  syncFileToSupabase,
  syncFolderToSupabase,
  syncActivityLogToSupabase,
  deleteFileFromSupabase,
  deleteFolderFromSupabase,
  fetchFilesFromSupabase,
  fetchFoldersFromSupabase,
  fetchActivityLogsFromSupabase,
  subscribeToSupabaseRealtime,
  uploadFileBlobToSupabase,
  downloadFileBlobFromSupabase
} from '../services/supabaseService';

import {
  isTelegramCloudEnabled,
  uploadFileToTelegram,
  downloadTelegramFileBlob
} from '../services/telegramStorageService';

const StorageContext = createContext(null);

export function StorageProvider({ children }) {
  const { user } = useAuth();

  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Navigation & View State — persisted in localStorage so refresh keeps the same view
  const [activeCategory, setActiveCategoryRaw] = useState(() => localStorage.getItem('vault_activeCategory') || 'all');
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderPath, setFolderPath] = useState([{ id: null, name: 'My Vault' }]);

  const setActiveCategory = (cat) => {
    localStorage.setItem('vault_activeCategory', cat);
    setActiveCategoryRaw(cat);
  };

  const [viewMode, setViewModeRaw] = useState(() => localStorage.getItem('vault_viewMode') || 'grid');
  const setViewMode = (mode) => {
    localStorage.setItem('vault_viewMode', mode);
    setViewModeRaw(mode);
  };

  // Live Windows PC Desktop Drive Mount State
  const [mountedDrives, setMountedDrives] = useState(() => {
    const saved = localStorage.getItem('storagebank_mounted_drives');
    if (saved) return JSON.parse(saved);
    // Legacy single drive migration if exists
    const legacy = localStorage.getItem('storagebank_windowsDrive');
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed.mounted) {
        return [{
          id: 'drive-legacy',
          name: parsed.folderName || 'Windows Vault (Z:)',
          driveLetter: 'Z:',
          syncedFilesCount: parsed.syncedFilesCount || 0,
          syncedBytes: parsed.syncedBytes || 0,
          mountedAt: parsed.lastSyncTime || 'Active',
          status: 'Active Live Sync',
          unlimited: true
        }];
      }
    }
    return [];
  });

  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);

  // Instant drive registration & live quota sync
  const registerDrive = (driveName, driveLetter) => {
    const driveRecord = {
      id: `drive-${driveLetter.replace(':', '')}`,
      name: driveName,
      driveLetter,
      syncedFilesCount: files.filter(f => !f.inTrash).length,
      syncedBytes: files.filter(f => !f.inTrash).reduce((a, b) => a + (b.size || 0), 0),
      mountedAt: new Date().toLocaleString(),
      status: 'Connected Cloud Drive',
      unlimited: true
    };
    setMountedDrives(prev => {
      const next = [driveRecord, ...prev.filter(d => d.driveLetter !== driveLetter)];
      try {
        localStorage.setItem('storagebank_mounted_drives', JSON.stringify(next));
      } catch {}
      return next;
    });
    logActivity('SYSTEM', `Mounted Windows Cloud Drive "${driveName}" (${driveLetter})`, 'success');
    return driveRecord;
  };

  // ── Real-Time Bi-Directional Windows Drive Sync Engine ────────────────────────
  const activeDriveHandlesRef = React.useRef(new Map());

  const syncVaultToFolderHandle = async (dirHandle) => {
    try {
      const folderMap = new Map();
      folderMap.set(null, dirHandle);

      for (const fold of folders) {
        if (fold.inTrash) continue;
        try {
          const parentHandle = folderMap.get(fold.parentId || null) || dirHandle;
          const subDirHandle = await parentHandle.getDirectoryHandle(fold.name, { create: true });
          folderMap.set(fold.id, subDirHandle);
        } catch (err) {
          console.warn('Subfolder creation error:', err);
        }
      }

      let syncedCount = 0;
      for (const fileRecord of files) {
        if (fileRecord.inTrash) continue;
        try {
          const targetDir = folderMap.get(fileRecord.folderId || null) || dirHandle;
          const fileHandle = await targetDir.getFileHandle(fileRecord.name, { create: true });
          const writable = await fileHandle.createWritable();

          if (fileRecord.blob) {
            await writable.write(fileRecord.blob);
          } else if (fileRecord.content) {
            await writable.write(new Blob([fileRecord.content], { type: 'text/plain' }));
          } else if (fileRecord.url && fileRecord.url.startsWith('data:')) {
            const res = await fetch(fileRecord.url);
            const blob = await res.blob();
            await writable.write(blob);
          } else {
            await writable.write(new Blob([`Storage Bank Vault File: ${fileRecord.name}`], { type: 'text/plain' }));
          }
          await writable.close();
          syncedCount++;
        } catch (err) {
          console.warn(`File export error for ${fileRecord.name}:`, err);
        }
      }
      return syncedCount;
    } catch (err) {
      console.error('Vault to disk sync failed:', err);
      return 0;
    }
  };

  const syncFolderHandleToVault = async (dirHandle, parentFolderId = null) => {
    try {
      const newFiles = [];
      const scanDir = async (handle, currentParentId) => {
        for await (const entry of handle.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            const exists = files.some(f => f.name === file.name && (f.folderId || null) === currentParentId);
            if (!exists) {
              newFiles.push({ file, folderId: currentParentId });
            }
          } else if (entry.kind === 'directory') {
            let matchingFold = folders.find(f => f.name === entry.name && (f.parentId || null) === currentParentId);
            if (!matchingFold) {
              matchingFold = await createFolder(entry.name, currentParentId);
            }
            if (matchingFold) {
              await scanDir(entry, matchingFold.id);
            }
          }
        }
      };
      await scanDir(dirHandle, parentFolderId);

      if (newFiles.length > 0) {
        const fileList = newFiles.map(i => i.file);
        await uploadFiles(fileList);
      }
      return newFiles.length;
    } catch (err) {
      console.error('Disk to vault sync error:', err);
      return 0;
    }
  };

  const connectWindowsFolder = async (customDriveName = null, customDriveLetter = 'Z:') => {
    try {
      if (!('showDirectoryPicker' in window)) {
        addToast('Directory Access supported in Chrome, Edge & Brave on Windows!', 'warning');
        return null;
      }
      addToast('Select or create the local folder to connect as Virtual Drive...', 'info');
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

      // 1. Sync any existing disk files into vault
      const importedCount = await syncFolderHandleToVault(dirHandle);

      // 2. Export all vault files & subfolders to disk so drive contains ALL vault items!
      const exportedCount = await syncVaultToFolderHandle(dirHandle);

      const driveName = customDriveName || dirHandle.name || `Storage Bank (${customDriveLetter})`;
      const driveRecord = {
        id: `drive-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: driveName,
        driveLetter: customDriveLetter || 'Z:',
        syncedFilesCount: files.length + importedCount,
        syncedBytes: files.reduce((acc, f) => acc + (f.size || 0), 0),
        mountedAt: new Date().toLocaleString(),
        status: 'Real-Time Connected Sync',
        unlimited: true,
        folderName: dirHandle.name
      };

      activeDriveHandlesRef.current.set(driveRecord.id, dirHandle);

      setMountedDrives(prev => {
        const next = [driveRecord, ...prev];
        localStorage.setItem('storagebank_mounted_drives', JSON.stringify(next));
        return next;
      });

      addToast(`Connected Drive ${customDriveLetter}! Exported ${exportedCount} vault file(s) to Windows folder.`, 'success');
      logActivity('SYSTEM', `Connected Windows Drive "${driveName}" (${customDriveLetter}) with bi-directional vault sync`, 'success');

      return { dirHandle, driveRecord, exportedCount };
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
        addToast('Failed to connect Windows folder.', 'error');
      }
      return null;
    }
  };

  const unmountDrive = (driveId) => {
    setMountedDrives(prev => {
      const next = prev.filter(d => d.id !== driveId);
      localStorage.setItem('storagebank_mounted_drives', JSON.stringify(next));
      return next;
    });
    addToast('Unmounted and removed active device from vault sync.', 'info');
  };

  const disconnectWindowsFolder = () => {
    setMountedDrives([]);
    localStorage.removeItem('storagebank_mounted_drives');
    localStorage.removeItem('storagebank_windowsDrive');
    addToast('Unmounted all active Windows Virtual Drives.', 'info');
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedItems, setSelectedItems] = useState([]);

  // Modals & Overlays State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [activePreview, setActivePreview] = useState(null);
  const [activeShare, setActiveShare] = useState(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [activeAudioTrack, setActiveAudioTrack] = useState(null);
  const [moveModalTarget, setMoveModalTarget] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const requestConfirm = (options) => {
    setConfirmDialog({
      title: options.title || 'Confirm Action',
      message: options.message || 'Are you sure you want to continue?',
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      danger: options.danger !== false,
      onConfirm: options.onConfirm
    });
  };

  const closeConfirmDialog = () => setConfirmDialog(null);

  // Site-Wide Background Music State
  const [currentMusicTrack, setCurrentMusicTrack] = useState(() => {
    const saved = localStorage.getItem('storagebank_music_track');
    return saved ? JSON.parse(saved) : null;
  });
  const [isMusicPlaying, setIsMusicPlayingRaw] = useState(() => {
    const saved = localStorage.getItem('storagebank_music_playing');
    return saved === 'true';
  });

  const setIsMusicPlaying = (valOrFn) => {
    setIsMusicPlayingRaw(prev => {
      const nextVal = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      localStorage.setItem('storagebank_music_playing', nextVal ? 'true' : 'false');
      return nextVal;
    });
  };

  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [isMusicLooping, setIsMusicLooping] = useState(true);

  const toggleMusicPlay = (track = null) => {
    if (track) {
      if (currentMusicTrack?.id === track.id) {
        setIsMusicPlaying(prev => !prev);
      } else {
        setCurrentMusicTrack(track);
        localStorage.setItem('storagebank_music_track', JSON.stringify(track));
        setIsMusicPlaying(true);
      }
    } else {
      setIsMusicPlaying(prev => !prev);
    }
  };

  // Toast Notifications State
  const [toasts, setToasts] = useState([]);

  // Upload Progress Engine State
  const [uploadProgress, setUploadProgress] = useState({
    active: false,
    fileName: '',
    fileIndex: 0,
    totalFiles: 0,
    loadedBytes: 0,
    totalBytes: 0,
    percentage: 0
  });

  const addToast = (message, type = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Load User Specific Storage from IndexedDB + Realtime Cloud Sync
  const reloadVault = async () => {
    if (!user) return;
    try {
      await initDB();
      // 1. Fast local load from IDB for instant UI
      const [allF, allFold, logs] = await Promise.all([
        getAllFiles(),
        getAllFolders(),
        getActivityLogsDB()
      ]);

      const localFiles = allF.filter(f => f.userId === user.id);
      const localFolders = allFold.filter(f => f.userId === user.id);
      const localLogs = logs.filter(l => l.userId === user.id);

      setFiles(localFiles);
      setFolders(localFolders);
      setActivityLogs(localLogs);
      setLoading(false);

      // 2. Background Cloud Sync from Supabase (Cross-Device Master Index)
      const [remoteFiles, remoteFolders, remoteLogs] = await Promise.all([
        fetchFilesFromSupabase(user.id),
        fetchFoldersFromSupabase(user.id),
        fetchActivityLogsFromSupabase(user.id)
      ]);

      const remoteFileIds = new Set(remoteFiles.map(rf => rf.id));
      const remoteFolderIds = new Set(remoteFolders.map(rf => rf.id));

      // Merge local + remote files
      const fileMap = new Map();
      localFiles.forEach(f => fileMap.set(f.id, f));
      remoteFiles.forEach(rf => {
        const existing = fileMap.get(rf.id);
        const merged = {
          ...existing,
          ...rf,
          telegramFileId: rf.telegramFileId || existing?.telegramFileId || null,
          parts: rf.parts || existing?.parts || null,
          isChunked: rf.isChunked || existing?.isChunked || false,
          storageProvider: rf.storageProvider || existing?.storageProvider || null,
          blob: existing?.blob instanceof Blob ? existing.blob : (rf.blob || null)
        };
        fileMap.set(rf.id, merged);
        dbSaveFile(merged);
      });

      // Merge local + remote folders
      const folderMap = new Map();
      localFolders.forEach(f => folderMap.set(f.id, f));
      remoteFolders.forEach(rf => {
        const existing = folderMap.get(rf.id);
        const merged = {
          ...existing,
          ...rf,
          category: rf.category || existing?.category || 'all'
        };
        folderMap.set(rf.id, merged);
        dbSaveFolder(merged);
      });

      // Merge logs
      const logMap = new Map();
      localLogs.forEach(l => logMap.set(l.id, l));
      remoteLogs.forEach(rl => {
        logMap.set(rl.id, rl);
        logActivityDB(rl);
      });

      const mergedFilesList = Array.from(fileMap.values());
      const mergedFoldersList = Array.from(folderMap.values());

      setFiles(mergedFilesList);
      setFolders(mergedFoldersList);
      setActivityLogs(Array.from(logMap.values()));

      // Push any local-only folders up to Supabase so other devices receive them
      localFolders.forEach(lf => {
        if (!remoteFolderIds.has(lf.id)) {
          syncFolderToSupabase(lf);
        }
      });

      // Heal & sync all files across Telegram Cloud + Supabase:
      // 1) If a file has a local blob but no telegramFileId, upload it to Telegram Cloud and sync to Supabase
      // 2) If a file is already on Telegram Cloud but not yet in Supabase remoteFiles, push metadata to Supabase
      // 3) If a file was synced from another device via Supabase (has telegramFileId/parts, no local blob), download its binary blob from Telegram Cloud so it opens in 0ms
      if (isTelegramCloudEnabled()) {
        mergedFilesList.forEach(async (mf) => {
          if (mf.blob instanceof Blob && !mf.telegramFileId) {
            try {
              const tgRes = await uploadFileToTelegram(mf.name, mf.blob);
              if (tgRes && tgRes.fileId) {
                const updated = {
                  ...mf,
                  userId: user.id,
                  type: inferMimeType(mf.name, mf.type),
                  storageProvider: 'telegram',
                  telegramFileId: tgRes.fileId,
                  telegramMessageId: tgRes.messageId,
                  parts: tgRes.parts || null,
                  isChunked: tgRes.isChunked || false
                };
                await dbSaveFile(updated);
                setFiles(prev => prev.map(f => f.id === mf.id ? updated : f));
                await syncFileToSupabase(updated);
              }
            } catch {}
          } else {
            if (!remoteFileIds.has(mf.id)) {
              syncFileToSupabase(mf);
            }
            if (!(mf.blob instanceof Blob) && (mf.telegramFileId || (mf.parts && mf.parts.length > 0))) {
              try {
                const restoredBlob = await downloadTelegramFileBlob(mf);
                if (restoredBlob instanceof Blob) {
                  const healed = {
                    ...mf,
                    type: inferMimeType(mf.name, mf.type),
                    blob: restoredBlob
                  };
                  await dbSaveFile(healed);
                  setFiles(prev => prev.map(f => f.id === mf.id ? healed : f));
                }
              } catch {}
            }
          }
        });
      }
    } catch (err) {
      console.error('[Vault] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      sessionStorage.removeItem('storagebank_admin_session_unlocked');
    } catch {}
    setActiveCategory('all');
    setCurrentFolderId(null);
    setFolderPath([{ id: null, name: 'My Vault' }]);
    setSelectedItems([]);
    setActivePreview(null);

    if (!user) {
      // User signed out — clear all state immediately
      setFiles([]);
      setFolders([]);
      setActivityLogs([]);
      setLoading(false);
      return;
    }

    reloadVault();

    // Debounce: avoid hammering IDB on rapid realtime bursts
    let debounceTimer = null;
    const debouncedReload = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => reloadVault(), 300);
    };

    const unsubscribe = subscribeToSupabaseRealtime(user.id, () => {
      debouncedReload();
    });

    return () => {
      clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [user?.id]);

  // Live Bi-Directional Sync with Windows WebDAV Zero-Disk Cloud Drive Bridge (http://127.0.0.1:8080)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const pushAndPullBridge = async () => {
      try {
        const planObj = getPlanQuota(user?.plan);
        const activeF = files.filter(f => !f.inTrash);
        const activeFold = folders.filter(f => !f.inTrash);
        const totalB = activeF.reduce((acc, f) => acc + (f.size || 0), 0);

        await fetch('http://127.0.0.1:8080/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: activeF.map(f => ({
              id: f.id,
              name: f.name,
              size: f.size || 0,
              type: f.type || 'application/octet-stream',
              category: f.category || 'document',
              folderId: f.folderId || null,
              telegramFileId: f.telegramFileId || null,
              createdAt: f.createdAt,
              updatedAt: f.updatedAt
            })),
            folders: activeFold.map(fd => ({
              id: fd.id,
              name: fd.name,
              parentId: fd.parentId || null,
              category: fd.category || 'all',
              createdAt: fd.createdAt,
              updatedAt: fd.updatedAt
            })),
            quotaBytes: planObj.quotaBytes,
            usedBytes: totalB,
            planName: planObj.displayName
          })
        });

        const statusRes = await fetch('http://127.0.0.1:8080/api/status');
        if (!statusRes.ok || cancelled) return;
        const statusData = await statusRes.json();

        if (Array.isArray(statusData.explorerEvents) && statusData.explorerEvents.length > 0) {
          for (const evt of statusData.explorerEvents) {
            if (evt.type === 'UPSERT_FILE' && evt.file) {
              let blob = null;
              if (evt.file.base64Content) {
                try {
                  const byteChars = atob(evt.file.base64Content);
                  const byteArr = new Uint8Array(byteChars.length);
                  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
                  blob = new Blob([byteArr], { type: evt.file.type || 'application/octet-stream' });
                } catch {}
              }
              const cat = getCategoryFromMime(evt.file.type || '', evt.file.name || '');
              const newRec = {
                ...evt.file,
                userId: user.id,
                category: cat,
                blob
              };
              delete newRec.base64Content;
              await dbSaveFile(newRec);
              setFiles(prev => [newRec, ...prev.filter(f => f.id !== newRec.id && f.name !== newRec.name)]);
            } else if (evt.type === 'CREATE_FOLDER' && evt.folder) {
              const newFold = { ...evt.folder, userId: user.id };
              await dbSaveFolder(newFold);
              setFolders(prev => [newFold, ...prev.filter(f => f.id !== newFold.id)]);
            } else if (evt.type === 'DELETE_FILE' && evt.id) {
              await dbDeleteFile(evt.id);
              setFiles(prev => prev.filter(f => f.id !== evt.id));
            } else if (evt.type === 'DELETE_FOLDER' && evt.id) {
              await dbDeleteFolder(evt.id);
              setFolders(prev => prev.filter(f => f.id !== evt.id));
            }
          }
        }
      } catch {
        // Local bridge daemon not active yet — ignore silently
      }
    };

    pushAndPullBridge();
    const interval = setInterval(pushAndPullBridge, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user, files, folders]);

  // Log User Activity to IndexedDB & Supabase
  const logActivity = async (action, details, status = 'success') => {
    if (!user) return;
    const entry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      userId: user.id,
      action,
      details,
      timestamp: new Date().toISOString(),
      status
    };
    await logActivityDB(entry);
    await syncActivityLogToSupabase(entry);
    setActivityLogs(prev => [entry, ...prev]);
  };

  const clearActivityLogs = async () => {
    setActivityLogs([]);
    try {
      localStorage.removeItem('storagebank_activity_logs');
    } catch {
      // ignore
    }
    addToast('Activity logs cleared.', 'info');
  };

  // File Upload Handler — Zero-RAM Blob Streaming + Batch Non-Blocking Upload Engine
  const uploadFiles = async (fileList, targetFolderId = currentFolderId, onProgress) => {
    if (!user || !fileList || fileList.length === 0) return;

    const newFiles = Array.from(fileList);
    const totalFiles = newFiles.length;
    let totalBytes = 0;

    for (let i = 0; i < totalFiles; i++) {
      const f = newFiles[i];
      totalBytes += f.size || f.blob?.size || 0;
    }

    const addedRecords = [];
    let loadedBytes = 0;

    setUploadProgress({
      active: true,
      fileName: newFiles[0]?.name || 'Preparing upload...',
      fileIndex: 1,
      totalFiles,
      loadedBytes: 0,
      totalBytes,
      percentage: 0
    });

    const BATCH_SIZE = 25; // Process in non-blocking batches of 25 for fast bulk streaming

    for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
      const chunk = newFiles.slice(i, i + BATCH_SIZE);
      const batchRecords = [];

      for (let j = 0; j < chunk.length; j++) {
        const f = chunk[j];
        const idx = i + j;

        // Zero-RAM extraction: pass File/Blob directly without memory buffering!
        let extractedBlob = null;
        if (f instanceof Blob) {
          extractedBlob = f;
        } else if (f && f.blob instanceof Blob) {
          extractedBlob = f.blob;
        } else if (f && f.content) {
          extractedBlob = new Blob([f.content], { type: f.type || 'text/plain' });
        }

        const rawFileName = f.name || 'Untitled_File';
        const secCheck = inspectFileSecurity(rawFileName, f.size || extractedBlob?.size || 0);
        const fileName = secCheck.sanitizedName;
        if (secCheck.isDoubleExtensionSpoof) {
          recordSecurityEvent('Blocked Spoofed Extension', `Neutralized double-extension pattern on "${rawFileName}"`, 'warning');
        }
        const sha256 = extractedBlob ? await computeFileSha256(extractedBlob) : null;
        const fileType = f.type || extractedBlob?.type || 'application/octet-stream';
        const fileSize = f.size || extractedBlob?.size || 0;
        const category = f.category || getCategoryFromMime(fileType, fileName);
        const now = new Date().toISOString();
        const uniqueId = f.id || `file-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 6)}`;

        const fileRecord = {
          id: uniqueId,
          userId: user.id,
          folderId: targetFolderId,
          name: fileName,
          type: fileType,
          category,
          size: fileSize,
          sha256,
          securityStatus: secCheck.riskLevel,
          blob: extractedBlob,
          starred: !!f.starred,
          inTrash: !!f.inTrash,
          createdAt: f.createdAt || now,
          updatedAt: now,
          tags: f.tags || [category]
        };

        batchRecords.push(fileRecord);
        addedRecords.push(fileRecord);
        loadedBytes += fileSize;
      }

      // Optimistic UI state update in bulk
      setFiles(prev => [...batchRecords, ...prev]);

      // Save chunk to IDB concurrently
      await Promise.all(batchRecords.map(r => dbSaveFile(r)));

      // Update progress bar state
      const currentFileName = chunk[chunk.length - 1]?.name || 'Uploading...';
      const percentage = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 100;
      const progObj = {
        active: true,
        fileName: currentFileName,
        fileIndex: Math.min(i + BATCH_SIZE, totalFiles),
        totalFiles,
        loadedBytes,
        totalBytes,
        percentage
      };
      setUploadProgress(progObj);
      if (onProgress) onProgress(progObj);

      // Non-blocking tick to let UI thread render smoothly at 60 FPS
      await new Promise(r => setTimeout(r, 0));
    }

    // Background cloud sync: upload binary to Telegram Cloud AND sync metadata + telegramFileId to Supabase for cross-device sync
    addedRecords.forEach(async (r) => {
      try {
        await syncFileToSupabase(r);
        if (r.blob && isTelegramCloudEnabled()) {
          const tgResult = await uploadFileToTelegram(r.name, r.blob);
          if (tgResult && tgResult.fileId) {
            r.storageProvider = 'telegram';
            r.telegramFileId = tgResult.fileId;
            r.telegramMessageId = tgResult.messageId;
            r.parts = tgResult.parts || null;
            r.isChunked = tgResult.isChunked || false;
            await dbSaveFile(r);
            setFiles(prev => prev.map(f => f.id === r.id ? { ...f, ...r } : f));
            await syncFileToSupabase(r);
          }
        } else if (r.blob) {
          const storagePath = await uploadFileBlobToSupabase(user.id, r.id, r.name, r.blob);
          if (storagePath) {
            r.storagePath = storagePath;
            await dbSaveFile(r);
            setFiles(prev => prev.map(f => f.id === r.id ? { ...f, ...r } : f));
            await syncFileToSupabase(r);
          }
        }
      } catch (err) {
        console.warn('Background cloud sync warning:', err);
      }
    });

    addToast(`Stored ${addedRecords.length} file(s) in Storage Bank!`, 'success');
    logActivity('UPLOAD', `Uploaded ${addedRecords.length} file(s)`, 'success');

    setTimeout(() => {
      setUploadProgress(prev => ({ ...prev, active: false }));
    }, 600);
  };


  const getCategoryFromMime = (mime, name) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif', 'heic'].includes(ext)) return 'image';
    if (mime.startsWith('video/') || ['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v', 'flv', 'wmv'].includes(ext)) return 'video';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'wma', 'opus'].includes(ext)) return 'audio';
    if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'csv', 'tsv', 'xlsx', 'xls', 'pptx', 'ppt', 'md', 'markdown'].includes(ext)) return 'document';
    if (['js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'json', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'go', 'rs', 'php', 'sql', 'sh', 'yaml', 'yml', 'xml', 'toml', 'ini', 'env'].includes(ext)) return 'code';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'archive';
    return 'document';
  };

  const ensureFileBlob = async (file) => {
    if (!file) return null;
    const correctMime = inferMimeType(file.name, file.type);
    if (file.blob instanceof Blob) {
      if (!file.blob.type || file.blob.type === 'application/octet-stream') {
        return new Blob([file.blob], { type: correctMime });
      }
      return file.blob;
    }
    if (file.storageProvider === 'telegram' || file.telegramFileId || file.parts) {
      try {
        const tgBlob = await downloadTelegramFileBlob(file);
        if (tgBlob) {
          const typedBlob = new Blob([tgBlob], { type: correctMime });
          const updated = { ...file, type: correctMime, blob: typedBlob };
          await dbSaveFile(updated);
          setFiles(prev => prev.map(f => f.id === file.id ? updated : f));
          return typedBlob;
        }
      } catch (tgErr) {
        console.warn('Failed to fetch blob from Telegram cloud:', tgErr);
      }
    }
    if (file.storagePath) {
      try {
        const downloadedBlob = await downloadFileBlobFromSupabase(file.storagePath);
        if (downloadedBlob) {
          const typedBlob = new Blob([downloadedBlob], { type: correctMime });
          const updated = { ...file, type: correctMime, blob: typedBlob };
          await dbSaveFile(updated);
          setFiles(prev => prev.map(f => f.id === file.id ? updated : f));
          return typedBlob;
        }
      } catch (err) {
        console.warn('Failed to fetch blob from cloud storage:', err);
      }
    }
    return null;
  };

  /**
   * Unified download trigger for any file (in-memory, Supabase, or chunked Telegram)
   */
  const downloadFile = async (file) => {
    if (!file) return;
    try {
      let blob = file.blob;
      if (!(blob instanceof Blob)) {
        addToast(`Preparing "${file.name}" from Cloud Vault...`, 'info');
        blob = await ensureFileBlob(file);
      }
      if (!blob) {
        addToast(`Could not retrieve "${file.name}" from Cloud Vault.`, 'error');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      addToast(`Downloaded "${file.name}"`, 'success');
      logActivity('DOWNLOAD', `Downloaded "${file.name}"`, 'success');
    } catch (err) {
      console.error('Download error:', err);
      addToast(`Download failed: ${err.message}`, 'error');
    }
  };

  // Folder Operations — precise category & placement support
  const createFolder = async (name, color = '#6366f1', options = {}) => {
    if (!user || !name.trim()) return;
    const now = new Date().toISOString();
    const validCategories = ['all', 'document', 'image', 'video', 'audio', 'code', 'archive'];
    const defaultCat = validCategories.includes(activeCategory) ? activeCategory : 'all';
    const targetCategory = options.category || defaultCat;
    const targetParentId = options.parentId !== undefined ? options.parentId : null;

    const folderRecord = {
      id: `fold-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      userId: user.id,
      parentId: targetParentId,
      category: targetCategory,
      name: name.trim(),
      color,
      starred: false,
      inTrash: false,
      createdAt: now,
      updatedAt: now
    };
    setFolders(prev => [folderRecord, ...prev]);
    await dbSaveFolder(folderRecord);
    syncFolderToSupabase(folderRecord);
    addToast(`Created folder "${name.trim()}"`, 'success');
    logActivity('CREATE_FOLDER', `Created folder "${name.trim()}"`, 'success');
    return folderRecord;
  };

  const saveFile = async (fileObj) => {
    const recordWithUser = {
      ...fileObj,
      userId: fileObj.userId && fileObj.userId !== 'local' ? fileObj.userId : (user?.id || 'local')
    };
    setFiles(prev => {
      const idx = prev.findIndex(f => f.id === recordWithUser.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = recordWithUser; return next; }
      return [recordWithUser, ...prev];
    });
    if (activePreview && activePreview.id === recordWithUser.id) {
      setActivePreview(recordWithUser);
    }
    await dbSaveFile(recordWithUser);
    syncFileToSupabase(recordWithUser);

    // Background stream to Telegram Cloud and sync telegramFileId to Supabase so every device receives the file
    if (recordWithUser.blob instanceof Blob && isTelegramCloudEnabled()) {
      uploadFileToTelegram(recordWithUser.name, recordWithUser.blob).then(async (tgResult) => {
        if (tgResult && tgResult.fileId) {
          const synced = {
            ...recordWithUser,
            storageProvider: 'telegram',
            telegramFileId: tgResult.fileId,
            telegramMessageId: tgResult.messageId,
            parts: tgResult.parts || null,
            isChunked: tgResult.isChunked || false
          };
          await dbSaveFile(synced);
          setFiles(prev => prev.map(f => f.id === recordWithUser.id ? synced : f));
          await syncFileToSupabase(synced);
        }
      }).catch(() => {});
    }
  };

  // Replace original — keeps same file ID, streams new blob to Cloud Vault and syncs across all devices
  const replaceFile = async (originalId, newBlob, extraMeta = {}) => {
    const now = new Date().toISOString();
    let updated;
    setFiles(prev => prev.map(f => {
      if (f.id !== originalId) return f;
      updated = { ...f, ...extraMeta, blob: newBlob, size: newBlob?.size ?? f.size, updatedAt: now };
      return updated;
    }));
    if (updated) {
      if (activePreview && activePreview.id === originalId) {
        setActivePreview(updated);
      }
      await dbSaveFile(updated);
      syncFileToSupabase(updated);

      if (newBlob instanceof Blob && isTelegramCloudEnabled()) {
        const targetRef = updated;
        uploadFileToTelegram(targetRef.name, newBlob).then(async (tgResult) => {
          if (tgResult && tgResult.fileId) {
            const cloudSynced = {
              ...targetRef,
              storageProvider: 'telegram',
              telegramFileId: tgResult.fileId,
              telegramMessageId: tgResult.messageId,
              parts: tgResult.parts || null,
              isChunked: tgResult.isChunked || false
            };
            await dbSaveFile(cloudSynced);
            setFiles(prev => prev.map(f => f.id === originalId ? cloudSynced : f));
            await syncFileToSupabase(cloudSynced);
          }
        }).catch(() => {});
      }
    }
    return updated;
  };


  const toggleStar = async (id, isFolder) => {
    const now = new Date().toISOString();
    if (isFolder) {
      let updated;
      setFolders(prev => prev.map(f => {
        if (f.id !== id) return f;
        updated = { ...f, starred: !f.starred, updatedAt: now };
        return updated;
      }));
      if (updated) { await dbSaveFolder(updated); syncFolderToSupabase(updated); }
    } else {
      let updated;
      setFiles(prev => prev.map(f => {
        if (f.id !== id) return f;
        updated = { ...f, starred: !f.starred, updatedAt: now };
        return updated;
      }));
      if (updated) { await dbSaveFile(updated); syncFileToSupabase(updated); }
    }
  };

  const moveToTrash = async (id, isFolder) => {
    const now = new Date().toISOString();
    if (isFolder) {
      let updated;
      setFolders(prev => prev.map(f => {
        if (f.id !== id) return f;
        updated = { ...f, inTrash: true, updatedAt: now };
        return updated;
      }));
      if (updated) { await dbSaveFolder(updated); syncFolderToSupabase(updated); }
    } else {
      let updated;
      setFiles(prev => prev.map(f => {
        if (f.id !== id) return f;
        updated = { ...f, inTrash: true, updatedAt: now };
        return updated;
      }));
      if (updated) { await dbSaveFile(updated); syncFileToSupabase(updated); }
    }
    addToast('Moved item to Trash', 'info');
  };

  const restoreFromTrash = async (id, isFolder) => {
    const now = new Date().toISOString();
    if (isFolder) {
      let updated;
      setFolders(prev => prev.map(f => {
        if (f.id !== id) return f;
        updated = { ...f, inTrash: false, updatedAt: now };
        return updated;
      }));
      if (updated) { await dbSaveFolder(updated); syncFolderToSupabase(updated); }
    } else {
      let updated;
      setFiles(prev => prev.map(f => {
        if (f.id !== id) return f;
        updated = { ...f, inTrash: false, updatedAt: now };
        return updated;
      }));
      if (updated) { await dbSaveFile(updated); syncFileToSupabase(updated); }
    }
    addToast('Restored item from Trash', 'success');
  };

  const deletePermanently = async (id, isFolder) => {
    if (isFolder) {
      setFolders(prev => prev.filter(f => f.id !== id));
      await dbDeleteFolder(id);
      deleteFolderFromSupabase(id);
    } else {
      setFiles(prev => prev.filter(f => f.id !== id));
      await dbDeleteFile(id);
      deleteFileFromSupabase(id);
    }
    addToast('Item permanently deleted', 'info');
  };

  const renameItem = async (id, isFolder, newName) => {
    if (!newName.trim()) return;
    const now = new Date().toISOString();
    if (isFolder) {
      let updated;
      setFolders(prev => prev.map(f => {
        if (f.id !== id) return f;
        updated = { ...f, name: newName.trim(), updatedAt: now };
        return updated;
      }));
      if (updated) { await dbSaveFolder(updated); syncFolderToSupabase(updated); }
    } else {
      let updated;
      setFiles(prev => prev.map(f => {
        if (f.id !== id) return f;
        updated = { ...f, name: newName.trim(), updatedAt: now };
        return updated;
      }));
      if (updated) { await dbSaveFile(updated); syncFileToSupabase(updated); }
    }
    addToast('Item renamed', 'success');
  };

  const navigateToFolder = (folderId, folderName = 'Folder', targetCategory = null) => {
    if (targetCategory) {
      setActiveCategory(targetCategory);
    } else if (['converter', 'profile'].includes(activeCategory)) {
      setActiveCategory('all');
    }
    setSearchQuery('');
    setCurrentFolderId(folderId);

    if (!folderId) {
      setFolderPath([{ id: null, name: 'My Vault' }]);
      return;
    }

    // Reconstruct exact root-to-folder hierarchy path
    const path = [];
    let currId = folderId;
    const visited = new Set();

    while (currId && !visited.has(String(currId))) {
      visited.add(String(currId));
      const targetFold = folders.find(f => String(f.id) === String(currId));
      if (targetFold) {
        path.unshift({ id: targetFold.id, name: targetFold.name });
        currId = targetFold.parentId;
      } else {
        path.unshift({ id: folderId, name: folderName });
        break;
      }
    }

    setFolderPath([{ id: null, name: 'My Vault' }, ...path]);
  };

  const toggleSelectItem = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const clearSelection = () => setSelectedItems([]);

  // SUB-SECOND FAST PARALLEL BATCH OPERATIONS
  const batchMoveToTrash = async (targetIds = null) => {
    const selected = Array.isArray(targetIds) && targetIds.length > 0 ? targetIds : [...selectedItems];
    if (selected.length === 0) return;
    setFolders(prev => prev.map(f => selected.includes(f.id) ? { ...f, inTrash: true } : f));
    setFiles(prev => prev.map(f => selected.includes(f.id) ? { ...f, inTrash: true } : f));
    clearSelection();

    await Promise.all(selected.map(id => {
      const targetFold = folders.find(f => f.id === id);
      if (targetFold) {
        const updated = { ...targetFold, inTrash: true };
        return Promise.all([dbSaveFolder(updated), syncFolderToSupabase(updated)]);
      }
      const targetFile = files.find(f => f.id === id);
      if (targetFile) {
        const updated = { ...targetFile, inTrash: true };
        return Promise.all([dbSaveFile(updated), syncFileToSupabase(updated)]);
      }
      return Promise.resolve();
    }));

    addToast(`Moved ${selected.length} item(s) to Trash`, 'info');
  };

  const batchRestoreFromTrash = async (targetIds = null) => {
    const selected = Array.isArray(targetIds) && targetIds.length > 0 ? targetIds : [...selectedItems];
    if (selected.length === 0) return;
    setFolders(prev => prev.map(f => selected.includes(f.id) ? { ...f, inTrash: false } : f));
    setFiles(prev => prev.map(f => selected.includes(f.id) ? { ...f, inTrash: false } : f));
    clearSelection();

    await Promise.all(selected.map(id => {
      const targetFold = folders.find(f => f.id === id);
      if (targetFold) {
        const updated = { ...targetFold, inTrash: false };
        return Promise.all([dbSaveFolder(updated), syncFolderToSupabase(updated)]);
      }
      const targetFile = files.find(f => f.id === id);
      if (targetFile) {
        const updated = { ...targetFile, inTrash: false };
        return Promise.all([dbSaveFile(updated), syncFileToSupabase(updated)]);
      }
      return Promise.resolve();
    }));

    addToast(`Restored ${selected.length} item(s) from Trash`, 'success');
  };

  const batchDeletePermanently = async (targetIds = null) => {
    const selected = Array.isArray(targetIds) && targetIds.length > 0 ? targetIds : [...selectedItems];
    if (selected.length === 0) return;
    setFolders(prev => prev.filter(f => !selected.includes(f.id)));
    setFiles(prev => prev.filter(f => !selected.includes(f.id)));
    clearSelection();

    await Promise.all(selected.map(id => {
      const isFold = folders.some(f => f.id === id);
      if (isFold) {
        return Promise.all([dbDeleteFolder(id), deleteFolderFromSupabase(id)]);
      } else {
        return Promise.all([dbDeleteFile(id), deleteFileFromSupabase(id)]);
      }
    }));

    addToast(`Permanently deleted ${selected.length} item(s)`, 'info');
  };

  // ZIP Selected Files Engine
  const zipSelectedFiles = async (customZipName = null) => {
    const selected = selectedItems.length > 0 ? selectedItems : displayedFiles.map(f => f.id);
    const targetFiles = files.filter(f => selected.includes(f.id) && f.blob);

    if (targetFiles.length === 0) {
      addToast('No valid files selected to zip.', 'warning');
      return;
    }

    addToast(`Compressing ${targetFiles.length} file(s) into ZIP archive...`, 'info');
    try {
      const JSZipModule = (await import('jszip')).default;
      const zip = new JSZipModule();

      targetFiles.forEach(f => {
        zip.file(f.name, f.blob);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFileName = customZipName || `Vault_Archive_${Date.now()}.zip`;

      const newZipRecord = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: user.id,
        folderId: currentFolderId,
        name: zipFileName,
        type: 'application/zip',
        category: 'archive',
        size: zipBlob.size,
        blob: zipBlob,
        starred: false,
        inTrash: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ['archive', 'zip']
      };

      await saveFile(newZipRecord);
      clearSelection();
      addToast(`Created ZIP Archive "${zipFileName}"`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to create ZIP archive.', 'error');
    }
  };

  // UNZIP Archive File Engine
  const unzipFile = async (zipFileRecord) => {
    if (!zipFileRecord || !zipFileRecord.blob) {
      addToast('Invalid ZIP file.', 'error');
      return;
    }

    try {
      addToast(`Extracting "${zipFileRecord.name}"...`, 'info');
      const JSZipModule = (await import('jszip')).default;
      const zip = new JSZipModule();
      const content = await zip.loadAsync(zipFileRecord.blob);
      const extractedFiles = [];

      for (const [filename, fileObj] of Object.entries(content.files)) {
        if (!fileObj.dir) {
          const blob = await fileObj.async('blob');
          const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();

          let category = 'document';
          if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) category = 'image';
          else if (['.mp4', '.webm', '.mov', '.mkv'].includes(ext)) category = 'video';
          else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) category = 'audio';
          else if (['.js', '.py', '.html', '.css', '.json', '.jsx'].includes(ext)) category = 'code';

          const newFile = {
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            userId: user.id,
            folderId: currentFolderId,
            name: filename.split('/').pop() || filename,
            type: blob.type || 'application/octet-stream',
            category,
            size: blob.size,
            blob,
            starred: false,
            inTrash: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tags: ['unzipped']
          };

          await saveFile(newFile);
          extractedFiles.push(newFile);
        }
      }

      addToast(`Unzipped ${extractedFiles.length} file(s) into vault!`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to unzip archive file.', 'error');
    }
  };

  // Move Selected Items to Target Folder
  const moveItemsToFolder = async (itemIds, targetFolderId) => {
    const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
    const now = new Date().toISOString();

    setFiles(prev => prev.map(f => ids.includes(f.id) ? { ...f, folderId: targetFolderId, updatedAt: now } : f));
    setFolders(prev => prev.map(f => ids.includes(f.id) ? { ...f, parentId: targetFolderId, updatedAt: now } : f));

    await Promise.all(ids.map(id => {
      const targetFile = files.find(f => f.id === id);
      if (targetFile) {
        const updated = { ...targetFile, folderId: targetFolderId, updatedAt: now };
        return Promise.all([dbSaveFile(updated), syncFileToSupabase(updated)]);
      }
      const targetFolder = folders.find(f => f.id === id);
      if (targetFolder) {
        const updated = { ...targetFolder, parentId: targetFolderId, updatedAt: now };
        return Promise.all([dbSaveFolder(updated), syncFolderToSupabase(updated)]);
      }
      return Promise.resolve();
    }));

    clearSelection();
    addToast(`Moved ${ids.length} item(s) to folder!`, 'success');
  };

  const displayedFolders = useMemo(() => {
    const normCurrent = (currentFolderId !== null && currentFolderId !== undefined && currentFolderId !== '') ? String(currentFolderId) : null;
    return folders.filter(folder => {
      const normParent = (folder.parentId !== null && folder.parentId !== undefined && folder.parentId !== '' && folder.parentId !== 'null') ? String(folder.parentId) : null;

      if (activeCategory === 'trash') {
        if (normCurrent) {
          // Inside a trashed folder: display any child subfolders
          return normParent === normCurrent;
        }
        return Boolean(folder.inTrash);
      }

      if (folder.inTrash) return false;
      if (activeCategory === 'starred') return Boolean(folder.starred);
      if (activeCategory === 'edited') return false;

      if (searchQuery.trim()) {
        const matchesQuery = folder.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesQuery) return false;
        if (['image', 'document', 'video', 'audio', 'code', 'archive'].includes(activeCategory)) {
          return folder.category === activeCategory || files.some(f => !f.inTrash && String(f.folderId) === String(folder.id) && f.category === activeCategory);
        }
        return true;
      }

      // Scoped category views: only show folders created for this category or holding files of this category
      if (['image', 'document', 'video', 'audio', 'code', 'archive'].includes(activeCategory)) {
        if (normParent !== normCurrent) return false;
        if (folder.category && folder.category !== 'all') {
          return folder.category === activeCategory;
        }
        return files.some(f => !f.inTrash && String(f.folderId) === String(folder.id) && f.category === activeCategory);
      }

      return normParent === normCurrent;
    });
  }, [folders, files, activeCategory, currentFolderId, searchQuery]);

  const displayedFiles = useMemo(() => {
    const normCurrent = (currentFolderId !== null && currentFolderId !== undefined && currentFolderId !== '') ? String(currentFolderId) : null;
    const validFolderIds = new Set(folders.filter(f => !f.inTrash).map(f => String(f.id)));

    let result = files.filter(file => {
      const rawFolder = (file.folderId !== null && file.folderId !== undefined && file.folderId !== '' && file.folderId !== 'null') ? String(file.folderId) : null;

      if (activeCategory === 'trash') {
        if (normCurrent) {
          // Inside a trashed folder: show all files belonging to this folder so user can preview them
          return rawFolder === normCurrent;
        }
        return Boolean(file.inTrash);
      }

      if (file.inTrash) return false;
      if (activeCategory === 'starred') return Boolean(file.starred);

      if (activeCategory === 'edited') {
        return file.tags?.includes('edited') || file.name.includes('_edited') || file.category === 'edited';
      }

      // Normalize folder reference (if folder was deleted, treat file as root)
      const normFolder = rawFolder && validFolderIds.has(rawFolder) ? rawFolder : null;

      // Category filters (photos, docs, audio, video, code, archive)
      if (['image', 'document', 'video', 'audio', 'code', 'archive'].includes(activeCategory)) {
        if ( file.category !== activeCategory ) return false;
        if (searchQuery.trim()) {
          return file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            file.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return normFolder === normCurrent;
      }

      if (searchQuery.trim()) {
        return file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          file.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      }

      return normFolder === normCurrent;
    });

    result.sort((a, b) => {
      let compA = a[sortBy] || '';
      let compB = b[sortBy] || '';
      if (sortBy === 'date') {
        compA = new Date(a.createdAt).getTime();
        compB = new Date(b.createdAt).getTime();
      }
      if (compA < compB) return sortOrder === 'asc' ? -1 : 1;
      if (compA > compB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [files, folders, activeCategory, currentFolderId, searchQuery, sortBy, sortOrder]);

  const selectAllDisplayedItems = () => {
    const allPageIds = [
      ...displayedFolders.map(f => f.id),
      ...displayedFiles.map(f => f.id)
    ];

    if (allPageIds.length === 0) {
      setSelectedItems([]);
      return;
    }

    const isAllSelected = allPageIds.length <= selectedItems.length && allPageIds.every(id => selectedItems.includes(id));

    if (isAllSelected) {
      setSelectedItems([]);
    } else {
      setSelectedItems(allPageIds);
    }
  };

  // Storage Quota Engine with dynamic tier tracking
  const currentPlanObj = useMemo(() => getPlanQuota(user?.plan), [user?.plan]);

  const storageStats = useMemo(() => {
    const activeFiles = files.filter(f => !f.inTrash);
    let totalBytes = 0;
    const categories = {
      image: { count: 0, bytes: 0, label: 'Photos & Images', color: '#06b6d4' },
      document: { count: 0, bytes: 0, label: 'Documents & PDFs', color: '#3b82f6' },
      video: { count: 0, bytes: 0, label: 'Videos & Media', color: '#8b5cf6' },
      audio: { count: 0, bytes: 0, label: 'Audio Tracks', color: '#ec4899' },
      code: { count: 0, bytes: 0, label: 'Code & Scripts', color: '#10b981' },
      archive: { count: 0, bytes: 0, label: 'Zip Archives', color: '#f59e0b' },
      other: { count: 0, bytes: 0, label: 'Other Files', color: '#64748b' }
    };

    activeFiles.forEach(f => {
      const sz = f.size || 0;
      totalBytes += sz;
      const catKey = categories[f.category] ? f.category : 'other';
      categories[catKey].count += 1;
      categories[catKey].bytes += sz;
    });

    const quotaBytes = currentPlanObj.quotaBytes;
    const usagePercent = Math.min(100, Math.max(0.01, (totalBytes / quotaBytes) * 100)).toFixed(2);

    return {
      totalFiles: activeFiles.length,
      totalBytes,
      categories,
      plan: currentPlanObj,
      tier: currentPlanObj.displayName,
      quotaBytes,
      quotaGB: currentPlanObj.quotaGB,
      usagePercent,
      diskUsage: totalBytes,
      diskQuota: quotaBytes,
      cloudSyncStatus: 'Synchronized • Real-Time Cloud Stream Active'
    };
  }, [files, currentPlanObj]);

  return (
    <StorageContext.Provider value={{
      files,
      folders,
      activityLogs,
      loading,
      activeCategory,
      setActiveCategory,
      currentFolderId,
      folderPath,
      viewMode,
      setViewMode,
      searchQuery,
      setSearchQuery,
      sortBy,
      setSortBy,
      sortOrder,
      setSortOrder,
      selectedItems,
      toggleSelectItem,
      selectAllDisplayedItems,
      clearSelection,
      batchMoveToTrash,
      batchRestoreFromTrash,
      batchDeletePermanently,
      zipSelectedFiles,
      unzipFile,
      moveItemsToFolder,
      navigateToFolder,
      moveModalTarget,
      setMoveModalTarget,
      displayedFolders,
      displayedFiles,
      storageStats,
      isUploadOpen,
      setIsUploadOpen,
      isNewFolderOpen,
      setIsNewFolderOpen,
      activePreview,
      setActivePreview,
      activeShare,
      setActiveShare,
      isAnalyticsOpen,
      setIsAnalyticsOpen,
      isAuthModalOpen,
      setIsAuthModalOpen,
      isCommandPaletteOpen,
      setIsCommandPaletteOpen,
      isActivityLogOpen,
      setIsActivityLogOpen,
      isSubscriptionOpen,
      setIsSubscriptionOpen,
      isTelegramCloudEnabled,
      downloadFile,
      currentMusicTrack,
      setCurrentMusicTrack,
      isMusicPlaying,
      setIsMusicPlaying,
      isMusicMuted,
      setIsMusicMuted,
      isMusicLooping,
      setIsMusicLooping,
      toggleMusicPlay,
      activeAudioTrack,
      setActiveAudioTrack,
      toasts,
      uploadProgress,
      addToast,
      removeToast,
      uploadFiles,
      createFolder,
      saveFile,
      replaceFile,
      toggleStar,
      moveToTrash,
      restoreFromTrash,
      deletePermanently,
      renameItem,
      mountedDrives,
      unmountDrive,
      registerDrive,
      isDriveModalOpen,
      setIsDriveModalOpen,
      connectWindowsFolder,
      disconnectWindowsFolder,
      logActivity,
      clearActivityLogs,
      reloadVault,
      ensureFileBlob,
      confirmDialog,
      requestConfirm,
      closeConfirmDialog
    }}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage() {
  const context = useContext(StorageContext);
  if (!context) throw new Error('useStorage must be used within StorageProvider');
  return context;
}

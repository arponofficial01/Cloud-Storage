// Supabase Service — uses official @supabase/supabase-js client for
// authenticated REST calls and Realtime subscriptions.
// Binary Blobs stay in IndexedDB; this service handles metadata only.

import { supabase } from '../lib/supabaseClient';

const withTimeout = (promise, ms = 4000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
  ]);

// ── File Metadata Sync (Includes Telegram Cloud fileId/parts inside storage_path for cross-device sync) ──
export async function syncFileToSupabase(fileRecord) {
  if (!fileRecord || !fileRecord.id || !fileRecord.userId) return;
  try {
    let encodedStoragePath = fileRecord.storagePath || null;
    if (fileRecord.telegramFileId) {
      encodedStoragePath =
        fileRecord.isChunked && Array.isArray(fileRecord.parts)
          ? JSON.stringify({
              tg: fileRecord.telegramFileId,
              msg: fileRecord.telegramMessageId || null,
              parts: fileRecord.parts
            })
          : `tg:${fileRecord.telegramFileId}`;
    }

    const { error } = await withTimeout(
      supabase.from('vault_files').upsert({
        id:           fileRecord.id,
        user_id:      fileRecord.userId,
        folder_id:    fileRecord.folderId  || null,
        name:         fileRecord.name,
        type:         fileRecord.type,
        category:     fileRecord.category,
        size:         fileRecord.size      || 0,
        storage_path: encodedStoragePath,
        starred:      fileRecord.starred   || false,
        in_trash:     fileRecord.inTrash   || false,
        created_at:   fileRecord.createdAt,
        updated_at:   fileRecord.updatedAt,
        tags:         fileRecord.tags      || []
      }, { onConflict: 'id' }),
      4000
    );

    if (error) {
      console.warn('[Supabase] syncFile error:', error.message);
      return false;
    }
    return true;
  } catch {
    // Offline or timed out - safe to ignore
    return false;
  }
}

// ── Folder Metadata Sync (Encodes color|category for cross-device category preservation) ──
export async function syncFolderToSupabase(folderRecord) {
  if (!folderRecord || !folderRecord.id || !folderRecord.userId) return false;
  try {
    const encodedColor = `${folderRecord.color || '#6366f1'}|${folderRecord.category || 'all'}`;
    const { error } = await withTimeout(
      supabase.from('vault_folders').upsert({
        id:         folderRecord.id,
        user_id:    folderRecord.userId,
        parent_id:  folderRecord.parentId  || null,
        name:       folderRecord.name,
        color:      encodedColor,
        starred:    folderRecord.starred   || false,
        in_trash:   folderRecord.inTrash   || false,
        created_at: folderRecord.createdAt,
        updated_at: folderRecord.updatedAt
      }, { onConflict: 'id' }),
      4000
    );

    if (error) {
      console.warn('[Supabase] syncFolder error:', error.message);
      return false;
    }
    return true;
  } catch {
    // Offline or timed out - safe to ignore
    return false;
  }
}

// ── Activity Log Sync ─────────────────────────────────────────────────────────
export async function syncActivityLogToSupabase(logRecord) {
  try {
    const { error } = await withTimeout(
      supabase.from('activity_logs').upsert({
        id:        logRecord.id,
        user_id:   logRecord.userId,
        action:    logRecord.action,
        details:   logRecord.details,
        timestamp: logRecord.timestamp,
        status:    logRecord.status
      }, { onConflict: 'id' }),
      2000
    );

    if (error) console.warn('[Supabase] syncLog error:', error.message);
  } catch {
    // Offline or timed out - safe to ignore
  }
}

// ── Delete File ───────────────────────────────────────────────────────────────
export async function deleteFileFromSupabase(id) {
  if (!id) return false;
  try {
    const { error } = await withTimeout(
      supabase.from('vault_files').delete().eq('id', id),
      4000
    );
    if (error) {
      console.warn('[Supabase] deleteFile error:', error.message);
      return false;
    }
    return true;
  } catch {
    // Offline or timed out - safe to ignore
    return false;
  }
}

// ── Delete Folder ─────────────────────────────────────────────────────────────
export async function deleteFolderFromSupabase(id) {
  if (!id) return false;
  try {
    const { error } = await withTimeout(
      supabase.from('vault_folders').delete().eq('id', id),
      4000
    );
    if (error) {
      console.warn('[Supabase] deleteFolder error:', error.message);
      return false;
    }
    return true;
  } catch {
    // Offline or timed out - safe to ignore
    return false;
  }
}

// ── Fetch Files for User (with reachability status to prevent zombie resurrection) ──
export async function fetchFilesFromSupabaseWithStatus(userId) {
  if (!userId) return { ok: false, items: [] };
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('vault_files')
        .select('*')
        .eq('user_id', userId),
      4500
    );

    if (error || !Array.isArray(data)) {
      return { ok: false, items: [] };
    }

    const items = data.map(item => {
      const rawPath = item.storage_path || null;
      let storageProvider = null;
      let telegramFileId = null;
      let telegramMessageId = null;
      let parts = null;
      let isChunked = false;
      let storagePath = rawPath;

      if (typeof rawPath === 'string' && rawPath.startsWith('tg:')) {
        storageProvider = 'telegram';
        telegramFileId = rawPath.slice(3);
        storagePath = null;
      } else if (typeof rawPath === 'string' && rawPath.startsWith('{"tg":')) {
        try {
          const parsed = JSON.parse(rawPath);
          storageProvider = 'telegram';
          telegramFileId = parsed.tg || null;
          telegramMessageId = parsed.msg || null;
          parts = Array.isArray(parsed.parts) ? parsed.parts : null;
          isChunked = Boolean(parts && parts.length > 0);
          storagePath = null;
        } catch {}
      }

      return {
        id:                item.id,
        userId:            item.user_id,
        folderId:          item.folder_id,
        name:              item.name,
        type:              item.type,
        category:          item.category,
        size:              item.size,
        storagePath,
        storageProvider,
        telegramFileId,
        telegramMessageId,
        parts,
        isChunked,
        starred:           !!item.starred,
        inTrash:           !!item.in_trash,
        createdAt:         item.created_at,
        updatedAt:         item.updated_at,
        tags:              Array.isArray(item.tags) ? item.tags : [],
        syncedToCloud:     true
      };
    });
    return { ok: true, items };
  } catch {
    return { ok: false, items: [] };
  }
}

export async function fetchFilesFromSupabase(userId) {
  const res = await fetchFilesFromSupabaseWithStatus(userId);
  return res.items;
}

// ── Fetch Folders for User (with reachability status) ─────────────────────────
export async function fetchFoldersFromSupabaseWithStatus(userId) {
  if (!userId) return { ok: false, items: [] };
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('vault_folders')
        .select('*')
        .eq('user_id', userId),
      4500
    );

    if (error || !Array.isArray(data)) {
      return { ok: false, items: [] };
    }

    const items = data.map(item => {
      const rawColor = item.color || '#6366f1';
      const [cleanColor, decodedCat] = rawColor.includes('|')
        ? rawColor.split('|')
        : [rawColor, 'all'];

      return {
        id:            item.id,
        userId:        item.user_id,
        parentId:      item.parent_id,
        name:          item.name,
        color:         cleanColor || '#6366f1',
        category:      decodedCat || 'all',
        starred:       !!item.starred,
        inTrash:       !!item.in_trash,
        createdAt:     item.created_at,
        updatedAt:     item.updated_at,
        syncedToCloud: true
      };
    });
    return { ok: true, items };
  } catch {
    return { ok: false, items: [] };
  }
}

export async function fetchFoldersFromSupabase(userId) {
  const res = await fetchFoldersFromSupabaseWithStatus(userId);
  return res.items;
}

// ── Fetch Activity Logs for User ──────────────────────────────────────────────
export async function fetchActivityLogsFromSupabase(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(200),
      2000
    );

    if (error) {
      return [];
    }
    if (!Array.isArray(data)) return [];

    return data.map(item => ({
      id:        item.id,
      userId:    item.user_id,
      action:    item.action,
      details:   item.details,
      timestamp: item.timestamp,
      status:    item.status
    }));
  } catch {
    return [];
  }
}

// ── Realtime Subscription via official @supabase/supabase-js channels ─────────
// Returns an unsubscribe function.
export function subscribeToSupabaseRealtime(userId, onDataChange) {
  if (!userId) return () => {};

  try {
    const channel = supabase
      .channel(`vault-realtime-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vault_files',   filter: `user_id=eq.${userId}` },
        onDataChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vault_folders', filter: `user_id=eq.${userId}` },
        onDataChange
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_logs', filter: `user_id=eq.${userId}` },
        onDataChange
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Supabase Realtime] ✅ Subscribed to vault changes');
        }
      });

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  } catch {
    return () => {};
  }
}

// ── Real Cloud Binary Storage (vault-files bucket) ───────────────────────────
export async function uploadFileBlobToSupabase(userId, fileId, fileName, blob) {
  if (!blob || !userId) return null;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${fileId}_${safeName}`;
  try {
    const { data, error } = await supabase.storage
      .from('vault-files')
      .upload(storagePath, blob, {
        upsert: true,
        contentType: blob.type || 'application/octet-stream'
      });
    if (error) {
      console.warn('[Supabase Storage] Upload error:', error.message);
      return null;
    }
    return data?.path || storagePath;
  } catch (err) {
    console.warn('[Supabase Storage] Upload exception:', err);
    return null;
  }
}

export async function downloadFileBlobFromSupabase(storagePath) {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from('vault-files')
      .download(storagePath);
    if (error || !data) {
      console.warn('[Supabase Storage] Download error:', error?.message);
      return null;
    }
    return data; // Returns binary Blob directly
  } catch (err) {
    console.warn('[Supabase Storage] Download exception:', err);
    return null;
  }
}

export async function getFileSignedUrlFromSupabase(storagePath, expiresIn = 3600) {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from('vault-files')
      .createSignedUrl(storagePath, expiresIn);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function deleteFileBlobFromSupabase(storagePath) {
  if (!storagePath) return;
  try {
    await supabase.storage.from('vault-files').remove([storagePath]);
  } catch {}
}


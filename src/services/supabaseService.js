// Supabase Service — uses official @supabase/supabase-js client for
// authenticated REST calls and Realtime subscriptions.
// Binary Blobs stay in IndexedDB; this service handles metadata only.

import { supabase } from '../lib/supabaseClient';

const withTimeout = (promise, ms = 1500) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
  ]);

// ── File Metadata Sync ────────────────────────────────────────────────────────
export async function syncFileToSupabase(fileRecord) {
  try {
    const { error } = await withTimeout(
      supabase.from('vault_files').upsert({
        id:         fileRecord.id,
        user_id:    fileRecord.userId,
        folder_id:  fileRecord.folderId  || null,
        name:       fileRecord.name,
        type:       fileRecord.type,
        category:   fileRecord.category,
        size:       fileRecord.size      || 0,
        storage_path: fileRecord.storagePath || null,
        starred:    fileRecord.starred   || false,
        in_trash:   fileRecord.inTrash   || false,
        created_at: fileRecord.createdAt,
        updated_at: fileRecord.updatedAt,
        tags:       fileRecord.tags      || []
      }, { onConflict: 'id' }),
      2000
    );

    if (error) console.warn('[Supabase] syncFile error:', error.message);
  } catch (err) {
    // Offline or timed out - safe to ignore
  }
}

// ── Folder Metadata Sync ──────────────────────────────────────────────────────
export async function syncFolderToSupabase(folderRecord) {
  try {
    const { error } = await withTimeout(
      supabase.from('vault_folders').upsert({
        id:         folderRecord.id,
        user_id:    folderRecord.userId,
        parent_id:  folderRecord.parentId  || null,
        name:       folderRecord.name,
        color:      folderRecord.color,
        starred:    folderRecord.starred   || false,
        in_trash:   folderRecord.inTrash   || false,
        created_at: folderRecord.createdAt,
        updated_at: folderRecord.updatedAt
      }, { onConflict: 'id' }),
      2000
    );

    if (error) console.warn('[Supabase] syncFolder error:', error.message);
  } catch (err) {
    // Offline or timed out - safe to ignore
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
  } catch (err) {
    // Offline or timed out - safe to ignore
  }
}

// ── Delete File ───────────────────────────────────────────────────────────────
export async function deleteFileFromSupabase(id) {
  if (!id) return;
  try {
    const { error } = await withTimeout(
      supabase.from('vault_files').delete().eq('id', id),
      2000
    );
    if (error) console.warn('[Supabase] deleteFile error:', error.message);
  } catch (err) {
    // Offline or timed out - safe to ignore
  }
}

// ── Delete Folder ─────────────────────────────────────────────────────────────
export async function deleteFolderFromSupabase(id) {
  if (!id) return;
  try {
    const { error } = await withTimeout(
      supabase.from('vault_folders').delete().eq('id', id),
      2000
    );
    if (error) console.warn('[Supabase] deleteFolder error:', error.message);
  } catch (err) {
    // Offline or timed out - safe to ignore
  }
}

// ── Fetch Files for User ──────────────────────────────────────────────────────
export async function fetchFilesFromSupabase(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('vault_files')
        .select('*')
        .eq('user_id', userId),
      1500
    );

    if (error) {
      return [];
    }
    if (!Array.isArray(data)) return [];

    return data.map(item => ({
      id:        item.id,
      userId:    item.user_id,
      folderId:  item.folder_id,
      name:      item.name,
      type:      item.type,
      category:  item.category,
      size:      item.size,
      storagePath: item.storage_path || null,
      starred:   !!item.starred,
      inTrash:   !!item.in_trash,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      tags:      Array.isArray(item.tags) ? item.tags : []
    }));
  } catch (err) {
    return [];
  }
}

// ── Fetch Folders for User ────────────────────────────────────────────────────
export async function fetchFoldersFromSupabase(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('vault_folders')
        .select('*')
        .eq('user_id', userId),
      1500
    );

    if (error) {
      return [];
    }
    if (!Array.isArray(data)) return [];

    return data.map(item => ({
      id:        item.id,
      userId:    item.user_id,
      parentId:  item.parent_id,
      name:      item.name,
      color:     item.color,
      starred:   !!item.starred,
      inTrash:   !!item.in_trash,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  } catch (err) {
    return [];
  }
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
      1500
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
  } catch (err) {
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


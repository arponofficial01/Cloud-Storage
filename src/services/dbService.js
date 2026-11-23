// Instant Dual Persistence Storage Engine (IndexedDB + LocalStorage Metadata Backup)
// Ensures all files, blobs, MIME types, and folders load instantaneously (0ms) after closing and reopening the website.

const DB_NAME = 'AetherDriveDB';
const DB_VERSION = 6;

let dbInstance = null;

export function inferMimeType(fileName = '', existingType = '') {
  if (existingType && existingType !== 'application/octet-stream' && existingType !== 'binary/octet-stream') {
    return existingType;
  }
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mimeMap = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    aac: 'audio/aac',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    txt: 'text/plain',
    md: 'text/markdown',
    markdown: 'text/markdown',
    rtf: 'application/rtf',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    json: 'application/json',
    js: 'text/javascript',
    jsx: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    py: 'text/x-python',
    xml: 'application/xml',
    zip: 'application/zip'
  };
  return mimeMap[ext] || existingType || 'application/octet-stream';
}

function normalizeRecordBlobAndMime(record) {
  if (!record || typeof record !== 'object') return record;
  const correctMime = inferMimeType(record.name, record.type);
  let normalizedBlob = record.blob || null;

  if (normalizedBlob instanceof Blob) {
    if (!normalizedBlob.type || normalizedBlob.type === 'application/octet-stream') {
      normalizedBlob = new Blob([normalizedBlob], { type: correctMime });
    }
  } else if (normalizedBlob && normalizedBlob.byteLength !== undefined) {
    // ArrayBuffer stored in IDB
    normalizedBlob = new Blob([normalizedBlob], { type: correctMime });
  }

  return {
    ...record,
    type: correctMime,
    blob: normalizedBlob
  };
}

// ── IndexedDB Initialization ──────────────────────────────────────────────────
export function initDB() {
  return new Promise((resolve) => {
    if (dbInstance) return resolve(dbInstance);

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onblocked = () => {
        if (dbInstance) {
          try { dbInstance.close(); } catch {}
          dbInstance = null;
        }
      };

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('files')) {
          const s = db.createObjectStore('files', { keyPath: 'id' });
          s.createIndex('userId', 'userId', { unique: false });
          s.createIndex('folderId', 'folderId', { unique: false });
        }

        if (!db.objectStoreNames.contains('folders')) {
          const s = db.createObjectStore('folders', { keyPath: 'id' });
          s.createIndex('userId', 'userId', { unique: false });
          s.createIndex('parentId', 'parentId', { unique: false });
        }

        if (!db.objectStoreNames.contains('activity_logs')) {
          const s = db.createObjectStore('activity_logs', { keyPath: 'id' });
          s.createIndex('userId', 'userId', { unique: false });
        }

        if (!db.objectStoreNames.contains('vault_settings')) {
          db.createObjectStore('vault_settings', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('converted_blobs')) {
          db.createObjectStore('converted_blobs', { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        dbInstance.onclose = () => { dbInstance = null; };
        dbInstance.onversionchange = () => {
          try { dbInstance.close(); } catch {}
          dbInstance = null;
        };
        resolve(dbInstance);
      };

      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

// ── LocalStorage Metadata Backup Helpers ─────────────────────────────────────
const LS_FILES_KEY = 'aether_ls_vault_files';
const LS_FOLDERS_KEY = 'aether_ls_vault_folders';
const LS_LOGS_KEY = 'aether_ls_activity_logs';

function getLS(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function putLS(key, record) {
  try {
    const items = getLS(key);
    const { blob: _blob, ...cleanRecord } = record;
    const idx = items.findIndex(i => i.id === cleanRecord.id);
    if (idx >= 0) {
      items[idx] = cleanRecord;
    } else {
      items.unshift(cleanRecord);
    }
    localStorage.setItem(key, JSON.stringify(items.slice(0, 500)));
  } catch {}
}

function deleteLS(key, id) {
  try {
    const items = getLS(key).filter(i => i.id !== id);
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export async function getFileById(id) {
  try {
    const db = await initDB();
    if (db) {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(id);
      const res = await new Promise(r => { req.onsuccess = () => r(req.result); req.onerror = () => r(null); });
      if (res) return normalizeRecordBlobAndMime(res);
    }
  } catch {}
  const lsFiles = getLS(LS_FILES_KEY);
  const found = lsFiles.find(f => f.id === id) || null;
  return found ? normalizeRecordBlobAndMime(found) : null;
}

export async function getAllFiles() {
  const lsFiles = getLS(LS_FILES_KEY);
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('files')) {
      return lsFiles.map(normalizeRecordBlobAndMime);
    }

    return new Promise((resolve) => {
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const req = store.getAll();
      req.onsuccess = () => {
        const idbFiles = req.result || [];
        const map = new Map();
        lsFiles.forEach(f => map.set(f.id, normalizeRecordBlobAndMime(f)));
        idbFiles.forEach(f => {
          const prev = map.get(f.id);
          const merged = normalizeRecordBlobAndMime({
            ...prev,
            ...f,
            blob: f.blob || prev?.blob || null
          });
          map.set(f.id, merged);
        });
        resolve(Array.from(map.values()));
      };
      req.onerror = () => resolve(lsFiles.map(normalizeRecordBlobAndMime));
    });
  } catch {
    return lsFiles.map(normalizeRecordBlobAndMime);
  }
}

export async function saveFile(record) {
  const normalized = normalizeRecordBlobAndMime(record);
  putLS(LS_FILES_KEY, normalized);
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('files')) return null;

    return new Promise((resolve) => {
      let isResolved = false;
      const done = (val) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          resolve(val);
        }
      };

      const timer = setTimeout(() => done(null), 15000);

      const tx = db.transaction('files', 'readwrite');
      tx.onabort = () => done(null);
      tx.onerror = () => done(null);

      const store = tx.objectStore('files');
      const getReq = store.get(normalized.id);

      getReq.onsuccess = () => {
        const existing = getReq.result;
        const recordToSave = {
          ...existing,
          ...normalized,
          blob: normalized.blob || existing?.blob || null
        };
        const putReq = store.put(recordToSave);
        putReq.onsuccess = () => done(putReq.result);
        putReq.onerror = () => done(null);
      };

      getReq.onerror = () => {
        const putReq = store.put(normalized);
        putReq.onsuccess = () => done(putReq.result);
        putReq.onerror = () => done(null);
      };
    });
  } catch {
    return null;
  }
}

export async function deleteFile(id) {
  deleteLS(LS_FILES_KEY, id);
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('files')) return;
    return new Promise((resolve) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

// ── Folders Operations ────────────────────────────────────────────────────────
export async function getAllFolders() {
  const lsFolders = getLS(LS_FOLDERS_KEY);
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('folders')) return lsFolders;

    return new Promise((resolve) => {
      const tx = db.transaction('folders', 'readonly');
      const store = tx.objectStore('folders');
      const req = store.getAll();
      req.onsuccess = () => {
        const idbFolders = req.result || [];
        const map = new Map();
        lsFolders.forEach(f => map.set(f.id, f));
        idbFolders.forEach(f => map.set(f.id, { ...map.get(f.id), ...f }));
        resolve(Array.from(map.values()));
      };
      req.onerror = () => resolve(lsFolders);
    });
  } catch {
    return lsFolders;
  }
}

export async function saveFolder(record) {
  putLS(LS_FOLDERS_KEY, record);
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('folders')) return;
    return new Promise((resolve) => {
      const tx = db.transaction('folders', 'readwrite');
      const store = tx.objectStore('folders');
      const req = store.put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function deleteFolder(id) {
  deleteLS(LS_FOLDERS_KEY, id);
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('folders')) return;
    return new Promise((resolve) => {
      const tx = db.transaction('folders', 'readwrite');
      tx.objectStore('folders').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

// ── Activity Logs ─────────────────────────────────────────────────────────────
export async function getActivityLogsDB() {
  const lsLogs = getLS(LS_LOGS_KEY);
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('activity_logs')) return lsLogs;

    return new Promise((resolve) => {
      const tx = db.transaction('activity_logs', 'readonly');
      const store = tx.objectStore('activity_logs');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || lsLogs);
      req.onerror = () => resolve(lsLogs);
    });
  } catch {
    return lsLogs;
  }
}

export async function logActivityDB(entry) {
  putLS(LS_LOGS_KEY, entry);
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('activity_logs')) return;
    return new Promise((resolve) => {
      const tx = db.transaction('activity_logs', 'readwrite');
      const store = tx.objectStore('activity_logs');
      const req = store.put(entry);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// ── Converted Blobs Store (Persisted in IndexedDB for instant session reload) ─
export async function saveConvertedBlob(id, file) {
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('converted_blobs')) return;
    return new Promise((resolve) => {
      const tx = db.transaction('converted_blobs', 'readwrite');
      const store = tx.objectStore('converted_blobs');
      const req = store.put({ id, file, savedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    return null;
  }
}

export async function getConvertedBlob(id) {
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('converted_blobs')) return null;
    return new Promise((resolve) => {
      const tx = db.transaction('converted_blobs', 'readonly');
      const store = tx.objectStore('converted_blobs');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result?.file || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAllConvertedBlobs() {
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('converted_blobs')) return [];
    return new Promise((resolve) => {
      const tx = db.transaction('converted_blobs', 'readonly');
      const store = tx.objectStore('converted_blobs');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function deleteConvertedBlob(id) {
  try {
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains('converted_blobs')) return;
    return new Promise((resolve) => {
      const tx = db.transaction('converted_blobs', 'readwrite');
      tx.objectStore('converted_blobs').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    return null;
  }
}

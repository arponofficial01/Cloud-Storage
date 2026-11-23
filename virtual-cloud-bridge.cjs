// StorageBank Native Windows Cloud Drive Engine (v4.0 — Zero-Freeze WebDAV + Full Read/Write/Rename/Delete)
// - Registers directly under "This PC > Devices and drives" (identical architecture to TeraBox)
// - Displays custom Drive Name, custom 64x64 StorageBank Cloud Logo .ICO, and exact Web Storage Available
// - Instant non-blocking PUT/MKCOL/MOVE/COPY/DELETE with proper 404/Lock-Token compliance so Windows Explorer NEVER freezes

const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PORT = 8080;
const BOT_TOKEN = process.env.VITE_TELEGRAM_BOT_TOKEN || '9290698563:AAGlJ58lmtHHWY-lbigU3jlHIcGNYyPUP-g';
const CHAT_ID = process.env.VITE_TELEGRAM_CHAT_ID || '-1003907976847';

let vaultState = {
  driveName: 'StorageBank Cloud',
  driveLetter: 'Z:',
  planName: 'Free Tier (512 GB)',
  quotaBytes: 512 * 1024 * 1024 * 1024,
  usedBytes: 0,
  folders: [],
  files: [],
  mountedDrives: []
};

// RAM cache for instant Windows Explorer read/write (0 B local C: drive usage)
const memoryBlobCache = new Map();
const MAX_CACHE_BYTES = 128 * 1024 * 1024;
let currentCacheBytes = 0;
const pendingExplorerEvents = [];
let lastExplorerMutationAt = 0;

function cacheBufferInRam(key, buf) {
  if (!Buffer.isBuffer(buf) || buf.length > 64 * 1024 * 1024) return;
  const k = String(key || '').toLowerCase();
  const prev = memoryBlobCache.get(k);
  if (prev) currentCacheBytes = Math.max(0, currentCacheBytes - prev.length);
  if (currentCacheBytes + buf.length > MAX_CACHE_BYTES) {
    memoryBlobCache.clear();
    currentCacheBytes = 0;
  }
  memoryBlobCache.set(k, buf);
  currentCacheBytes += buf.length;
}

function formatBytesClean(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return (val >= 100 ? val.toFixed(0) : val.toFixed(1).replace(/\.0$/, '')) + ' ' + sizes[i];
}

function inferMimeFromName(fileName = '') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    md: 'text/markdown',
    html: 'text/html',
    json: 'application/json',
    js: 'text/javascript',
    zip: 'application/zip'
  };
  return map[ext] || 'application/octet-stream';
}

function isSystemJunkFile(name = '') {
  const lower = String(name || '').toLowerCase();
  return (
    lower === 'desktop.ini' ||
    lower === 'thumbs.db' ||
    lower === 'folder.jpg' ||
    lower === 'folder.gif' ||
    lower === 'autorun.inf' ||
    lower.startsWith('._') ||
    lower.startsWith('~$')
  );
}

/**
 * Generate a crisp 64x64 32-bit RGBA Windows .ICO binary with anti-aliased StorageBank Cloud Vault emblem
 */
function generateStorageBankIcoBuffer() {
  const width = 64;
  const height = 64;
  const pixelDataSize = width * height * 4;
  const maskSize = (width * height) / 8;
  const dibHeaderSize = 40;
  const imageSize = dibHeaderSize + pixelDataSize + maskSize;

  const buf = Buffer.alloc(6 + 16 + imageSize, 0);

  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(1, 4);

  buf.writeUInt8(width, 6);
  buf.writeUInt8(height, 7);
  buf.writeUInt8(0, 8);
  buf.writeUInt8(0, 9);
  buf.writeUInt16LE(1, 10);
  buf.writeUInt16LE(32, 12);
  buf.writeUInt32LE(imageSize, 14);
  buf.writeUInt32LE(22, 18);

  const dibOffset = 22;
  buf.writeUInt32LE(dibHeaderSize, dibOffset);
  buf.writeInt32LE(width, dibOffset + 4);
  buf.writeInt32LE(height * 2, dibOffset + 8);
  buf.writeUInt16LE(1, dibOffset + 12);
  buf.writeUInt16LE(32, dibOffset + 14);
  buf.writeUInt32LE(0, dibOffset + 16);
  buf.writeUInt32LE(pixelDataSize + maskSize, dibOffset + 20);

  const pxOffset = dibOffset + dibHeaderSize;

  for (let y = 0; y < height; y++) {
    const py = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const idx = pxOffset + (y * width + x) * 4;
      const dx = Math.max(0, Math.abs(x - 31.5) - 15.5);
      const dy = Math.max(0, Math.abs(py - 31.5) - 15.5);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 13.0) {
        buf.writeUInt32LE(0x00000000, idx);
        continue;
      }

      const edgeAlpha = dist > 11.8 ? Math.max(0, Math.min(1, 13.0 - dist)) : 1.0;
      const cLeft = Math.hypot(x - 23.5, py - 36.5) <= 8.8;
      const cTop = Math.hypot(x - 32.0, py - 28.5) <= 10.8;
      const cRight = Math.hypot(x - 41.5, py - 36.5) <= 7.8;
      const cBase = x >= 23 && x <= 42 && py >= 31 && py <= 44.3;
      const isCloud = cLeft || cTop || cRight || cBase;

      if (isCloud) {
        buf[idx] = 255;
        buf[idx + 1] = 255;
        buf[idx + 2] = 255;
        buf[idx + 3] = Math.round(255 * edgeAlpha);
      } else {
        const grad = (x + py) / 128;
        buf[idx] = Math.round(245 - grad * 38);
        buf[idx + 1] = Math.round(108 - grad * 48);
        buf[idx + 2] = Math.round(102 - grad * 32);
        buf[idx + 3] = Math.round(255 * edgeAlpha);
      }
    }
  }

  return buf;
}

const STORAGEBANK_ICO_BUFFER = generateStorageBankIcoBuffer();

function ensurePersistentLogoIco() {
  const appData = process.env.APPDATA || os.tmpdir();
  const dir = path.join(appData, 'StorageBank');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const icoPath = path.join(dir, 'storagebank_logo.ico');
    fs.writeFileSync(icoPath, STORAGEBANK_ICO_BUFFER);
    return icoPath;
  } catch {
    const fallback = path.join(os.tmpdir(), 'storagebank_logo.ico');
    try { fs.writeFileSync(fallback, STORAGEBANK_ICO_BUFFER); } catch {}
    return fallback;
  }
}

const PERSISTENT_ICO_PATH = ensurePersistentLogoIco();

function getClsidForLetter(letter) {
  const clean = (letter || 'Z').replace(':', '').trim().toUpperCase();
  const hexCode = clean.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  return `{B9E83A14-46C1-4D56-8A33-87E7BC8528${hexCode}}`;
}

function uploadSingleChunkToTelegram(filename, buffer, caption = '') {
  return new Promise((resolve, reject) => {
    const boundary = '----StorageBankCloud' + Date.now().toString(16) + Math.random().toString(16).slice(2, 6);
    const safeName = filename || 'vault_file.bin';

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
      `${CHAT_ID}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="caption"\r\n\r\n` +
      `${caption || `StorageBank Cloud Drive: ${safeName}`}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="document"; filename="${safeName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
      'utf-8'
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Buffer.concat([header, buffer, footer]);

    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendDocument`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            if (!json.ok) return reject(new Error(json.description || 'Upload error'));
            const msg = json.result;
            const doc = msg.document || msg.video || msg.audio || (msg.photo && msg.photo[msg.photo.length - 1]);
            resolve({
              fileId: doc ? doc.file_id : null,
              messageId: msg.message_id
            });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function uploadBufferToTelegramCloud(filename, buffer) {
  const CHUNK_SIZE = 19 * 1024 * 1024;
  if (buffer.length <= CHUNK_SIZE) {
    const res = await uploadSingleChunkToTelegram(filename, buffer);
    return { ...res, isChunked: false, parts: null };
  }

  const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
  const parts = [];
  for (let i = 0; i < totalChunks; i++) {
    const slice = buffer.subarray(i * CHUNK_SIZE, Math.min(buffer.length, (i + 1) * CHUNK_SIZE));
    const partName = `${filename}.part_${String(i + 1).padStart(3, '0')}_of_${String(totalChunks).padStart(3, '0')}`;
    const res = await uploadSingleChunkToTelegram(partName, slice, `StorageBank Multi-Part (${i + 1}/${totalChunks}): ${filename}`);
    parts.push({ partIndex: i, fileId: res.fileId, messageId: res.messageId, size: slice.length });
  }
  return {
    fileId: parts[0]?.fileId || null,
    messageId: parts[0]?.messageId || null,
    isChunked: true,
    parts
  };
}

function fetchBufferFromTelegramCloud(fileId) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          if (!data.ok || !data.result?.file_path) {
            return reject(new Error('Could not resolve cloud file path'));
          }
          const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`;
          https.get(downloadUrl, (fileRes) => {
            const fileChunks = [];
            fileRes.on('data', c => fileChunks.push(c));
            fileRes.on('end', () => resolve(Buffer.concat(fileChunks)));
            fileRes.on('error', reject);
          }).on('error', reject);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Walk a relative WebDAV path (e.g. "Projects/2026/spec.pdf") through vaultState.folders & vaultState.files
 */
function resolveVaultPath(relativePath) {
  const clean = String(relativePath || '').replace(/^\/+|\/+$/g, '');
  if (!clean) {
    return { type: 'root', parentId: null, folder: null, file: null, parentFolder: null, leafName: '' };
  }

  const segments = clean.split('/').filter(Boolean);
  let currParentId = null;
  let parentFolder = null;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i].toLowerCase();
    const match = vaultState.folders.find(f => {
      if (f.inTrash) return false;
      const pId = f.parentId && f.parentId !== 'null' ? String(f.parentId) : null;
      return pId === currParentId && f.name.toLowerCase() === seg;
    });
    if (!match) {
      return { type: 'missing_parent', parentId: null, folder: null, file: null, parentFolder: null, leafName: segments[segments.length - 1] };
    }
    parentFolder = match;
    currParentId = String(match.id);
  }

  const leafName = segments[segments.length - 1];
  const leafLower = leafName.toLowerCase();

  const matchingFolder = vaultState.folders.find(f => {
    if (f.inTrash) return false;
    const pId = f.parentId && f.parentId !== 'null' ? String(f.parentId) : null;
    return pId === currParentId && f.name.toLowerCase() === leafLower;
  });

  if (matchingFolder) {
    return { type: 'folder', parentId: currParentId, folder: matchingFolder, file: null, parentFolder, leafName };
  }

  const matchingFile = vaultState.files.find(f => {
    if (f.inTrash) return false;
    const fId = f.folderId && f.folderId !== 'null' ? String(f.folderId) : null;
    return fId === currParentId && f.name.toLowerCase() === leafLower;
  });

  if (matchingFile) {
    return { type: 'file', parentId: currParentId, folder: null, file: matchingFile, parentFolder, leafName };
  }

  return { type: 'not_found', parentId: currParentId, folder: null, file: null, parentFolder, leafName };
}

function buildHrefForPath(relPath, isCollection = false) {
  const clean = String(relPath || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return '/vault/';
  const encoded = clean.split('/').map(s => encodeURIComponent(s)).join('/');
  return isCollection ? `/vault/${encoded}/` : `/vault/${encoded}`;
}

function executeWindowsMount({ driveLetter, driveName, quotaBytes, usedBytes, planName, openExplorer = true }, callback) {
  const cleanLetter = (driveLetter || 'Z:').replace(':', '').trim().toUpperCase();
  const fullLetter = `${cleanLetter}:`;
  const safeName = (driveName || 'StorageBank Cloud').replace(/["'`]/g, '').trim();

  if (quotaBytes) vaultState.quotaBytes = Number(quotaBytes);
  if (usedBytes !== undefined) vaultState.usedBytes = Number(usedBytes);
  if (planName) vaultState.planName = planName;
  vaultState.driveName = safeName;
  vaultState.driveLetter = fullLetter;

  const icoPath = ensurePersistentLogoIco();
  const clsid = getClsidForLetter(cleanLetter);
  const freeBytes = Math.max(0, vaultState.quotaBytes - vaultState.usedBytes);
  const statusSubtitle = `${formatBytesClean(freeBytes)} free of ${formatBytesClean(vaultState.quotaBytes)}`;
  const displayTitle = `${safeName} (${fullLetter})`;
  const uncTarget = `\\\\127.0.0.1@${PORT}\\DavWWWRoot\\vault`;

  const psCommands = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `cmd /c "net use ${fullLetter} /delete /y >nul 2>&1"`,
    `cmd /c "subst ${fullLetter} /d >nul 2>&1"`,
    `Remove-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\${cleanLetter}" -Recurse -Force -ErrorAction SilentlyContinue`,
    ...(clsid !== '{B9E83A14-46C1-4D56-8A33-87E7BC852899}'
      ? [
          `Remove-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\{B9E83A14-46C1-4D56-8A33-87E7BC852899}" -Recurse -Force -ErrorAction SilentlyContinue`,
          `Remove-Item -Path "HKCU:\\Software\\Classes\\CLSID\\{B9E83A14-46C1-4D56-8A33-87E7BC852899}" -Recurse -Force -ErrorAction SilentlyContinue`
        ]
      : []),
    `Start-Service -Name WebClient -ErrorAction SilentlyContinue`,
    `$clsidPath = "HKCU:\\Software\\Classes\\CLSID\\${clsid}"`,
    `New-Item -Path $clsidPath -Force | Out-Null`,
    `Set-ItemProperty -Path $clsidPath -Name "(default)" -Value "${displayTitle}" -Force`,
    `Set-ItemProperty -Path $clsidPath -Name "LocalizedString" -Value "${displayTitle}" -Force`,
    `Set-ItemProperty -Path $clsidPath -Name "TileInfo" -Value "prop:System.ItemAuthors" -Force`,
    `Set-ItemProperty -Path $clsidPath -Name "System.ItemAuthors" -Value "${statusSubtitle}" -Force`,
    `Set-ItemProperty -Path $clsidPath -Name "InfoTip" -Value "${displayTitle} • ${statusSubtitle}" -Force`,
    `New-Item -Path "$clsidPath\\DefaultIcon" -Force | Out-Null`,
    `Set-ItemProperty -Path "$clsidPath\\DefaultIcon" -Name "(default)" -Value "${icoPath}" -Force`,
    `New-Item -Path "$clsidPath\\InprocServer32" -Force | Out-Null`,
    `Set-ItemProperty -Path "$clsidPath\\InprocServer32" -Name "(default)" -Value "$env:SystemRoot\\system32\\shdocvw.dll" -Force`,
    `Set-ItemProperty -Path "$clsidPath\\InprocServer32" -Name "ThreadingModel" -Value "Apartment" -Force`,
    `New-Item -Path "$clsidPath\\Instance" -Force | Out-Null`,
    `Set-ItemProperty -Path "$clsidPath\\Instance" -Name "CLSID" -Value "{0E5AAE11-A475-4c5b-AB00-C66DE400274E}" -Force`,
    `New-Item -Path "$clsidPath\\Instance\\InitPropertyBag" -Force | Out-Null`,
    `Set-ItemProperty -Path "$clsidPath\\Instance\\InitPropertyBag" -Name "TargetFolderPath" -Value "${uncTarget}" -Force`,
    `New-Item -Path "$clsidPath\\Shell\\Open\\Command" -Force | Out-Null`,
    `Set-ItemProperty -Path "$clsidPath\\Shell\\Open\\Command" -Name "(default)" -Value "explorer.exe \`"${uncTarget}\`"" -Force`,
    `New-Item -Path "$clsidPath\\ShellFolder" -Force | Out-Null`,
    `Set-ItemProperty -Path "$clsidPath\\ShellFolder" -Name "Attributes" -Value ([int]0x48800108) -Type DWord -Force`,
    `Set-ItemProperty -Path "$clsidPath\\ShellFolder" -Name "PinToNameSpaceTree" -Value "" -Force`,
    `Set-ItemProperty -Path "$clsidPath\\ShellFolder" -Name "QueryForOverlay" -Value "" -Force`,
    `Set-ItemProperty -Path "$clsidPath\\ShellFolder" -Name "wantsFORPARSING" -Value "" -Force`,
    `$nsPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\${clsid}"`,
    `New-Item -Path $nsPath -Force | Out-Null`,
    `Set-ItemProperty -Path $nsPath -Name "(default)" -Value "${displayTitle}" -Force`,
    ...(openExplorer ? [`Start-Process explorer.exe -ArgumentList "shell:MyComputerFolder"`] : [])
  ].join('; ');

  exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommands.replace(/"/g, '\\"')}"`, (err) => {
    const driveRecord = {
      id: `drive-${cleanLetter}`,
      clsid,
      name: safeName,
      driveLetter: fullLetter,
      explorerLabel: displayTitle,
      statusSubtitle,
      quotaBytes: vaultState.quotaBytes,
      usedBytes: vaultState.usedBytes,
      syncedFilesCount: vaultState.files.length,
      mountedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: statusSubtitle
    };
    vaultState.mountedDrives = [
      driveRecord,
      ...vaultState.mountedDrives.filter(d => d.driveLetter !== fullLetter)
    ];
    if (callback) callback(err, driveRecord);
  });
}

let lastSyncedQuotaSig = '';
function updateMountedDrivesStorageSubtitle() {
  if (vaultState.mountedDrives.length === 0) return;
  const freeBytes = Math.max(0, vaultState.quotaBytes - vaultState.usedBytes);
  const statusSubtitle = `${formatBytesClean(freeBytes)} free of ${formatBytesClean(vaultState.quotaBytes)}`;
  const sig = `${statusSubtitle}_${vaultState.mountedDrives.map(d => d.driveLetter).join(',')}`;
  if (sig === lastSyncedQuotaSig) return;
  lastSyncedQuotaSig = sig;

  const cmds = vaultState.mountedDrives.map(d => {
    const clsid = d.clsid || getClsidForLetter(d.driveLetter);
    return `Set-ItemProperty -Path "HKCU:\\Software\\Classes\\CLSID\\${clsid}" -Name "System.ItemAuthors" -Value "${statusSubtitle}" -Force -ErrorAction SilentlyContinue`;
  }).join('; ');

  if (cmds) {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmds.replace(/"/g, '\\"')}"`, () => {});
  }
}

function executeWindowsUnmount(driveLetter, callback) {
  const cleanLetter = (driveLetter || 'Z:').replace(':', '').trim().toUpperCase();
  const fullLetter = `${cleanLetter}:`;
  const clsid = getClsidForLetter(cleanLetter);
  const psCommands = [
    `cmd /c "net use ${fullLetter} /delete /y >nul 2>&1"`,
    `cmd /c "subst ${fullLetter} /d >nul 2>&1"`,
    `Remove-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\${cleanLetter}" -Recurse -Force -ErrorAction SilentlyContinue`,
    `Remove-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\${clsid}" -Recurse -Force -ErrorAction SilentlyContinue`,
    `Remove-Item -Path "HKCU:\\Software\\Classes\\CLSID\\${clsid}" -Recurse -Force -ErrorAction SilentlyContinue`
  ].join('; ');

  exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommands.replace(/"/g, '\\"')}"`, () => {
    vaultState.mountedDrives = vaultState.mountedDrives.filter(d => d.driveLetter !== fullLetter);
    if (callback) callback();
  });
}

const escapeXml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const server = http.createServer(async (req, res) => {
  const method = req.method;
  const rawUrl = req.url || '/';
  let cleanUrl = '/';
  try {
    cleanUrl = decodeURIComponent(rawUrl.split('?')[0]);
  } catch {
    cleanUrl = rawUrl.split('?')[0];
  }

  res.setHeader('Server', 'StorageBank-CloudDrive/4.0');
  res.setHeader('DAV', '1, 2');
  res.setHeader('MS-Author-Via', 'DAV');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
  res.setHeader('Access-Control-Allow-Headers', 'Depth, Content-Type, Authorization, If-Modified-Since, If-None-Match, Overwrite, Destination, Lock-Token, If, Timeout, Translate, X-File-Name');

  if (method === 'OPTIONS') {
    res.setHeader('Allow', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
    res.writeHead(200);
    return res.end();
  }

  if (cleanUrl === '/logo.ico' || cleanUrl === '/vault/favicon.ico') {
    res.setHeader('Content-Type', 'image/x-icon');
    res.setHeader('Content-Length', STORAGEBANK_ICO_BUFFER.length);
    res.writeHead(200);
    return res.end(STORAGEBANK_ICO_BUFFER);
  }

  // ── LOCAL BRIDGE REST API FOR WEB APP ───────────────────────────────────────
  if (cleanUrl.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (method === 'GET' && cleanUrl === '/api/status') {
      const events = pendingExplorerEvents.splice(0, pendingExplorerEvents.length);
      res.writeHead(200);
      return res.end(JSON.stringify({
        online: true,
        port: PORT,
        endpoint: `http://127.0.0.1:${PORT}/vault`,
        driveName: vaultState.driveName,
        driveLetter: vaultState.driveLetter,
        planName: vaultState.planName,
        quotaBytes: vaultState.quotaBytes,
        usedBytes: vaultState.usedBytes,
        fileCount: vaultState.files.length,
        folderCount: vaultState.folders.length,
        mountedDrives: vaultState.mountedDrives,
        explorerEvents: events
      }));
    }

    if (method === 'POST' && cleanUrl === '/api/sync') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          // Do NOT overwrite vaultState while Windows Explorer has pending undrained mutations (< 5s ago)
          const hasPending = pendingExplorerEvents.length > 0 || (Date.now() - lastExplorerMutationAt < 5000);
          if (!hasPending) {
            if (Array.isArray(payload.files)) vaultState.files = payload.files;
            if (Array.isArray(payload.folders)) vaultState.folders = payload.folders;
          }
          if (payload.quotaBytes) vaultState.quotaBytes = Number(payload.quotaBytes);
          if (!hasPending && payload.usedBytes !== undefined) vaultState.usedBytes = Number(payload.usedBytes);
          if (payload.planName) vaultState.planName = payload.planName;

          updateMountedDrivesStorageSubtitle();

          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
            skippedOverwrite: hasPending,
            syncedFiles: vaultState.files.length,
            syncedFolders: vaultState.folders.length,
            quotaBytes: vaultState.quotaBytes,
            usedBytes: vaultState.usedBytes
          }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (method === 'POST' && cleanUrl === '/api/cache-file') {
      const fileNameHeader = req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : null;
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (fileNameHeader) {
          cacheBufferInRam(fileNameHeader.toLowerCase(), buf);
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, cachedBytes: buf.length }));
      });
      return;
    }

    if (method === 'GET' && cleanUrl === '/api/cached-file') {
      const params = new URLSearchParams(rawUrl.split('?')[1] || '');
      const key = (params.get('id') || params.get('name') || '').toLowerCase();
      const buf = memoryBlobCache.get(key);
      if (!buf) {
        res.writeHead(404);
        return res.end(JSON.stringify({ ok: false, error: 'Not cached' }));
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', buf.length);
      res.writeHead(200);
      return res.end(buf);
    }

    if (method === 'POST' && cleanUrl === '/api/mount') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          executeWindowsMount(body, (err, driveRecord) => {
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, drive: driveRecord, warning: err ? err.message : null }));
          });
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (method === 'POST' && cleanUrl === '/api/unmount') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          executeWindowsUnmount(body.driveLetter, () => {
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          });
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (method === 'GET' && cleanUrl === '/api/telegram-file') {
      const params = new URLSearchParams(rawUrl.split('?')[1] || '');
      const fileId = params.get('fileId');
      const fileName = params.get('name') || '';

      if (!fileId) {
        res.writeHead(400);
        return res.end(JSON.stringify({ ok: false, error: 'Missing fileId' }));
      }

      try {
        let buf = fileName ? memoryBlobCache.get(fileName.toLowerCase()) : null;
        if (!buf) {
          buf = await fetchBufferFromTelegramCloud(fileId);
          if (fileName) cacheBufferInRam(fileName.toLowerCase(), buf);
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', buf.length);
        res.writeHead(200);
        return res.end(buf);
      } catch (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }
  }

  // ── WEBDAV SERVER FOR WINDOWS EXPLORER (RFC 4918 Compliant) ─────────────────
  const relativePath = cleanUrl.replace(/^\/vault\/?/, '').replace(/^\/+|\/+$/g, '');
  const resolved = resolveVaultPath(relativePath);

  if (method === 'PROPFIND') {
    // Drain request body cleanly so keep-alive sockets never stall Windows WebClient
    req.resume();

    // Handle server root "/" cleanly for Windows WebClient (mrxdav.sys) discovery handshake
    if (cleanUrl === '/' || cleanUrl === '') {
      const depthRoot = req.headers['depth'] || '1';
      const availableBytes = Math.max(0, vaultState.quotaBytes - vaultState.usedBytes);
      const nowUtc = new Date().toUTCString();
      res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
      res.writeHead(207, 'Multi-Status');
      let rootXml = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>StorageBank</D:displayname>
        <D:getlastmodified>${nowUtc}</D:getlastmodified>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:quota-available-bytes>${availableBytes}</D:quota-available-bytes>
        <D:quota-used-bytes>${vaultState.usedBytes}</D:quota-used-bytes>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
      if (depthRoot !== '0') {
        rootXml += `
  <D:response>
    <D:href>/vault/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(vaultState.driveName)}</D:displayname>
        <D:getlastmodified>${nowUtc}</D:getlastmodified>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
      }
      rootXml += `\n</D:multistatus>`;
      return res.end(rootXml);
    }

    if (resolved.type === 'not_found' || resolved.type === 'missing_parent') {
      res.writeHead(404);
      return res.end('Not Found');
    }

    const depth = req.headers['depth'] || '1';
    const availableBytes = Math.max(0, vaultState.quotaBytes - vaultState.usedBytes);

    res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
    res.writeHead(207, 'Multi-Status');

    if (resolved.type === 'file') {
      const f = resolved.file;
      const mtime = new Date(f.updatedAt || f.createdAt || Date.now()).toUTCString();
      const ctime = new Date(f.createdAt || Date.now()).toISOString();
      const href = buildHrefForPath(relativePath, false);
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${href}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(f.name)}</D:displayname>
        <D:getcontentlength>${f.size || 0}</D:getcontentlength>
        <D:getcontenttype>${escapeXml(f.type || inferMimeFromName(f.name))}</D:getcontenttype>
        <D:creationdate>${ctime}</D:creationdate>
        <D:getlastmodified>${mtime}</D:getlastmodified>
        <D:getetag>"${escapeXml(f.id)}-${f.size || 0}"</D:getetag>
        <D:resourcetype/>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
      return res.end(xml);
    }

    // Root or Folder collection
    const activeParentId = resolved.type === 'folder' ? String(resolved.folder.id) : null;
    const baseHref = buildHrefForPath(relativePath, true);
    const displayTitle = resolved.type === 'folder' ? resolved.folder.name : vaultState.driveName;
    const dirMtime = new Date((resolved.folder && (resolved.folder.updatedAt || resolved.folder.createdAt)) || Date.now()).toUTCString();

    let xml = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${baseHref}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(displayTitle)}</D:displayname>
        <D:getlastmodified>${dirMtime}</D:getlastmodified>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:quota-available-bytes>${availableBytes}</D:quota-available-bytes>
        <D:quota-used-bytes>${vaultState.usedBytes}</D:quota-used-bytes>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;

    if (depth !== '0') {
      const childFolders = vaultState.folders.filter(f => {
        if (f.inTrash) return false;
        const pId = f.parentId && f.parentId !== 'null' ? String(f.parentId) : null;
        return pId === activeParentId;
      });

      childFolders.forEach(fold => {
        const mtime = new Date(fold.updatedAt || fold.createdAt || Date.now()).toUTCString();
        const ctime = new Date(fold.createdAt || Date.now()).toISOString();
        xml += `
  <D:response>
    <D:href>${baseHref}${encodeURIComponent(fold.name)}/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(fold.name)}</D:displayname>
        <D:creationdate>${ctime}</D:creationdate>
        <D:getlastmodified>${mtime}</D:getlastmodified>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
      });

      const childFiles = vaultState.files.filter(f => {
        if (f.inTrash) return false;
        const fId = f.folderId && f.folderId !== 'null' ? String(f.folderId) : null;
        return fId === activeParentId;
      });

      childFiles.forEach(file => {
        const mtime = new Date(file.updatedAt || file.createdAt || Date.now()).toUTCString();
        const ctime = new Date(file.createdAt || Date.now()).toISOString();
        xml += `
  <D:response>
    <D:href>${baseHref}${encodeURIComponent(file.name)}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(file.name)}</D:displayname>
        <D:getcontentlength>${file.size || 0}</D:getcontentlength>
        <D:getcontenttype>${escapeXml(file.type || inferMimeFromName(file.name))}</D:getcontenttype>
        <D:creationdate>${ctime}</D:creationdate>
        <D:getlastmodified>${mtime}</D:getlastmodified>
        <D:getetag>"${escapeXml(file.id)}-${file.size || 0}"</D:getetag>
        <D:resourcetype/>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
      });
    }

    xml += `\n</D:multistatus>`;
    return res.end(xml);
  }

  if (method === 'GET' || method === 'HEAD') {
    if (!relativePath) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      if (method === 'HEAD') return res.end();
      const freeBytes = Math.max(0, vaultState.quotaBytes - vaultState.usedBytes);
      return res.end(`<!DOCTYPE html>
<html><head><title>${escapeXml(vaultState.driveName)}</title></head>
<body style="font-family:-apple-system,sans-serif;background:#09090b;color:#ededed;padding:36px;">
  <div style="max-width:640px;margin:0 auto;background:#18181b;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;">
    <h2 style="margin:0 0 8px 0;color:#6366f1;">${escapeXml(vaultState.driveName)} (${escapeXml(vaultState.driveLetter)})</h2>
    <p style="margin:0;color:#a1a1aa;font-size:0.9rem;">${formatBytesClean(freeBytes)} free of ${formatBytesClean(vaultState.quotaBytes)} &bull; ${vaultState.files.length} files across ${vaultState.folders.length} folders</p>
  </div>
</body></html>`);
    }

    if (resolved.type !== 'file') {
      res.writeHead(404);
      return res.end('Not found');
    }

    const targetFile = resolved.file;
    try {
      let buf = memoryBlobCache.get(targetFile.id.toLowerCase()) || memoryBlobCache.get(targetFile.name.toLowerCase());
      if (!buf && targetFile.isChunked && Array.isArray(targetFile.parts) && targetFile.parts.length > 0) {
        const sortedParts = [...targetFile.parts].sort((a, b) => (a.partIndex ?? 0) - (b.partIndex ?? 0));
        const partBuffers = [];
        for (const p of sortedParts) {
          if (p.fileId) {
            partBuffers.push(await fetchBufferFromTelegramCloud(p.fileId));
          }
        }
        buf = Buffer.concat(partBuffers);
        cacheBufferInRam(targetFile.id.toLowerCase(), buf);
        cacheBufferInRam(targetFile.name.toLowerCase(), buf);
      } else if (!buf && targetFile.telegramFileId) {
        buf = await fetchBufferFromTelegramCloud(targetFile.telegramFileId);
        cacheBufferInRam(targetFile.id.toLowerCase(), buf);
        cacheBufferInRam(targetFile.name.toLowerCase(), buf);
      }
      if (!buf) {
        buf = Buffer.alloc(0);
      }

      res.setHeader('Content-Type', targetFile.type || inferMimeFromName(targetFile.name));
      res.setHeader('Content-Length', buf.length);
      res.setHeader('ETag', `"${targetFile.id}-${buf.length}"`);
      res.writeHead(200);
      if (method === 'HEAD') return res.end();
      return res.end(buf);
    } catch (err) {
      res.writeHead(500);
      return res.end(err.message);
    }
  }

  // INSTANT NON-BLOCKING PUT (Responds in <5ms so Windows Explorer NEVER freezes during paste/create!)
  if (method === 'PUT') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const baseName = resolved.leafName;

      // Quietly accept Windows system junk files without polluting Cloud Vault
      if (!baseName || isSystemJunkFile(baseName)) {
        res.writeHead(201);
        return res.end();
      }

      if (resolved.type === 'missing_parent') {
        res.writeHead(409);
        return res.end('Conflict: parent folder missing');
      }

      lastExplorerMutationAt = Date.now();
      const now = new Date().toISOString();
      const parentId = resolved.parentId || null;
      const mimeType = inferMimeFromName(baseName);

      const existingIdx = vaultState.files.findIndex(f => {
        if (f.inTrash) return false;
        const fId = f.folderId && f.folderId !== 'null' ? String(f.folderId) : null;
        return fId === parentId && f.name.toLowerCase() === baseName.toLowerCase();
      });

      const isUpdate = existingIdx >= 0;
      const fileId = isUpdate
        ? vaultState.files[existingIdx].id
        : `file-pc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      cacheBufferInRam(fileId.toLowerCase(), buffer);
      cacheBufferInRam(baseName.toLowerCase(), buffer);

      const fileRecord = {
        id: fileId,
        name: baseName,
        size: buffer.length,
        type: mimeType,
        folderId: parentId,
        storageProvider: 'cloud',
        telegramFileId: isUpdate ? vaultState.files[existingIdx].telegramFileId || null : null,
        telegramMessageId: isUpdate ? vaultState.files[existingIdx].telegramMessageId || null : null,
        parts: isUpdate ? vaultState.files[existingIdx].parts || null : null,
        isChunked: isUpdate ? Boolean(vaultState.files[existingIdx].isChunked) : false,
        inTrash: false,
        starred: false,
        createdAt: isUpdate ? vaultState.files[existingIdx].createdAt : now,
        updatedAt: now
      };

      if (isUpdate) {
        vaultState.files[existingIdx] = { ...vaultState.files[existingIdx], ...fileRecord };
      } else {
        vaultState.files.unshift(fileRecord);
      }

      vaultState.usedBytes = vaultState.files.reduce((acc, f) => acc + (f.size || 0), 0);
      updateMountedDrivesStorageSubtitle();

      // Respond IMMEDIATELY to Windows Explorer so copy/paste feels native and instantaneous!
      res.setHeader('ETag', `"${fileId}-${buffer.length}"`);
      res.writeHead(isUpdate ? 204 : 201);
      res.end();

      // Push event to Web App (Web App fetches bytes from /api/cached-file?id=... if needed)
      pendingExplorerEvents.push({ type: 'UPSERT_FILE', file: { ...fileRecord } });

      // Stream binary to Telegram Cloud asynchronously in background (never blocks Explorer!)
      if (buffer.length > 0) {
        uploadBufferToTelegramCloud(baseName, buffer)
          .then((tgInfo) => {
            if (tgInfo && tgInfo.fileId) {
              const idx = vaultState.files.findIndex(f => f.id === fileId);
              if (idx >= 0) {
                vaultState.files[idx] = {
                  ...vaultState.files[idx],
                  storageProvider: 'telegram',
                  telegramFileId: tgInfo.fileId,
                  telegramMessageId: tgInfo.messageId,
                  parts: tgInfo.parts || null,
                  isChunked: Boolean(tgInfo.isChunked)
                };
                pendingExplorerEvents.push({ type: 'UPSERT_FILE', file: { ...vaultState.files[idx] } });
              }
            }
          })
          .catch((err) => console.warn('[Cloud Drive] Async Telegram upload warning:', err.message));
      }
    });
    return;
  }

  // INSTANT MKCOL (Create Folder anywhere, including nested subfolders!)
  if (method === 'MKCOL') {
    req.resume();
    if (resolved.type === 'missing_parent') {
      res.writeHead(409);
      return res.end('Conflict');
    }
    if (resolved.type === 'folder' || resolved.type === 'file') {
      res.writeHead(405);
      return res.end('Method Not Allowed: already exists');
    }

    const folderName = resolved.leafName;
    if (folderName && !isSystemJunkFile(folderName)) {
      lastExplorerMutationAt = Date.now();
      const now = new Date().toISOString();
      const folderRecord = {
        id: `fold-pc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: folderName,
        parentId: resolved.parentId || null,
        category: 'all',
        color: '#6366f1',
        inTrash: false,
        starred: false,
        createdAt: now,
        updatedAt: now
      };
      vaultState.folders.unshift(folderRecord);
      pendingExplorerEvents.push({ type: 'CREATE_FOLDER', folder: folderRecord });
    }
    res.writeHead(201);
    return res.end();
  }

  // FULL RFC 4918 MOVE (Handles Renaming Files/Folders AND Drag-Moving between Folders!)
  if (method === 'MOVE' || method === 'COPY') {
    req.resume();
    const destHeader = req.headers['destination'] || '';
    let destCleanPath = '';
    try {
      const parsedDest = destHeader.startsWith('http')
        ? new URL(destHeader).pathname
        : destHeader;
      destCleanPath = decodeURIComponent(parsedDest).replace(/^\/vault\/?/, '').replace(/^\/+|\/+$/g, '');
    } catch {
      destCleanPath = destHeader.replace(/^.*\/vault\/?/, '').replace(/^\/+|\/+$/g, '');
    }

    if (!destCleanPath || resolved.type === 'not_found' || resolved.type === 'missing_parent') {
      res.writeHead(404);
      return res.end('Not Found');
    }

    const destResolved = resolveVaultPath(destCleanPath);
    if (destResolved.type === 'missing_parent') {
      res.writeHead(409);
      return res.end('Conflict');
    }

    const overwrite = (req.headers['overwrite'] || 'T').toUpperCase() !== 'F';
    if (!overwrite && (destResolved.type === 'file' || destResolved.type === 'folder')) {
      res.writeHead(412);
      return res.end('Precondition Failed');
    }

    lastExplorerMutationAt = Date.now();
    const now = new Date().toISOString();
    const newName = destResolved.leafName;
    const newParentId = destResolved.parentId || null;

    if (resolved.type === 'file') {
      // Remove overwritten destination file if any
      if (destResolved.type === 'file' && destResolved.file.id !== resolved.file.id) {
        vaultState.files = vaultState.files.filter(f => f.id !== destResolved.file.id);
        pendingExplorerEvents.push({ type: 'DELETE_FILE', id: destResolved.file.id });
      }

      if (method === 'MOVE') {
        const oldNameLower = resolved.file.name.toLowerCase();
        const cached = memoryBlobCache.get(resolved.file.id.toLowerCase()) || memoryBlobCache.get(oldNameLower);
        if (cached) cacheBufferInRam(newName.toLowerCase(), cached);

        const updatedFile = {
          ...resolved.file,
          name: newName,
          folderId: newParentId,
          type: inferMimeFromName(newName),
          updatedAt: now
        };
        vaultState.files = vaultState.files.map(f => f.id === resolved.file.id ? updatedFile : f);
        pendingExplorerEvents.push({ type: 'UPSERT_FILE', file: updatedFile });
      } else {
        // COPY file
        const copyId = `file-pc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const cached = memoryBlobCache.get(resolved.file.id.toLowerCase()) || memoryBlobCache.get(resolved.file.name.toLowerCase());
        if (cached) {
          cacheBufferInRam(copyId.toLowerCase(), cached);
          cacheBufferInRam(newName.toLowerCase(), cached);
        }
        const copiedFile = {
          ...resolved.file,
          id: copyId,
          name: newName,
          folderId: newParentId,
          createdAt: now,
          updatedAt: now
        };
        vaultState.files.unshift(copiedFile);
        pendingExplorerEvents.push({ type: 'UPSERT_FILE', file: copiedFile });
      }
      res.writeHead(destResolved.type === 'not_found' ? 201 : 204);
      return res.end();
    }

    if (resolved.type === 'folder') {
      if (method === 'MOVE') {
        const updatedFolder = {
          ...resolved.folder,
          name: newName,
          parentId: newParentId,
          updatedAt: now
        };
        vaultState.folders = vaultState.folders.map(f => f.id === resolved.folder.id ? updatedFolder : f);
        pendingExplorerEvents.push({ type: 'UPDATE_FOLDER', folder: updatedFolder });
      } else {
        const copyFolder = {
          ...resolved.folder,
          id: `fold-pc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: newName,
          parentId: newParentId,
          createdAt: now,
          updatedAt: now
        };
        vaultState.folders.unshift(copyFolder);
        pendingExplorerEvents.push({ type: 'CREATE_FOLDER', folder: copyFolder });
      }
      res.writeHead(destResolved.type === 'not_found' ? 201 : 204);
      return res.end();
    }

    res.writeHead(204);
    return res.end();
  }

  // INSTANT DELETE (Files & Recursive Folders)
  if (method === 'DELETE') {
    req.resume();
    if (resolved.type === 'not_found' || resolved.type === 'missing_parent') {
      res.writeHead(404);
      return res.end('Not Found');
    }

    lastExplorerMutationAt = Date.now();

    if (resolved.type === 'file') {
      const target = resolved.file;
      vaultState.files = vaultState.files.filter(f => f.id !== target.id);
      memoryBlobCache.delete(target.id.toLowerCase());
      memoryBlobCache.delete(target.name.toLowerCase());
      vaultState.usedBytes = vaultState.files.reduce((acc, f) => acc + (f.size || 0), 0);
      updateMountedDrivesStorageSubtitle();
      pendingExplorerEvents.push({ type: 'DELETE_FILE', id: target.id, name: target.name });
    } else if (resolved.type === 'folder') {
      // Collect folder + all nested descendant folders & files
      const idsToDelete = new Set([String(resolved.folder.id)]);
      let changed = true;
      while (changed) {
        changed = false;
        vaultState.folders.forEach(fd => {
          if (fd.parentId && idsToDelete.has(String(fd.parentId)) && !idsToDelete.has(String(fd.id))) {
            idsToDelete.add(String(fd.id));
            changed = true;
          }
        });
      }

      const filesInTree = vaultState.files.filter(f => f.folderId && idsToDelete.has(String(f.folderId)));
      filesInTree.forEach(f => {
        memoryBlobCache.delete(f.id.toLowerCase());
        pendingExplorerEvents.push({ type: 'DELETE_FILE', id: f.id, name: f.name });
      });
      vaultState.files = vaultState.files.filter(f => !(f.folderId && idsToDelete.has(String(f.folderId))));

      Array.from(idsToDelete).forEach(fid => {
        pendingExplorerEvents.push({ type: 'DELETE_FOLDER', id: fid });
      });
      vaultState.folders = vaultState.folders.filter(fd => !idsToDelete.has(String(fd.id)));

      vaultState.usedBytes = vaultState.files.reduce((acc, f) => acc + (f.size || 0), 0);
      updateMountedDrivesStorageSubtitle();
    }

    res.writeHead(204);
    return res.end();
  }

  // RFC 4918 LOCK with mandatory Lock-Token HTTP Header (Prevents Windows Explorer 30s freeze!)
  if (method === 'LOCK') {
    req.resume();
    const token = `opaquelocktoken:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
    res.setHeader('Lock-Token', `<${token}>`);
    res.writeHead(200);
    return res.end(`<?xml version="1.0" encoding="utf-8" ?>
<D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock>
<D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope>
<D:depth>0</D:depth><D:owner><D:href>StorageBank</D:href></D:owner>
<D:timeout>Second-3600</D:timeout>
<D:locktoken><D:href>${token}</D:href></D:locktoken>
</D:activelock></D:lockdiscovery></D:prop>`);
  }

  if (method === 'UNLOCK') {
    req.resume();
    res.writeHead(204);
    return res.end();
  }

  if (method === 'PROPPATCH') {
    req.resume();
    res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
    res.writeHead(207, 'Multi-Status');
    return res.end(`<?xml version="1.0" encoding="utf-8" ?><D:multistatus xmlns:D="DAV:"><D:response><D:href>${escapeXml(cleanUrl)}</D:href><D:propstat><D:prop/><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`);
  }

  req.resume();
  res.writeHead(200);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[StorageBank Cloud Drive v4.0] Online at http://127.0.0.1:${PORT}/vault`);
  console.log(`[StorageBank Cloud Drive v4.0] Icon Ready: ${PERSISTENT_ICO_PATH}`);
  executeWindowsMount({
    driveLetter: 'Z:',
    driveName: 'StorageBank Cloud',
    quotaBytes: vaultState.quotaBytes,
    usedBytes: vaultState.usedBytes,
    planName: vaultState.planName,
    openExplorer: false
  });
});

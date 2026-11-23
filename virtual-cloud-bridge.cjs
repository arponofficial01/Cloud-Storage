// StorageBank Native Windows Cloud Drive Engine
// - Registers directly under "This PC > Devices and drives" (identical architecture to TeraBox)
// - Displays custom Drive Name, custom 64x64 StorageBank Cloud Logo .ICO, and exact Web Storage Available
// - Streams files & folders bi-directionally between Windows File Explorer, Web App, and Cloud Storage

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

const memoryBlobCache = new Map();
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
let currentCacheBytes = 0;
const pendingExplorerEvents = [];

function cacheBufferInRam(key, buf) {
  if (!Buffer.isBuffer(buf) || buf.length > 25 * 1024 * 1024) return;
  if (currentCacheBytes + buf.length > MAX_CACHE_BYTES) {
    memoryBlobCache.clear();
    currentCacheBytes = 0;
  }
  memoryBlobCache.set(key, buf);
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

  // ICONDIR
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(1, 4);

  // ICONDIRENTRY
  buf.writeUInt8(width, 6);
  buf.writeUInt8(height, 7);
  buf.writeUInt8(0, 8);
  buf.writeUInt8(0, 9);
  buf.writeUInt16LE(1, 10);
  buf.writeUInt16LE(32, 12);
  buf.writeUInt32LE(imageSize, 14);
  buf.writeUInt32LE(22, 18);

  // BITMAPINFOHEADER
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
    const py = height - 1 - y; // Top-down 0..63
    for (let x = 0; x < width; x++) {
      const idx = pxOffset + (y * width + x) * 4;

      // Rounded squircle (center 31.5, 31.5, half-size 28, corner radius 13)
      const dx = Math.max(0, Math.abs(x - 31.5) - 15.5);
      const dy = Math.max(0, Math.abs(py - 31.5) - 15.5);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 13.0) {
        buf.writeUInt32LE(0x00000000, idx);
        continue;
      }

      // Smooth anti-aliased edge alpha
      const edgeAlpha = dist > 11.8 ? Math.max(0, Math.min(1, 13.0 - dist)) : 1.0;

      // Cloud silhouette inside 64x64
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
        // Rich Indigo-Violet gradient (#6366F1 -> #4338CA)
        const grad = (x + py) / 128;
        buf[idx] = Math.round(245 - grad * 38);     // B
        buf[idx + 1] = Math.round(108 - grad * 48); // G
        buf[idx + 2] = Math.round(102 - grad * 32); // R
        buf[idx + 3] = Math.round(255 * edgeAlpha); // A
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

// Deterministic CLSID per drive letter so each mounted drive appears cleanly under "This PC > Devices and drives"
function getClsidForLetter(letter) {
  const clean = (letter || 'Z').replace(':', '').trim().toUpperCase();
  const hexCode = clean.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  return `{B9E83A14-46C1-4D56-8A33-87E7BC8528${hexCode}}`;
}

function uploadBufferToTelegramCloud(filename, buffer) {
  return new Promise((resolve, reject) => {
    const boundary = '----StorageBankCloud' + Date.now().toString(16);
    const safeName = filename || 'vault_file.bin';

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
      `${CHAT_ID}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="caption"\r\n\r\n` +
      `StorageBank Cloud Drive: ${safeName}\r\n` +
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
 * Register Drive in "This PC > Devices and drives" (Identical to TeraBox, never shows C: drive bar or Network Location)
 */
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
    // 1. Remove any old net use or subst mapping so Windows NEVER shows a C:-sized Network Location
    `cmd /c "net use ${fullLetter} /delete /y >nul 2>&1"`,
    `cmd /c "subst ${fullLetter} /d >nul 2>&1"`,
    `Remove-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\${cleanLetter}" -Recurse -Force -ErrorAction SilentlyContinue`,
    // Remove legacy static CLSID if different from current letter CLSID
    ...(clsid !== '{B9E83A14-46C1-4D56-8A33-87E7BC852899}'
      ? [
          `Remove-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\{B9E83A14-46C1-4D56-8A33-87E7BC852899}" -Recurse -Force -ErrorAction SilentlyContinue`,
          `Remove-Item -Path "HKCU:\\Software\\Classes\\CLSID\\{B9E83A14-46C1-4D56-8A33-87E7BC852899}" -Recurse -Force -ErrorAction SilentlyContinue`
        ]
      : []),
    `Start-Service -Name WebClient -ErrorAction SilentlyContinue`,
    // 2. Register under "This PC > Devices and drives" (TeraBox architecture)
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

/**
 * Refresh live storage subtitle in Windows Explorer for all mounted drives whenever Web quota/usage changes
 */
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
  const cleanUrl = decodeURIComponent(rawUrl.split('?')[0]);

  res.setHeader('Server', 'StorageBank-CloudDrive/3.5');
  res.setHeader('DAV', '1, 2');
  res.setHeader('MS-Author-Via', 'DAV');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK');
  res.setHeader('Access-Control-Allow-Headers', 'Depth, Content-Type, Authorization, If-Modified-Since, If-None-Match, Overwrite, Destination, X-File-Name');

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
          if (Array.isArray(payload.files)) vaultState.files = payload.files;
          if (Array.isArray(payload.folders)) vaultState.folders = payload.folders;
          if (payload.quotaBytes) vaultState.quotaBytes = Number(payload.quotaBytes);
          if (payload.usedBytes !== undefined) vaultState.usedBytes = Number(payload.usedBytes);
          if (payload.planName) vaultState.planName = payload.planName;

          updateMountedDrivesStorageSubtitle();

          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
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

    if (method === 'POST' && cleanUrl === '/api/mount') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          executeWindowsMount(body, (err, driveRecord) => {
            res.writeHead(200);
            res.end(JSON.stringify({
              ok: true,
              drive: driveRecord,
              warning: err ? err.message : null
            }));
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

    // CORS-free Telegram Cloud Binary Proxy for Web App instant file restoration
    if (method === 'GET' && cleanUrl === '/api/telegram-file') {
      const queryStr = rawUrl.split('?')[1] || '';
      const params = new URLSearchParams(queryStr);
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

  // ── WEBDAV DIRECTORY & FILE STREAMING FOR WINDOWS EXPLORER ──────────────────
  const relativePath = cleanUrl.replace(/^\/vault\/?/, '').replace(/^\/+|\/+$/g, '');

  if (method === 'PROPFIND') {
    const depth = req.headers['depth'] || '1';
    const availableBytes = Math.max(0, vaultState.quotaBytes - vaultState.usedBytes);

    res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
    res.writeHead(207, 'Multi-Status');

    const targetFolder = relativePath
      ? vaultState.folders.find(f => !f.inTrash && f.name.toLowerCase() === relativePath.toLowerCase())
      : null;
    const targetFile = relativePath
      ? vaultState.files.find(f => !f.inTrash && f.name.toLowerCase() === relativePath.toLowerCase())
      : null;

    if (targetFile) {
      const mtime = new Date(targetFile.updatedAt || targetFile.createdAt || Date.now()).toUTCString();
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/vault/${encodeURIComponent(targetFile.name)}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(targetFile.name)}</D:displayname>
        <D:getcontentlength>${targetFile.size || 0}</D:getcontentlength>
        <D:getcontenttype>${escapeXml(targetFile.type || 'application/octet-stream')}</D:getcontenttype>
        <D:getlastmodified>${mtime}</D:getlastmodified>
        <D:resourcetype/>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
      return res.end(xml);
    }

    const activeParentId = targetFolder ? String(targetFolder.id) : null;
    const baseHref = targetFolder ? `/vault/${encodeURIComponent(targetFolder.name)}/` : '/vault/';
    const displayTitle = targetFolder ? targetFolder.name : vaultState.driveName;

    let xml = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${baseHref}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(displayTitle)}</D:displayname>
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
        xml += `
  <D:response>
    <D:href>${baseHref}${encodeURIComponent(fold.name)}/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(fold.name)}</D:displayname>
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
        xml += `
  <D:response>
    <D:href>${baseHref}${encodeURIComponent(file.name)}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${escapeXml(file.name)}</D:displayname>
        <D:getcontentlength>${file.size || 0}</D:getcontentlength>
        <D:getcontenttype>${escapeXml(file.type || 'application/octet-stream')}</D:getcontenttype>
        <D:getlastmodified>${mtime}</D:getlastmodified>
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
      const freeBytes = Math.max(0, vaultState.quotaBytes - vaultState.usedBytes);
      return res.end(`<!DOCTYPE html>
<html>
<head><title>${escapeXml(vaultState.driveName)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#09090b;color:#ededed;padding:36px;">
  <div style="max-width:640px;margin:0 auto;background:#18181b;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;">
    <h2 style="margin:0 0 8px 0;color:#6366f1;">${escapeXml(vaultState.driveName)} (${escapeXml(vaultState.driveLetter)})</h2>
    <p style="margin:0 0 16px 0;color:#a1a1aa;font-size:0.9rem;">Active Plan: <b>${escapeXml(vaultState.planName)}</b> &bull; ${formatBytesClean(freeBytes)} free of ${formatBytesClean(vaultState.quotaBytes)}</p>
    <div style="font-size:0.85rem;color:#d4d4d8;line-height:1.7;">
      <div>&bull; <b>Synced Vault Files:</b> ${vaultState.files.length} files across ${vaultState.folders.length} folders</div>
      <div>&bull; <b>Windows Explorer Integration:</b> This PC &gt; Devices and drives</div>
    </div>
  </div>
</body>
</html>`);
    }

    const baseName = relativePath.split('/').pop();
    const targetFile = vaultState.files.find(f => !f.inTrash && f.name.toLowerCase() === baseName.toLowerCase());

    if (!targetFile) {
      res.writeHead(404);
      return res.end('Not found');
    }

    try {
      let buf = memoryBlobCache.get(baseName.toLowerCase());
      if (!buf && targetFile.telegramFileId) {
        buf = await fetchBufferFromTelegramCloud(targetFile.telegramFileId);
        cacheBufferInRam(baseName.toLowerCase(), buf);
      }
      if (!buf) {
        buf = Buffer.from(`StorageBank Cloud Vault File: ${targetFile.name}\nSize: ${targetFile.size || 0} bytes\n`, 'utf-8');
      }

      res.setHeader('Content-Type', targetFile.type || 'application/octet-stream');
      res.setHeader('Content-Length', buf.length);
      res.writeHead(200);
      if (method === 'HEAD') return res.end();
      return res.end(buf);
    } catch (err) {
      res.writeHead(500);
      return res.end(err.message);
    }
  }

  if (method === 'PUT') {
    const baseName = relativePath.split('/').pop();
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      cacheBufferInRam(baseName.toLowerCase(), buffer);

      const now = new Date().toISOString();
      let tgInfo = { fileId: null, messageId: null };
      if (buffer.length > 0) {
        try {
          tgInfo = await uploadBufferToTelegramCloud(baseName, buffer);
        } catch (e) {
          console.warn('[Cloud Drive] Upload stream notice:', e.message);
        }
      }

      const existingIdx = vaultState.files.findIndex(f => f.name.toLowerCase() === baseName.toLowerCase());
      const fileRecord = {
        id: existingIdx >= 0 ? vaultState.files[existingIdx].id : `file-pc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: baseName,
        size: buffer.length,
        type: 'application/octet-stream',
        category: 'document',
        folderId: null,
        storageProvider: tgInfo.fileId ? 'telegram' : 'cloud',
        telegramFileId: tgInfo.fileId,
        telegramMessageId: tgInfo.messageId,
        inTrash: false,
        starred: false,
        createdAt: now,
        updatedAt: now,
        base64Content: buffer.length <= 5 * 1024 * 1024 ? buffer.toString('base64') : null
      };

      if (existingIdx >= 0) {
        vaultState.files[existingIdx] = { ...vaultState.files[existingIdx], ...fileRecord };
      } else {
        vaultState.files.unshift(fileRecord);
      }

      vaultState.usedBytes = vaultState.files.reduce((acc, f) => acc + (f.size || 0), 0);
      updateMountedDrivesStorageSubtitle();
      pendingExplorerEvents.push({ type: 'UPSERT_FILE', file: fileRecord });

      res.writeHead(201);
      res.end();
    });
    return;
  }

  if (method === 'MKCOL') {
    const folderName = relativePath.split('/').pop();
    if (folderName) {
      const now = new Date().toISOString();
      const folderRecord = {
        id: `fold-pc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: folderName,
        parentId: null,
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

  if (method === 'DELETE') {
    const targetName = relativePath.split('/').pop();
    if (targetName) {
      const fileMatch = vaultState.files.find(f => f.name.toLowerCase() === targetName.toLowerCase());
      if (fileMatch) {
        vaultState.files = vaultState.files.filter(f => f.id !== fileMatch.id);
        memoryBlobCache.delete(targetName.toLowerCase());
        vaultState.usedBytes = vaultState.files.reduce((acc, f) => acc + (f.size || 0), 0);
        updateMountedDrivesStorageSubtitle();
        pendingExplorerEvents.push({ type: 'DELETE_FILE', id: fileMatch.id, name: fileMatch.name });
      }
      const folderMatch = vaultState.folders.find(f => f.name.toLowerCase() === targetName.toLowerCase());
      if (folderMatch) {
        vaultState.folders = vaultState.folders.filter(f => f.id !== folderMatch.id);
        pendingExplorerEvents.push({ type: 'DELETE_FOLDER', id: folderMatch.id, name: folderMatch.name });
      }
    }
    res.writeHead(204);
    return res.end();
  }

  if (method === 'LOCK') {
    res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
    res.writeHead(200);
    return res.end(`<?xml version="1.0" encoding="utf-8" ?>
<D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock>
<D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope>
<D:depth>Infinity</D:depth><D:owner><D:href>StorageBank</D:href></D:owner>
<D:timeout>Second-3600</D:timeout>
<D:locktoken><D:href>opaquelocktoken:${Date.now()}</D:href></D:locktoken>
</D:activelock></D:lockdiscovery></D:prop>`);
  }

  if (method === 'UNLOCK') {
    res.writeHead(204);
    return res.end();
  }

  if (method === 'PROPPATCH') {
    res.setHeader('Content-Type', 'text/xml; charset="utf-8"');
    res.writeHead(207, 'Multi-Status');
    return res.end(`<?xml version="1.0" encoding="utf-8" ?><D:multistatus xmlns:D="DAV:"><D:response><D:href>${escapeXml(cleanUrl)}</D:href><D:propstat><D:prop/><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`);
  }

  res.writeHead(200);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[StorageBank Cloud Drive] Online at http://127.0.0.1:${PORT}/vault`);
  console.log(`[StorageBank Cloud Drive] Icon Ready: ${PERSISTENT_ICO_PATH}`);
  // Automatically register default StorageBank Cloud (Z:) under "This PC > Devices and drives" on startup
  executeWindowsMount({
    driveLetter: 'Z:',
    driveName: 'StorageBank Cloud',
    quotaBytes: vaultState.quotaBytes,
    usedBytes: vaultState.usedBytes,
    planName: vaultState.planName,
    openExplorer: false
  });
});

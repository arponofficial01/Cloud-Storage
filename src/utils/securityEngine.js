// StorageBank Zero-Trust Security & Anti-Hacker Protection Engine
// Provides WebCrypto AES-256-GCM encryption, SHA-256 file integrity hashing,
// brute-force rate limiting, malicious filename/extension sanitization, and security audit logging.

const AUDIT_LOG_KEY = 'storagebank_security_audit_log';
const LOCKOUT_KEY = 'storagebank_security_lockout';
const AUTO_LOCK_KEY = 'storagebank_autolock_minutes';

// Dangerous executable extensions that hackers use in double-extension or payload attacks
const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'scr', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'ps1', 'msi', 'com', 'pif', 'hta', 'cpl', 'jar', 'reg'
]);

/**
 * Sanitize filenames against path traversal (../), null bytes, control chars, and double-extension spoofing
 */
export function sanitizeFileName(rawName = '') {
  const filteredChars = Array.from(String(rawName || 'untitled_file'))
    .filter(ch => {
      const code = ch.charCodeAt(0);
      return code > 31 && (code < 127 || code > 159);
    })
    .join('');

  let clean = filteredChars
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .trim();

  if (!clean || clean === '.' || clean === '..') {
    clean = `vault_file_${Date.now()}`;
  }
  return clean;
}

/**
 * Inspect a file for potential hacker payload patterns (e.g. invoice.pdf.exe double extension)
 */
export function inspectFileSecurity(fileName = '', fileSize = 0) {
  const cleanName = sanitizeFileName(fileName);
  const parts = cleanName.toLowerCase().split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1] : '';
  const secondLastExt = parts.length > 2 ? parts[parts.length - 2] : '';

  const isDoubleExtensionSpoof =
    parts.length > 2 &&
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'png', 'txt', 'mp4'].includes(secondLastExt) &&
    DANGEROUS_EXTENSIONS.has(ext);

  const isExecutable = ['exe', 'bat', 'cmd', 'scr', 'vbs', 'ps1', 'msi', 'hta', 'com', 'pif'].includes(ext);

  return {
    sanitizedName: cleanName,
    isDoubleExtensionSpoof,
    isExecutable,
    riskLevel: isDoubleExtensionSpoof ? 'high' : isExecutable ? 'medium' : 'safe',
    fileSize
  };
}

/**
 * Compute real cryptographic SHA-256 fingerprint (first 2 MB sample for speed on huge media)
 */
export async function computeFileSha256(blob) {
  try {
    if (!(blob instanceof Blob) || typeof crypto === 'undefined' || !crypto.subtle) {
      return null;
    }
    const sample = blob.size > 2 * 1024 * 1024 ? blob.slice(0, 2 * 1024 * 1024) : blob;
    const buffer = await sample.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Derive an AES-256-GCM WebCrypto key from a user passphrase using PBKDF2 (100,000 iterations)
 */
async function deriveAesGcmKey(passphrase, saltBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a Blob using real WebCrypto AES-256-GCM
 * Binary layout: [8-byte magic "SBANKENC"][16-byte salt][12-byte IV][ciphertext + 16-byte auth tag]
 */
export async function encryptBlobAes256(blob, passphrase) {
  if (!(blob instanceof Blob) || !passphrase) {
    throw new Error('Valid file and passphrase are required for AES-256 encryption');
  }
  const magic = new TextEncoder().encode('SBANKENC');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(passphrase, salt);

  const plainBuffer = await blob.arrayBuffer();
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plainBuffer
  );

  const combined = new Uint8Array(magic.length + salt.length + iv.length + cipherBuffer.byteLength);
  combined.set(magic, 0);
  combined.set(salt, magic.length);
  combined.set(iv, magic.length + salt.length);
  combined.set(new Uint8Array(cipherBuffer), magic.length + salt.length + iv.length);

  return new Blob([combined], { type: 'application/octet-stream' });
}

/**
 * Decrypt an AES-256-GCM encrypted Blob created by encryptBlobAes256
 */
export async function decryptBlobAes256(encryptedBlob, passphrase, originalMime = 'application/octet-stream') {
  const buffer = await encryptedBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const magicStr = new TextDecoder().decode(bytes.slice(0, 8));
  if (magicStr !== 'SBANKENC') {
    throw new Error('File is not a valid StorageBank AES-256 encrypted package');
  }
  const salt = bytes.slice(8, 24);
  const iv = bytes.slice(24, 36);
  const cipherBytes = bytes.slice(36);

  const key = await deriveAesGcmKey(passphrase, salt);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes
  );

  return new Blob([plainBuffer], { type: originalMime });
}

/**
 * Brute-force rate limiter for PIN & authentication attempts
 */
export function checkBruteForceLockout() {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    if (!raw) return { locked: false, remainingSeconds: 0, attempts: 0 };
    const state = JSON.parse(raw);
    const now = Date.now();
    if (state.lockedUntil && state.lockedUntil > now) {
      return {
        locked: true,
        remainingSeconds: Math.ceil((state.lockedUntil - now) / 1000),
        attempts: state.attempts || 5
      };
    }
    return { locked: false, remainingSeconds: 0, attempts: state.attempts || 0 };
  } catch {
    return { locked: false, remainingSeconds: 0, attempts: 0 };
  }
}

export function recordAuthAttempt(success, contextLabel = 'Vault PIN') {
  try {
    if (success) {
      localStorage.removeItem(LOCKOUT_KEY);
      recordSecurityEvent(`${contextLabel} Verified`, 'Authorized session unlock', 'success');
      return { locked: false, remainingSeconds: 0, attempts: 0 };
    }

    const current = checkBruteForceLockout();
    const nextAttempts = (current.attempts || 0) + 1;
    const isLocking = nextAttempts >= 5;
    const lockedUntil = isLocking ? Date.now() + 30 * 1000 : 0;

    localStorage.setItem(
      LOCKOUT_KEY,
      JSON.stringify({ attempts: isLocking ? 0 : nextAttempts, lockedUntil })
    );

    recordSecurityEvent(
      isLocking ? `Brute-Force Shield Triggered (${contextLabel})` : `Failed ${contextLabel} Attempt`,
      isLocking ? '5 failed attempts — 30s anti-hacker lockout engaged' : `Failed attempt #${nextAttempts}`,
      isLocking ? 'danger' : 'warning'
    );

    return {
      locked: isLocking,
      remainingSeconds: isLocking ? 30 : 0,
      attempts: nextAttempts
    };
  } catch {
    return { locked: false, remainingSeconds: 0, attempts: 0 };
  }
}

/**
 * Security Audit Log persistence
 */
export function getSecurityAuditLogs() {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordSecurityEvent(event, details = '', severity = 'info') {
  try {
    const logs = getSecurityAuditLogs();
    const entry = {
      id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event,
      details,
      severity,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify([entry, ...logs].slice(0, 30)));
    return entry;
  } catch {
    return null;
  }
}

export function clearSecurityAuditLogs() {
  try {
    localStorage.removeItem(AUDIT_LOG_KEY);
  } catch {}
}

/**
 * Auto-Lock Idle Timeout configuration (in minutes, 0 = disabled)
 */
export function getAutoLockMinutes() {
  try {
    const val = parseInt(localStorage.getItem(AUTO_LOCK_KEY) || '15', 10);
    return isNaN(val) ? 15 : val;
  } catch {
    return 15;
  }
}

export function setAutoLockMinutes(minutes) {
  try {
    localStorage.setItem(AUTO_LOCK_KEY, String(minutes));
    recordSecurityEvent('Auto-Lock Policy Updated', minutes > 0 ? `Idle lock set to ${minutes} min` : 'Idle auto-lock disabled', 'info');
  } catch {}
}

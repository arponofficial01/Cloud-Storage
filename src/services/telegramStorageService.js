// Universal Telegram Cloud Storage Engine for StorageBank
// Built-in 100% Free, Unlimited Permanent Cloud Storage for ALL Users

const DEFAULT_BOT_TOKEN = '9290698563:AAGlJ58lmtHHWY-lbigU3jlHIcGNYyPUP-g';
const DEFAULT_CHAT_ID = '-1003907976847';

const TELEGRAM_CONFIG_KEY = 'storagebank_telegram_config';

/**
 * Universal configuration provider:
 * Returns the universal bot & channel ID so every user has automatic cloud storage.
 */
export const getTelegramConfig = () => {
  try {
    const saved = localStorage.getItem(TELEGRAM_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.botToken && parsed.chatId) {
        return {
          botToken: parsed.botToken.trim(),
          chatId: parsed.chatId.trim(),
          botUsername: parsed.botUsername || 'mystorage27_bot',
          chatTitle: parsed.chatTitle || 'My Cloud Vault',
          isConfigured: true,
          isEnv: false
        };
      }
    }
  } catch {}

  const envToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
  const envChatId = import.meta.env.VITE_TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID;

  return {
    botToken: envToken.trim(),
    chatId: envChatId.trim(),
    botUsername: 'mystorage27_bot',
    chatTitle: 'My Cloud Vault',
    isConfigured: true,
    isEnv: true
  };
};

/**
 * Always enabled universally for all users
 */
export const isTelegramCloudEnabled = () => {
  return true;
};

/**
 * Saves and validates Telegram Cloud settings
 */
export const saveTelegramConfig = (botToken, chatId, extra = {}) => {
  const config = {
    botToken: (botToken || DEFAULT_BOT_TOKEN).trim(),
    chatId: (chatId || DEFAULT_CHAT_ID).trim(),
    botUsername: extra.botUsername || 'mystorage27_bot',
    chatTitle: extra.chatTitle || 'My Cloud Vault',
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(TELEGRAM_CONFIG_KEY, JSON.stringify(config));
  return config;
};

export const removeTelegramConfig = () => {
  localStorage.removeItem(TELEGRAM_CONFIG_KEY);
};

export const verifyTelegramBot = async (token) => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    return { ok: data.ok, username: data.result?.username };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

export const verifyTelegramChannel = async (token, chatId) => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${chatId}`);
    const data = await res.json();
    return { ok: data.ok, title: data.result?.title };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

export const autoDetectChatId = async () => ({ ok: false });

/**
 * Helper to handle Telegram API rate limits (HTTP 429) gracefully
 */
const fetchWithRetry = async (url, options = {}, retries = 3) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const waitSec = body.parameters?.retry_after || (attempt + 1) * 2;
      console.warn(`[Telegram API] Rate limited. Waiting ${waitSec}s before retry...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      continue;
    }
    return res;
  }
  return await fetch(url, options);
};

/**
 * Uploads a file (or Blob) of ANY size to the universal Telegram Cloud Vault.
 * - Files under 19 MB: Uploaded directly in 1 instant HTTP request.
 * - Files over 19 MB: Sliced into 19 MB chunks (`File.prototype.slice`) with multi-part assembly.
 * Bypasses all single-file size limits (no 2 GB limit, works for 5 GB, 10 GB+).
 */
export const uploadFileToTelegram = async (fileName, fileOrBlob, onProgress = null) => {
  const config = getTelegramConfig();
  const { botToken, chatId } = config;

  const fileSize = fileOrBlob.size;
  // 19 MB chunks: safely within Telegram getFile 20 MB download limit
  const CHUNK_SIZE = 19 * 1024 * 1024;

  if (fileSize <= CHUNK_SIZE) {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', fileOrBlob, fileName);
    formData.append('caption', `📦 StorageBank Cloud Vault\n📄 File: ${fileName}\n⚖️ Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB\n⏰ ${new Date().toLocaleString()}`);

    const res = await fetchWithRetry(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || 'Failed to upload to Cloud Vault');
    }

    const doc = data.result.document || data.result.video || data.result.audio || data.result;
    return {
      fileId: doc.file_id,
      fileUniqueId: doc.file_unique_id,
      messageId: data.result.message_id,
      storageProvider: 'telegram',
      size: fileSize,
      isChunked: false
    };
  } else {
    // ── High-Capacity Multi-Part Slicing Engine (Bypasses 2 GB Limit) ──
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const parts = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(fileSize, start + CHUNK_SIZE);
      const chunkBlob = fileOrBlob.slice(start, end);
      const partName = `${fileName}.part_${String(i + 1).padStart(3, '0')}_of_${String(totalChunks).padStart(3, '0')}`;

      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('document', chunkBlob, partName);
      formData.append('caption', `📦 StorageBank Multi-Part (${i + 1}/${totalChunks})\n📄 Original: ${fileName}\n🧩 Slice: ${(chunkBlob.size / (1024 * 1024)).toFixed(2)} MB`);

      const res = await fetchWithRetry(`https://api.telegram.org/bot${botToken}/sendDocument`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(`Failed to upload chunk ${i + 1} of ${totalChunks}: ${data.description}`);
      }

      const doc = data.result.document || data.result;
      parts.push({
        partIndex: i,
        fileId: doc.file_id,
        messageId: data.result.message_id,
        size: end - start
      });

      if (onProgress) {
        onProgress({
          percentage: Math.round(((i + 1) / totalChunks) * 100),
          chunk: i + 1,
          totalChunks
        });
      }

      // Small pacing pause (350ms) to ensure smooth transmission without triggering flood limits
      if (i < totalChunks - 1) {
        await new Promise(r => setTimeout(r, 350));
      }
    }

    return {
      fileId: parts[0].fileId,
      parts,
      storageProvider: 'telegram',
      size: fileSize,
      isChunked: true
    };
  }
};

import { inferMimeType } from './dbService';

/**
 * Fetches binary file bytes from Telegram Cloud using:
 * 1) Local Bridge Proxy (http://127.0.0.1:8080/api/telegram-file) — bypasses browser CORS
 * 2) Vite Dev Proxy (/tg-file/bot...) — bypasses browser CORS
 * 3) Direct Telegram CDN URL fallback
 */
const fetchTelegramBinaryBlob = async (fileId, fileName = '', mimeType = '') => {
  const config = getTelegramConfig();
  const { botToken } = config;
  const resolvedMime = inferMimeType(fileName, mimeType);

  // 1. Try Serverless / Production API Proxy (/api/telegram-file) — works on Vercel & production domains
  try {
    const prodProxyRes = await fetch(
      `/api/telegram-file?fileId=${encodeURIComponent(fileId)}&name=${encodeURIComponent(fileName)}`
    );
    if (prodProxyRes.ok) {
      const ct = prodProxyRes.headers.get('content-type') || '';
      if (!ct.includes('text/html') && !ct.includes('application/json')) {
        const buf = await prodProxyRes.arrayBuffer();
        if (buf.byteLength > 0) {
          return new Blob([buf], { type: resolvedMime });
        }
      }
    }
  } catch {}

  // 2. Try Local Node Cloud Bridge (CORS-enabled + RAM cached)
  try {
    const bridgeRes = await fetch(
      `http://127.0.0.1:8080/api/telegram-file?fileId=${encodeURIComponent(fileId)}&name=${encodeURIComponent(fileName)}`
    );
    if (bridgeRes.ok) {
      const buf = await bridgeRes.arrayBuffer();
      if (buf.byteLength > 0) {
        return new Blob([buf], { type: resolvedMime });
      }
    }
  } catch {}

  // 2. Resolve file_path from Telegram getFile API (JSON endpoint supports CORS)
  const res = await fetchWithRetry(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const data = await res.json();
  if (!data.ok || !data.result?.file_path) {
    throw new Error('Could not resolve file path from Cloud Vault.');
  }

  const filePath = data.result.file_path;

  // 3. Try Vite local proxy (/tg-file/bot...) to avoid browser CORS block on api.telegram.org/file
  try {
    const proxyRes = await fetch(`/tg-file/bot${botToken}/${filePath}`);
    if (proxyRes.ok) {
      const contentType = proxyRes.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        const buf = await proxyRes.arrayBuffer();
        return new Blob([buf], { type: resolvedMime });
      }
    }
  } catch {}

  // 4. Direct CDN fallback
  const directRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!directRes.ok) throw new Error(`HTTP error ${directRes.status} downloading file.`);
  const buf = await directRes.arrayBuffer();
  return new Blob([buf], { type: resolvedMime });
};

/**
 * Retrieves the direct download URL for a file from Telegram CDN
 */
export const getTelegramDownloadUrl = async (fileId) => {
  const config = getTelegramConfig();
  const { botToken } = config;

  try {
    const res = await fetchWithRetry(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (data.ok && data.result?.file_path) {
      return `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
    }
  } catch (err) {
    console.warn('Failed to retrieve Telegram file path:', err);
  }
  return null;
};

/**
 * Downloads and reassembles a file (single or multi-part) back into an accurately-typed Blob
 */
export const downloadTelegramFileBlob = async (fileRecord) => {
  const resolvedMime = inferMimeType(fileRecord.name, fileRecord.type);

  // Single-part download
  if (!fileRecord.isChunked && fileRecord.telegramFileId) {
    return await fetchTelegramBinaryBlob(fileRecord.telegramFileId, fileRecord.name, resolvedMime);
  }

  // Multi-part reassembly with concurrent fetching (max 3 at once for high speed)
  if (fileRecord.parts && fileRecord.parts.length > 0) {
    const sortedParts = [...fileRecord.parts].sort((a, b) => a.partIndex - b.partIndex);
    const chunkBlobs = new Array(sortedParts.length);

    const CONCURRENCY = 3;
    for (let i = 0; i < sortedParts.length; i += CONCURRENCY) {
      const slice = sortedParts.slice(i, i + CONCURRENCY);
      await Promise.all(slice.map(async (part) => {
        chunkBlobs[part.partIndex] = await fetchTelegramBinaryBlob(part.fileId, '', 'application/octet-stream');
      }));
    }

    return new Blob(chunkBlobs, { type: resolvedMime });
  }

  throw new Error('No Cloud Vault file identifier found on this record.');
};

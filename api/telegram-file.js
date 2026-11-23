// Vercel Serverless Function: CORS-Free Telegram Cloud Binary Stream Proxy
// Endpoint: /api/telegram-file?fileId=<telegram_file_id>&name=<filename>

const DEFAULT_BOT_TOKEN = '9290698563:AAGlJ58lmtHHWY-lbigU3jlHIcGNYyPUP-g';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { fileId, filePath: directPath } = req.query || {};
  const botToken = process.env.VITE_TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;

  if (!fileId && !directPath) {
    return res.status(400).json({ error: 'Missing fileId or filePath query parameter' });
  }

  try {
    let resolvedPath = directPath;

    if (!resolvedPath) {
      const metaRes = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
      );
      const metaJson = await metaRes.json();
      if (!metaJson.ok || !metaJson.result?.file_path) {
        return res.status(404).json({ error: 'Could not resolve Telegram file_path' });
      }
      resolvedPath = metaJson.result.file_path;
    }

    const fileRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${resolvedPath}`);
    if (!fileRes.ok) {
      return res.status(fileRes.status).json({ error: `Upstream HTTP ${fileRes.status}` });
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Proxy error' });
  }
}

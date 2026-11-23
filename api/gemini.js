// Vercel Serverless Function: Secure Gemini Neural Agent Proxy
// Keeps GEMINI_API_KEY / VITE_GEMINI_API_KEY strictly on the server in production.

const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest'
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey) {
    return res.status(503).json({ error: 'Server Gemini API key not configured in Vercel Environment Variables' });
  }

  const payload = req.body;
  if (!payload || !Array.isArray(payload.contents)) {
    return res.status(400).json({ error: 'Invalid Gemini request payload' });
  }

  let lastError = 'Gemini service unavailable';

  for (const modelName of GEMINI_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!upstream.ok) {
        const errJson = await upstream.json().catch(() => ({}));
        lastError = errJson?.error?.message || `HTTP ${upstream.status}`;
        continue;
      }

      const data = await upstream.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const nonThought = parts.filter(p => !p.thought && typeof p.text === 'string');
      const text = (nonThought.length > 0 ? nonThought : parts).map(p => p.text || '').join('').trim();

      if (text) {
        return res.status(200).json({ text, model: modelName });
      }
    } catch (err) {
      clearTimeout(timer);
      lastError = err?.message || 'Timeout';
    }
  }

  return res.status(502).json({ error: lastError });
}

// StorageBank Vault Assistant & Built-in Google Gemini Neural Agent
// Universal built-in Gemini API — natural multi-turn AI agent with vault intelligence & zero user API key setup.

export const DEFAULT_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// Ordered by real-time benchmark speed and availability (gemini-flash-lite-latest responds in ~1.3s)
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.8-flash'
];

export class VaultAssistantEngine {
  formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  inspectVault(files = [], folders = []) {
    const activeFiles = files.filter(f => !f.inTrash);
    const trashFiles = files.filter(f => f.inTrash);
    const activeFolders = folders.filter(f => !f.inTrash);
    const totalBytes = activeFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    const trashBytes = trashFiles.reduce((acc, f) => acc + (f.size || 0), 0);

    const categories = {
      image: activeFiles.filter(f => f.category === 'image'),
      document: activeFiles.filter(f => f.category === 'document'),
      video: activeFiles.filter(f => f.category === 'video'),
      audio: activeFiles.filter(f => f.category === 'audio'),
      code: activeFiles.filter(f => f.category === 'code'),
      archive: activeFiles.filter(f => f.category === 'archive')
    };

    const nameCounts = {};
    activeFiles.forEach(f => {
      const key = `${f.name.toLowerCase()}_${f.size || 0}`;
      nameCounts[key] = (nameCounts[key] || 0) + 1;
    });
    const duplicates = activeFiles.filter(f => nameCounts[`${f.name.toLowerCase()}_${f.size || 0}`] > 1);
    const largestFiles = [...activeFiles].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 5);

    return {
      activeFiles,
      trashFiles,
      activeFolders,
      totalBytes,
      trashBytes,
      categories,
      duplicates,
      largestFiles
    };
  }

  detectActionForQuery(query, files = [], folders = []) {
    const vault = this.inspectVault(files, folders);
    const qLower = query.toLowerCase().trim();

    if (qLower.includes('trash') && (qLower.includes('empty') || qLower.includes('clean') || qLower.includes('clear') || qLower.includes('delete'))) {
      if (vault.trashFiles.length > 0) {
        return {
          type: 'EMPTY_TRASH',
          title: `Empty Trash (${vault.trashFiles.length} items • ${this.formatSize(vault.trashBytes)})`,
          details: 'Permanently purges all items currently inside Trash.'
        };
      }
    }

    if (qLower.includes('convert') || qLower.includes('format studio') || qLower.includes('pdf to') || qLower.includes('image to')) {
      return {
        type: 'NAVIGATE_CONVERTER',
        title: 'Open Format Converter Studio',
        details: 'Launch the client-side document & media conversion workspace.'
      };
    }

    if ((qLower.includes('folder') || qLower.includes('document')) && (qLower.includes('create') || qLower.includes('new') || qLower.includes('make') || qLower.includes('add'))) {
      return {
        type: 'CREATE_FOLDER',
        title: 'Open Folder & Document Creator',
        details: 'Create a new category-scoped folder or document in your vault.'
      };
    }

    if (qLower.includes('duplicate') || qLower.includes('analytics') || qLower.includes('breakdown')) {
      return {
        type: 'SCAN_DUPLICATES',
        title: 'Open Storage Analytics',
        details: 'Inspect detailed category distribution and vault health metrics.'
      };
    }

    if (qLower.includes('mount') || qLower.includes('windows drive') || qLower.includes('pc drive') || qLower.includes('network drive')) {
      return {
        type: 'OPEN_DRIVE_MOUNT',
        title: 'Open Windows Desktop Drive Mount',
        details: 'Mount your cloud vault directly in Windows File Explorer with 0 B local disk usage.'
      };
    }

    return null;
  }

  /**
   * Natural Conversational Fallback Agent (used only when completely offline)
   */
  processUserQuery(query, storageStats, files = [], folders = []) {
    const vault = this.inspectVault(files, folders);
    const qLower = query.toLowerCase().trim();
    const proposedAction = this.detectActionForQuery(query, files, folders);
    let responseText = '';

    if (/^(hi|hello|hey|yo|good morning|good evening|sup|greetings)\b/i.test(qLower)) {
      responseText = `Hey there! I'm your **StorageBank AI Agent**. Right now your vault holds **${vault.activeFiles.length} file(s)** (${this.formatSize(vault.totalBytes)}) across **${vault.activeFolders.length} folder(s)**.\n\nYou can ask me anything naturally — whether you want me to summarize or search your documents, draft a new report or code file, check for duplicates, or answer general questions!`;
    } else if (qLower.includes('who are you') || qLower.includes('what can you do') || qLower.includes('help')) {
      responseText = `I'm your **StorageBank AI Copilot**, built into your cloud vault (developed by **Arpon Chakraborty**). Here is what I can do for you:\n• **Answer Anything Naturally**: Ask me coding, writing, math, research, or productivity questions.\n• **Read & Summarize Your Vault Files**: I can read inside your Word (\`.docx\`), PDF, Markdown, CSV, and code files.\n• **Draft & Save Notes to Vault**: Ask me to write an essay, contract, or code snippet and click **Save as Note** to store it straight in your folder.\n• **Manage Your Storage**: Ask me to scan duplicates, inspect storage usage, or clean up your Trash.`;
    } else if (qLower.includes('trash') || qLower.includes('empty')) {
      if (vault.trashFiles.length === 0) {
        responseText = `I checked your Trash bin — it's completely clean right now with **0 items**.`;
      } else {
        const samples = vault.trashFiles.slice(0, 5).map(f => `• **${f.name}** (${this.formatSize(f.size)})`).join('\n');
        responseText = `You currently have **${vault.trashFiles.length} item(s)** taking up **${this.formatSize(vault.trashBytes)}** in Trash:\n${samples}\n\nYou can use the action button below if you'd like me to empty it for you.`;
      }
    } else if (qLower.includes('duplicate')) {
      if (vault.duplicates.length === 0) {
        responseText = `I scanned all **${vault.activeFiles.length} active file(s)** across your **${vault.activeFolders.length} folder(s)** and didn't find any duplicate files. Your vault is clean!`;
      } else {
        const list = vault.duplicates.slice(0, 6).map(f => `• **${f.name}** (${this.formatSize(f.size)})`).join('\n');
        responseText = `I spotted **${vault.duplicates.length} potential duplicate file(s)** with matching names and sizes:\n${list}`;
      }
    } else if (qLower.includes('storage') || qLower.includes('space') || qLower.includes('quota') || qLower.includes('how much') || qLower.includes('summary') || qLower.includes('summarize')) {
      const topCat = Object.entries(vault.categories)
        .map(([cat, list]) => ({ cat, count: list.length, bytes: list.reduce((a, b) => a + (b.size || 0), 0) }))
        .sort((a, b) => b.bytes - a.bytes);

      const catBreakdown = topCat
        .filter(c => c.count > 0)
        .map(c => `• **${c.cat.toUpperCase()}**: ${c.count} file(s) (${this.formatSize(c.bytes)})`)
        .join('\n');

      const quotaLabel = storageStats?.quotaBytes ? this.formatSize(storageStats.quotaBytes) : '512 GB';
      responseText = `Here is a quick summary of your vault storage:\n• **Used Space**: ${this.formatSize(vault.totalBytes)} of ${quotaLabel} (${storageStats?.tier || 'Free Tier'})\n• **Files & Folders**: ${vault.activeFiles.length} active file(s) in ${vault.activeFolders.length} folder(s)\n• **Trash**: ${vault.trashFiles.length} item(s) (${this.formatSize(vault.trashBytes)})\n\n**Breakdown by Category**:\n${catBreakdown || '• No files uploaded yet'}`;
    } else {
      const matched = vault.activeFiles.filter(f => f.name.toLowerCase().includes(qLower));
      if (matched.length > 0) {
        const list = matched.slice(0, 8).map(f => `• **${f.name}** (${this.formatSize(f.size)} • ${f.category})`).join('\n');
        responseText = `I found **${matched.length} matching file(s)** in your vault:\n${list}`;
      } else {
        responseText = `I'm currently operating in local vault mode (check your internet connection if you want full cloud LLM reasoning). In your vault right now, you have **${vault.activeFiles.length} file(s)** (${this.formatSize(vault.totalBytes)}) across **${vault.activeFolders.length} folder(s)**. Try asking me to search for a filename, check duplicates, or summarize your storage!`;
      }
    }

    return { response: responseText, action: proposedAction };
  }
}

export const customAiEngine = new VaultAssistantEngine();

/**
 * Query real Google Gemini model with multi-turn conversation history, fast per-model timeout, and non-thought text extraction
 */
export async function queryGeminiNeuralModel(prompt, vaultContext = {}, chatHistory = []) {
  const activeKey = DEFAULT_GEMINI_API_KEY;

  const filesSummary = (vaultContext.activeFiles || [])
    .slice(0, 30)
    .map(f => `${f.name} (${f.category || 'file'}, ${customAiEngine.formatSize(f.size || 0)})`)
    .join('; ');

  const foldersSummary = (vaultContext.activeFolders || [])
    .slice(0, 20)
    .map(f => `${f.name} [${f.category || 'all'}]`)
    .join(', ');

  const docExcerptsSection = vaultContext.documentExcerpts
    ? `\nReadable Document Contents in User's Vault:\n${vaultContext.documentExcerpts}\n`
    : '';

  const systemPrompt = `You are StorageBank AI Agent, a natural, warm, highly intelligent AI assistant built into the StorageBank Cloud Vault platform (Developed By Arpon Chakraborty).

Personality & Behavior Guidelines:
- Speak naturally, conversationally, and helpfully like an elite human-like AI agent (such as ChatGPT / Gemini / Claude). Do NOT sound like a rigid status bot and do NOT dump raw telemetry tables unless the user actually asks about their files or storage.
- You can help with ANY request: general conversation, coding, writing essays/emails/contracts, explaining concepts, brainstorming, math, or managing and analyzing the user's cloud vault files.
- When the user asks about their vault, files, folders, storage space, or documents, use the Live Vault Context below to give exact, personalized answers.
- When the user asks to summarize, inspect, or answer questions about a document in their vault, use the Readable Document Contents below.
- When the user asks you to write, draft, or generate a document, note, or code script, write it cleanly so they can click "Save as Note" to save it directly into their vault.

Live Vault Context (Reference only when relevant):
- Plan: ${vaultContext.planName || 'Free Tier (512 GB)'}
- Used Storage: ${vaultContext.formattedTotal || '0 B'} of ${vaultContext.formattedQuota || '512 GB'}
- Active Files (${vaultContext.activeFiles?.length || 0}): ${filesSummary || 'None uploaded yet'}
- Active Folders (${vaultContext.activeFolders?.length || 0}): ${foldersSummary || 'None created yet'}
- Trash Items: ${vaultContext.trashCount || 0}${docExcerptsSection}`;

  // Build multi-turn conversation contents from recent chat history
  const recentTurns = (chatHistory || [])
    .filter(m => m && m.text && m.id !== 'msg-welcome')
    .slice(-8)
    .map(m => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: String(m.text) }]
    }));

  const contents = [
    {
      role: 'user',
      parts: [{ text: `[System Instructions]\n${systemPrompt}\n\nAcknowledge and follow these instructions naturally.` }]
    },
    {
      role: 'model',
      parts: [{ text: 'Understood. I will respond naturally, conversationally, and intelligently as the StorageBank AI Agent.' }]
    },
    ...recentTurns,
    {
      role: 'user',
      parts: [{ text: prompt }]
    }
  ];

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1500
    }
  };

  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7500);

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(activeKey)}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        lastError = new Error(errData?.error?.message || `HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      // Filter out internal thinking parts (p.thought === true) so we always get the actual natural response
      const nonThoughtParts = parts.filter(p => !p.thought && typeof p.text === 'string');
      const textOutput = (nonThoughtParts.length > 0 ? nonThoughtParts : parts)
        .map(p => p.text || '')
        .join('')
        .trim();

      if (textOutput) {
        return textOutput;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
    }
  }

  throw lastError || new Error('Gemini service temporarily unavailable');
}

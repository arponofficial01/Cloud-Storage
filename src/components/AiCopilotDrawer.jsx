import React, { useState, useEffect, useRef } from 'react';
import { useStorage } from '../context/StorageContext';
import { useAuth } from '../context/AuthContext';
import { customAiEngine, queryGeminiNeuralModel } from '../services/AetherAiEngine';
import { parseDocxBlob, extractPdfDetails } from '../utils/documentParser';
import { formatBytes } from '../utils/planQuotas';
import {
  Bot,
  Sparkles,
  X,
  Send,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  XCircle,
  FolderPlus,
  Trash2,
  History,
  Monitor,
  FileSearch,
  ArrowUpRight,
  FilePlus
} from 'lucide-react';

// Clean Markdown Renderer for AI Messages
function FormattedAiMessage({ text }) {
  const lines = String(text || '').split('\n');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} style={{ height: '4px' }} />;

        const formatInline = (str) => {
          const parts = str.split(/(\*\*.*?\*\*|`.*?`)/g);
          return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
              return (
                <code
                  key={i}
                  style={{
                    background: 'var(--bg-input)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '0.76rem'
                  }}
                >
                  {part.slice(1, -1)}
                </code>
              );
            }
            return part;
          });
        };

        if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
          const clean = trimmed.replace(/^#+\s*/, '');
          return (
            <div key={idx} style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)', marginTop: '4px' }}>
              {formatInline(clean)}
            </div>
          );
        }

        if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const clean = trimmed.replace(/^[•\-*]\s+/, '');
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', paddingLeft: '4px' }}>
              <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>&bull;</span>
              <span style={{ flex: 1 }}>{formatInline(clean)}</span>
            </div>
          );
        }

        return <div key={idx}>{formatInline(line)}</div>;
      })}
    </div>
  );
}

export function AiCopilotDrawer({ isOpen, onClose }) {
  const {
    storageStats,
    files,
    folders,
    setActiveCategory,
    setIsNewFolderOpen,
    batchDeletePermanently,
    setIsAnalyticsOpen,
    setIsDriveModalOpen,
    saveFile,
    setActivePreview,
    currentFolderId,
    addToast
  } = useStorage();
  const { user } = useAuth();

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('storagebank_ai_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Filter out any old prompt telling user to connect an API key
        if (Array.isArray(parsed) && parsed.length > 0 && !parsed[0]?.text?.includes('settings icon')) {
          return parsed.slice(-25);
        }
      }
    } catch {}
    return [
      {
        id: 'msg-welcome',
        sender: 'ai',
        text: '**StorageBank Gemini Copilot**\n\nConnected directly to your cloud vault inventory. Ask me to summarize your storage, search files, detect duplicates, or run instant vault actions.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: null
      }
    ];
  });

  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('storagebank_ai_chat_history', JSON.stringify(messages.slice(-25)));
    } catch {}
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, pendingAction]);

  if (!isOpen) return null;

  const activeFiles = (files || []).filter(f => !f.inTrash);
  const activeFolders = (folders || []).filter(f => !f.inTrash);
  const trashFiles = (files || []).filter(f => f.inTrash);

  const handleSend = async (textToSend) => {
    const query = (textToSend || inputValue || '').trim();
    if (!query || isTyping) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputValue('');
    setIsTyping(true);

    // Detect if query also maps to an interactive Vault Action
    const detectedAction = customAiEngine.detectActionForQuery(query, files, folders);

    try {
      const totalBytes = activeFiles.reduce((acc, f) => acc + (f.size || 0), 0);
      const formattedTotal = formatBytes(totalBytes);
      const formattedQuota = formatBytes(storageStats?.quotaBytes || 512 * 1024 * 1024 * 1024);

      // Extract readable text from up to 4 relevant documents/code files in the vault so Gemini can read & summarize them
      const qLower = query.toLowerCase();
      const candidateDocs = activeFiles
        .filter(f => (f.category === 'document' || f.category === 'code') && f.blob instanceof Blob)
        .sort((a, b) => {
          const aMatch = qLower.includes(a.name.toLowerCase().replace(/\.[^.]+$/, '')) ? 1 : 0;
          const bMatch = qLower.includes(b.name.toLowerCase().replace(/\.[^.]+$/, '')) ? 1 : 0;
          return bMatch - aMatch;
        })
        .slice(0, 4);

      const excerptList = [];
      for (const doc of candidateDocs) {
        try {
          const ext = (doc.name.split('.').pop() || '').toLowerCase();
          let txt = '';
          if (ext === 'docx') {
            const parsed = await parseDocxBlob(doc.blob);
            txt = parsed.text || '';
          } else if (ext === 'pdf') {
            const parsed = await extractPdfDetails(doc.blob);
            txt = parsed.extractedText || '';
          } else if (!['xlsx', 'xls', 'zip'].includes(ext)) {
            txt = await doc.blob.slice(0, 3000).text();
          }
          if (txt && txt.trim()) {
            excerptList.push(`--- File: ${doc.name} ---\n${txt.trim().slice(0, 1200)}`);
          }
        } catch {}
      }

      const geminiResponse = await queryGeminiNeuralModel(
        query,
        {
          activeFiles,
          activeFolders,
          trashCount: trashFiles.length,
          formattedTotal,
          formattedQuota,
          planName: storageStats?.tier || 'Free Tier (512 GB)',
          documentExcerpts: excerptList.join('\n\n')
        },
        messages
      );

      const aiMsg = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: geminiResponse,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: detectedAction
      };
      setMessages(prev => [...prev, aiMsg]);
      if (detectedAction) setPendingAction(detectedAction);
    } catch {
      // Seamless instant fallback to local vault telemetry reasoning if offline or rate-limited
      const result = customAiEngine.processUserQuery(query, storageStats, files, folders);
      const aiMsg = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: result.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: result.action || detectedAction
      };
      setMessages(prev => [...prev, aiMsg]);
      if (result.action || detectedAction) {
        setPendingAction(result.action || detectedAction);
      }
    } finally {
      setIsTyping(false);
    }
  };

  const handleApproveAction = async (action) => {
    if (!action) return;

    if (action.type === 'NAVIGATE_CONVERTER') {
      setActiveCategory('converter');
      addToast('Opened Format Converter Studio', 'success');
    } else if (action.type === 'CREATE_FOLDER') {
      setIsNewFolderOpen(true);
      addToast('Opened Folder & Document Creator', 'success');
    } else if (action.type === 'EMPTY_TRASH') {
      const trashedIds = trashFiles.map(f => f.id);
      if (trashedIds.length > 0) {
        await batchDeletePermanently(trashedIds);
        addToast(`Permanently deleted ${trashedIds.length} trash item(s)`, 'success');
      } else {
        addToast('Trash is already empty.', 'info');
      }
    } else if (action.type === 'SCAN_DUPLICATES' || action.type === 'OPEN_ANALYTICS') {
      setIsAnalyticsOpen(true);
      addToast('Opened Storage Analytics', 'success');
    } else if (action.type === 'OPEN_DRIVE_MOUNT') {
      setIsDriveModalOpen(true);
      addToast('Opened Windows Desktop Drive Mounter', 'success');
    }

    setPendingAction(null);
  };

  const clearChatHistory = () => {
    const initialMsg = [
      {
        id: `msg-${Date.now()}`,
        sender: 'ai',
        text: '**StorageBank Gemini Copilot**\n\nConversation reset. How can I assist with your vault today?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        action: null
      }
    ];
    setMessages(initialMsg);
    localStorage.removeItem('storagebank_ai_chat_history');
    setPendingAction(null);
    addToast('Copilot conversation cleared', 'info');
  };

  const quickPrompts = [
    { label: 'Vault Summary', prompt: 'Summarize my vault inventory and storage usage by category', icon: <HardDrive size={12} color="var(--accent-primary)" /> },
    { label: 'Scan Duplicates', prompt: 'Check my vault for duplicate or redundant files', icon: <FileSearch size={12} color="var(--accent-cyan)" /> },
    { label: 'New Folder / Doc', prompt: 'Create a new folder or document in my vault', icon: <FolderPlus size={12} color="var(--accent-emerald)" /> },
    { label: 'Format Converter', prompt: 'Convert file formats in Converter Studio', icon: <RefreshCw size={12} color="var(--accent-amber)" /> },
    { label: 'Mount PC Drive', prompt: 'How do I mount my cloud vault as a Windows PC network drive?', icon: <Monitor size={12} color="var(--accent-secondary)" /> },
    { label: 'Clean Trash', prompt: 'Inspect and empty my Trash bin', icon: <Trash2 size={12} color="var(--accent-rose)" /> }
  ];

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: '100%',
      maxWidth: '420px',
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border-subtle)',
      boxShadow: '-16px 0 48px rgba(0, 0, 0, 0.5)',
      zIndex: 2500,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Matte Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-primary)'
          }}>
            <Bot size={17} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Vault Copilot
              </h3>
              <span style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: 'var(--accent-emerald)',
                border: '1px solid rgba(16, 185, 129, 0.25)'
              }}>
                GEMINI 3.5
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>
              {activeFiles.length} files &bull; {activeFolders.length} folders indexed
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className="btn btn-ghost btn-icon"
            onClick={clearChatHistory}
            title="Reset conversation"
            style={{ width: '28px', height: '28px', padding: 0 }}
          >
            <History size={14} color="var(--text-muted)" />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            style={{ width: '28px', height: '28px', padding: 0 }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Quick Action Matrix — Horizontal Scrollable Pills for Clean Mobile & Desktop Fit */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '9px 14px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-input)',
        overflowX: 'auto',
        flexShrink: 0
      }}>
        {quickPrompts.map((item, idx) => (
          <button
            key={idx}
            type="button"
            className="btn btn-secondary"
            onClick={() => handleSend(item.prompt)}
            disabled={isTyping}
            style={{
              padding: '5px 10px',
              fontSize: '0.73rem',
              justifyContent: 'flex-start',
              background: 'var(--bg-surface)',
              borderRadius: '6px',
              gap: '5px',
              fontWeight: 500,
              flexShrink: 0
            }}
          >
            {item.icon}
            <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Chat Messages Timeline */}
      <div style={{
        flex: 1,
        padding: '16px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {messages.map(msg => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: '9px',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '90%'
              }}
            >
              {!isUser && (
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '6px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                  color: 'var(--accent-primary)'
                }}>
                  <Sparkles size={13} />
                </div>
              )}

              <div style={{
                background: isUser ? 'var(--accent-primary)' : 'var(--bg-surface)',
                color: isUser ? '#ffffff' : 'var(--text-secondary)',
                padding: '10px 13px',
                borderRadius: '8px',
                border: isUser ? 'none' : '1px solid var(--border-subtle)',
                fontSize: '0.8rem',
                lineHeight: '1.55'
              }}>
                {isUser ? (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                ) : (
                  <FormattedAiMessage text={msg.text} />
                )}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  marginTop: '6px'
                }}>
                  {!isUser && msg.text && msg.text.length > 60 ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const now = new Date().toISOString();
                        const noteName = `Copilot_Note_${Date.now().toString().slice(-4)}.md`;
                        const blob = new Blob([msg.text], { type: 'text/markdown' });
                        const rec = {
                          id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                          userId: user?.id || 'local',
                          folderId: currentFolderId || null,
                          name: noteName,
                          type: 'text/markdown',
                          category: 'document',
                          size: blob.size,
                          blob,
                          starred: false,
                          inTrash: false,
                          createdAt: now,
                          updatedAt: now,
                          tags: ['document', 'ai-note']
                        };
                        await saveFile(rec);
                        addToast(`Saved AI response as "${noteName}" in Documents`, 'success');
                        setActivePreview(rec);
                      }}
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.66rem',
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Save this AI response as a Markdown document in your vault"
                    >
                      <FilePlus size={10} color="var(--accent-primary)" />
                      <span>Save as Note</span>
                    </button>
                  ) : <span />}
                  <span style={{ fontSize: '0.64rem', opacity: 0.6 }}>
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Interactive Vault Action Card */}
        {pendingAction && (
          <div style={{
            borderRadius: '8px',
            padding: '12px 14px',
            border: '1px solid var(--border-strong)',
            background: 'var(--bg-surface)',
            marginTop: '4px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Suggested Vault Action
              </span>
              <ArrowUpRight size={13} color="var(--accent-primary)" />
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {pendingAction.title}
            </div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '2px', marginBottom: '10px' }}>
              {pendingAction.details}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleApproveAction(pendingAction)}
                style={{ padding: '5px 10px', fontSize: '0.75rem', flex: 1, borderRadius: '6px' }}
              >
                <CheckCircle2 size={13} />
                <span>Execute Action</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPendingAction(null)}
                style={{ padding: '5px 10px', fontSize: '0.75rem', borderRadius: '6px' }}
              >
                <XCircle size={13} />
                <span>Dismiss</span>
              </button>
            </div>
          </div>
        )}

        {isTyping && (
          <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-start', alignItems: 'center' }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)'
            }}>
              <Sparkles size={13} className="spin" />
            </div>
            <div style={{
              background: 'var(--bg-surface)',
              padding: '7px 12px',
              borderRadius: '8px',
              fontSize: '0.76rem',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)'
            }}>
              Analyzing vault with Gemini...
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex',
          gap: '8px'
        }}
      >
        <input
          type="text"
          className="input-text"
          placeholder="Ask Gemini about your files, storage, or actions..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          style={{ fontSize: '0.82rem', height: '36px', borderRadius: '7px' }}
        />
        <button
          type="submit"
          className="btn btn-primary btn-icon"
          disabled={!inputValue.trim() || isTyping}
          style={{ height: '36px', width: '36px', borderRadius: '7px', flexShrink: 0 }}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

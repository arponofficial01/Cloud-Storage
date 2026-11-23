import React, { useState, useEffect, useRef } from 'react';
import { useStorage } from '../context/StorageContext';
import {
  getDocumentKind,
  parseDocxBlob,
  buildDocxBlob,
  parseLegacyWordBlob,
  parseSpreadsheetBlob,
  rowsToCsv,
  parseCsvToRows,
  extractPdfDetails,
  compileTextToPdfBlob,
  applyPdfOperations
} from '../utils/documentParser';
import {
  X,
  Save,
  Download,
  Copy,
  FileText,
  Code2,
  Check,
  WrapText,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  RotateCw,
  Stamp,
  FilePlus,
  Table,
  Plus,
  Trash2,
  RefreshCw
} from 'lucide-react';

export function DocumentEditorModal({ file, isOpen, onClose }) {
  const { saveFile, replaceFile, reloadVault, addToast, logActivity, ensureFileBlob } = useStorage();

  const ext = (file?.name?.split('.').pop() || '').toLowerCase();
  const kind = getDocumentKind(file);
  const isPdf = kind === 'pdf';
  const isDocx = kind === 'docx';
  const isLegacyWord = kind === 'legacy-word';
  const isWord = isDocx || isLegacyWord;
  const isSheet = kind === 'xlsx' || kind === 'csv';
  const isHtml = kind === 'html';
  const isMarkdown = kind === 'markdown';
  const isJson = kind === 'json';
  const isCode = kind === 'code';

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState('replace'); // 'replace' | 'new'
  const [viewMode, setViewMode] = useState('split'); // 'edit' | 'split' | 'preview'
  const [wordWrap, setWordWrap] = useState(true);
  const [copied, setCopied] = useState(false);

  // Spreadsheet Table Editor State
  const [sheetRows, setSheetRows] = useState([['Column 1', 'Column 2'], ['', '']]);
  const [sheetEditMode, setSheetEditMode] = useState('grid'); // 'grid' | 'raw'

  // PDF Studio Editor State
  const [pdfMode, setPdfMode] = useState('tools'); // 'tools' | 'writer'
  const [pdfWorkingBlob, setPdfWorkingBlob] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [pdfRotateDeg, setPdfRotateDeg] = useState(0);
  const [pdfWatermark, setPdfWatermark] = useState('');
  const [pdfAppendText, setPdfAppendText] = useState('');
  const [pdfOrientation, setPdfOrientation] = useState('portrait');
  const [pdfCompiling, setPdfCompiling] = useState(false);

  const textareaRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    if (!file || !isOpen) return;

    const initEditor = async () => {
      setLoading(true);
      setPdfRotateDeg(0);
      setPdfWatermark('');
      setPdfAppendText('');

      let blob = file.blob;
      if (!(blob instanceof Blob) && typeof ensureFileBlob === 'function') {
        blob = await ensureFileBlob(file);
      }
      if (cancelled) return;
      const isMobileScreen = typeof window !== 'undefined' && window.innerWidth <= 768;
      const defaultRichView = isMobileScreen ? 'edit' : 'split';

      if (isPdf) {
        setViewMode(defaultRichView);
        if (blob instanceof Blob) {
          const typedPdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
          setPdfWorkingBlob(typedPdf);
          const details = await extractPdfDetails(typedPdf);
          if (!cancelled) {
            setPdfPageCount(details.pageCount || 1);
            setContent(
              details.extractedText ||
                `# ${file.name.replace(/\.pdf$/i, '')}\n\nWrite or edit document content here to compile a multi-page PDF.`
            );
            setPdfMode('tools');
          }
        } else {
          setContent(`# ${file.name.replace(/\.pdf$/i, '')}\n\n`);
          setPdfMode('writer');
        }
      } else if (isDocx && blob instanceof Blob) {
        setViewMode(defaultRichView);
        const parsed = await parseDocxBlob(blob);
        if (!cancelled) setContent(parsed.text || '');
      } else if (isLegacyWord && blob instanceof Blob) {
        setViewMode(defaultRichView);
        const parsed = await parseLegacyWordBlob(blob, ext);
        if (!cancelled) setContent(parsed.text || '');
      } else if (isSheet && blob instanceof Blob) {
        const parsed = await parseSpreadsheetBlob(blob, ext);
        if (!cancelled) {
          const rows = parsed.rows?.length > 0 ? parsed.rows : [['Column 1', 'Column 2'], ['', '']];
          setSheetRows(rows);
          setContent(parsed.csvText || rowsToCsv(rows));
          setSheetEditMode('grid');
        }
      } else if (blob instanceof Blob) {
        setViewMode(isMarkdown || isHtml ? defaultRichView : 'edit');
        const txt = await blob.text();
        if (!cancelled) setContent(txt);
      } else if (typeof file.content === 'string') {
        setViewMode(isMarkdown || isHtml || isWord ? defaultRichView : 'edit');
        setContent(file.content);
      } else {
        setContent('');
      }

      if (!cancelled) setLoading(false);
    };

    initEditor();

    return () => {
      cancelled = true;
    };
  }, [file, isOpen, isPdf, isDocx, isLegacyWord, isWord, isSheet, isMarkdown, isHtml, ext, ensureFileBlob]);

  // Manage PDF Object URL lifecycle
  useEffect(() => {
    if (!pdfWorkingBlob) {
      setPdfPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pdfWorkingBlob);
    setPdfPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfWorkingBlob]);

  if (!isOpen || !file) return null;

  const lines = content.split('\n').length;
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const chars = content.length;

  // Rich Text / Markdown Insertion Helper
  const insertFormatting = (prefix, suffix = '') => {
    const el = textareaRef.current;
    if (!el) {
      setContent(prev => prev + '\n' + prefix + suffix);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const selected = content.substring(start, end) || 'Text';
    const replacement = `${prefix}${selected}${suffix}`;
    const updated = content.substring(0, start) + replacement + content.substring(end);
    setContent(updated);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 10);
  };

  // Spreadsheet Helpers
  const handleCellChange = (rIdx, cIdx, val) => {
    setSheetRows(prev => {
      const next = prev.map(r => [...r]);
      next[rIdx][cIdx] = val;
      setContent(rowsToCsv(next));
      return next;
    });
  };

  const handleAddRow = () => {
    setSheetRows(prev => {
      const cols = prev[0]?.length || 2;
      const next = [...prev, Array(cols).fill('')];
      setContent(rowsToCsv(next));
      return next;
    });
  };

  const handleAddColumn = () => {
    setSheetRows(prev => {
      const next = prev.map((row, idx) => [...row, idx === 0 ? `Column ${row.length + 1}` : '']);
      setContent(rowsToCsv(next));
      return next;
    });
  };

  const handleRemoveRow = (rIdx) => {
    if (sheetRows.length <= 1) return;
    setSheetRows(prev => {
      const next = prev.filter((_, idx) => idx !== rIdx);
      setContent(rowsToCsv(next));
      return next;
    });
  };

  // PDF Operations Helpers
  const handleApplyPdfPageTools = async () => {
    if (!pdfWorkingBlob) return;
    setPdfCompiling(true);
    try {
      const updatedBlob = await applyPdfOperations(pdfWorkingBlob, {
        rotateDeg: pdfRotateDeg,
        watermarkText: pdfWatermark,
        appendPageText: pdfAppendText
      });
      const details = await extractPdfDetails(updatedBlob);
      setPdfWorkingBlob(updatedBlob);
      setPdfPageCount(details.pageCount || pdfPageCount);
      setPdfRotateDeg(0);
      setPdfAppendText('');
      addToast('Applied PDF edits to live preview', 'success');
    } catch (err) {
      addToast('Could not modify PDF: ' + err.message, 'error');
    } finally {
      setPdfCompiling(false);
    }
  };

  const handleCompileTextToPdf = async () => {
    setPdfCompiling(true);
    try {
      const compiled = await compileTextToPdfBlob(file.name.replace(/\.pdf$/i, ''), content, {
        orientation: pdfOrientation
      });
      const details = await extractPdfDetails(compiled);
      setPdfWorkingBlob(compiled);
      setPdfPageCount(details.pageCount || 1);
      addToast('Compiled multi-page PDF preview', 'success');
    } catch (err) {
      addToast('Failed to compile PDF: ' + err.message, 'error');
    } finally {
      setPdfCompiling(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    addToast('Copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(content);
      setContent(JSON.stringify(parsed, null, 2));
      addToast('Formatted JSON', 'success');
    } catch {
      addToast('Invalid JSON syntax', 'error');
    }
  };

  const buildOutputBlobAndMeta = async () => {
    if (isPdf) {
      let finalPdf = pdfWorkingBlob;
      if (pdfMode === 'writer' || !finalPdf) {
        finalPdf = await compileTextToPdfBlob(file.name.replace(/\.pdf$/i, ''), content, {
          orientation: pdfOrientation
        });
      } else if (pdfRotateDeg || pdfWatermark.trim() || pdfAppendText.trim()) {
        finalPdf = await applyPdfOperations(finalPdf, {
          rotateDeg: pdfRotateDeg,
          watermarkText: pdfWatermark,
          appendPageText: pdfAppendText
        });
      }
      return {
        blob: finalPdf,
        mime: 'application/pdf',
        extOverride: '.pdf'
      };
    }

    if (isDocx || isLegacyWord) {
      const docxBlob = await buildDocxBlob(file.name.replace(/\.[^.]+$/, ''), content);
      return {
        blob: docxBlob,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extOverride: '.docx'
      };
    }

    if (isSheet) {
      const csvOut = sheetEditMode === 'grid' ? rowsToCsv(sheetRows) : content;
      const csvBlob = new Blob([csvOut], { type: 'text/csv' });
      return {
        blob: csvBlob,
        mime: 'text/csv',
        extOverride: ext === 'xlsx' ? '.csv' : `.${ext || 'csv'}`
      };
    }

    const mime =
      file.type ||
      (isMarkdown ? 'text/markdown' : isHtml ? 'text/html' : isJson ? 'application/json' : isCode ? 'text/javascript' : 'text/plain');
    return {
      blob: new Blob([content], { type: mime }),
      mime,
      extOverride: null
    };
  };

  const handleDownload = async () => {
    const { blob } = await buildOutputBlobAndMeta();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSaveToVault = async () => {
    setSaving(true);
    try {
      const { blob, mime, extOverride } = await buildOutputBlobAndMeta();

      if (saveMode === 'replace') {
        await replaceFile(file.id, blob, { type: mime, size: blob.size });
        addToast(`Saved changes to "${file.name}"`, 'success');
        if (logActivity) logActivity('EDIT', `Edited document: ${file.name}`);
      } else {
        const dotIndex = file.name.lastIndexOf('.');
        const base = dotIndex !== -1 ? file.name.substring(0, dotIndex) : file.name;
        const extStr = extOverride || (dotIndex !== -1 ? file.name.substring(dotIndex) : '.txt');
        const newName = `${base}_edited_${Date.now()}${extStr}`;

        await saveFile({
          id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          name: newName,
          type: mime,
          size: blob.size,
          category: file.category || 'document',
          blob,
          folderId: file.folderId || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: ['edited', file.category || 'document']
        });

        addToast(`Saved new version "${newName}"`, 'success');
        if (logActivity) logActivity('SAVE', `Saved new version: ${newName}`);
      }

      await reloadVault();
      onClose();
    } catch (err) {
      console.error(err);
      addToast('Failed to save file: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderFormattedPreview = () => {
    return (content || '').split('\n').map((line, idx) => {
      if (line.startsWith('# ')) {
        return <h1 key={idx} style={{ fontSize: '1.45rem', fontWeight: 700, margin: '14px 0 8px 0' }}>{line.slice(2)}</h1>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} style={{ fontSize: '1.2rem', fontWeight: 600, margin: '12px 0 6px 0' }}>{line.slice(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={idx} style={{ fontSize: '1.04rem', fontWeight: 600, margin: '10px 0 4px 0' }}>{line.slice(4)}</h3>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <div key={idx} style={{ display: 'flex', gap: '8px', margin: '3px 0 3px 12px' }}>
            <span>&bull;</span>
            <span>{line.slice(2)}</span>
          </div>
        );
      }
      if (line.trim() === '---') {
        return <hr key={idx} style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '14px 0' }} />;
      }
      if (!line.trim()) {
        return <div key={idx} style={{ height: '10px' }} />;
      }
      return <p key={idx} style={{ margin: '0 0 8px 0', lineHeight: 1.65 }}>{line}</p>;
    });
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '95vw',
          maxWidth: '1220px',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)'
        }}
      >
        {/* ── Top Header Bar ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '6px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isPdf ? '#ef4444' : isWord ? '#3b82f6' : isSheet ? '#10b981' : 'var(--accent-primary)',
              flexShrink: 0
            }}>
              {isCode ? <Code2 size={15} /> : isSheet ? <Table size={15} /> : <FileText size={15} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {file.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{isPdf ? `PDF Studio (${pdfPageCount} page${pdfPageCount !== 1 ? 's' : ''})` : isWord ? 'Word OpenXML Editor' : isSheet ? `Spreadsheet (${sheetRows.length} rows)` : `${ext.toUpperCase()} Editor`}</span>
                {!isSheet && (
                  <>
                    <span>&bull;</span>
                    <span>{lines} lines</span>
                    <span>&bull;</span>
                    <span>{words} words</span>
                    <span>&bull;</span>
                    <span>{chars} chars</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Center Mode Switchers */}
          {isPdf ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-input)',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid var(--border-subtle)'
            }}>
              <button
                className="btn btn-ghost"
                onClick={() => setPdfMode('tools')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  borderRadius: '5px',
                  background: pdfMode === 'tools' ? 'var(--bg-surface)' : 'transparent',
                  color: pdfMode === 'tools' ? 'var(--text-primary)' : 'var(--text-muted)'
                }}
              >
                PDF Page Tools
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setPdfMode('writer')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  borderRadius: '5px',
                  background: pdfMode === 'writer' ? 'var(--bg-surface)' : 'transparent',
                  color: pdfMode === 'writer' ? 'var(--text-primary)' : 'var(--text-muted)'
                }}
              >
                Edit &amp; Compile Text
              </button>
            </div>
          ) : isSheet ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-input)',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid var(--border-subtle)'
            }}>
              <button
                className="btn btn-ghost"
                onClick={() => setSheetEditMode('grid')}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  borderRadius: '5px',
                  background: sheetEditMode === 'grid' ? 'var(--bg-surface)' : 'transparent',
                  color: sheetEditMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)'
                }}
              >
                Table Grid
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setContent(rowsToCsv(sheetRows));
                  setSheetEditMode('raw');
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  borderRadius: '5px',
                  background: sheetEditMode === 'raw' ? 'var(--bg-surface)' : 'transparent',
                  color: sheetEditMode === 'raw' ? 'var(--text-primary)' : 'var(--text-muted)'
                }}
              >
                Raw CSV
              </button>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-input)',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid var(--border-subtle)'
            }}>
              {['edit', 'split', 'preview'].map((m) => (
                <button
                  key={m}
                  className="btn btn-ghost"
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.74rem',
                    borderRadius: '5px',
                    textTransform: 'capitalize',
                    background: viewMode === m ? 'var(--bg-surface)' : 'transparent',
                    color: viewMode === m ? 'var(--text-primary)' : 'var(--text-muted)'
                  }}
                >
                  {m === 'edit' ? 'Editor' : m === 'split' ? 'Split View' : 'Page Preview'}
                </button>
              ))}
            </div>
          )}

          {/* Right Quick Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {isJson && (
              <button
                className="btn btn-secondary"
                onClick={handleFormatJson}
                style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: '6px' }}
              >
                Format JSON
              </button>
            )}

            {!isSheet && !isPdf && (
              <button
                className="btn btn-secondary"
                onClick={() => setWordWrap(!wordWrap)}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.74rem',
                  borderRadius: '6px',
                  gap: '4px',
                  color: wordWrap ? 'var(--accent-primary)' : 'var(--text-muted)'
                }}
                title="Toggle Word Wrap"
              >
                <WrapText size={13} />
                <span className="desktop-only">Wrap</span>
              </button>
            )}

            <button
              className="btn btn-secondary"
              onClick={handleCopy}
              style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: '6px', gap: '4px' }}
              title="Copy content"
            >
              {copied ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
              <span className="desktop-only">{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              className="btn btn-ghost btn-icon"
              onClick={onClose}
              style={{ padding: '4px', height: '28px', width: '28px' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Formatting Toolbar (for Word, Markdown, Text, HTML, and PDF Writer) ── */}
        {!loading && ((isPdf && pdfMode === 'writer') || (!isPdf && !isSheet && !isCode)) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-input)',
            flexWrap: 'wrap'
          }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => insertFormatting('# ')}
              style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: '5px', gap: '4px' }}
              title="Heading 1"
            >
              <Heading1 size={13} />
              <span>H1</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => insertFormatting('## ')}
              style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: '5px', gap: '4px' }}
              title="Heading 2"
            >
              <Heading2 size={13} />
              <span>H2</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => insertFormatting('**', '**')}
              style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: '5px', gap: '4px' }}
              title="Bold"
            >
              <Bold size={13} />
              <span>Bold</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => insertFormatting('*', '*')}
              style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: '5px', gap: '4px' }}
              title="Italic"
            >
              <Italic size={13} />
              <span>Italic</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => insertFormatting('- ')}
              style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: '5px', gap: '4px' }}
              title="Bullet List"
            >
              <List size={13} />
              <span>Bullet List</span>
            </button>

            {isPdf && pdfMode === 'writer' && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={pdfOrientation}
                  onChange={(e) => setPdfOrientation(e.target.value)}
                  className="input-text"
                  style={{ height: '28px', padding: '0 8px', fontSize: '0.74rem', width: 'auto' }}
                >
                  <option value="portrait">A4 Portrait</option>
                  <option value="landscape">A4 Landscape</option>
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCompileTextToPdf}
                  disabled={pdfCompiling}
                  style={{ padding: '4px 10px', fontSize: '0.74rem', borderRadius: '5px', gap: '5px' }}
                >
                  <RefreshCw size={12} className={pdfCompiling ? 'spin' : ''} />
                  <span>Update PDF Preview</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Main Editor Workspace ── */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            Loading document workspace...
          </div>
        ) : isPdf ? (
          /* PDF STUDIO WORKSPACE */
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            {/* Left Control / Editor Panel */}
            <div style={{
              width: '45%',
              minWidth: '310px',
              borderRight: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto'
            }}>
              {pdfMode === 'tools' ? (
                <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)'
                  }}>
                    Modify the existing PDF structure (rotate pages, stamp a watermark, or append a new page) and preview changes live on the right.
                  </div>

                  {/* Rotate Pages */}
                  <div style={{
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Rotate All Pages</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Queued rotation: {pdfRotateDeg}°
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setPdfRotateDeg(d => (d + 90) % 360)}
                      style={{ fontSize: '0.76rem', padding: '6px 12px', borderRadius: '6px', gap: '5px' }}
                    >
                      <RotateCw size={13} />
                      <span>Rotate +90°</span>
                    </button>
                  </div>

                  {/* Watermark / Header Stamp */}
                  <div style={{
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <Stamp size={14} color="var(--accent-primary)" />
                      <span>Stamp Diagonal Watermark</span>
                    </div>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="e.g. CONFIDENTIAL / APPROVED"
                      value={pdfWatermark}
                      onChange={(e) => setPdfWatermark(e.target.value)}
                      style={{ fontSize: '0.82rem', padding: '8px 10px', borderRadius: '6px' }}
                    />
                  </div>

                  {/* Append Page */}
                  <div style={{
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <FilePlus size={14} color="var(--accent-emerald)" />
                      <span>Append New Page with Notes</span>
                    </div>
                    <textarea
                      className="input-text"
                      rows={5}
                      placeholder="Type content to append as a new page at the end of this PDF..."
                      value={pdfAppendText}
                      onChange={(e) => setPdfAppendText(e.target.value)}
                      style={{ fontSize: '0.82rem', padding: '8px 10px', borderRadius: '6px', resize: 'vertical' }}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleApplyPdfPageTools}
                    disabled={pdfCompiling}
                    style={{ width: '100%', justifyContent: 'center', padding: '9px', fontSize: '0.82rem', borderRadius: '7px' }}
                  >
                    <RefreshCw size={14} className={pdfCompiling ? 'spin' : ''} />
                    <span>{pdfCompiling ? 'Updating PDF...' : 'Apply Edits to Live PDF Preview'}</span>
                  </button>
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write or edit document text to compile into a PDF..."
                  style={{
                    flex: 1,
                    width: '100%',
                    padding: '16px',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit',
                    fontSize: '0.86rem',
                    lineHeight: 1.65
                  }}
                />
              )}
            </div>

            {/* Right Live PDF Viewer */}
            <div style={{ flex: 1, background: '#18181b', display: 'flex', flexDirection: 'column' }}>
              {pdfPreviewUrl ? (
                <iframe
                  src={pdfPreviewUrl}
                  title="Live PDF Preview"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff' }}
                />
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                  Click &ldquo;Update PDF Preview&rdquo; to render PDF pages.
                </div>
              )}
            </div>
          </div>
        ) : isSheet ? (
          /* SPREADSHEET WORKSPACE */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
            {sheetEditMode === 'grid' ? (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input)'
                }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddRow}
                    style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: '6px', gap: '4px' }}
                  >
                    <Plus size={12} />
                    <span>Add Row</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddColumn}
                    style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: '6px', gap: '4px' }}
                  >
                    <Plus size={12} />
                    <span>Add Column</span>
                  </button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-surface)', fontSize: '0.8rem' }}>
                    <tbody>
                      {sheetRows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td style={{
                            width: '38px',
                            textAlign: 'center',
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-muted)',
                            fontSize: '0.72rem'
                          }}>
                            {rIdx === 0 ? 'HDR' : rIdx}
                          </td>
                          {row.map((cellVal, cIdx) => (
                            <td key={cIdx} style={{ border: '1px solid var(--border-subtle)', padding: 0 }}>
                              <input
                                type="text"
                                value={cellVal}
                                onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                                style={{
                                  width: '100%',
                                  minWidth: '110px',
                                  padding: '7px 10px',
                                  border: 'none',
                                  outline: 'none',
                                  background: rIdx === 0 ? 'var(--bg-secondary)' : 'transparent',
                                  color: 'var(--text-primary)',
                                  fontWeight: rIdx === 0 ? 600 : 400,
                                  fontSize: '0.8rem'
                                }}
                              />
                            </td>
                          ))}
                          <td style={{ width: '34px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(rIdx)}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                              title="Delete row"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setSheetRows(parseCsvToRows(e.target.value));
                }}
                style={{
                  flex: 1,
                  width: '100%',
                  padding: '16px',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '0.84rem',
                  lineHeight: 1.6
                }}
              />
            )}
          </div>
        ) : (
          /* WORD / MARKDOWN / HTML / CODE / TEXT WORKSPACE */
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            {(viewMode === 'edit' || viewMode === 'split') && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-secondary)',
                borderRight: viewMode === 'split' ? '1px solid var(--border-subtle)' : 'none'
              }}>
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write or edit your document content here..."
                  spellCheck={!isCode}
                  style={{
                    flex: 1,
                    width: '100%',
                    padding: '18px',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: isCode ? 'var(--font-mono, monospace)' : 'inherit',
                    fontSize: '0.86rem',
                    lineHeight: '1.65',
                    whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                    overflowY: 'auto',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            {(viewMode === 'preview' || viewMode === 'split') && (
              <div style={{
                flex: 1,
                padding: '24px 32px',
                overflowY: 'auto',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                lineHeight: '1.7'
              }}>
                {isHtml ? (
                  <iframe
                    title="HTML Preview"
                    srcDoc={content}
                    style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff', borderRadius: '6px' }}
                  />
                ) : (
                  <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                    <div style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      marginBottom: '14px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid var(--border-subtle)',
                      letterSpacing: '0.05em'
                    }}>
                      {isWord ? 'Word Document Live Page Preview' : 'Rendered Document Preview'}
                    </div>
                    {renderFormattedPreview()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Footer Bar ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="docSaveMode"
                checked={saveMode === 'replace'}
                onChange={() => setSaveMode('replace')}
              />
              <span>Replace in Vault</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="docSaveMode"
                checked={saveMode === 'new'}
                onChange={() => setSaveMode('new')}
              />
              <span>Save as New Version</span>
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={handleDownload}
              style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px', gap: '5px' }}
            >
              <Download size={13} />
              <span>Download</span>
            </button>
            <button
              className="btn btn-ghost"
              onClick={onClose}
              disabled={saving}
              style={{ fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px' }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSaveToVault}
              disabled={saving}
              style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: '6px', gap: '6px' }}
            >
              <Save size={13} />
              <span>{saving ? 'Saving...' : saveMode === 'replace' ? 'Save Changes' : 'Save as New'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

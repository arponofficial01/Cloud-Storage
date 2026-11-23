import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useStorage } from '../context/StorageContext';
import {
  getDocumentKind,
  parseDocxBlob,
  parseLegacyWordBlob,
  parseSpreadsheetBlob
} from '../utils/documentParser';

const MediaEditorModal = lazy(() => import('./MediaEditorModal').then(m => ({ default: m.MediaEditorModal })));
const DocumentEditorModal = lazy(() => import('./DocumentEditorModal').then(m => ({ default: m.DocumentEditorModal })));

import {
  X,
  Download,
  Share2,
  Maximize2,
  Minimize2,
  Sliders,
  RotateCw,
  Sun,
  Contrast,
  RefreshCw,
  Pencil,
  ExternalLink,
  RotateCcw,
  FileText,
  Table,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export function FilePreviewModal() {
  const {
    activePreview,
    setActivePreview,
    setActiveShare,
    setActiveCategory,
    downloadFile,
    ensureFileBlob,
    restoreFromTrash,
    displayedFiles
  } = useStorage();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMediaEditorOpen, setIsMediaEditorOpen] = useState(false);
  const [isDocEditorOpen, setIsDocEditorOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);

  const currentIndex = Array.isArray(displayedFiles) && activePreview
    ? displayedFiles.findIndex(f => f.id === activePreview.id)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && Array.isArray(displayedFiles) && currentIndex < displayedFiles.length - 1;

  const handlePrev = () => {
    if (hasPrev) setActivePreview(displayedFiles[currentIndex - 1]);
  };

  const handleNext = () => {
    if (hasNext) setActivePreview(displayedFiles[currentIndex + 1]);
  };

  // Image Filter Controls
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [showFilterBar, setShowFilterBar] = useState(false);

  const [objectUrl, setObjectUrl] = useState(null);
  const [textContent, setTextContent] = useState('');
  const [docHtml, setDocHtml] = useState('');
  const [sheetRows, setSheetRows] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let currentUrl = null;

    if (!activePreview) {
      setObjectUrl(null);
      setTextContent('');
      setDocHtml('');
      setSheetRows([]);
      setBrightness(100);
      setContrast(100);
      setRotation(0);
      setShowFilterBar(false);
      setLoadingPreview(false);
      return;
    }

    const loadPreviewData = async () => {
      setLoadingPreview(true);
      setDocHtml('');
      setSheetRows([]);
      setTextContent('');

      let blob = activePreview.blob;
      if (!(blob instanceof Blob) && typeof ensureFileBlob === 'function') {
        blob = await ensureFileBlob(activePreview);
      }

      if (cancelled) return;

      const kind = getDocumentKind(activePreview);
      const ext = (activePreview.name?.split('.').pop() || '').toLowerCase();

      if (blob instanceof Blob) {
        // Ensure PDF blobs explicitly carry application/pdf mime so browser iframe viewer renders
        const effectiveBlob =
          kind === 'pdf' && blob.type !== 'application/pdf'
            ? new Blob([blob], { type: 'application/pdf' })
            : blob;

        currentUrl = URL.createObjectURL(effectiveBlob);
        setObjectUrl(currentUrl);

        if (kind === 'docx') {
          const parsed = await parseDocxBlob(blob);
          if (!cancelled) {
            setDocHtml(parsed.html);
            setTextContent(parsed.text);
          }
        } else if (kind === 'legacy-word') {
          const parsed = await parseLegacyWordBlob(blob, ext);
          if (!cancelled) {
            setDocHtml(parsed.html);
            setTextContent(parsed.text);
          }
        } else if (kind === 'xlsx' || kind === 'csv') {
          const parsed = await parseSpreadsheetBlob(blob, ext);
          if (!cancelled) {
            setSheetRows(parsed.rows || []);
            setTextContent(parsed.csvText || '');
          }
        } else if (['markdown', 'html', 'json', 'code', 'text'].includes(kind)) {
          try {
            const txt = await blob.text();
            if (!cancelled) setTextContent(txt);
          } catch {}
        }
      } else if (typeof activePreview.content === 'string') {
        setTextContent(activePreview.content);
      }

      if (!cancelled) setLoadingPreview(false);
    };

    loadPreviewData();

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [activePreview, ensureFileBlob]);

  // Keyboard Navigation (ArrowLeft / ArrowRight / Escape)
  useEffect(() => {
    if (!activePreview || isMediaEditorOpen || isDocEditorOpen) return;
    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        setActivePreview(displayedFiles[currentIndex - 1]);
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        setActivePreview(displayedFiles[currentIndex + 1]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setActivePreview(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePreview, isMediaEditorOpen, isDocEditorOpen, hasPrev, hasNext, currentIndex, displayedFiles, setActivePreview]);

  if (!activePreview) return null;

  const kind = getDocumentKind(activePreview);
  const isPdf = kind === 'pdf';
  const isWord = kind === 'docx' || kind === 'legacy-word';
  const isSheet = kind === 'xlsx' || kind === 'csv';
  const isMarkdown = kind === 'markdown';
  const isHtml = kind === 'html';
  const isEditableDoc = ['pdf', 'docx', 'legacy-word', 'xlsx', 'csv', 'markdown', 'html', 'json', 'code', 'text'].includes(kind);
  const isEditableMedia =
    activePreview.category === 'image' ||
    activePreview.category === 'video';

  const handleDownload = () => {
    if (downloadFile) {
      downloadFile(activePreview);
    } else if (objectUrl) {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = activePreview.name;
      a.click();
    }
  };

  const handleOpenInNewTab = () => {
    if (objectUrl) {
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenConverterPage = () => {
    setActivePreview(null);
    setActiveCategory('converter');
  };

  const handleOpenEdit = () => {
    if (isEditableMedia) {
      setIsMediaEditorOpen(true);
    } else {
      setIsDocEditorOpen(true);
    }
  };

  const handleRestore = async () => {
    if (restoreFromTrash) {
      await restoreFromTrash(activePreview.id, false);
      setActivePreview(prev => (prev ? { ...prev, inTrash: false } : null));
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        padding: isFullscreen ? '0' : '20px',
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 2000
      }}
      onClick={() => setActivePreview(null)}
    >
      <div
        className="preview-modal-shell"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isFullscreen ? '100vw' : '94vw',
          maxWidth: isFullscreen ? '100vw' : '1220px',
          height: isFullscreen ? '100vh' : '90vh',
          background: 'var(--bg-modal)',
          borderRadius: isFullscreen ? '0' : '10px',
          border: isFullscreen ? 'none' : '1px solid var(--border-subtle)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.55)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Top Control Bar */}
        <div
          className="preview-modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: isPdf ? '#ef4444' : isWord ? '#3b82f6' : isSheet ? '#10b981' : 'var(--accent-primary)',
              background: 'var(--bg-input)',
              padding: '2px 7px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)'
            }}>
              {kind.toUpperCase()}
            </span>
            <h3 style={{
              fontSize: '0.88rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap'
            }}>
              {activePreview.name}
            </h3>
            {activePreview.inTrash && (
              <span style={{
                fontSize: '0.66rem',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: '4px',
                background: 'rgba(244, 63, 94, 0.14)',
                color: 'var(--accent-rose)',
                border: '1px solid rgba(244, 63, 94, 0.3)'
              }}>
                In Trash
              </span>
            )}
          </div>

          <div className="preview-modal-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {activePreview.inTrash && (
              <button
                className="btn btn-secondary"
                onClick={handleRestore}
                title="Restore file from Trash"
                style={{ fontSize: '0.76rem', padding: '4px 10px', gap: '5px', height: '30px', borderRadius: '6px', color: 'var(--accent-emerald)' }}
              >
                <RotateCcw size={12} />
                <span>Restore</span>
              </button>
            )}

            {objectUrl && (isPdf || activePreview.category === 'image') && (
              <button
                className="btn btn-ghost"
                onClick={handleOpenInNewTab}
                title="Open in new browser tab"
                style={{ fontSize: '0.76rem', padding: '4px 9px', gap: '5px', height: '30px', borderRadius: '6px' }}
              >
                <ExternalLink size={13} />
                <span className="desktop-only">Open Tab</span>
              </button>
            )}

            <button
              className="btn btn-ghost btn-icon"
              onClick={handleOpenConverterPage}
              title="Convert format"
              style={{ padding: '6px', height: '30px', width: '30px' }}
            >
              <RefreshCw size={14} color="var(--text-secondary)" />
            </button>

            {(activePreview.category === 'image' || activePreview.category === 'video') && (
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setShowFilterBar(prev => !prev)}
                title="Adjust visual filters"
                style={{ padding: '6px', height: '30px', width: '30px', background: showFilterBar ? 'var(--bg-surface-hover)' : 'transparent' }}
              >
                <Sliders size={14} color="var(--text-secondary)" />
              </button>
            )}

            {(isEditableMedia || isEditableDoc) && (
              <button
                className="btn btn-primary"
                onClick={handleOpenEdit}
                title="Open Editor Tools"
                style={{ fontSize: '0.78rem', padding: '4px 12px', gap: '5px', height: '30px', borderRadius: '6px' }}
              >
                <Pencil size={12} />
                <span>
                  {activePreview.category === 'video'
                    ? 'Edit Video'
                    : activePreview.category === 'image'
                    ? 'Edit Image'
                    : isPdf
                    ? 'Edit PDF'
                    : isWord
                    ? 'Edit Word Doc'
                    : isSheet
                    ? 'Edit Sheet'
                    : 'Edit'}
                </span>
              </button>
            )}

            <button
              className="btn btn-ghost btn-icon"
              onClick={handleDownload}
              title="Download"
              style={{ padding: '6px', height: '30px', width: '30px' }}
            >
              <Download size={14} color="var(--text-secondary)" />
            </button>

            {!activePreview.inTrash && (
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setActiveShare(activePreview)}
                title="Share Link"
                style={{ padding: '6px', height: '30px', width: '30px' }}
              >
                <Share2 size={14} color="var(--text-secondary)" />
              </button>
            )}

            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setIsFullscreen(prev => !prev)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              style={{ padding: '6px', height: '30px', width: '30px' }}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)', margin: '0 2px' }} />

            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setActivePreview(null)}
              style={{ padding: '6px', height: '30px', width: '30px' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter Adjustment Bar */}
        {showFilterBar && (activePreview.category === 'image' || activePreview.category === 'video') && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            padding: '8px 16px',
            background: 'var(--bg-input)',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: '0.76rem',
            color: 'var(--text-secondary)',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sun size={13} />
              <span>Brightness</span>
              <input type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(e.target.value)} style={{ width: '90px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Contrast size={13} />
              <span>Contrast</span>
              <input type="range" min="50" max="150" value={contrast} onChange={(e) => setContrast(e.target.value)} style={{ width: '90px' }} />
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => setRotation(r => (r + 90) % 360)}
              style={{ fontSize: '0.75rem', padding: '4px 8px', gap: '5px' }}
            >
              <RotateCw size={12} />
              <span>Rotate</span>
            </button>
          </div>
        )}

        {/* Main Canvas */}
        <div
          onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            if (touchStartX === null) return;
            const endX = e.changedTouches[0]?.clientX ?? touchStartX;
            const diff = touchStartX - endX;
            if (Math.abs(diff) > 60) {
              if (diff > 0 && hasNext) handleNext();
              else if (diff < 0 && hasPrev) handlePrev();
            }
            setTouchStartX(null);
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: (activePreview.category === 'image' || activePreview.category === 'video' || isPdf) ? '0' : '16px',
            background: (activePreview.category === 'image' || activePreview.category === 'video') ? '#090a0f' : 'var(--bg-secondary)',
            overflow: 'auto',
            minHeight: 0,
            position: 'relative'
          }}
        >
          {/* Previous File Floating Button */}
          {hasPrev && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handlePrev(); }}
              title="Previous File (Left Arrow)"
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 30,
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(13, 15, 18, 0.78)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(0,0,0,0.45)'
              }}
            >
              <ChevronLeft size={18} />
            </button>
          )}

          {/* Next File Floating Button */}
          {hasNext && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleNext(); }}
              title="Next File (Right Arrow)"
              style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 30,
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(13, 15, 18, 0.78)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(0,0,0,0.45)'
              }}
            >
              <ChevronRight size={18} />
            </button>
          )}
          {loadingPreview ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: 'var(--text-muted)' }}>
              <Loader2 size={28} className="spin" color="var(--accent-primary)" />
              <span style={{ fontSize: '0.82rem' }}>Loading preview...</span>
            </div>
          ) : activePreview.category === 'image' && objectUrl ? (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0',
              overflow: 'hidden'
            }}>
              <img
                src={objectUrl}
                alt={activePreview.name}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease',
                  display: 'block',
                  border: 'none'
                }}
              />
            </div>
          ) : activePreview.category === 'video' && objectUrl ? (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0',
              overflow: 'hidden',
              background: '#090a0f'
            }}>
              <video
                src={objectUrl}
                controls
                autoPlay
                playsInline
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease',
                  display: 'block',
                  border: 'none',
                  outline: 'none'
                }}
              />
            </div>
          ) : activePreview.category === 'audio' && objectUrl ? (
            <div style={{ textAlign: 'center', padding: '30px' }}>
              <audio src={objectUrl} controls autoPlay style={{ width: '320px' }} />
            </div>
          ) : isPdf && objectUrl ? (
            <iframe
              src={objectUrl}
              title={activePreview.name}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: '#ffffff'
              }}
            />
          ) : isWord ? (
            /* Word Document (.docx / .doc / .rtf / .odt) Formatted Paper Sheet View */
            <div style={{
              width: '100%',
              height: '100%',
              overflowY: 'auto',
              display: 'flex',
              justifyContent: 'center',
              padding: '16px'
            }}>
              <div style={{
                width: '100%',
                maxWidth: '820px',
                minHeight: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '36px 44px',
                color: 'var(--text-primary)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                height: 'fit-content'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '14px',
                  marginBottom: '20px',
                  borderBottom: '1px solid var(--border-subtle)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} color="#3b82f6" />
                    <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Word Document View
                    </span>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={handleOpenEdit}
                    style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '6px', gap: '5px' }}
                  >
                    <Pencil size={12} />
                    <span>Open in Word Editor</span>
                  </button>
                </div>
                <div
                  style={{ fontSize: '0.94rem', lineHeight: 1.7 }}
                  dangerouslySetInnerHTML={{
                    __html: docHtml || `<p style="color:var(--text-muted)">Empty document. Click "Edit Word Doc" to write content.</p>`
                  }}
                />
              </div>
            </div>
          ) : isSheet ? (
            /* Spreadsheet (.xlsx / .xls / .csv / .tsv) Interactive Table Grid */
            <div style={{
              width: '100%',
              height: '100%',
              overflow: 'auto',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-input)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <Table size={14} color="#10b981" />
                  <span>Spreadsheet Grid ({sheetRows.length} rows)</span>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={handleOpenEdit}
                  style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '6px', gap: '5px' }}
                >
                  <Pencil size={12} />
                  <span>Edit Cells</span>
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {sheetRows.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '8px 10px', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', width: '42px', textAlign: 'center' }}>#</th>
                        {sheetRows[0].map((col, cIdx) => (
                          <th key={cIdx} style={{ padding: '8px 12px', border: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600 }}>
                            {col || `Column ${cIdx + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheetRows.slice(1).map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td style={{ padding: '6px 10px', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'center', background: 'var(--bg-input)' }}>
                            {rIdx + 1}
                          </td>
                          {sheetRows[0].map((_, cIdx) => (
                            <td key={cIdx} style={{ padding: '6px 12px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                              {row[cIdx] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                    No rows found. Click &ldquo;Edit Sheet&rdquo; to add rows and columns.
                  </div>
                )}
              </div>
            </div>
          ) : isHtml ? (
            <div style={{
              width: '100%',
              height: '100%',
              background: '#ffffff',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)'
            }}>
              <iframe
                title={activePreview.name}
                srcDoc={textContent}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          ) : isMarkdown ? (
            <div style={{
              width: '100%',
              height: '100%',
              overflowY: 'auto',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '28px 36px',
              color: 'var(--text-primary)',
              lineHeight: 1.7
            }}>
              <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                {(textContent || '').split('\n').map((line, idx) => {
                  if (line.startsWith('# ')) return <h1 key={idx} style={{ fontSize: '1.5rem', fontWeight: 700, margin: '14px 0 8px 0' }}>{line.slice(2)}</h1>;
                  if (line.startsWith('## ')) return <h2 key={idx} style={{ fontSize: '1.22rem', fontWeight: 600, margin: '12px 0 6px 0' }}>{line.slice(3)}</h2>;
                  if (line.startsWith('### ')) return <h3 key={idx} style={{ fontSize: '1.05rem', fontWeight: 600, margin: '10px 0 4px 0' }}>{line.slice(4)}</h3>;
                  if (line.startsWith('- ') || line.startsWith('* ')) return <div key={idx} style={{ marginLeft: '14px', marginBottom: '4px' }}>&bull; {line.slice(2)}</div>;
                  if (!line.trim()) return <div key={idx} style={{ height: '10px' }} />;
                  return <p key={idx} style={{ margin: '0 0 8px 0' }}>{line}</p>;
                })}
              </div>
            </div>
          ) : (
            <pre style={{
              width: '100%',
              height: '100%',
              padding: '18px',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.84rem',
              lineHeight: '1.6',
              overflow: 'auto',
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              margin: 0,
              whiteSpace: 'pre-wrap'
            }}>
              {textContent || 'Click "Edit" in the toolbar above to inspect or edit this document.'}
            </pre>
          )}
        </div>

        {/* Lazy Loaded Studio Editors */}
        <Suspense fallback={null}>
          {isMediaEditorOpen && (
            <MediaEditorModal
              file={activePreview}
              isOpen={isMediaEditorOpen}
              onClose={() => setIsMediaEditorOpen(false)}
            />
          )}

          {isDocEditorOpen && (
            <DocumentEditorModal
              file={activePreview}
              isOpen={isDocEditorOpen}
              onClose={() => setIsDocEditorOpen(false)}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useStorage } from '../context/StorageContext';
import { useAuth } from '../context/AuthContext';
import { buildDocxBlob, compileTextToPdfBlob } from '../utils/documentParser';
import { X, Folder, FileText, Check } from 'lucide-react';

const CATEGORY_OPTIONS = [
  { key: 'all', label: 'All Files' },
  { key: 'document', label: 'Documents' },
  { key: 'image', label: 'Photos' },
  { key: 'video', label: 'Videos' },
  { key: 'audio', label: 'Audio' },
  { key: 'code', label: 'Code' }
];

const DOC_TEMPLATES = [
  {
    ext: 'docx',
    label: 'Word',
    category: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    defaultText: '# Document Title\n\nStart writing your content here.'
  },
  {
    ext: 'pdf',
    label: 'PDF',
    category: 'document',
    mime: 'application/pdf',
    defaultText: '# PDF Document\n\nCreated in StorageBank Vault.'
  },
  {
    ext: 'csv',
    label: 'Sheet',
    category: 'document',
    mime: 'text/csv',
    defaultText: 'Name,Category,Status\nItem 1,General,Active'
  },
  {
    ext: 'md',
    label: 'Markdown',
    category: 'document',
    mime: 'text/markdown',
    defaultText: '# Notes\n\n- Point 1\n- Point 2'
  },
  {
    ext: 'txt',
    label: 'Text',
    category: 'document',
    mime: 'text/plain',
    defaultText: ''
  },
  {
    ext: 'html',
    label: 'HTML',
    category: 'code',
    mime: 'text/html',
    defaultText: '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8" />\n  <title>Document</title>\n</head>\n<body>\n  <h1>Document</h1>\n</body>\n</html>'
  },
  {
    ext: 'json',
    label: 'JSON',
    category: 'code',
    mime: 'application/json',
    defaultText: '{\n  "name": "config",\n  "status": "active"\n}'
  },
  {
    ext: 'js',
    label: 'JS',
    category: 'code',
    mime: 'text/javascript',
    defaultText: 'export default function main() {\n  return true;\n}\n'
  }
];

const COLOR_OPTIONS = [
  { label: 'Slate', hex: '#64748b' },
  { label: 'Indigo', hex: '#6366f1' },
  { label: 'Steel', hex: '#3b82f6' },
  { label: 'Emerald', hex: '#10b981' },
  { label: 'Amber', hex: '#d97706' },
  { label: 'Rose', hex: '#e11d48' }
];

export function NewFolderModal() {
  const {
    isNewFolderOpen,
    setIsNewFolderOpen,
    createFolder,
    saveFile,
    setActivePreview,
    activeCategory,
    currentFolderId,
    folderPath,
    addToast
  } = useStorage();
  const { user } = useAuth();

  const [mode, setMode] = useState('folder'); // 'folder' | 'file'
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#6366f1');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [placement, setPlacement] = useState('root'); // 'root' | 'current'
  const [docType, setDocType] = useState('docx');
  const [creating, setCreating] = useState(false);

  const currentFolderName =
    currentFolderId && (folderPath || []).length > 1
      ? folderPath[folderPath.length - 1]?.name || 'Current Folder'
      : null;

  useEffect(() => {
    if (isNewFolderOpen) {
      const requestedMode = isNewFolderOpen === 'file' ? 'file' : 'folder';
      setMode(requestedMode);

      const validCats = CATEGORY_OPTIONS.map(c => c.key);
      setSelectedCategory(validCats.includes(activeCategory) ? activeCategory : 'all');
      setPlacement(requestedMode === 'file' && currentFolderId ? 'current' : 'root');
      setName('');
      setDocType(activeCategory === 'code' ? 'js' : 'docx');
    }
  }, [isNewFolderOpen, activeCategory, currentFolderId]);

  if (!isNewFolderOpen) return null;

  const activeTemplate = DOC_TEMPLATES.find(t => t.ext === docType) || DOC_TEMPLATES[0];

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);

    try {
      const targetParentId = placement === 'current' && currentFolderId ? currentFolderId : null;

      if (mode === 'folder') {
        await createFolder(name.trim(), selectedColor, {
          parentId: targetParentId,
          category: selectedCategory
        });
      } else {
        const template = activeTemplate;
        const cleanBase = name.trim().replace(/\.[^.]+$/, '');
        const fullName = `${cleanBase}.${template.ext}`;
        let blob;

        if (template.ext === 'docx') {
          blob = await buildDocxBlob(cleanBase, template.defaultText);
        } else if (template.ext === 'pdf') {
          blob = await compileTextToPdfBlob(cleanBase, template.defaultText || `# ${cleanBase}`);
        } else {
          blob = new Blob([template.defaultText], { type: template.mime });
        }

        const fileCat = selectedCategory !== 'all' ? selectedCategory : template.category;
        const now = new Date().toISOString();
        const newFileRecord = {
          id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          userId: user?.id || 'local',
          folderId: targetParentId,
          name: fullName,
          type: template.mime,
          category: fileCat,
          size: blob.size,
          blob,
          starred: false,
          inTrash: false,
          createdAt: now,
          updatedAt: now,
          tags: [fileCat]
        };

        await saveFile(newFileRecord);
        if (addToast) addToast(`Created "${fullName}"`, 'success');
        setActivePreview(newFileRecord);
      }

      setName('');
      setIsNewFolderOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const sectionLabelStyle = {
    fontSize: '0.67rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '6px',
    display: 'block'
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => setIsNewFolderOpen(false)}
      style={{
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(4px)',
        zIndex: 2300
      }}
    >
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '420px',
          width: '92vw',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          padding: 0
        }}
      >
        {/* Minimal Matte Header with Inline Mode Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '13px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {mode === 'folder' ? (
              <Folder size={15} color="var(--text-secondary)" />
            ) : (
              <FileText size={15} color="var(--text-secondary)" />
            )}
            <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {mode === 'folder' ? 'New Folder' : 'New Document'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Discreet Monochrome Segmented Switch */}
            <div style={{
              display: 'inline-flex',
              padding: '2px',
              borderRadius: '6px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)'
            }}>
              <button
                type="button"
                onClick={() => setMode('folder')}
                style={{
                  padding: '3px 9px',
                  fontSize: '0.72rem',
                  fontWeight: mode === 'folder' ? 600 : 500,
                  borderRadius: '4px',
                  border: 'none',
                  background: mode === 'folder' ? 'var(--bg-surface-hover)' : 'transparent',
                  color: mode === 'folder' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                Folder
              </button>
              <button
                type="button"
                onClick={() => setMode('file')}
                style={{
                  padding: '3px 9px',
                  fontSize: '0.72rem',
                  fontWeight: mode === 'file' ? 600 : 500,
                  borderRadius: '4px',
                  border: 'none',
                  background: mode === 'file' ? 'var(--bg-surface-hover)' : 'transparent',
                  color: mode === 'file' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                Document
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsNewFolderOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                padding: '3px'
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Minimalist Body */}
        <div style={{
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          {/* 1. Name Input */}
          <div>
            <label style={sectionLabelStyle}>
              {mode === 'folder' ? 'Name' : 'Filename'}
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                className="input-text"
                placeholder={mode === 'folder' ? 'Untitled folder' : 'Untitled document'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
                style={{
                  height: '36px',
                  fontSize: '0.83rem',
                  padding: '0 11px',
                  paddingRight: mode === 'file' ? '56px' : '11px',
                  borderRadius: '6px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)'
                }}
              />
              {mode === 'file' && (
                <span style={{
                  position: 'absolute',
                  right: '8px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  pointerEvents: 'none'
                }}>
                  .{activeTemplate.ext}
                </span>
              )}
            </div>
          </div>

          {/* 2. Document Format (Monochrome Matte Pills) */}
          {mode === 'file' && (
            <div>
              <label style={sectionLabelStyle}>Format</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '5px'
              }}>
                {DOC_TEMPLATES.map(tpl => {
                  const active = docType === tpl.ext;
                  return (
                    <button
                      key={tpl.ext}
                      type="button"
                      onClick={() => {
                        setDocType(tpl.ext);
                        setSelectedCategory(tpl.category);
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: active ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                        border: active ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontSize: '0.73rem',
                        fontWeight: active ? 600 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.12s ease'
                      }}
                    >
                      <span>{tpl.label}</span>
                      <span style={{ fontSize: '0.64rem', opacity: 0.65 }}>.{tpl.ext}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Category Scope (Monochrome Matte Pills) */}
          <div>
            <label style={sectionLabelStyle}>Category</label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '5px'
            }}>
              {CATEGORY_OPTIONS.map(cat => {
                const active = selectedCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategory(cat.key)}
                    style={{
                      padding: '6px 9px',
                      borderRadius: '6px',
                      background: active ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                      border: active ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: '0.74rem',
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.12s ease'
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Placement Location (Compact Segmented Row) */}
          {currentFolderId && (
            <div>
              <label style={sectionLabelStyle}>Placement</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '5px'
              }}>
                <button
                  type="button"
                  onClick={() => setPlacement('root')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    background: placement === 'root' ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                    border: placement === 'root' ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                    color: placement === 'root' ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: '0.74rem',
                    fontWeight: placement === 'root' ? 600 : 500,
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  Category Root
                </button>
                <button
                  type="button"
                  onClick={() => setPlacement('current')}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    background: placement === 'current' ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                    border: placement === 'current' ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                    color: placement === 'current' ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: '0.74rem',
                    fontWeight: placement === 'current' ? 600 : 500,
                    cursor: 'pointer',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={`Inside ${currentFolderName}`}
                >
                  In &ldquo;{currentFolderName}&rdquo;
                </button>
              </div>
            </div>
          )}

          {/* 5. Folder Accent (Quiet Inline Row) */}
          {mode === 'folder' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '2px'
            }}>
              <span style={{
                fontSize: '0.67rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em'
              }}>
                Folder Accent
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                {COLOR_OPTIONS.map(c => {
                  const active = selectedColor === c.hex;
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setSelectedColor(c.hex)}
                      title={c.label}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: c.hex,
                        border: active ? '1.5px solid var(--text-primary)' : '1px solid rgba(255,255,255,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        opacity: active ? 1 : 0.65,
                        transition: 'opacity 0.12s ease'
                      }}
                    >
                      {active && <Check size={10} color="#ffffff" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Minimal Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '8px',
          padding: '11px 16px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)'
        }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIsNewFolderOpen(false)}
            style={{ height: '32px', padding: '0 12px', fontSize: '0.78rem', borderRadius: '6px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            style={{ height: '32px', padding: '0 14px', fontSize: '0.78rem', fontWeight: 600, borderRadius: '6px' }}
          >
            {creating ? 'Creating...' : mode === 'folder' ? 'Create Folder' : 'Create Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

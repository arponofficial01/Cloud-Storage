import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useStorage } from '../context/StorageContext';
import { RenameModal } from './RenameModal';
import { ItemMenu } from './ItemMenu';
import { getFileColorStyle } from '../utils/fileTypeStyles';

const MediaEditorModal = lazy(() => import('./MediaEditorModal').then(m => ({ default: m.MediaEditorModal })));
const DocumentEditorModal = lazy(() => import('./DocumentEditorModal').then(m => ({ default: m.DocumentEditorModal })));
import {
  Folder,
  FolderPlus,
  FilePlus,
  FileText,
  Image as ImageIcon,
  Star,
  MoreVertical,
  Play,
  Check,
  File
} from 'lucide-react';

export function FileGrid() {
  const {
    displayedFolders,
    displayedFiles,
    activeCategory,
    setActiveCategory,
    currentFolderId,
    folderPath,
    setIsUploadOpen,
    setIsNewFolderOpen,
    uploadFiles,
    downloadFile
  } = useStorage();

  const [visibleCount, setVisibleCount] = useState(60);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [editorTarget, setEditorTarget] = useState(null);
  const [docEditorTarget, setDocEditorTarget] = useState(null);

  // Reset window count when category or folder changes
  useEffect(() => {
    setVisibleCount(60);
  }, [activeCategory, displayedFiles.length]);

  // Global click outside to dismiss context menus
  useEffect(() => {
    const handleWindowClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  const handleDownload = (file) => {
    if (downloadFile) {
      downloadFile(file);
    } else if (file?.blob) {
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const handleEmptyFolderDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  if (displayedFolders.length === 0 && displayedFiles.length === 0) {
    const isInsideFolder = currentFolderId !== null;
    const currentFolderName = isInsideFolder
      ? (folderPath || []).slice(-1)[0]?.name || 'Folder'
      : null;
    return (
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleEmptyFolderDrop}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          textAlign: 'center',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '2px dashed var(--border-subtle)',
          transition: 'all 0.2s ease'
        }}
      >
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: isInsideFolder ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '16px', color: 'var(--accent-primary)'
        }}>
          <Folder size={32} fill={isInsideFolder ? 'rgba(99,102,241,0.4)' : 'none'} />
        </div>
        {isInsideFolder ? (
          <>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '6px', color: 'var(--text-primary)' }}>
              📂 &ldquo;{currentFolderName}&rdquo; is ready
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '360px', marginBottom: '20px' }}>
              This folder is active. Drag &amp; drop files here, or click upload to add items into this vault folder.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                className="btn btn-primary"
                onClick={() => setIsUploadOpen(true)}
                style={{ padding: '8px 18px', borderRadius: '8px', fontWeight: 600, fontSize: '0.82rem' }}
              >
                Upload Files into &ldquo;{currentFolderName}&rdquo;
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setIsNewFolderOpen('file')}
                style={{ padding: '8px 14px', borderRadius: '8px', fontWeight: 600, fontSize: '0.82rem', gap: '6px' }}
              >
                <FilePlus size={14} color="var(--accent-emerald)" />
                <span>New Document</span>
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setIsNewFolderOpen('folder')}
                style={{ padding: '8px 14px', borderRadius: '8px', fontWeight: 600, fontSize: '0.82rem', gap: '6px' }}
              >
                <FolderPlus size={14} color="var(--accent-primary)" />
                <span>New Subfolder</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '6px', fontWeight: 600 }}>No items in this view</h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: '360px', marginBottom: activeCategory !== 'trash' && activeCategory !== 'starred' ? '18px' : '0' }}>
              {activeCategory === 'trash'
                ? 'Trash is completely empty.'
                : 'Upload a file, create a folder, or start a new document in your cloud vault.'}
            </p>
            {activeCategory !== 'trash' && activeCategory !== 'starred' && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsNewFolderOpen('folder')}
                  style={{ padding: '7px 14px', borderRadius: '8px', fontWeight: 600, fontSize: '0.8rem', gap: '6px' }}
                >
                  <FolderPlus size={14} color="var(--accent-primary)" />
                  <span>New Folder</span>
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsNewFolderOpen('file')}
                  style={{ padding: '7px 14px', borderRadius: '8px', fontWeight: 600, fontSize: '0.8rem', gap: '6px' }}
                >
                  <FilePlus size={14} color="var(--accent-emerald)" />
                  <span>New Document / File</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const filesToRender = displayedFiles.slice(0, visibleCount);
  const hasMore = displayedFiles.length > visibleCount;

  return (
    <>
      <div className="vault-file-grid">
        {/* Folders */}
        {displayedFolders.map(folder => (
          <FolderCard
            key={folder.id}
            folder={folder}
            activeMenuId={activeMenuId}
            setActiveMenuId={setActiveMenuId}
            onRename={() => setRenameTarget({ item: folder, isFolder: true })}
          />
        ))}

        {/* Files */}
        {filesToRender.map(file => (
          <MemoizedFileGridCard
            key={file.id}
            file={file}
            activeMenuId={activeMenuId}
            setActiveMenuId={setActiveMenuId}
            onRename={() => setRenameTarget({ item: file, isFolder: false })}
            onEditMedia={() => setEditorTarget(file)}
            onEditDoc={() => setDocEditorTarget(file)}
            onConvert={() => setActiveCategory('converter')}
            onDownload={() => handleDownload(file)}
          />
        ))}
      </div>

      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setVisibleCount(prev => prev + 60)}
            style={{ padding: '10px 24px', borderRadius: '12px', fontSize: '0.88rem', fontWeight: '700' }}
          >
            Load More Files ({displayedFiles.length - visibleCount} remaining)
          </button>
        </div>
      )}

      <RenameModal
        item={renameTarget?.item}
        isFolder={renameTarget?.isFolder}
        onClose={() => setRenameTarget(null)}
      />

      {Boolean(editorTarget) && (
        <Suspense fallback={null}>
          <MediaEditorModal
            file={editorTarget}
            isOpen={Boolean(editorTarget)}
            onClose={() => setEditorTarget(null)}
          />
        </Suspense>
      )}

      {Boolean(docEditorTarget) && (
        <Suspense fallback={null}>
          <DocumentEditorModal
            file={docEditorTarget}
            isOpen={Boolean(docEditorTarget)}
            onClose={() => setDocEditorTarget(null)}
          />
        </Suspense>
      )}
    </>
  );
}

const MemoizedFileGridCard = React.memo(FileGridCard);

function FolderCard({ folder, activeMenuId, setActiveMenuId, onRename }) {
  const { toggleStar, selectedItems, toggleSelectItem, navigateToFolder, files, folders, uploadFiles, moveItemsToFolder, addToast } = useStorage();
  const [isDragOver, setIsDragOver] = useState(false);
  const isSelected = selectedItems.includes(folder.id);
  const isMenuOpen = activeMenuId === folder.id;

  const childFiles = files.filter(f => String(f.folderId) === String(folder.id) && (folder.inTrash || !f.inTrash));
  const childSubFolders = folders.filter(f => String(f.parentId) === String(folder.id) && (folder.inTrash || !f.inTrash));
  const totalContents = childFiles.length + childSubFolders.length;

  const handleCardClick = (e) => {
    e.stopPropagation();
    if (typeof navigateToFolder === 'function') {
      navigateToFolder(folder.id, folder.name);
    }
  };

  const handleDragStart = (e) => {
    const dragIds = selectedItems.includes(folder.id) ? selectedItems : [folder.id];
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'vault-items', itemIds: dragIds }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (folder.inTrash) return;

    const raw = e.dataTransfer.getData('application/json');
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.type === 'vault-items' && Array.isArray(data.itemIds)) {
          const moveIds = data.itemIds.filter(id => id !== folder.id);
          if (moveIds.length > 0) {
            await moveItemsToFolder(moveIds, folder.id);
            addToast(`Moved ${moveIds.length} item(s) into "${folder.name}"`, 'success');
          }
          return;
        }
      } catch {
        // Fallback
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files, folder.id);
      addToast(`Uploaded ${e.dataTransfer.files.length} file(s) into "${folder.name}"`, 'success');
    }
  };

  const folderColor = folder.color || '#6366f1';

  return (
    <div
      className="glass-panel vault-folder-card"
      onClick={handleCardClick}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setActiveMenuId(folder.id);
      }}
      draggable={!folder.inTrash}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        borderRadius: 'var(--radius-md)',
        padding: '14px',
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.16s ease',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        border: isDragOver
          ? '2px dashed var(--accent-emerald, #10b981)'
          : isSelected
          ? '2px solid var(--accent-primary)'
          : '1px solid var(--border-subtle)',
        background: isDragOver
          ? 'rgba(16, 185, 129, 0.12)'
          : isSelected
          ? 'rgba(99, 102, 241, 0.14)'
          : 'var(--bg-surface)',
        minHeight: '140px',
        zIndex: isMenuOpen ? 50 : 1,
        overflow: 'visible'
      }}
    >
      {/* Top Header: Select Checkbox & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div
          onClick={(e) => { e.stopPropagation(); toggleSelectItem(folder.id); }}
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            border: isSelected ? '2px solid var(--accent-primary)' : '2px solid var(--border-subtle)',
            background: isSelected ? 'var(--accent-primary)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          {isSelected && <Check size={11} color="#ffffff" />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {!folder.inTrash && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleStar(folder.id, true); }}
              style={{ background: 'none', border: 'none', color: folder.starred ? '#f59e0b' : 'var(--text-muted)', cursor: 'pointer', padding: '3px' }}
            >
              <Star size={15} fill={folder.starred ? '#f59e0b' : 'none'} />
            </button>
          )}

          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveMenuId(isMenuOpen ? null : folder.id); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '3px' }}
            >
              <MoreVertical size={16} />
            </button>

            {isMenuOpen && (
              <ItemMenu
                item={folder}
                isFolder={true}
                onClose={() => setActiveMenuId(null)}
                onRename={onRename}
                onOpenFolder={() => navigateToFolder(folder.id, folder.name)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Prominent Clean Folder Icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0 10px 0' }}>
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '12px',
          background: `${folderColor}1f`,
          color: folderColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${folderColor}33`,
          flexShrink: 0
        }}>
          <Folder size={26} fill={folderColor} />
        </div>

        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontWeight: '700', fontSize: '0.94rem', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {folder.name}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {totalContents} item{totalContents !== 1 ? 's' : ''} &bull; Folder
          </div>
        </div>
      </div>

      {/* Drag & Drop Feedback or Clean Footer */}
      {isDragOver && (
        <div style={{
          fontSize: '0.72rem',
          paddingTop: '6px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--accent-emerald)',
          fontWeight: 600
        }}>
          <span>&darr; Drop to move inside</span>
        </div>
      )}
    </div>
  );
}

function FileGridCard({ file, activeMenuId, setActiveMenuId, onRename, onEditMedia, onEditDoc, onConvert: _onConvert, onDownload }) {
  const { toggleStar, setActivePreview, setActiveShare, setActiveAudioTrack, selectedItems, toggleSelectItem, ensureFileBlob } = useStorage();
  const [thumbUrl, setThumbUrl] = useState(null);
  const [docSnippet, setDocSnippet] = useState(null);
  const isSelected = selectedItems.includes(file.id);
  const isMenuOpen = activeMenuId === file.id;

  const ext = file.name?.split('.').pop()?.toLowerCase() || '';
  const fileStyle = getFileColorStyle(file);

  const isPdf = ext === 'pdf' || file.type === 'application/pdf';
  const isDoc = ['doc', 'docx', 'rtf'].includes(ext);
  const isSheet = ['csv', 'xlsx', 'xls'].includes(ext);
  const isText = ['txt', 'md', 'markdown', 'log'].includes(ext);
  const isCode = file.category === 'code' || ['js', 'jsx', 'ts', 'tsx', 'css', 'json', 'py', 'java', 'cpp', 'c', 'php', 'sql', 'sh', 'xml', 'html'].includes(ext);

  useEffect(() => {
    let cancelled = false;
    let url = null;
    if (file.category === 'image' || file.category === 'video') {
      if (file.blob instanceof Blob) {
        url = URL.createObjectURL(file.blob);
        setThumbUrl(url);
      } else if (typeof ensureFileBlob === 'function' && (file.telegramFileId || file.parts || file.storagePath)) {
        ensureFileBlob(file).then(b => {
          if (!cancelled && b instanceof Blob) {
            url = URL.createObjectURL(b);
            setThumbUrl(url);
          }
        }).catch(() => {});
      }
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, ensureFileBlob]);

  useEffect(() => {
    if (!isPdf && !isDoc && (isText || isCode || ext === 'csv')) {
      if (typeof file.content === 'string') {
        setDocSnippet(file.content.slice(0, 180));
      } else if (file.blob && typeof file.blob.slice === 'function') {
        file.blob.slice(0, 600).text().then(txt => {
          setDocSnippet(txt.slice(0, 180));
        }).catch(() => {});
      }
    }
  }, [file, isPdf, isDoc, isText, isCode, ext]);

  const handleDragStart = (e) => {
    const dragIds = selectedItems.includes(file.id) ? selectedItems : [file.id];
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'vault-items', itemIds: dragIds }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // ── 1. Image & Video Card: FULL-BLEED BORDERLESS HERO WITH FLOATING CONTROLS ─
  if (file.category === 'image' || file.category === 'video') {
    const isVideoCard = file.category === 'video';
    return (
      <div
        className="glass-panel vault-media-card"
        onClick={() => setActivePreview(file)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setActiveMenuId(file.id);
        }}
        draggable={!file.inTrash}
        onDragStart={handleDragStart}
        style={{
          borderRadius: 'var(--radius-md)',
          padding: '12px',
          position: 'relative',
          cursor: 'pointer',
          transition: 'transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
          background: isSelected ? 'rgba(99, 102, 241, 0.14)' : 'var(--bg-surface)',
          minHeight: '210px',
          zIndex: isMenuOpen ? 50 : 1,
          overflow: 'visible'
        }}
      >
        {/* Borderless Edge-to-Edge Media Hero Container */}
        <div
          className="vault-media-hero"
          style={{
            position: 'relative',
            width: 'calc(100% + 24px)',
            margin: '-12px -12px 10px -12px',
            height: '138px',
            background: '#090a0f',
            borderTopLeftRadius: 'var(--radius-md)',
            borderTopRightRadius: 'var(--radius-md)',
            overflow: 'hidden'
          }}
        >
          {thumbUrl ? (
            isVideoCard ? (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <video
                  src={thumbUrl}
                  muted
                  playsInline
                  preload="metadata"
                  onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
                  onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    border: 'none'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 100%)'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'rgba(0, 0, 0, 0.65)',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Play size={15} fill="#ffffff" color="#ffffff" style={{ marginLeft: '2px' }} />
                  </div>
                </div>
              </div>
            ) : (
              <img
                src={thumbUrl}
                alt={file.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
              />
            )
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isVideoCard ? (
                <Play size={32} color="var(--text-muted)" opacity={0.4} />
              ) : (
                <ImageIcon size={32} color="var(--text-muted)" opacity={0.4} />
              )}
            </div>
          )}
        </div>

        {/* Floating Controls Overlay (Sits OUTSIDE the image overflow container so menu never clips) */}
        <div style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          right: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
          pointerEvents: 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', pointerEvents: 'auto' }}>
            <div
              onClick={(e) => { e.stopPropagation(); toggleSelectItem(file.id); }}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: isSelected ? '2px solid var(--accent-primary)' : '2px solid rgba(255,255,255,0.7)',
                background: isSelected ? 'var(--accent-primary)' : 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {isSelected && <Check size={11} color="#ffffff" />}
            </div>
            <span style={{
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              fontWeight: 700,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(4px)',
              color: fileStyle.color,
              padding: '2px 6px',
              borderRadius: '4px',
              border: `1px solid ${fileStyle.border}`
            }}>
              {fileStyle.label}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', pointerEvents: 'auto' }}>
            {!file.inTrash && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleStar(file.id, false); }}
                style={{
                  background: 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(4px)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: file.starred ? '#f59e0b' : '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <Star size={13} fill={file.starred ? '#f59e0b' : 'none'} />
              </button>
            )}

            <div style={{ position: 'relative' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveMenuId(isMenuOpen ? null : file.id); }}
                style={{
                  background: 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(4px)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <MoreVertical size={13} />
              </button>

              {isMenuOpen && (
                <ItemMenu
                  item={file}
                  isFolder={false}
                  onClose={() => setActiveMenuId(null)}
                  onRename={onRename}
                  onEditMedia={onEditMedia}
                  onEditDoc={onEditDoc}
                  onDownload={onDownload}
                  onPreview={() => setActivePreview(file)}
                  onShare={() => setActiveShare(file)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Bottom Metadata */}
        <div>
          <div style={{ fontWeight: '600', fontSize: '0.86rem', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {file.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            <span>{formatSize(file.size)}</span>
            <span>{new Date(file.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── 2. Color-Coded Document & Code Cards ──────────────────────────────────────
  return (
    <div
      className="glass-panel vault-doc-card"
      onClick={() => setActivePreview(file)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setActiveMenuId(file.id);
      }}
      draggable={!file.inTrash}
      onDragStart={handleDragStart}
      style={{
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        position: 'relative',
        cursor: 'pointer',
        transition: 'transform 0.16s ease, border-color 0.16s ease',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
        background: isSelected ? 'rgba(99, 102, 241, 0.14)' : 'var(--bg-surface)',
        minHeight: '210px',
        zIndex: isMenuOpen ? 50 : 1,
        overflow: 'visible'
      }}
    >
      {/* Top Card Bar: Distinct Color-Coded Tag */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            onClick={(e) => { e.stopPropagation(); toggleSelectItem(file.id); }}
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              border: isSelected ? '2px solid var(--accent-primary)' : '2px solid var(--border-subtle)',
              background: isSelected ? 'var(--accent-primary)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            {isSelected && <Check size={11} color="#ffffff" />}
          </div>
          <span style={{
            fontSize: '0.64rem',
            textTransform: 'uppercase',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: '4px',
            background: fileStyle.bg,
            color: fileStyle.color,
            border: `1px solid ${fileStyle.border}`
          }}>
            {fileStyle.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {!file.inTrash && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleStar(file.id, false); }}
              style={{ background: 'none', border: 'none', color: file.starred ? '#f59e0b' : 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
            >
              <Star size={14} fill={file.starred ? '#f59e0b' : 'none'} />
            </button>
          )}

          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveMenuId(isMenuOpen ? null : file.id); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
            >
              <MoreVertical size={15} />
            </button>

            {isMenuOpen && (
              <ItemMenu
                item={file}
                isFolder={false}
                onClose={() => setActiveMenuId(null)}
                onRename={onRename}
                onEditMedia={onEditMedia}
                onEditDoc={onEditDoc}
                onDownload={onDownload}
                onPreview={() => setActivePreview(file)}
                onShare={() => setActiveShare(file)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Outside Preview Representation with Distinct Color Theme */}
      <div
        className="vault-doc-preview"
        style={{
          height: '105px',
          borderRadius: '7px',
          background: 'var(--bg-input)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
          marginBottom: '10px',
          border: '1px solid var(--border-subtle)'
        }}
      >
        {file.category === 'video' && thumbUrl ? (
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video src={thumbUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Play size={15} fill="#ffffff" color="#ffffff" style={{ marginLeft: '2px' }} />
            </div>
          </div>
        ) : isPdf ? (
          // Stylized Miniature PDF Document Page with Crimson Accent
          <div style={{
            width: '82px',
            height: '92px',
            background: 'var(--bg-surface)',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ background: '#ef4444', color: '#fff', fontSize: '0.58rem', fontWeight: 800, padding: '2px 5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>PDF</span>
              <FileText size={9} />
            </div>
            <div style={{ padding: '6px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ height: '4px', background: 'var(--text-muted)', opacity: 0.5, borderRadius: '2px', width: '85%' }} />
              <div style={{ height: '3px', background: 'var(--text-muted)', opacity: 0.3, borderRadius: '2px', width: '100%' }} />
              <div style={{ height: '3px', background: 'var(--text-muted)', opacity: 0.3, borderRadius: '2px', width: '92%' }} />
              <div style={{ height: '3px', background: 'var(--text-muted)', opacity: 0.3, borderRadius: '2px', width: '65%' }} />
            </div>
          </div>
        ) : isDoc ? (
          // Stylized Miniature Word / DOCX Page with Blue Accent
          <div style={{
            width: '82px',
            height: '92px',
            background: 'var(--bg-surface)',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ background: '#3b82f6', color: '#fff', fontSize: '0.58rem', fontWeight: 800, padding: '2px 5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>DOCX</span>
              <FileText size={9} />
            </div>
            <div style={{ padding: '6px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ height: '4px', background: 'var(--text-muted)', opacity: 0.5, borderRadius: '2px', width: '70%' }} />
              <div style={{ height: '3px', background: 'var(--text-muted)', opacity: 0.3, borderRadius: '2px', width: '95%' }} />
              <div style={{ height: '3px', background: 'var(--text-muted)', opacity: 0.3, borderRadius: '2px', width: '88%' }} />
            </div>
          </div>
        ) : isSheet ? (
          // Stylized Miniature Spreadsheet Table with Emerald Accent
          <div style={{
            width: '84px',
            height: '92px',
            background: 'var(--bg-surface)',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ background: '#10b981', color: '#fff', fontSize: '0.58rem', fontWeight: 800, padding: '2px 5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{fileStyle.label}</span>
              <span style={{ fontSize: '0.55rem' }}>DATA</span>
            </div>
            <div style={{ padding: '4px', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ height: '10px', background: 'var(--bg-input)', borderRadius: '1px', opacity: 0.6 }} />
              ))}
            </div>
          </div>
        ) : isCode ? (
          // Stylized Miniature Code Terminal with Language Color Dot
          <div style={{
            width: '100%',
            height: '100%',
            background: '#0d1117',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'monospace',
            fontSize: '0.62rem',
            color: fileStyle.color,
            overflow: 'hidden',
            lineHeight: '1.4'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', borderBottom: '1px solid #21262d', paddingBottom: '3px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: fileStyle.color }} />
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4b5563' }} />
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#374151' }} />
              <span style={{ marginLeft: 'auto', color: fileStyle.color, fontWeight: 700, fontSize: '0.58rem' }}>{fileStyle.label}</span>
            </div>
            <div style={{ opacity: 0.85, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
              {docSnippet ? docSnippet.slice(0, 110) : `// ${file.name}\nexport default function () {\n  return true;\n}`}
            </div>
          </div>
        ) : isText ? (
          // Stylized Miniature Text / Markdown Snippet Page with Violet Accent
          <div style={{
            width: '100%',
            height: '100%',
            background: 'var(--bg-surface)',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            fontSize: '0.65rem',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            lineHeight: '1.4',
            borderLeft: `3px solid ${fileStyle.color}`
          }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: fileStyle.color, marginBottom: '3px', textTransform: 'uppercase' }}>
              {fileStyle.label} DOCUMENT
            </div>
            <div style={{ opacity: 0.8, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
              {docSnippet ? docSnippet.slice(0, 110) : file.name}
            </div>
          </div>
        ) : file.category === 'audio' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#f59e0b', fontSize: '0.74rem', fontWeight: 600 }}>Audio Track</span>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveAudioTrack(file); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'var(--accent-gradient)',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.72rem',
                padding: '3px 9px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              <Play size={10} fill="#ffffff" /> Play Audio
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: fileStyle.color }}>
            <File size={24} />
            <span style={{ fontSize: '0.68rem', fontWeight: 700 }}>{fileStyle.label}</span>
          </div>
        )}
      </div>

      {/* Bottom Metadata */}
      <div>
        <div style={{ fontWeight: '600', fontSize: '0.86rem', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {file.name}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          <span>{formatSize(file.size)}</span>
          <span>{new Date(file.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

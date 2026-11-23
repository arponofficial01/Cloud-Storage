import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useStorage } from '../context/StorageContext';
import { RenameModal } from './RenameModal';
import { ItemMenu } from './ItemMenu';

const MediaEditorModal = lazy(() => import('./MediaEditorModal').then(m => ({ default: m.MediaEditorModal })));
const DocumentEditorModal = lazy(() => import('./DocumentEditorModal').then(m => ({ default: m.DocumentEditorModal })));
import {
  Folder,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Code2,
  Archive,
  File,
  Star,
  Eye,
  ArrowUpDown,
  Check,
  MoreVertical
} from 'lucide-react';

export function FileList() {
  const {
    displayedFolders,
    displayedFiles,
    navigateToFolder,
    toggleStar,
    setActivePreview,
    setActiveShare,
    sortBy,
    setSortBy,
    setSortOrder,
    selectedItems,
    toggleSelectItem,
    moveItemsToFolder,
    uploadFiles,
    addToast,
    downloadFile
  } = useStorage();

  const [activeMenuId, setActiveMenuId] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [editorTarget, setEditorTarget] = useState(null);
  const [docEditorTarget, setDocEditorTarget] = useState(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);

  const handleDragStart = (e, item) => {
    const dragIds = selectedItems.includes(item.id) ? selectedItems : [item.id];
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'vault-items', itemIds: dragIds }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDrop = async (e, folder) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    if (folder.inTrash) return;

    const raw = e.dataTransfer.getData('application/json');
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.type === 'vault-items' && Array.isArray(data.itemIds)) {
          const moveIds = data.itemIds.filter(id => id !== folder.id);
          if (moveIds.length > 0) {
            await moveItemsToFolder(moveIds, folder.id);
            addToast(`Moved ${moveIds.length} item(s) to "${folder.name}"`, 'success');
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

  useEffect(() => {
    setVisibleCount(60);
  }, [displayedFiles.length]);

  const formatSize = (bytes) => {
    if (!bytes) return '--';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

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

  const handleHeaderSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const getItemIcon = (item, isFolder) => {
    if (isFolder) return <Folder size={17} fill={item.color || 'var(--accent-primary)'} color={item.color || 'var(--accent-primary)'} />;
    switch (item.category) {
      case 'image': return <ImageIcon size={17} color="var(--accent-primary)" />;
      case 'video': return <Video size={17} color="var(--accent-rose)" />;
      case 'audio': return <Music size={17} color="var(--accent-amber)" />;
      case 'document': return <FileText size={17} color="var(--accent-emerald)" />;
      case 'code': return <Code2 size={17} color="var(--accent-secondary)" />;
      case 'archive': return <Archive size={17} color="var(--accent-primary)" />;
      default: return <File size={17} color="var(--text-muted)" />;
    }
  };

  const filesToRender = displayedFiles.slice(0, visibleCount);
  const hasMore = displayedFiles.length > visibleCount;

  return (
    <>
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: '9px',
        border: '1px solid var(--border-subtle)',
        overflowX: 'auto',
        overflowY: 'visible'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '9px 12px', width: '38px' }}></th>
              <th style={{ padding: '9px 12px', cursor: 'pointer', fontWeight: 600 }} onClick={() => handleHeaderSort('name')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Name</span>
                  <ArrowUpDown size={11} />
                </div>
              </th>
              <th className="desktop-only" style={{ padding: '9px 12px', cursor: 'pointer', fontWeight: 600 }} onClick={() => handleHeaderSort('category')}>
                <span>Type</span>
              </th>
              <th style={{ padding: '9px 12px', cursor: 'pointer', fontWeight: 600 }} onClick={() => handleHeaderSort('size')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Size</span>
                  <ArrowUpDown size={11} />
                </div>
              </th>
              <th className="desktop-only" style={{ padding: '9px 12px', cursor: 'pointer', fontWeight: 600 }} onClick={() => handleHeaderSort('date')}>
                <span>Date Modified</span>
              </th>
              <th style={{ padding: '9px 12px', textAlign: 'right', width: '110px', fontWeight: 600 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Folders */}
            {displayedFolders.map(folder => {
              const isSelected = selectedItems.includes(folder.id);
              const isDragTarget = dragOverFolderId === folder.id;
              return (
                <tr
                  key={folder.id}
                  onClick={() => navigateToFolder(folder.id, folder.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveMenuId(folder.id);
                  }}
                  draggable={!folder.inTrash}
                  onDragStart={(e) => handleDragStart(e, folder)}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverFolderId(folder.id); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverFolderId(null); }}
                  onDrop={(e) => handleFolderDrop(e, folder)}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    background: isDragTarget ? 'rgba(16, 185, 129, 0.16)' : isSelected ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                    outline: isDragTarget ? '1px dashed var(--accent-emerald)' : 'none',
                    transition: 'background-color 0.12s ease'
                  }}
                >
                  <td style={{ padding: '9px 12px' }}>
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleSelectItem(folder.id); }}
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-strong)',
                        background: isSelected ? 'var(--accent-primary)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      {isSelected && <Check size={10} color="#ffffff" />}
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px', fontWeight: '600', color: 'var(--text-primary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getItemIcon(folder, true)}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</span>
                    </div>
                  </td>
                  <td className="desktop-only" style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>Folder</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>--</td>
                  <td className="desktop-only" style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{new Date(folder.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', position: 'relative' }}>
                      <button
                        className="btn btn-ghost btn-icon"
                        title={folder.starred ? 'Starred' : 'Add to Starred'}
                        onClick={(e) => { e.stopPropagation(); toggleStar(folder.id, true); }}
                        style={{ padding: '4px', height: '26px', width: '26px' }}
                      >
                        <Star size={13} fill={folder.starred ? '#f59e0b' : 'none'} color={folder.starred ? '#f59e0b' : 'var(--text-muted)'} />
                      </button>

                      <button
                        className="btn btn-ghost btn-icon"
                        title="More options"
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === folder.id ? null : folder.id); }}
                        style={{ padding: '4px', height: '26px', width: '26px' }}
                      >
                        <MoreVertical size={13} color="var(--text-muted)" />
                      </button>

                      {activeMenuId === folder.id && (
                        <ItemMenu
                          item={folder}
                          isFolder={true}
                          onClose={() => setActiveMenuId(null)}
                          onRename={() => setRenameTarget({ item: folder, isFolder: true })}
                          onOpenFolder={() => navigateToFolder(folder.id, folder.name)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Files */}
            {filesToRender.map(file => {
              const isSelected = selectedItems.includes(file.id);
              return (
                <tr
                  key={file.id}
                  onClick={() => setActivePreview(file)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveMenuId(file.id);
                  }}
                  draggable={!file.inTrash}
                  onDragStart={(e) => handleDragStart(e, file)}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                    transition: 'background-color 0.12s ease'
                  }}
                >
                  <td style={{ padding: '9px 12px' }}>
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleSelectItem(file.id); }}
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-strong)',
                        background: isSelected ? 'var(--accent-primary)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      {isSelected && <Check size={10} color="#ffffff" />}
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px', fontWeight: '500', color: 'var(--text-primary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getItemIcon(file, false)}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                    </div>
                  </td>
                  <td className="desktop-only" style={{ padding: '9px 12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{file.category}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatSize(file.size)}</td>
                  <td className="desktop-only" style={{ padding: '9px 12px', color: 'var(--text-muted)' }}>{new Date(file.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', position: 'relative' }}>
                      <button
                        className="btn btn-ghost btn-icon"
                        title={file.starred ? 'Starred' : 'Add to Starred'}
                        onClick={(e) => { e.stopPropagation(); toggleStar(file.id, false); }}
                        style={{ padding: '4px', height: '26px', width: '26px' }}
                      >
                        <Star size={13} fill={file.starred ? '#f59e0b' : 'none'} color={file.starred ? '#f59e0b' : 'var(--text-muted)'} />
                      </button>

                      <button
                        className="btn btn-ghost btn-icon"
                        title="Preview"
                        onClick={(e) => { e.stopPropagation(); setActivePreview(file); }}
                        style={{ padding: '4px', height: '26px', width: '26px' }}
                      >
                        <Eye size={13} color="var(--text-secondary)" />
                      </button>

                      <button
                        className="btn btn-ghost btn-icon"
                        title="More options"
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === file.id ? null : file.id); }}
                        style={{ padding: '4px', height: '26px', width: '26px' }}
                      >
                        <MoreVertical size={13} color="var(--text-muted)" />
                      </button>

                      {activeMenuId === file.id && (
                        <ItemMenu
                          item={file}
                          isFolder={false}
                          onClose={() => setActiveMenuId(null)}
                          onRename={() => setRenameTarget({ item: file, isFolder: false })}
                          onPreview={() => setActivePreview(file)}
                          onDownload={() => handleDownload(file)}
                          onShare={() => setActiveShare(file)}
                          onEditMedia={() => setEditorTarget(file)}
                          onEditDoc={() => setDocEditorTarget(file)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setVisibleCount(prev => prev + 60)}
            style={{ padding: '8px 20px', borderRadius: '7px', fontSize: '0.82rem', fontWeight: 600 }}
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

import React from 'react';
import { useStorage } from '../context/StorageContext';
import {
  Trash2,
  X,
  RotateCcw,
  Star,
  CheckSquare,
  Archive,
  FolderInput,
  Download,
  Share2,
  Eye,
  Folder
} from 'lucide-react';

export function BatchActionBar() {
  const {
    selectedItems,
    clearSelection,
    batchMoveToTrash,
    batchDeletePermanently,
    batchRestoreFromTrash,
    zipSelectedFiles,
    setMoveModalTarget,
    activeCategory,
    files,
    folders,
    toggleStar,
    setActivePreview,
    setActiveShare,
    navigateToFolder,
    downloadFile,
    requestConfirm
  } = useStorage();

  if (selectedItems.length === 0) return null;

  const isTrashView = activeCategory === 'trash';
  const isSingle = selectedItems.length === 1;

  // Single item lookup
  const singleFile = isSingle ? files.find(f => f.id === selectedItems[0]) : null;
  const singleFolder = isSingle && !singleFile ? folders.find(f => f.id === selectedItems[0]) : null;
  const singleItem = singleFile || singleFolder;
  const isSingleFolder = Boolean(singleFolder);

  const handleDownloadSingle = () => {
    if (downloadFile) {
      downloadFile(singleFile);
    } else if (singleFile?.blob) {
      const url = URL.createObjectURL(singleFile.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = singleFile.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  return (
    <div
      className="batch-action-bar"
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--bg-modal)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '6px 12px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        zIndex: 2000,
        maxWidth: '92vw',
        flexWrap: 'nowrap'
      }}
    >
      {/* Selected Counter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>
        <CheckSquare size={14} color="var(--accent-primary)" />
        <span>{selectedItems.length} selected</span>
      </div>

      <div style={{ height: '16px', width: '1px', background: 'var(--border-subtle)', flexShrink: 0 }} />

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {!isTrashView ? (
          <>
            {/* If exactly 1 file/folder selected */}
            {isSingle && singleItem && (
              <>
                {!isSingleFolder && (
                  <>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setActivePreview(singleFile)}
                      style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px' }}
                      title="Preview file"
                    >
                      <Eye size={13} />
                      <span className="desktop-only">Preview</span>
                    </button>

                    <button
                      className="btn btn-secondary"
                      onClick={handleDownloadSingle}
                      style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px' }}
                      title="Download file"
                    >
                      <Download size={13} />
                      <span className="desktop-only">Download</span>
                    </button>

                    <button
                      className="btn btn-secondary"
                      onClick={() => setActiveShare(singleFile)}
                      style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px' }}
                      title="Share link"
                    >
                      <Share2 size={13} />
                      <span className="desktop-only">Share</span>
                    </button>
                  </>
                )}

                {isSingleFolder && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      navigateToFolder(singleFolder.id, singleFolder.name);
                      clearSelection();
                    }}
                    style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px' }}
                    title="Open folder"
                  >
                    <Folder size={13} />
                    <span>Open</span>
                  </button>
                )}

                <button
                  className="btn btn-secondary"
                  onClick={() => toggleStar(singleItem.id, isSingleFolder)}
                  style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px', color: singleItem.starred ? '#f59e0b' : 'inherit' }}
                  title={singleItem.starred ? 'Remove Star' : 'Add Star'}
                >
                  <Star size={13} fill={singleItem.starred ? '#f59e0b' : 'none'} />
                </button>
              </>
            )}

            {/* If multiple items selected */}
            {!isSingle && (
              <button
                className="btn btn-secondary"
                onClick={() => zipSelectedFiles()}
                style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px' }}
                title="Compress selected into .ZIP"
              >
                <Archive size={13} />
                <span>Zip (.ZIP)</span>
              </button>
            )}

            {/* Common: Move to folder */}
            <button
              className="btn btn-secondary"
              onClick={() => setMoveModalTarget(selectedItems)}
              style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px' }}
              title="Move items to another folder"
            >
              <FolderInput size={13} />
              <span>Move</span>
            </button>

            {/* Common: Move to trash */}
            <button
              className="btn btn-secondary"
              onClick={() => batchMoveToTrash()}
              style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px', color: 'var(--accent-rose)' }}
              title="Move to trash"
            >
              <Trash2 size={13} />
              <span>Trash</span>
            </button>
          </>
        ) : (
          /* Trash View Actions */
          <>
            {isSingle && singleFile && (
              <button
                className="btn btn-secondary"
                onClick={() => setActivePreview(singleFile)}
                style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px' }}
                title="Preview file in Trash"
              >
                <Eye size={13} />
                <span>Preview</span>
              </button>
            )}

            {isSingle && singleFolder && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  navigateToFolder(singleFolder.id, singleFolder.name, 'trash');
                  clearSelection();
                }}
                style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px' }}
                title="Preview folder contents in Trash"
              >
                <Folder size={13} />
                <span>Preview Folder</span>
              </button>
            )}

            <button
              className="btn btn-secondary"
              onClick={() => batchRestoreFromTrash()}
              style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px' }}
              title="Restore to vault"
            >
              <RotateCcw size={13} />
              <span>Restore</span>
            </button>

            <button
              className="btn btn-danger"
              onClick={() =>
                requestConfirm({
                  title: 'Delete Selected Items Permanently',
                  message: `Are you sure you want to permanently delete ${selectedItems.length} selected item(s)? This action cannot be undone.`,
                  confirmText: 'Delete Permanently',
                  danger: true,
                  onConfirm: () => batchDeletePermanently()
                })
              }
              style={{ padding: '5px 9px', fontSize: '0.76rem', gap: '4px', borderRadius: '6px' }}
              title="Delete permanently"
            >
              <Trash2 size={13} />
              <span>Delete Permanently</span>
            </button>
          </>
        )}

        <div style={{ height: '16px', width: '1px', background: 'var(--border-subtle)', flexShrink: 0 }} />

        <button
          className="btn btn-ghost btn-icon"
          onClick={clearSelection}
          style={{ padding: '3px', height: '24px', width: '24px', borderRadius: '5px', flexShrink: 0 }}
          title="Clear Selection"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

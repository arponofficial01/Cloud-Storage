import React from 'react';
import { useStorage } from '../context/StorageContext';
import { X, Folder, ArrowRight, FolderPlus } from 'lucide-react';

export function MoveToFolderModal({ isOpen, onClose, targetItemIds }) {
  const { folders, moveItemsToFolder, currentFolderId, addToast, setIsNewFolderOpen } = useStorage();

  if (!isOpen) return null;

  const itemIds = Array.isArray(targetItemIds) ? targetItemIds : (targetItemIds ? [targetItemIds] : []);

  const handleSelectFolder = async (folderId) => {
    if (folderId === currentFolderId) {
      addToast('Item is already in this folder.', 'info');
      onClose();
      return;
    }
    await moveItemsToFolder(itemIds, folderId);
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3200 }} onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px', borderRadius: '10px' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={17} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '0.96rem', fontWeight: '600' }}>Move to Folder</h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '16px 20px' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
            Select destination folder for <strong style={{ color: 'var(--text-primary)' }}>{itemIds.length} item(s)</strong>:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
            {/* Move to Root / Main Vault */}
            <div
              onClick={() => handleSelectFolder(null)}
              style={{
                background: currentFolderId === null ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
                border: currentFolderId === null ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                borderRadius: '8px', padding: '10px 14px', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Folder size={16} color="var(--accent-primary)" />
                </div>
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: '600', color: 'var(--text-primary)' }}>Main Vault Root</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Top level storage directory</div>
                </div>
              </div>
              <ArrowRight size={14} color="var(--text-muted)" />
            </div>

            {/* Custom User Folders */}
            {folders.map(folder => (
              <div
                key={folder.id}
                onClick={() => handleSelectFolder(folder.id)}
                style={{
                  background: folder.id === currentFolderId ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
                  border: folder.id === currentFolderId ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  borderRadius: '8px', padding: '10px 14px', display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '6px',
                    background: 'var(--bg-input)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--border-subtle)'
                  }}>
                    <Folder size={15} color={folder.color || 'var(--accent-primary)'} fill={folder.color || 'var(--accent-primary)'} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: '600', color: 'var(--text-primary)' }}>{folder.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Custom folder</div>
                  </div>
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>
            ))}
          </div>

          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => { onClose(); setIsNewFolderOpen(true); }}
              style={{ fontSize: '0.8rem', gap: '6px', borderRadius: '10px' }}
            >
              <FolderPlus size={14} /> Create New Folder
            </button>

            <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '0.8rem' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

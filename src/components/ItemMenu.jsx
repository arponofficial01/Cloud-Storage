import React, { useEffect, useRef } from 'react';
import { useStorage } from '../context/StorageContext';
import { useAuth } from '../context/AuthContext';
import { encryptBlobAes256, decryptBlobAes256, recordSecurityEvent } from '../utils/securityEngine';
import {
  Folder,
  Eye,
  Sliders,
  Download,
  Share2,
  Edit3,
  Trash2,
  RotateCcw,
  FolderInput,
  FolderOutput,
  FileText,
  Lock,
  Unlock
} from 'lucide-react';

export function ItemMenu({
  item,
  isFolder,
  onClose,
  onRename,
  onEditMedia,
  onEditDoc,
  onDownload,
  onPreview,
  onShare,
  onOpenFolder
}) {
  const {
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    unzipFile,
    setMoveModalTarget,
    requestConfirm,
    ensureFileBlob,
    replaceFile,
    addToast
  } = useStorage();
  const { user } = useAuth();
  const menuRef = useRef(null);

  const isEncryptedFile = !isFolder && (item?.isEncrypted || item?.name?.endsWith('.sbank.enc'));

  const handleToggleEncryption = async () => {
    onClose();
    try {
      const secretKey = user?.pin || user?.id || user?.email || 'storagebank-zero-trust-key';
      let blob = item.blob;
      if (!(blob instanceof Blob) && typeof ensureFileBlob === 'function') {
        blob = await ensureFileBlob(item);
      }
      if (!(blob instanceof Blob)) {
        addToast('File payload not ready for encryption yet.', 'error');
        return;
      }

      if (isEncryptedFile) {
        const origMime = item.originalMime || 'application/octet-stream';
        const origName = item.originalName || item.name.replace(/\.sbank\.enc$/i, '');
        const decryptedBlob = await decryptBlobAes256(blob, secretKey, origMime);
        await replaceFile(item.id, decryptedBlob, {
          name: origName,
          type: origMime,
          isEncrypted: false
        });
        recordSecurityEvent('AES-256 File Decrypted', `Decrypted "${origName}" in vault`, 'success');
        addToast(`Decrypted "${origName}" (AES-256-GCM)`, 'success');
      } else {
        const encryptedBlob = await encryptBlobAes256(blob, secretKey);
        const encName = item.name.endsWith('.sbank.enc') ? item.name : `${item.name}.sbank.enc`;
        await replaceFile(item.id, encryptedBlob, {
          name: encName,
          originalName: item.name,
          originalMime: item.type || blob.type || 'application/octet-stream',
          type: 'application/octet-stream',
          isEncrypted: true
        });
        recordSecurityEvent('AES-256 File Encrypted', `Encrypted "${item.name}" with AES-256-GCM`, 'success');
        addToast(`Encrypted "${item.name}" with AES-256-GCM`, 'success');
      }
    } catch (err) {
      addToast(err?.message || 'AES-256 encryption operation failed', 'error');
    }
  };

  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [onClose]);

  if (!item) return null;

  const isMedia = item.category === 'image' || item.category === 'video';
  const isDocOrCode = !isFolder && (item.category === 'document' || item.category === 'code');
  const isZip = !isFolder && (item.name?.endsWith('.zip') || item.category === 'archive');

  const btnStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    fontSize: '0.78rem',
    borderRadius: '5px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.12s ease'
  };

  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: '100%',
        right: '0',
        marginTop: '4px',
        width: '180px',
        background: 'var(--bg-modal)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '7px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px var(--border-subtle)',
        padding: '5px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '1px'
      }}
    >
      {!item.inTrash ? (
        <>
          {isFolder && onOpenFolder && (
            <button
              style={{ ...btnStyle, color: 'var(--text-primary)', fontWeight: 600 }}
              onClick={() => { onOpenFolder(); onClose(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Folder size={13} color="var(--accent-primary)" />
              <span>Open Folder</span>
            </button>
          )}

          {!isFolder && onPreview && (
            <button
              style={{ ...btnStyle, color: 'var(--text-primary)', fontWeight: 600 }}
              onClick={() => { onPreview(); onClose(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Eye size={13} color="var(--accent-primary)" />
              <span>Preview &amp; Open</span>
            </button>
          )}

          {!isFolder && isDocOrCode && (onEditDoc || onPreview) && (
            <button
              style={btnStyle}
              onClick={() => { (onEditDoc || onPreview)(); onClose(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <FileText size={13} />
              <span>Edit Document</span>
            </button>
          )}

          {!isFolder && isMedia && onEditMedia && (
            <button
              style={btnStyle}
              onClick={() => { onEditMedia(); onClose(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Sliders size={13} />
              <span>Edit Media</span>
            </button>
          )}

          {!isFolder && onDownload && (
            <button
              style={btnStyle}
              onClick={() => { onDownload(); onClose(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Download size={13} />
              <span>Download</span>
            </button>
          )}

          {!isFolder && onShare && (
            <button
              style={btnStyle}
              onClick={() => { onShare(); onClose(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Share2 size={13} />
              <span>Share Link</span>
            </button>
          )}

          {isZip && (
            <button
              style={btnStyle}
              onClick={() => { unzipFile(item); onClose(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <FolderOutput size={13} />
              <span>Extract (.ZIP)</span>
            </button>
          )}

          <button
            style={btnStyle}
            onClick={() => { setMoveModalTarget([item.id]); onClose(); }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <FolderInput size={13} />
            <span>Move to...</span>
          </button>

          <button
            style={btnStyle}
            onClick={() => { onRename(); onClose(); }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Edit3 size={13} />
            <span>Rename</span>
          </button>

          {!isFolder && (
            <button
              style={{ ...btnStyle, color: isEncryptedFile ? 'var(--accent-emerald)' : 'var(--accent-primary)' }}
              onClick={handleToggleEncryption}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {isEncryptedFile ? <Unlock size={13} /> : <Lock size={13} />}
              <span>{isEncryptedFile ? 'Decrypt (AES-256)' : 'Encrypt (AES-256)'}</span>
            </button>
          )}

          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '3px 0' }} />

          <button
            style={{ ...btnStyle, color: 'var(--accent-rose)' }}
            onClick={() => { moveToTrash(item.id, isFolder); onClose(); }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Trash2 size={13} />
            <span>Move to Trash</span>
          </button>
        </>
      ) : (
        <>
          {isFolder && onOpenFolder && (
            <button
              style={{ ...btnStyle, color: 'var(--text-primary)', fontWeight: 600 }}
              onClick={() => { onOpenFolder(); onClose(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Folder size={13} color="var(--accent-primary)" />
              <span>Preview Folder</span>
            </button>
          )}

          {!isFolder && onPreview && (
            <button
              style={{ ...btnStyle, color: 'var(--text-primary)', fontWeight: 600 }}
              onClick={() => { onPreview(); onClose(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Eye size={13} color="var(--accent-primary)" />
              <span>Preview File</span>
            </button>
          )}

          {!isFolder && onDownload && (
            <button
              style={btnStyle}
              onClick={() => { onDownload(); onClose(); }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Download size={13} />
              <span>Download</span>
            </button>
          )}

          <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '3px 0' }} />

          <button
            style={{ ...btnStyle, color: 'var(--accent-emerald)' }}
            onClick={() => { restoreFromTrash(item.id, isFolder); onClose(); }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <RotateCcw size={13} />
            <span>Restore</span>
          </button>

          <button
            style={{ ...btnStyle, color: 'var(--accent-rose)' }}
            onClick={() => {
              onClose();
              requestConfirm({
                title: 'Delete Permanently',
                message: `Are you sure you want to permanently delete "${item.name}"? This item cannot be recovered.`,
                confirmText: 'Delete Permanently',
                danger: true,
                onConfirm: () => deletePermanently(item.id, isFolder)
              });
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Trash2 size={13} />
            <span>Delete Permanently</span>
          </button>
        </>
      )}
    </div>
  );
}

export default ItemMenu;

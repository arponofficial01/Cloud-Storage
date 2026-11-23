import React, { useEffect } from 'react';
import { useStorage } from '../context/StorageContext';
import { AlertTriangle, Trash2, X, ShieldAlert } from 'lucide-react';

export function ConfirmDialogModal() {
  const { confirmDialog, closeConfirmDialog } = useStorage();

  useEffect(() => {
    if (!confirmDialog) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeConfirmDialog();
      if (e.key === 'Enter' && confirmDialog.onConfirm) {
        confirmDialog.onConfirm();
        closeConfirmDialog();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDialog, closeConfirmDialog]);

  if (!confirmDialog) return null;

  const isDanger = confirmDialog.danger !== false;

  const handleConfirm = async () => {
    const fn = confirmDialog.onConfirm;
    closeConfirmDialog();
    if (typeof fn === 'function') {
      await fn();
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 9500,
        background: 'rgba(3, 7, 18, 0.78)',
        backdropFilter: 'blur(10px)'
      }}
      onClick={closeConfirmDialog}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '420px',
          width: '92vw',
          borderRadius: '11px',
          padding: 0,
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-strong)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
          overflow: 'hidden'
        }}
      >
        {/* Top Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              background: isDanger ? 'rgba(244, 63, 94, 0.12)' : 'rgba(99, 102, 241, 0.12)',
              border: `1px solid ${isDanger ? 'rgba(244, 63, 94, 0.28)' : 'rgba(99, 102, 241, 0.28)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDanger ? 'var(--accent-rose)' : 'var(--accent-primary)',
              flexShrink: 0
            }}>
              {isDanger ? <AlertTriangle size={15} /> : <ShieldAlert size={15} />}
            </div>
            <h3 style={{ fontSize: '0.94rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {confirmDialog.title || 'Confirm Action'}
            </h3>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={closeConfirmDialog}
            style={{ width: '26px', height: '26px', padding: 0 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {confirmDialog.message || 'Are you sure you want to proceed with this action?'}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '8px',
          padding: '12px 18px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)'
        }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={closeConfirmDialog}
            style={{ padding: '7px 14px', fontSize: '0.8rem', borderRadius: '7px' }}
          >
            {confirmDialog.cancelText || 'Cancel'}
          </button>
          <button
            type="button"
            className={isDanger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={handleConfirm}
            style={{
              padding: '7px 16px',
              fontSize: '0.8rem',
              borderRadius: '7px',
              fontWeight: 600,
              gap: '6px',
              ...(isDanger
                ? {
                    background: 'var(--accent-rose)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.15)'
                  }
                : {})
            }}
          >
            {isDanger && <Trash2 size={13} />}
            <span>{confirmDialog.confirmText || 'Confirm'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

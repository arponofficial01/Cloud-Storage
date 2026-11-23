import React, { useState } from 'react';
import { useStorage } from '../context/StorageContext';
import { formatBytes } from '../utils/planQuotas';
import { X, Share2, Copy, Check, Lock, Globe, ExternalLink } from 'lucide-react';

function encodeShareToken(file) {
  try {
    const payload = {
      id: file.id,
      n: file.name,
      s: file.size || 0,
      t: file.type || 'application/octet-stream',
      c: file.category || 'document',
      tg: file.telegramFileId || null
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch {
    return '';
  }
}

export function ShareModal() {
  const { activeShare, setActiveShare, addToast } = useStorage();
  const [copied, setCopied] = useState(false);
  const [linkAccess, setLinkAccess] = useState('passcode'); // 'public' | 'passcode'
  const [sharePasscode, setSharePasscode] = useState(() => Math.floor(100000 + Math.random() * 900000).toString());

  if (!activeShare) return null;

  const realPasscode = linkAccess === 'passcode' ? sharePasscode : '';
  const token = encodeShareToken(activeShare);
  const shareUrl = `${window.location.origin}?share=${encodeURIComponent(activeShare.id)}${token ? `&token=${encodeURIComponent(token)}` : ''}${realPasscode ? `&pass=${encodeURIComponent(realPasscode)}` : ''}`;

  const generateNewPasscode = () => {
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();
    setSharePasscode(newPin);
    addToast('Generated new 6-digit access passcode', 'info');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    addToast(`Copied share link ${realPasscode ? `(PIN: ${realPasscode})` : ''}`, 'success');
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3500 }} onClick={() => setActiveShare(null)}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '500px', width: '94vw' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)'
            }}>
              <Share2 size={15} />
            </div>
            <h3 style={{ fontSize: '0.96rem', fontWeight: 600 }}>Share Cloud File Link</h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={() => setActiveShare(null)}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '12px 14px',
            background: 'var(--bg-surface)',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {activeShare.name}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {activeShare.category?.toUpperCase()} &bull; {formatBytes(activeShare.size || 0)}
              </div>
            </div>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
              style={{ fontSize: '0.74rem', padding: '5px 9px', borderRadius: '6px', gap: '4px', flexShrink: 0 }}
              title="Preview shared page in new tab"
            >
              <span>Test Link</span>
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Access Policy Selection */}
          <div>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
              ACCESS PERMISSION
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setLinkAccess('public')}
                style={{
                  justifyContent: 'flex-start',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: linkAccess === 'public' ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                  border: linkAccess === 'public' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-subtle)'
                }}
              >
                <Globe size={15} color="var(--accent-primary)" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Direct Link</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Anyone with link can view</div>
                </div>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setLinkAccess('passcode')}
                style={{
                  justifyContent: 'flex-start',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: linkAccess === 'passcode' ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                  border: linkAccess === 'passcode' ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-subtle)'
                }}
              >
                <Lock size={15} color="var(--accent-emerald)" />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>PIN Protected</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Requires 6-digit PIN</div>
                </div>
              </button>
            </div>
          </div>

          {linkAccess === 'passcode' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ACCESS PASSCODE (PIN)
                </label>
                <button
                  type="button"
                  onClick={generateNewPasscode}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Generate New PIN
                </button>
              </div>
              <input
                type="text"
                className="input-text"
                placeholder="e.g. 6-digit passcode"
                value={sharePasscode}
                onChange={(e) => setSharePasscode(e.target.value)}
                style={{ fontSize: '0.88rem', fontFamily: 'monospace', letterSpacing: '0.1em' }}
              />
            </div>
          )}

          {/* Copy Link Input Bar */}
          <div>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
              SHAREABLE CLOUD URL
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="input-text"
                value={shareUrl}
                readOnly
                style={{ fontSize: '0.78rem', fontFamily: 'monospace', flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={handleCopy}
                style={{ padding: '0 16px', fontSize: '0.8rem', borderRadius: '7px', flexShrink: 0 }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setActiveShare(null)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

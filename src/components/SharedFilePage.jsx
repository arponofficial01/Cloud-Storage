import React, { useState, useEffect } from 'react';
import { useStorage } from '../context/StorageContext';
import { Lock, Download, ShieldCheck, FileText, Cloud, Loader2, ArrowLeft } from 'lucide-react';
import { getFileById, inferMimeType } from '../services/dbService';
import { downloadTelegramFileBlob } from '../services/telegramStorageService';
import { getDocumentKind, parseDocxBlob, parseSpreadsheetBlob } from '../utils/documentParser';
import { formatBytes } from '../utils/planQuotas';

function decodeShareToken(tokenStr) {
  if (!tokenStr) return null;
  try {
    const json = decodeURIComponent(escape(atob(tokenStr)));
    const p = JSON.parse(json);
    if (!p || !p.n) return null;
    return {
      id: p.id || 'shared-file',
      name: p.n,
      size: p.s || 0,
      type: inferMimeType(p.n, p.t),
      category: p.c || 'document',
      telegramFileId: p.tg || null
    };
  } catch {
    return null;
  }
}

export function SharedFilePage({ sharedFileId, requiredPasscode }) {
  const { files, ensureFileBlob } = useStorage();
  const [sharedFile, setSharedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [passInput, setPassInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(!requiredPasscode);
  const [errorMsg, setErrorMsg] = useState('');
  const [objectUrl, setObjectUrl] = useState(null);
  const [docHtml, setDocHtml] = useState('');
  const [sheetRows, setSheetRows] = useState([]);
  const [textContent, setTextContent] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadTargetFile() {
      const params = new URLSearchParams(window.location.search);
      const tokenParam = params.get('token');
      const tokenMeta = decodeShareToken(tokenParam);

      // 1. Check in-memory vault files
      let match = files.find(f => f.id === sharedFileId);

      // 2. Check IndexedDB
      if (!match) {
        try {
          match = await getFileById(sharedFileId);
        } catch {}
      }

      // 3. Fallback to self-contained cross-device share token metadata
      if (!match && tokenMeta) {
        match = tokenMeta;
      }

      if (match) {
        let blob = match.blob;
        if (!(blob instanceof Blob)) {
          try {
            if (typeof ensureFileBlob === 'function') {
              blob = await ensureFileBlob(match);
            }
            if (!(blob instanceof Blob) && match.telegramFileId) {
              blob = await downloadTelegramFileBlob(match);
            }
          } catch {}
        }

        const resolvedRecord = { ...match, blob: blob || null };
        if (isMounted) {
          setSharedFile(resolvedRecord);
          setLoading(false);
        }
      } else {
        if (isMounted) setLoading(false);
      }
    }
    loadTargetFile();
    return () => { isMounted = false; };
  }, [sharedFileId, files, ensureFileBlob]);

  useEffect(() => {
    let url = null;
    if (sharedFile?.blob instanceof Blob) {
      const kind = getDocumentKind(sharedFile);
      const ext = (sharedFile.name?.split('.').pop() || '').toLowerCase();
      const effectiveBlob =
        kind === 'pdf' && sharedFile.blob.type !== 'application/pdf'
          ? new Blob([sharedFile.blob], { type: 'application/pdf' })
          : sharedFile.blob;
      url = URL.createObjectURL(effectiveBlob);
      setObjectUrl(url);

      if (kind === 'docx') {
        parseDocxBlob(sharedFile.blob).then(res => setDocHtml(res.html || '')).catch(() => {});
      } else if (kind === 'xlsx' || kind === 'csv') {
        parseSpreadsheetBlob(sharedFile.blob, ext).then(res => setSheetRows(res.rows || [])).catch(() => {});
      } else if (['markdown', 'html', 'json', 'code', 'text'].includes(kind)) {
        sharedFile.blob.text().then(t => setTextContent(t)).catch(() => {});
      }
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [sharedFile]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', width: '100vw', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          <Loader2 className="spin" size={20} color="var(--accent-primary)" />
          <span>Loading shared cloud file...</span>
        </div>
      </div>
    );
  }

  const handleUnlock = (e) => {
    e.preventDefault();
    if (passInput.trim() === requiredPasscode) {
      setIsUnlocked(true);
      setErrorMsg('');
    } else {
      setErrorMsg('Incorrect access passcode. Please try again.');
    }
  };

  const handleDownload = () => {
    if (!sharedFile) return;
    if (objectUrl) {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = sharedFile.name;
      a.click();
    }
  };

  if (!sharedFile) {
    return (
      <div style={{
        minHeight: '100vh', width: '100vw', background: 'var(--bg-primary)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px'
      }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '32px', maxWidth: '420px', textAlign: 'center' }}>
          <ShieldCheck size={34} color="var(--accent-rose)" style={{ marginBottom: '12px' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Shared Link Unavailable</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '6px', marginBottom: '16px' }}>
            This share link may have expired or was removed by the vault owner.
          </p>
          <a href={window.location.origin} className="btn btn-secondary" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
            <ArrowLeft size={13} />
            <span>Return to StorageBank</span>
          </a>
        </div>
      </div>
    );
  }

  const kind = getDocumentKind(sharedFile);

  return (
    <div style={{
      minHeight: '100vh', width: '100vw', background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px'
    }}>
      {/* Header Branding */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '720px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff' }}>
            <Cloud size={16} />
          </div>
          <span style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            StorageBank Cloud Share
          </span>
        </div>
        <a href={window.location.origin} className="btn btn-ghost" style={{ textDecoration: 'none', fontSize: '0.78rem', padding: '5px 10px' }}>
          Open My Vault
        </a>
      </div>

      <div style={{
        background: 'var(--bg-modal)', border: '1px solid var(--border-subtle)',
        borderRadius: '11px', padding: '24px', width: '100%', maxWidth: '720px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
      }}>
        {!isUnlocked ? (
          <form onSubmit={handleUnlock} style={{ textAlign: 'center', maxWidth: '360px', margin: '0 auto', padding: '12px 0' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '9px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', color: 'var(--accent-primary)' }}>
              <Lock size={20} />
            </div>
            <h2 style={{ fontSize: '1.08rem', fontWeight: 600, color: 'var(--text-primary)' }}>PIN Protected File</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px', marginBottom: '18px' }}>
              Enter the access PIN provided by the owner to unlock <strong>{sharedFile.name}</strong>.
            </p>

            {errorMsg && (
              <div style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)', color: 'var(--accent-rose)', padding: '8px 12px', borderRadius: '7px', fontSize: '0.78rem', marginBottom: '14px' }}>
                {errorMsg}
              </div>
            )}

            <input
              type="password"
              className="input-text"
              placeholder="Enter 6-digit PIN"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', fontSize: '0.96rem', textAlign: 'center',
                letterSpacing: '0.15em', marginBottom: '14px'
              }}
              autoFocus
            />

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '9px', borderRadius: '7px', fontWeight: 600, fontSize: '0.84rem', justifyContent: 'center' }}>
              Unlock File
            </button>
          </form>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{sharedFile.name}</h3>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  {formatBytes(sharedFile.size || 0)} &bull; {kind.toUpperCase()}
                </span>
              </div>

              <button className="btn btn-primary" onClick={handleDownload} disabled={!objectUrl} style={{ padding: '7px 14px', borderRadius: '7px', gap: '6px', fontSize: '0.8rem' }}>
                <Download size={14} /> Download File
              </button>
            </div>

            {/* Universal Preview Stage */}
            <div style={{
              background: (sharedFile.category === 'image' || sharedFile.category === 'video') ? '#090a0f' : 'var(--bg-secondary)',
              borderRadius: '8px',
              overflow: 'hidden',
              minHeight: '280px',
              maxHeight: '520px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-subtle)'
            }}>
              {sharedFile.category === 'image' && objectUrl ? (
                <img src={objectUrl} alt={sharedFile.name} style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain', display: 'block' }} />
              ) : sharedFile.category === 'video' && objectUrl ? (
                <video src={objectUrl} controls playsInline style={{ width: '100%', maxHeight: '500px', display: 'block' }} />
              ) : sharedFile.category === 'audio' && objectUrl ? (
                <audio src={objectUrl} controls style={{ width: '90%' }} />
              ) : kind === 'pdf' && objectUrl ? (
                <iframe src={objectUrl} title={sharedFile.name} style={{ width: '100%', height: '480px', border: 'none', background: '#ffffff' }} />
              ) : kind === 'docx' && docHtml ? (
                <div style={{ padding: '24px', overflowY: 'auto', maxHeight: '480px', width: '100%', color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: 1.65 }} dangerouslySetInnerHTML={{ __html: docHtml }} />
              ) : (kind === 'xlsx' || kind === 'csv') && sheetRows.length > 0 ? (
                <div style={{ overflow: 'auto', maxHeight: '460px', width: '100%' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <tbody>
                      {sheetRows.slice(0, 40).map((r, rIdx) => (
                        <tr key={rIdx}>
                          {r.map((cell, cIdx) => (
                            <td key={cIdx} style={{ padding: '6px 10px', border: '1px solid var(--border-subtle)', color: rIdx === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: rIdx === 0 ? 600 : 400 }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : textContent ? (
                <pre style={{ padding: '18px', margin: 0, width: '100%', maxHeight: '460px', overflow: 'auto', fontSize: '0.8rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                  {textContent}
                </pre>
              ) : (
                <div style={{ textAlign: 'center', padding: '36px' }}>
                  <FileText size={36} color="var(--accent-primary)" style={{ marginBottom: '10px' }} />
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {objectUrl ? 'Click Download File above to save a copy to your device.' : 'Retrieving cloud stream...'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: '18px', fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>StorageBank Cloud Vault</span>
        <span>&bull;</span>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Developed By Arpon Chakraborty</span>
      </div>
    </div>
  );
}

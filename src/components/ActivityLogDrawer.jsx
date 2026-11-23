import React, { useState, useMemo } from 'react';
import { useStorage } from '../context/StorageContext';
import {
  X,
  Activity,
  UploadCloud,
  FolderPlus,
  Trash2,
  Edit2,
  Shield,
  RefreshCw,
  Sliders,
  HardDrive,
  RotateCcw,
  BarChart3,
  ArrowRight
} from 'lucide-react';

export function ActivityLogDrawer() {
  const { isActivityLogOpen, setIsActivityLogOpen, activityLogs, clearActivityLogs, setIsAnalyticsOpen } = useStorage();
  const [filterAction, setFilterAction] = useState('ALL');

  const logs = useMemo(() => activityLogs || [], [activityLogs]);

  // Data Analytics Metrics
  const uploadCount = logs.filter(l => l.action === 'UPLOAD').length;
  const editConvertCount = logs.filter(l => ['EDIT', 'CONVERT', 'SAVE'].includes(l.action)).length;
  const trashCount = logs.filter(l => l.action === 'TRASH').length;

  const filteredLogs = useMemo(() => {
    if (filterAction === 'ALL') return logs;
    if (filterAction === 'UPLOAD') return logs.filter(l => l.action === 'UPLOAD');
    if (filterAction === 'EDIT') return logs.filter(l => ['EDIT', 'CONVERT', 'SAVE', 'RENAME'].includes(l.action));
    if (filterAction === 'TRASH') return logs.filter(l => ['TRASH', 'RESTORE'].includes(l.action));
    return logs;
  }, [logs, filterAction]);

  const formatLogDetails = (act) => {
    if (act.action === 'BKASH_REQUEST' && act.details) {
      try {
        const tx = JSON.parse(act.details);
        return `bKash ${tx.plan || 'Upgrade'} • TrxID ${tx.trxId || ''} (${act.status || tx.status || 'pending'})`;
      } catch {
        return 'bKash Subscription Request';
      }
    }
    return act.details || act.action;
  };

  if (!isActivityLogOpen) return null;

  const getActionIcon = (action) => {
    switch (action) {
      case 'UPLOAD': return <UploadCloud size={14} color="var(--accent-emerald)" />;
      case 'CREATE_FOLDER': return <FolderPlus size={14} color="var(--accent-primary)" />;
      case 'CONVERT': return <RefreshCw size={14} color="var(--accent-primary)" />;
      case 'EDIT': return <Sliders size={14} color="var(--accent-amber)" />;
      case 'SAVE': return <HardDrive size={14} color="var(--accent-primary)" />;
      case 'RENAME': return <Edit2 size={14} color="var(--accent-amber)" />;
      case 'TRASH': return <Trash2 size={14} color="var(--accent-rose)" />;
      case 'RESTORE': return <RotateCcw size={14} color="var(--accent-emerald)" />;
      default: return <Shield size={14} color="var(--text-secondary)" />;
    }
  };

  return (
    <div className="modal-overlay" style={{ justifyContent: 'flex-end', padding: 0, zIndex: 3500 }} onClick={() => setIsActivityLogOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '380px',
          maxWidth: '100vw',
          height: '100vh',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-subtle)',
          boxShadow: '0 0 40px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>Activity &amp; Audit Log</h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {logs.length > 0 && (
              <button
                className="btn btn-ghost btn-icon"
                title="Clear all activity logs"
                onClick={clearActivityLogs}
                style={{ padding: '4px', height: '26px', width: '26px', color: 'var(--accent-rose)' }}
              >
                <Trash2 size={14} />
              </button>
            )}

            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setIsActivityLogOpen(false)}
              style={{ padding: '4px', height: '26px', width: '26px' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Matching Data Analytics Header Card */}
        <div style={{
          padding: '14px 16px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              <BarChart3 size={13} color="var(--accent-primary)" />
              <span>Audit Analytics</span>
            </div>
            <button
              onClick={() => { setIsActivityLogOpen(false); setIsAnalyticsOpen(true); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary)',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0
              }}
            >
              Full Analytics <ArrowRight size={11} />
            </button>
          </div>

          {/* Quick Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
            <div style={{ background: 'var(--bg-input)', padding: '8px 4px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>{uploadCount}</div>
              <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Uploads</div>
            </div>
            <div style={{ background: 'var(--bg-input)', padding: '8px 4px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{editConvertCount}</div>
              <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Edits / Conv</div>
            </div>
            <div style={{ background: 'var(--bg-input)', padding: '8px 4px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-rose)' }}>{trashCount}</div>
              <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Trashed</div>
            </div>
          </div>

          {/* Action Filter Pills */}
          <div style={{ display: 'flex', gap: '4px', marginTop: '10px' }}>
            {[
              { id: 'ALL', label: `All (${logs.length})` },
              { id: 'UPLOAD', label: `Uploads (${uploadCount})` },
              { id: 'EDIT', label: `Edits (${editConvertCount})` },
              { id: 'TRASH', label: `Trash (${trashCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterAction(tab.id)}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: filterAction === tab.id ? 'var(--accent-primary)' : 'var(--bg-input)',
                  color: filterAction === tab.id ? '#ffffff' : 'var(--text-muted)',
                  transition: 'var(--transition-fast)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Log List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              No audit logs recorded for this filter.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredLogs.map(act => (
                <div key={act.id} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 12px',
                  background: 'var(--bg-surface)',
                  borderRadius: '7px',
                  border: '1px solid var(--border-subtle)'
                }}>
                  <div style={{
                    padding: '6px',
                    borderRadius: '5px',
                    background: 'var(--bg-input)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {getActionIcon(act.action)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '500', fontSize: '0.82rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                      {formatLogDetails(act)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull; {new Date(act.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

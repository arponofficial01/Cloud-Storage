import React, { useState, useMemo } from 'react';
import { useStorage } from '../context/StorageContext';
import { formatBytes } from '../utils/planQuotas';
import {
  X,
  PieChart,
  HardDrive,
  BarChart3,
  ShieldCheck,
  Trash2,
  Files
} from 'lucide-react';

export function StorageAnalyticsModal() {
  const { isAnalyticsOpen, setIsAnalyticsOpen, storageStats, files, folders, batchDeletePermanently, addToast, requestConfirm } = useStorage();
  const [activeTab, setActiveTab] = useState('breakdown'); // 'breakdown' | 'optimization'

  const categoryConfigs = useMemo(() => [
    { key: 'image', label: 'Photos & Media', color: 'var(--accent-primary)' },
    { key: 'document', label: 'Documents', color: 'var(--accent-emerald)' },
    { key: 'video', label: 'Videos', color: 'var(--accent-rose)' },
    { key: 'audio', label: 'Audio', color: 'var(--accent-amber)' },
    { key: 'code', label: 'Code', color: 'var(--accent-secondary)' },
    { key: 'archive', label: 'Archives', color: '#6366f1' },
  ], []);

  const totalBytes = storageStats?.totalBytes || 0;
  const totalFiles = storageStats?.totalFiles || 0;
  const totalFolders = (folders || []).filter(f => !f.inTrash).length;

  const activeFilesList = useMemo(() => (files || []).filter(f => !f.inTrash), [files]);
  const trashFilesList = useMemo(() => (files || []).filter(f => f.inTrash), [files]);
  const trashBytes = useMemo(() => trashFilesList.reduce((acc, f) => acc + (f.size || 0), 0), [trashFilesList]);

  // Real Top 5 Largest Files
  const largestFiles = useMemo(() => {
    return [...activeFilesList].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 5);
  }, [activeFilesList]);

  // Real Duplicate File Pairs (matching name + size)
  const duplicatePairs = useMemo(() => {
    const map = new Map();
    const dups = [];

    activeFilesList.forEach(file => {
      const key = `${file.name.toLowerCase()}-${file.size}`;
      if (map.has(key)) {
        dups.push({ original: map.get(key), duplicate: file });
      } else {
        map.set(key, file);
      }
    });

    return dups;
  }, [activeFilesList]);

  // Real-Time SVG Multi-Color Donut Segments
  const donutSegments = useMemo(() => {
    if (!totalBytes || totalBytes === 0) return [];
    let accumulatedPct = 0;

    return categoryConfigs.map(cat => {
      const bytes = storageStats?.categories?.[cat.key]?.bytes || 0;
      const pct = (bytes / totalBytes) * 100;
      const strokeDasharray = `${pct} ${100 - pct}`;
      const strokeDashoffset = -accumulatedPct;
      accumulatedPct += pct;

      return {
        ...cat,
        bytes,
        pct: pct.toFixed(1),
        strokeDasharray,
        strokeDashoffset
      };
    });
  }, [storageStats, totalBytes, categoryConfigs]);

  if (!isAnalyticsOpen) return null;

  const formatSize = formatBytes;

  const handleEmptyTrash = () => {
    if (trashFilesList.length === 0) return;
    requestConfirm({
      title: 'Empty Trash Permanently',
      message: `Permanently delete all ${trashFilesList.length} item(s) (${formatSize(trashBytes)}) from Trash? This action cannot be undone.`,
      confirmText: 'Empty Trash',
      danger: true,
      onConfirm: async () => {
        const ids = trashFilesList.map(f => f.id);
        await batchDeletePermanently(ids);
        addToast(`Permanently deleted ${ids.length} item(s) from Trash.`, 'success');
      }
    });
  };

  const handleDeleteDuplicate = (dupFileId, dupName) => {
    requestConfirm({
      title: 'Remove Duplicate Copy',
      message: `Permanently remove duplicate copy "${dupName || 'file'}" from your vault?`,
      confirmText: 'Remove Copy',
      danger: true,
      onConfirm: async () => {
        await batchDeletePermanently([dupFileId]);
        addToast('Removed duplicate copy.', 'success');
      }
    });
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setIsAnalyticsOpen(false)}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '720px',
          width: '92vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: '9px',
          overflow: 'hidden',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PieChart size={17} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '0.96rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              Storage Analytics & Optimization
            </h3>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setIsAnalyticsOpen(false)}
            style={{ padding: '4px', height: '28px', width: '28px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Selector */}
        <div style={{
          display: 'flex',
          padding: '12px 18px 0 18px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          gap: '8px'
        }}>
          <button
            className="btn btn-ghost"
            onClick={() => setActiveTab('breakdown')}
            style={{
              padding: '6px 14px',
              fontSize: '0.8rem',
              borderBottom: activeTab === 'breakdown' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              borderRadius: '0',
              color: activeTab === 'breakdown' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'breakdown' ? 600 : 500,
              gap: '6px'
            }}
          >
            <BarChart3 size={14} />
            <span>Storage Breakdown</span>
          </button>

          <button
            className="btn btn-ghost"
            onClick={() => setActiveTab('optimization')}
            style={{
              padding: '6px 14px',
              fontSize: '0.8rem',
              borderBottom: activeTab === 'optimization' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              borderRadius: '0',
              color: activeTab === 'optimization' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'optimization' ? 600 : 500,
              gap: '6px'
            }}
          >
            <ShieldCheck size={14} />
            <span>Vault Optimization ({duplicatePairs.length > 0 || trashFilesList.length > 0 ? duplicatePairs.length + trashFilesList.length : 0})</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
          {/* Top Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '18px' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Vault Used</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {formatSize(totalBytes)}
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Content</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {totalFiles} files <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>({totalFolders} folders)</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Trash Bin Overhead</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: trashFilesList.length > 0 ? 'var(--accent-rose)' : 'var(--text-muted)', marginTop: '4px' }}>
                {formatSize(trashBytes)} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>({trashFilesList.length} items)</span>
              </div>
            </div>
          </div>

          {activeTab === 'breakdown' && (
            <>
              {/* SVG Donut & Category List */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: totalBytes > 0 ? '160px 1fr' : '1fr',
                gap: '20px',
                alignItems: 'center',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '18px'
              }}>
                {totalBytes > 0 && (
                  <div style={{ position: 'relative', width: '130px', height: '130px', margin: 'auto' }}>
                    <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.08)"
                        strokeWidth="3.8"
                      />
                      {donutSegments.map((seg) => (
                        <path
                          key={seg.key}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="3.8"
                          strokeDasharray={seg.strokeDasharray}
                          strokeDashoffset={seg.strokeDashoffset}
                        />
                      ))}
                    </svg>

                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {formatSize(totalBytes)}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Used
                      </div>
                    </div>
                  </div>
                )}

                {/* Category List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {categoryConfigs.map(cat => {
                    const bytes = storageStats?.categories?.[cat.key]?.bytes || 0;
                    const count = storageStats?.categories?.[cat.key]?.count || 0;
                    const pct = totalBytes > 0 ? ((bytes / totalBytes) * 100).toFixed(1) : 0;

                    return (
                      <div key={cat.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cat.color }} />
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{cat.label}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({count})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontSize: '0.76rem' }}>{pct}%</span>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: '60px', textAlign: 'right' }}>
                            {formatSize(bytes)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {activeTab === 'optimization' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Trash Bin Purge Box */}
              {trashFilesList.length > 0 && (
                <div style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  background: 'rgba(239, 68, 68, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Trash2 size={14} /> Trash Contains {trashFilesList.length} Item(s)
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Purging trash will permanently free up {formatSize(trashBytes)} of space.
                    </div>
                  </div>
                  <button
                    className="btn btn-danger"
                    onClick={handleEmptyTrash}
                    style={{ fontSize: '0.76rem', padding: '5px 12px', borderRadius: '6px', gap: '5px' }}
                  >
                    <Trash2 size={13} /> Empty Trash
                  </button>
                </div>
              )}

              {/* Duplicate Files Scanner */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px'
              }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Files size={14} color="var(--accent-primary)" /> Duplicate Files Detected ({duplicatePairs.length})
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Files sharing identical names and byte sizes.
                </div>

                {duplicatePairs.length === 0 ? (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', padding: '10px 0' }}>
                    ✓ No duplicate files detected in your active vault.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {duplicatePairs.map((pair, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'var(--bg-input)',
                          borderRadius: '6px',
                          fontSize: '0.78rem'
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{pair.duplicate.name}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '8px' }}>{formatSize(pair.duplicate.size)}</span>
                        </div>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleDeleteDuplicate(pair.duplicate.id, pair.duplicate.name)}
                          style={{ padding: '3px 8px', fontSize: '0.72rem', color: 'var(--accent-rose)' }}
                        >
                          Remove Copy
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top 5 Largest Files */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px'
              }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HardDrive size={14} color="var(--accent-primary)" /> Largest Files in Vault
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Top 5 files consuming the largest storage space.
                </div>

                {largestFiles.length === 0 ? (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', padding: '10px 0' }}>
                    No files found in vault.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {largestFiles.map((file, idx) => (
                      <div
                        key={file.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 10px',
                          background: 'var(--bg-input)',
                          borderRadius: '6px',
                          fontSize: '0.78rem'
                        }}
                      >
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>
                          {file.name}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {formatSize(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

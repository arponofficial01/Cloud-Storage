import React, { useState, useRef } from 'react';
import { useStorage } from '../context/StorageContext';
import { X, UploadCloud, FolderUp, File, CheckCircle2 } from 'lucide-react';
import { getFileColorStyle } from '../utils/fileTypeStyles';

export function UploadModal() {
  const { isUploadOpen, setIsUploadOpen, uploadFiles, uploadProgress } = useStorage();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  if (!isUploadOpen) return null;

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const incoming = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...incoming]);
      setIsDone(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const incoming = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...incoming]);
      setIsDone(false);
      e.target.value = ''; // reset so same files can be re-selected if desired
    }
  };

  const handleStartUpload = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    setIsDone(false);
    try {
      await uploadFiles(selectedFiles);
      setIsDone(true);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFinish = () => {
    setSelectedFiles([]);
    setIsDone(false);
    setIsUploadOpen(false);
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '620px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UploadCloud size={18} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '0.98rem', fontWeight: 600 }}>Upload to Vault</h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={() => setIsUploadOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Cloud Storage Destination Status */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '8px 12px',
            marginBottom: '14px',
            fontSize: '0.74rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-primary)', fontWeight: 600 }}>
              <UploadCloud size={13} />
              <span>Encrypted Cloud Vault Active &bull; Unlimited Storage</span>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>High-Speed CDN</span>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: isDragging ? '2px dashed var(--accent-primary)' : '2px dashed var(--border-subtle)',
              background: isDragging ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-input)',
              borderRadius: 'var(--radius-lg)',
              padding: '36px 20px',
              textAlign: 'center',
              transition: 'var(--transition-fast)'
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              style={{ display: 'none' }}
            />
            <input
              type="file"
              ref={folderInputRef}
              onChange={handleFileChange}
              webkitdirectory="true"
              directory="true"
              multiple
              style={{ display: 'none' }}
            />

            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '9px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto',
              color: 'var(--accent-primary)'
            }}>
              <UploadCloud size={22} />
            </div>

            <h4 style={{ fontSize: '0.96rem', fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>
              Drag and drop files or folders here
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Files are encrypted locally and saved directly to your private vault.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} style={{ fontSize: '0.82rem', padding: '7px 14px', borderRadius: '7px' }}>
                <File size={14} /> Choose Files
              </button>
              <button className="btn btn-secondary" onClick={() => folderInputRef.current?.click()} style={{ fontSize: '0.82rem', padding: '7px 14px', borderRadius: '7px' }}>
                <FolderUp size={14} /> Upload Folder
              </button>
            </div>
          </div>

          {/* Selected Files List Preview */}
          {selectedFiles.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.84rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                    QUEUED ITEMS ({selectedFiles.length})
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    &bull; {formatSize(selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0))}
                  </span>
                  <span style={{
                    fontSize: '0.64rem',
                    color: 'var(--accent-emerald)',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600
                  }}>
                    No batch limit
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSelectedFiles([])}
                  style={{ fontSize: '0.74rem', padding: '2px 8px', color: 'var(--accent-rose)' }}
                  disabled={isUploading}
                >
                  Clear Queue
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '230px', overflowY: 'auto', paddingRight: '4px' }}>
                {selectedFiles.map((file, idx) => {
                  const fStyle = getFileColorStyle(file);
                  return (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.85rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{
                          fontSize: '0.62rem',
                          fontWeight: '700',
                          padding: '2px 5px',
                          borderRadius: '4px',
                          background: fStyle.bg,
                          color: fStyle.color,
                          border: `1px solid ${fStyle.border}`,
                          fontFamily: 'var(--font-mono)',
                          flexShrink: 0
                        }}>
                          {fStyle.label}
                        </span>
                        <span style={{ fontWeight: '500', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.webkitRelativePath || file.name}
                        </span>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0, marginLeft: '8px' }}>
                        {formatSize(file.size)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Real-Time Upload Progress Bar */}
          {uploadProgress && uploadProgress.active && (
            <div style={{
              marginTop: '20px',
              padding: '14px 16px',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-primary)',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px', fontWeight: '700' }}>
                <span style={{ color: 'var(--text-primary)' }}>
                  Writing file {uploadProgress.fileIndex} of {uploadProgress.totalFiles}: {uploadProgress.fileName}
                </span>
                <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{uploadProgress.percentage}%</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'var(--bg-input)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{
                  width: `${uploadProgress.percentage}%`,
                  height: '100%',
                  background: 'var(--accent-primary)',
                  borderRadius: '999px',
                  transition: 'width 0.2s ease-out'
                }} />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {isDone ? (
            <button className="btn btn-primary" onClick={handleFinish} style={{ width: '100%' }}>
              <CheckCircle2 size={16} /> Stored {selectedFiles.length} File(s) in Vault — Close
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setIsUploadOpen(false)} disabled={isUploading}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStartUpload}
                disabled={selectedFiles.length === 0 || isUploading}
              >
                {isUploading ? 'Writing to Vault...' : `Upload ${selectedFiles.length} Item(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

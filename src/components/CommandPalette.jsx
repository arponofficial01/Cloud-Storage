import React, { useState } from 'react';
import { useStorage } from '../context/StorageContext';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Upload,
  FolderPlus,
  Activity,
  Sun,
  Moon,
  HardDrive,
  X,
  File,
  ChevronRight
} from 'lucide-react';

export function CommandPalette() {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    files,
    folders,
    navigateToFolder,
    setIsUploadOpen,
    setIsNewFolderOpen,
    setIsActivityLogOpen,
    setActivePreview
  } = useStorage();

  const { theme, changeTheme } = useAuth();
  const [query, setQuery] = useState('');

  if (!isCommandPaletteOpen) return null;

  const filteredFiles = files.filter(f => !f.inTrash && f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
  const filteredFolders = folders.filter(f => !f.inTrash && f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 3);

  const handleRunAction = (actionFn) => {
    actionFn();
    setIsCommandPaletteOpen(false);
  };

  return (
    <div className="modal-overlay" onClick={() => setIsCommandPaletteOpen(false)}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '560px',
          width: '92vw',
          borderRadius: '9px',
          overflow: 'hidden',
          padding: 0,
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Command Search Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)'
        }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            className="input-text"
            placeholder="Type a command or search vault..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '0.88rem',
              outline: 'none',
              padding: 0,
              boxShadow: 'none'
            }}
          />
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setIsCommandPaletteOpen(false)}
            style={{ padding: '2px', height: '24px', width: '24px' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Results Body */}
        <div style={{ maxHeight: '340px', overflowY: 'auto', padding: '10px' }}>
          <div style={{
            fontSize: '0.68rem',
            fontWeight: '600',
            color: 'var(--text-muted)',
            padding: '4px 8px 6px 8px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            QUICK ACTIONS
          </div>

          <CommandItem
            icon={<Upload size={14} color="var(--accent-primary)" />}
            title="Upload Files"
            category="Action"
            onClick={() => handleRunAction(() => setIsUploadOpen(true))}
          />
          <CommandItem
            icon={<FolderPlus size={14} color="var(--accent-primary)" />}
            title="Create New Folder"
            category="Action"
            onClick={() => handleRunAction(() => setIsNewFolderOpen(true))}
          />
          <CommandItem
            icon={<Activity size={14} color="var(--text-secondary)" />}
            title="Open Activity Log"
            category="Drawer"
            onClick={() => handleRunAction(() => setIsActivityLogOpen(true))}
          />
          <CommandItem
            icon={theme === 'dark' ? <Sun size={14} color="var(--accent-amber)" /> : <Moon size={14} color="var(--accent-primary)" />}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            category="Theme"
            onClick={() => handleRunAction(() => changeTheme(theme === 'dark' ? 'light' : 'dark'))}
          />

          {/* Folders Search */}
          {filteredFolders.length > 0 && (
            <>
              <div style={{
                fontSize: '0.68rem',
                fontWeight: '600',
                color: 'var(--text-muted)',
                margin: '10px 0 4px 0',
                padding: '4px 8px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                FOLDERS ({filteredFolders.length})
              </div>
              {filteredFolders.map(folder => (
                <CommandItem
                  key={folder.id}
                  icon={<HardDrive size={14} color={folder.color || 'var(--accent-primary)'} />}
                  title={folder.name}
                  category="Folder"
                  onClick={() => handleRunAction(() => navigateToFolder(folder.id, folder.name))}
                />
              ))}
            </>
          )}

          {/* Files Search */}
          {filteredFiles.length > 0 && (
            <>
              <div style={{
                fontSize: '0.68rem',
                fontWeight: '600',
                color: 'var(--text-muted)',
                margin: '10px 0 4px 0',
                padding: '4px 8px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                FILES ({filteredFiles.length})
              </div>
              {filteredFiles.map(file => (
                <CommandItem
                  key={file.id}
                  icon={<File size={14} color="var(--text-secondary)" />}
                  title={file.name}
                  category={file.category}
                  onClick={() => handleRunAction(() => setActivePreview(file))}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer Hint */}
        <div style={{
          padding: '8px 14px',
          background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.72rem',
          color: 'var(--text-muted)'
        }}>
          <span>Press <kbd style={{ background: 'var(--bg-input)', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>ESC</kbd> to exit</span>
          <span>StorageBank Quick Action</span>
        </div>
      </div>
    </div>
  );
}

function CommandItem({ icon, title, category, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 10px',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.12s ease',
        marginBottom: '2px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-surface-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        {icon}
        <span style={{ fontSize: '0.82rem', fontWeight: '500', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <span style={{
          fontSize: '0.68rem',
          color: 'var(--text-muted)',
          background: 'var(--bg-input)',
          padding: '1px 6px',
          borderRadius: '4px',
          border: '1px solid var(--border-subtle)'
        }}>
          {category}
        </span>
        <ChevronRight size={13} color="var(--text-muted)" />
      </div>
    </div>
  );
}

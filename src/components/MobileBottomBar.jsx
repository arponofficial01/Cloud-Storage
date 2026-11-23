import React from 'react';
import { useStorage } from '../context/StorageContext';
import {
  HardDrive,
  FolderPlus,
  Plus,
  Bot,
  User
} from 'lucide-react';

export function MobileBottomBar({ onOpenAiCopilot }) {
  const {
    activeCategory,
    navigateToFolder,
    setActiveCategory,
    setIsUploadOpen,
    setIsNewFolderOpen
  } = useStorage();

  const handleNav = (cat) => {
    if (['all', 'image', 'document', 'video', 'audio', 'code', 'trash', 'starred'].includes(cat)) {
      navigateToFolder(null, 'My Vault', cat);
    } else {
      setActiveCategory(cat);
    }
  };

  const navBtnStyle = (isActive) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    padding: '6px 2px',
    background: 'transparent',
    border: 'none',
    color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
    fontSize: '0.65rem',
    fontWeight: isActive ? 600 : 500,
    cursor: 'pointer',
    transition: 'color 0.14s ease',
    minHeight: '44px'
  });

  return (
    <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
      <button
        type="button"
        style={navBtnStyle(activeCategory === 'all')}
        onClick={() => handleNav('all')}
      >
        <HardDrive size={17} />
        <span>Vault</span>
      </button>

      <button
        type="button"
        style={navBtnStyle(false)}
        onClick={() => setIsNewFolderOpen('folder')}
      >
        <FolderPlus size={17} />
        <span>Create</span>
      </button>

      {/* Center Matte Upload Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--accent-primary)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)'
          }}
          title="Upload Files"
        >
          <Plus size={20} />
        </button>
      </div>

      <button
        type="button"
        style={navBtnStyle(false)}
        onClick={() => { if (onOpenAiCopilot) onOpenAiCopilot(); }}
      >
        <Bot size={17} />
        <span>AI Agent</span>
      </button>

      <button
        type="button"
        style={navBtnStyle(activeCategory === 'profile')}
        onClick={() => handleNav('profile')}
      >
        <User size={17} />
        <span>Account</span>
      </button>
    </nav>
  );
}

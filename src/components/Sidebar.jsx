import React from 'react';
import { useStorage } from '../context/StorageContext';
import { useAuth } from '../context/AuthContext';
import { getPlanQuota, formatBytes } from '../utils/planQuotas';

import {
  Cloud,
  FolderPlus,
  FilePlus,
  Upload,
  HardDrive,
  Image as ImageIcon,
  FileText,
  Video,
  Music,
  Code2,
  Star,
  Trash2,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  Monitor,
  User,
  X
} from 'lucide-react';

export function Sidebar({ isOpen, isCollapsed, onToggleCollapse, onCloseMobile }) {
  const {
    activeCategory,
    setActiveCategory,
    navigateToFolder,
    setIsUploadOpen,
    setIsNewFolderOpen,
    setIsSubscriptionOpen,
    setIsDriveModalOpen,
    storageStats
  } = useStorage();

  const handleCategoryClick = (catKey) => {
    if (typeof navigateToFolder === 'function') {
      navigateToFolder(null, 'My Vault', catKey);
    } else {
      setActiveCategory(catKey);
    }
    if (onCloseMobile) onCloseMobile();
  };

  const { user } = useAuth();
  const planInfo = getPlanQuota(user?.plan);
  const usedBytes = storageStats?.totalBytes || 0;
  const quotaBytes = planInfo.quotaBytes;
  const usagePercentage = Math.min(100, Math.max(0.01, (usedBytes / quotaBytes) * 100)).toFixed(1);

  const sidebarWidth = isCollapsed ? '64px' : '240px';

  return (
    <>
      <aside className={`sidebar ${isOpen ? 'open' : ''}`} style={{
        width: sidebarWidth,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: isCollapsed ? '16px 8px' : '18px 14px',
        borderRight: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-secondary)',
        zIndex: 100,
        flexShrink: 0,
        transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1), padding 0.25s ease'
      }}>
        {/* Header & Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          gap: '8px',
          marginBottom: '20px',
          padding: '0 4px'
        }}>
          {!isCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '7px',
                background: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                flexShrink: 0
              }}>
                <Cloud size={16} />
              </div>
              <span style={{ fontSize: '0.98rem', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                StorageBank
              </span>
            </div>
          )}

          {/* Desktop Only: Collapse/Expand Sidebar Button */}
          <button
            className="btn btn-ghost btn-icon desktop-only"
            onClick={onToggleCollapse}
            style={{ padding: '6px', color: 'var(--text-muted)' }}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>

          {/* Mobile Only: Close Drawer Button */}
          {onCloseMobile && (
            <button
              className="btn btn-ghost btn-icon mobile-menu-btn"
              onClick={onCloseMobile}
              style={{ padding: '6px', color: 'var(--text-muted)' }}
              title="Close Menu"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
          <button
            className="btn btn-primary"
            onClick={() => { setIsUploadOpen(true); if (onCloseMobile) onCloseMobile(); }}
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: isCollapsed ? '8px' : '8px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '7px',
              gap: '7px'
            }}
            title="Upload Files"
          >
            <Upload size={14} />
            {!isCollapsed && <span>Upload Files</span>}
          </button>

          {isCollapsed ? (
            <button
              className="btn btn-secondary"
              onClick={() => { setIsNewFolderOpen('folder'); if (onCloseMobile) onCloseMobile(); }}
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '8px',
                borderRadius: '7px'
              }}
              title="New Folder or Document"
            >
              <FolderPlus size={14} color="var(--text-secondary)" />
            </button>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '4px'
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setIsNewFolderOpen('folder'); if (onCloseMobile) onCloseMobile(); }}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  gap: '5px',
                  color: 'var(--text-secondary)'
                }}
                title="Create a new folder"
              >
                <FolderPlus size={13} />
                <span>Folder</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setIsNewFolderOpen('file'); if (onCloseMobile) onCloseMobile(); }}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  gap: '5px',
                  color: 'var(--text-secondary)'
                }}
                title="Create a new document"
              >
                <FilePlus size={13} />
                <span>Document</span>
              </button>
            </div>
          )}
        </div>

        {/* Navigation Categories */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {!isCollapsed && (
            <div style={{ padding: '6px 8px 4px 8px', fontSize: '0.68rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Vault
            </div>
          )}
          
          <NavItem 
            icon={<HardDrive size={15} />} 
            label="All Files" 
            isCollapsed={isCollapsed}
            active={activeCategory === 'all'} 
            onClick={() => handleCategoryClick('all')} 
          />
          <NavItem 
            icon={<Star size={15} />} 
            label="Starred" 
            isCollapsed={isCollapsed}
            active={activeCategory === 'starred'} 
            onClick={() => handleCategoryClick('starred')} 
          />
          <NavItem 
            icon={<Trash2 size={15} />} 
            label="Trash" 
            isCollapsed={isCollapsed}
            active={activeCategory === 'trash'} 
            onClick={() => handleCategoryClick('trash')} 
          />
          
          {!isCollapsed && (
            <div style={{ margin: '12px 0 4px 0', padding: '6px 8px 4px 8px', fontSize: '0.68rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Categories
            </div>
          )}

          <NavItem 
            icon={<FileText size={15} />} 
            label="Documents" 
            isCollapsed={isCollapsed}
            active={activeCategory === 'document'} 
            onClick={() => handleCategoryClick('document')} 
          />
          <NavItem 
            icon={<ImageIcon size={15} />} 
            label="Photos & Media" 
            isCollapsed={isCollapsed}
            active={activeCategory === 'image'} 
            onClick={() => handleCategoryClick('image')} 
          />
          <NavItem 
            icon={<Video size={15} />} 
            label="Videos" 
            isCollapsed={isCollapsed}
            active={activeCategory === 'video'} 
            onClick={() => handleCategoryClick('video')} 
          />
          <NavItem 
            icon={<Music size={15} />} 
            label="Audio" 
            isCollapsed={isCollapsed}
            active={activeCategory === 'audio'} 
            onClick={() => handleCategoryClick('audio')} 
          />
          <NavItem 
            icon={<Code2 size={15} />} 
            label="Code" 
            isCollapsed={isCollapsed}
            active={activeCategory === 'code'} 
            onClick={() => handleCategoryClick('code')} 
          />

          {!isCollapsed && (
            <div style={{ margin: '12px 0 4px 0', padding: '6px 8px 4px 8px', fontSize: '0.68rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tools & Settings
            </div>
          )}

          <NavItem 
            icon={<RefreshCw size={15} />} 
            label="Format Converter" 
            isCollapsed={isCollapsed}
            active={activeCategory === 'converter'} 
            onClick={() => handleCategoryClick('converter')} 
          />
          <NavItem 
            icon={<Monitor size={15} />} 
            label="Desktop Drive" 
            isCollapsed={isCollapsed}
            active={false} 
            className="desktop-only"
            onClick={() => { setIsDriveModalOpen(true); if (onCloseMobile) onCloseMobile(); }} 
          />
          <NavItem 
            icon={<User size={15} />} 
            label="Account Settings" 
            isCollapsed={isCollapsed}
            active={activeCategory === 'profile'} 
            onClick={() => handleCategoryClick('profile')} 
          />
        </div>

        {/* Minimalist Matte Storage Quota Footer */}
        {!isCollapsed ? (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '9px',
            padding: '12px',
            marginTop: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                Vault Storage
              </span>
              <button
                onClick={() => setIsSubscriptionOpen(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Upgrade
              </button>
            </div>

            <div style={{
              width: '100%',
              height: '4px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '999px',
              overflow: 'hidden',
              marginBottom: '6px'
            }}>
              <div style={{
                width: `${usagePercentage}%`,
                height: '100%',
                background: 'var(--accent-primary)',
                borderRadius: '999px'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span>{formatBytes(usedBytes)} of {formatBytes(quotaBytes)}</span>
              <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>Cloud Active</span>
            </div>

            <div style={{
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.67rem',
              color: 'var(--text-muted)',
              letterSpacing: '0.01em'
            }}>
              <span>Developed By</span>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Arpon Chakraborty</span>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setIsSubscriptionOpen(true)}
            title="Storage Quota"
            style={{ marginTop: '10px', justifyContent: 'center' }}
          >
            <Cloud size={16} color="var(--accent-primary)" />
          </button>
        )}
      </aside>
    </>
  );
}

function NavItem({ icon, label, isCollapsed, active, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      title={isCollapsed ? label : undefined}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        gap: '10px',
        width: '100%',
        padding: isCollapsed ? '8px' : '7px 10px',
        borderRadius: '7px',
        border: 'none',
        background: active ? 'var(--bg-surface-hover)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: active ? '600' : '500',
        fontSize: '0.82rem',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease, color 0.15s ease',
        whiteSpace: 'nowrap',
        overflow: 'hidden'
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--bg-surface)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }
      }}
    >
      <span style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
        {icon}
      </span>
      {!isCollapsed && <span>{label}</span>}
    </button>
  );
}

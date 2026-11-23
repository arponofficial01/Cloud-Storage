import React, { useState, useEffect, useRef } from 'react';
import { useStorage } from '../context/StorageContext';
import { useAuth } from '../context/AuthContext';
import { getPlanQuota } from '../utils/planQuotas';
import {
  Search,
  LayoutGrid,
  List,
  Command,
  User,
  LogOut,
  ShieldCheck,
  Bot,
  Activity,
  Sun,
  Moon,
  Menu,
  HardDrive,
  Lock
} from 'lucide-react';

export function Navbar({ onOpenAiCopilot, onToggleMobileSidebar, onOpenSubscription }) {
  const {
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    setIsCommandPaletteOpen,
    setIsActivityLogOpen,
    setActiveCategory,
    addToast
  } = useStorage();

  const { user, theme, changeTheme, signOut } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const toggleTheme = () => {
    changeTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const formatPlanDisplay = (plan) => {
    return getPlanQuota(plan).displayName;
  };

  const getCleanUsername = () => {
    if (!user?.username) return user?.email?.split('@')[0] || 'Vault Owner';
    return user.username;
  };

  const getCleanEmail = () => {
    return user?.email || 'user@storagebank.vault';
  };

  return (
    <header
      className="navbar-header"
      style={{
        height: '56px',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        zIndex: 90,
        flexShrink: 0
      }}
    >
      {/* Left section: Mobile Hamburger (Mobile Only) + Search Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '520px', minWidth: 0 }}>
        {onToggleMobileSidebar && (
          <button
            className="btn btn-ghost btn-icon mobile-menu-btn"
            onClick={onToggleMobileSidebar}
            style={{
              height: '34px',
              width: '34px',
              padding: 0,
              borderRadius: '7px',
              border: '1px solid var(--border-subtle)',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
            title="Open Navigation"
          >
            <Menu size={16} color="var(--text-secondary)" />
          </button>
        )}

        <div
          style={{
            position: 'relative',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            minWidth: 0
          }}
        >
          <Search size={14} style={{ position: 'absolute', left: '11px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            className="input-text navbar-search-input"
            placeholder="Search files & folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: '33px',
              paddingRight: '58px',
              height: '34px',
              borderRadius: '8px',
              background: 'var(--bg-input)',
              fontSize: '0.83rem'
            }}
          />
          <div
            className="desktop-only"
            onClick={() => setIsCommandPaletteOpen(true)}
            title="Open Command Palette (Ctrl+K)"
            style={{
              position: 'absolute',
              right: '7px',
              alignItems: 'center',
              gap: '2px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.66rem',
              color: 'var(--text-muted)',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <Command size={10} /> K
          </div>
        </div>
      </div>

      {/* Right Controls - Minimalist Mature Suite (Accessible on Both Desktop & Mobile) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>

        {/* View Mode Switcher (Grid / List) - Now available on both Desktop and Mobile */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: '32px',
            background: 'var(--bg-input)',
            padding: '2px',
            borderRadius: '7px',
            border: '1px solid var(--border-subtle)'
          }}
        >
          <button
            onClick={() => setViewMode('grid')}
            style={{
              height: '26px',
              width: '26px',
              background: viewMode === 'grid' ? 'var(--bg-surface-hover)' : 'transparent',
              color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            title="Grid View"
          >
            <LayoutGrid size={13} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              height: '26px',
              width: '26px',
              background: viewMode === 'list' ? 'var(--bg-surface-hover)' : 'transparent',
              color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            title="List View"
          >
            <List size={13} />
          </button>
        </div>

        {/* AI Copilot Trigger */}
        <button
          onClick={onOpenAiCopilot}
          className="btn btn-secondary"
          style={{
            height: '32px',
            padding: '0 9px',
            borderRadius: '7px',
            fontSize: '0.78rem',
            fontWeight: '600',
            gap: '5px'
          }}
          title="Open Gemini AI Agent"
        >
          <Bot size={14} color="var(--accent-primary)" />
          <span className="desktop-only">AI Agent</span>
        </button>

        {/* Instant Vault Security Lock / Shield Button */}
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => {
            const activePin = user?.pin || localStorage.getItem('storagebank_vault_pin');
            if (activePin) {
              window.dispatchEvent(new CustomEvent('storagebank:lock-vault'));
              if (addToast) addToast('Vault session locked', 'info');
            } else {
              setActiveCategory('profile');
              if (addToast) addToast('Configure a 4-digit PIN in Security & PIN settings to lock your vault', 'info');
            }
          }}
          style={{ height: '32px', width: '32px', padding: 0, borderRadius: '7px', border: '1px solid var(--border-subtle)' }}
          title={user?.pin ? 'Lock Vault Session Immediately' : 'Security & PIN Settings'}
        >
          <Lock size={14} color={user?.pin ? 'var(--accent-emerald)' : 'var(--text-secondary)'} />
        </button>

        {/* Activity Log Trigger - Desktop Only */}
        <button
          className="btn btn-ghost btn-icon desktop-only"
          onClick={() => setIsActivityLogOpen(true)}
          style={{ height: '32px', width: '32px', padding: 0, borderRadius: '7px', border: '1px solid var(--border-subtle)' }}
          title="Activity Log"
        >
          <Activity size={15} color="var(--text-secondary)" />
        </button>

        {/* Dark/Light Theme Toggle */}
        <button
          className="btn btn-ghost btn-icon"
          onClick={toggleTheme}
          style={{ height: '32px', width: '32px', padding: 0, borderRadius: '7px', border: '1px solid var(--border-subtle)' }}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={15} color="var(--text-secondary)" /> : <Moon size={15} color="var(--text-secondary)" />}
        </button>

        {/* User Profile Avatar */}
        <div style={{ position: 'relative' }} ref={profileRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setIsProfileMenuOpen(prev => !prev); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px'
            }}
          >
            <img
              src={user?.avatar}
              alt={user?.username}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid var(--border-strong)'
              }}
            />
          </button>

          {isProfileMenuOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '42px',
              width: '240px',
              background: 'var(--bg-modal)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '9px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
              padding: '10px',
              zIndex: 200
            }}>
              <div style={{ paddingBottom: '10px', marginBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.88rem' }}>{getCleanUsername()}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>
                  {getCleanEmail()}
                </div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  marginTop: '6px',
                  padding: '2px 7px',
                  borderRadius: '5px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.7rem',
                  color: 'var(--text-secondary)',
                  fontWeight: '500'
                }}>
                  <ShieldCheck size={11} color="var(--accent-primary)" />
                  <span>{formatPlanDisplay(user?.plan)}</span>
                </div>
              </div>

              <button
                className="btn btn-ghost"
                onClick={() => { setActiveCategory('profile'); setIsProfileMenuOpen(false); }}
                style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.82rem', padding: '6px 8px' }}
              >
                <User size={14} />
                <span>Account Settings</span>
              </button>

              <button
                className="btn btn-ghost"
                onClick={() => {
                  if (onOpenSubscription) onOpenSubscription();
                  setIsProfileMenuOpen(false);
                }}
                style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.82rem', padding: '6px 8px' }}
              >
                <HardDrive size={14} />
                <span>Storage & Plans</span>
              </button>

              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '6px 0' }} />

              <button
                className="btn btn-ghost"
                onClick={() => { signOut(); setIsProfileMenuOpen(false); }}
                style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.82rem', padding: '6px 8px', color: 'var(--accent-rose)' }}
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

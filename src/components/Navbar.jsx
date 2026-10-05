import React, { useState, useEffect, useRef } from 'react';
import { useStorage } from '../context/StorageContext';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  LayoutGrid,
  List,
  PieChart,
  Activity,
  Command,
  User,
  LogOut,
  ShieldCheck,
  Palette,
  Bot,
  Music,
  Disc,
  Sparkles
} from 'lucide-react';

export function Navbar({ onOpenAiCopilot }) {
  const {
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    setIsAnalyticsOpen,
    setIsAuthModalOpen,
    setIsCommandPaletteOpen,
    setIsActivityLogOpen,
    setIsSubscriptionOpen,
    setIsMusicStudioOpen,
    setActiveCategory,
    isMusicPlaying,
    toggleMusicPlay,
    currentMusicTrack
  } = useStorage();

  const { user, theme, changeTheme, signOut } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  const profileRef = useRef(null);
  const themeRef = useRef(null);

  // Click outside to dismiss menus
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target)) {
        setIsThemeMenuOpen(false);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const themeOptions = [
    { key: 'dark', name: 'Obsidian Cyber (Dark)', color: '#6366f1' },
    { key: 'light', name: 'Clean Pearl (Light)', color: '#0f172a' },
    { key: 'cyberpunk', name: 'Neon Cyberpunk', color: '#ec4899' },
    { key: 'emerald', name: 'Emerald Forest', color: '#10b981' },
    { key: 'sunset', name: 'Sunset Horizon', color: '#f59e0b' },
    { key: 'oled', name: 'Midnight OLED', color: '#ffffff' },
    { key: 'cosmos', name: 'Deep Cosmos', color: '#3b82f6' },
    { key: 'matrix', name: 'Toxic Acid Matrix', color: '#22c55e' },
    { key: 'mocha', name: 'Warm Mocha Velvet', color: '#d97706' },
    { key: 'nordic', name: 'Nordic Ice Frost', color: '#38bdf8' },
    { key: 'sakura', name: 'Sakura Bloom', color: '#f472b6' },
    { key: 'synthwave', name: 'Hyper Synthwave', color: '#d946ef' },
  ];

  return (
    <header style={{
      height: '70px',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface)',
      backdropFilter: 'blur(20px)',
      zIndex: 90,
      flexShrink: 0
    }}>
      {/* Search Input Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, maxWidth: '580px' }}>
        <div
          onClick={() => setIsCommandPaletteOpen(true)}
          style={{
            position: 'relative',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer'
          }}
        >
          <Search size={18} style={{ position: 'absolute', left: '14px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-text"
            placeholder="Search files or press Ctrl+K for commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: '42px',
              paddingRight: '74px',
              borderRadius: '9999px',
              background: 'var(--bg-input)',
              fontSize: '0.88rem',
              cursor: 'pointer'
            }}
          />
          <div style={{
            position: 'absolute',
            right: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            fontWeight: '600'
          }}>
            <Command size={10} /> K
          </div>
        </div>
      </div>

      {/* Right Controls - Unified Luxury Glass Suite */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        
        {/* Designer Hallmark Badge: Made by Arpon */}
        <div 
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            height: '36px',
            padding: '0 12px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
            fontSize: '0.72rem',
            fontWeight: '700',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            userSelect: 'none',
            whiteSpace: 'nowrap'
          }}
          title="Designed & Developed by Arpon"
        >
          <span style={{ 
            color: 'var(--accent-primary)', 
            fontSize: '0.75rem',
            filter: 'drop-shadow(0 0 5px var(--accent-glow))' 
          }}>✦</span>
          <span style={{
            background: 'linear-gradient(135deg, #ffffff 40%, var(--text-secondary) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: '800'
          }}>
            Made by Arpon
          </span>
        </div>

        {/* AetherAI Copilot Neural Trigger - Matched Luxury Glass */}
        <button
          onClick={onOpenAiCopilot}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            height: '36px',
            padding: '0 13px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.16) 0%, rgba(168, 85, 247, 0.16) 100%)',
            border: '1px solid rgba(139, 92, 246, 0.35)',
            boxShadow: '0 2px 10px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255,255,255,0.12)',
            backdropFilter: 'blur(12px)',
            color: '#ffffff',
            fontSize: '0.82rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.26) 0%, rgba(168, 85, 247, 0.26) 100%)';
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.55)';
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.16) 0%, rgba(168, 85, 247, 0.16) 100%)';
            e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.35)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 10px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255,255,255,0.12)';
          }}
          title="Open AetherAI Copilot (Google Gemini 3.5 Flash Online)"
        >
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 8px rgba(168,85,247,0.45)'
          }}>
            <Bot size={13} color="#ffffff" />
          </div>
          <span style={{ fontWeight: '700', letterSpacing: '-0.01em' }}>AetherAI</span>
          <span style={{
            fontSize: '0.62rem',
            padding: '1px 5px',
            borderRadius: '4px',
            background: 'rgba(255,255,255,0.12)',
            color: '#e2e8f0',
            fontWeight: '600'
          }}>3.5</span>
        </button>

        {/* Activity Log Trigger */}
        <button 
          className="btn btn-ghost btn-icon" 
          onClick={() => setIsActivityLogOpen(true)}
          style={{ height: '36px', width: '36px', padding: 0, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)' }}
          title="Vault Activity Log"
        >
          <Activity size={17} color="var(--accent-amber)" />
        </button>

        {/* Storage Analytics Quick Button */}
        <button 
          className="btn btn-ghost" 
          onClick={() => setIsAnalyticsOpen(true)}
          style={{
            height: '36px',
            padding: '0 12px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.82rem',
            fontWeight: '600',
            border: '1px solid var(--border-subtle)',
            background: 'rgba(255,255,255,0.03)'
          }}
          title="Google Cloud Virtual Telemetry & Analytics"
        >
          <PieChart size={16} color="var(--accent-primary)" />
          <span style={{ display: 'inline-block' }}>Analytics</span>
        </button>

        {/* Grid vs List View Switcher */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          height: '36px',
          background: 'var(--bg-input)',
          padding: '2px',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)'
        }}>
          <button
            onClick={() => setViewMode('grid')}
            style={{
              height: '30px',
              width: '30px',
              background: viewMode === 'grid' ? 'var(--accent-primary)' : 'transparent',
              color: viewMode === 'grid' ? '#ffffff' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '7px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            title="Grid View"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              height: '30px',
              width: '30px',
              background: viewMode === 'list' ? 'var(--accent-primary)' : 'transparent',
              color: viewMode === 'list' ? '#ffffff' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '7px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            title="List View"
          >
            <List size={15} />
          </button>
        </div>

        {/* Music Studio Button */}
        <button
          onClick={() => {
            if (!isMusicPlaying) toggleMusicPlay(currentMusicTrack);
            else setIsMusicStudioOpen(true);
          }}
          title="Storage Bank Music Studio & Phonk Player — Click to toggle music"
          style={{
            height: '36px',
            padding: '0 12px',
            borderRadius: '10px',
            fontSize: '0.76rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            border: isMusicPlaying ? '1px solid rgba(245,158,11,0.45)' : '1px solid var(--border-subtle)',
            background: isMusicPlaying ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.03)',
            color: isMusicPlaying ? 'var(--accent-amber)' : 'var(--text-secondary)',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
          }}
        >
          <Disc size={15} color="var(--accent-amber)" style={{ animation: isMusicPlaying ? 'spin 3s linear infinite' : 'none' }} />
          <span>{isMusicPlaying ? `♪ ${currentMusicTrack?.title || 'Playing Music'}` : 'Play Music'}</span>
        </button>

        {/* VIP Plan Luxury Badge */}
        <button
          onClick={() => setIsSubscriptionOpen(true)}
          style={{
            height: '36px',
            padding: '0 12px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(217, 119, 6, 0.08) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.32)',
            color: '#fbbf24',
            fontSize: '0.74rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 10px rgba(245,158,11,0.12)',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.55)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(245,158,11,0.25)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.32)';
            e.currentTarget.style.boxShadow = '0 2px 10px rgba(245,158,11,0.12)';
          }}
          title="Upgrade to VIP Unlimited Google Cloud Vault"
        >
          <Sparkles size={13} color="#fbbf24" />
          <span>PRO TRIAL</span>
        </button>


        {/* 12-Theme Palette Selector */}
        <div style={{ position: 'relative' }} ref={themeRef}>
          <button 
            className="btn btn-ghost btn-icon" 
            onClick={(e) => { e.stopPropagation(); setIsThemeMenuOpen(prev => !prev); }}
            style={{ height: '36px', width: '36px', padding: 0, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)' }}
            title="Change Theme Palette"
          >
            <Palette size={17} color="var(--accent-primary)" />
          </button>

          {isThemeMenuOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '50px',
              width: '240px',
              maxHeight: '380px',
              overflowY: 'auto',
              background: 'var(--bg-modal)',
              border: '1px solid var(--border-strong)',
              borderRadius: '16px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              padding: '8px',
              zIndex: 200,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ padding: '4px 8px 8px 8px', fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                SELECT THEME PALETTE (12)
              </div>
              {themeOptions.map(t => (
                <button
                  key={t.key}
                  className="btn btn-ghost"
                  onClick={() => { changeTheme(t.key); setIsThemeMenuOpen(false); }}
                  style={{
                    width: '100%',
                    justify: 'flex-start',
                    padding: '8px 10px',
                    fontSize: '0.82rem',
                    background: theme === t.key ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                    color: theme === t.key ? 'var(--accent-primary)' : 'var(--text-primary)'
                  }}
                >
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: t.color, display: 'inline-block', flexShrink: 0 }} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Profile Avatar */}
        <div style={{ position: 'relative' }} ref={profileRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setIsProfileMenuOpen(prev => !prev); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <img
              src={user?.avatar}
              alt={user?.username}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--accent-primary)',
                boxShadow: '0 2px 10px var(--accent-glow)'
              }}
            />
          </button>

          {isProfileMenuOpen && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '50px',
              width: '240px',
              background: 'var(--bg-modal)',
              border: '1px solid var(--border-strong)',
              borderRadius: '16px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              padding: '12px',
              zIndex: 200
            }}>
              <div style={{ paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.95rem' }}>{user?.username}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user?.email}</div>
                <div className="badge badge-indigo" style={{ marginTop: '6px' }}>
                  <ShieldCheck size={12} /> {user?.plan || 'Unlimited Vault'}
                </div>
              </div>

              <button
                className="btn btn-ghost"
                onClick={() => { setActiveCategory('profile'); setIsProfileMenuOpen(false); }}
                style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.85rem' }}
              >
                <User size={16} />
                <span>Switch / Manage Profile</span>
              </button>

              <button
                className="btn btn-ghost"
                onClick={() => { signOut(); setIsProfileMenuOpen(false); }}
                style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.85rem', color: 'var(--accent-rose)' }}
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

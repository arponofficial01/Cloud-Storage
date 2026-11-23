import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStorage } from '../context/StorageContext';
import { getPlanQuota, formatBytes } from '../utils/planQuotas';
import {
  getAutoLockMinutes,
  setAutoLockMinutes,
  getSecurityAuditLogs,
  clearSecurityAuditLogs
} from '../utils/securityEngine';
import {
  User,
  Camera,
  Lock,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Shield,
  Palette,
  LogOut,
  HardDrive,
  Database,
  KeyRound,
  Copy,
  Check,
  LayoutGrid,
  List,
  ArrowUpRight
} from 'lucide-react';

// Architectural Matte Themes — all backed by real CSS rules in index.css
const MATTE_THEMES = [
  {
    key: 'dark',
    label: 'Obsidian Matte',
    desc: 'Deep zinc carbon surfaces with crisp indigo accents',
    bg: '#09090b',
    surface: '#18181b',
    border: '#27272a',
    accent: '#6366f1',
    text: '#ededed'
  },
  {
    key: 'carbon',
    label: 'Carbon Monolith',
    desc: 'Pure zero-glare OLED black with steel blue contrast',
    bg: '#050506',
    surface: '#121215',
    border: '#222228',
    accent: '#3b82f6',
    text: '#f4f4f5'
  },
  {
    key: 'graphite',
    label: 'Graphite Slate',
    desc: 'Cool slate-grey engineering finish with emerald indicator',
    bg: '#0d1017',
    surface: '#181d27',
    border: '#262e3d',
    accent: '#10b981',
    text: '#e2e8f0'
  },
  {
    key: 'light',
    label: 'Paper Daylight',
    desc: 'High-contrast matte alabaster & slate for bright rooms',
    bg: '#f9fafb',
    surface: '#ffffff',
    border: '#e5e7eb',
    accent: '#4f46e5',
    text: '#111827'
  }
];

// Clean minimalist geometric SVG data-URI avatars (no cartoon robots, 100% offline-ready)
const makeGeometricAvatar = (bg1, bg2, accent, label) =>
  `data:image/svg+xml;utf8,` +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <rect width="120" height="120" rx="24" fill="${bg1}"/>
      <circle cx="92" cy="28" r="36" fill="${bg2}" opacity="0.65"/>
      <rect x="18" y="70" width="84" height="34" rx="10" fill="${accent}" opacity="0.22"/>
      <text x="60" y="68" font-family="-apple-system, BlinkMacSystemFont, Inter, sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${label}</text>
    </svg>`
  );

const MATTE_AVATARS = [
  makeGeometricAvatar('#18181b', '#312e81', '#6366f1', 'SB'),
  makeGeometricAvatar('#111827', '#1e3a8a', '#3b82f6', 'VX'),
  makeGeometricAvatar('#0f172a', '#064e3b', '#10b981', 'EM'),
  makeGeometricAvatar('#18181b', '#3f3f46', '#a1a1aa', 'MN'),
  makeGeometricAvatar('#1c1917', '#78350f', '#f59e0b', 'AU'),
  makeGeometricAvatar('#1f1218', '#881337', '#f43f5e', 'RS')
];

function MatteCard({ title, subtitle, icon, rightBadge, children }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '10px',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '14px 18px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            flexShrink: 0
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {rightBadge && (
          <span style={{
            fontSize: '0.68rem',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '5px',
            background: 'var(--bg-input)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)'
          }}>
            {rightBadge}
          </span>
        )}
      </div>
      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {children}
      </div>
    </div>
  );
}

function StatusBanner({ type, children }) {
  const isSuccess = type === 'success';
  return (
    <div style={{
      background: isSuccess ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
      border: `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
      color: isSuccess ? 'var(--accent-emerald)' : 'var(--accent-rose)',
      padding: '9px 12px',
      borderRadius: '7px',
      fontSize: '0.78rem',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      {isSuccess ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      <span>{children}</span>
    </div>
  );
}

export function ProfilePage() {
  const { user, theme, changeTheme, updateUserProfile, updatePassword, updatePin, signOut } = useAuth();
  const { setIsSubscriptionOpen, storageStats, viewMode, setViewMode, setActiveCategory, addToast } = useStorage();

  const [activeTab, setActiveTab] = useState('profile');
  const [username, setUsername] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  // Password states
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState(null);

  // PIN & Security states
  const [pinInput, setPinInput] = useState('');
  const [pinMsg, setPinMsg] = useState(null);
  const [autoLockMins, setAutoLockMinsState] = useState(() => getAutoLockMinutes());
  const [securityLogs, setSecurityLogs] = useState(() => getSecurityAuditLogs());

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setAvatarPreview(user.avatar || MATTE_AVATARS[0]);
      setPinInput(user.pin || localStorage.getItem('storagebank_vault_pin') || '');
    }
  }, [user]);

  if (!user) return null;

  const planInfo = getPlanQuota(user.plan);
  const usedBytes = storageStats?.totalBytes || 0;
  const quotaBytes = planInfo.quotaBytes;
  const usagePercent = Math.min(100, Math.max(0.01, (usedBytes / quotaBytes) * 100)).toFixed(2);

  const handleFileAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setProfileMsg({ type: 'error', text: 'Profile image must be under 10 MB.' });
      return;
    }
    // Compress & downscale onto a compact 120x120 JPEG (~2.5-3.5KB) so it syncs reliably across all devices via Supabase Auth & Profiles
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 120;
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.68);
      setAvatarPreview(compressedDataUrl);
      setProfileMsg(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setProfileMsg({ type: 'error', text: 'Could not process image file.' });
    };
    img.src = url;
  };

  const handleSaveProfile = async () => {
    if (!username.trim()) {
      setProfileMsg({ type: 'error', text: 'Display name cannot be empty.' });
      return;
    }
    setProfileSaving(true);
    setProfileMsg(null);
    const res = await updateUserProfile({ username: username.trim(), avatar: avatarPreview });
    setProfileSaving(false);
    if (res.success) {
      setProfileMsg({ type: 'success', text: 'Account profile updated.' });
      if (addToast) addToast('Profile changes saved', 'success');
    } else {
      setProfileMsg({ type: 'error', text: res.error || 'Failed to update profile.' });
    }
  };

  const handleChangePassword = async () => {
    if (newPass.length < 6) {
      setPassMsg({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (newPass !== confirmPass) {
      setPassMsg({ type: 'error', text: 'Confirmation password does not match.' });
      return;
    }
    setPassSaving(true);
    setPassMsg(null);
    const res = await updatePassword(newPass);
    setPassSaving(false);
    if (res.success) {
      setPassMsg({ type: 'success', text: 'Account password updated.' });
      setNewPass('');
      setConfirmPass('');
      if (addToast) addToast('Password updated', 'success');
    } else {
      setPassMsg({ type: 'error', text: res.error || 'Could not update password.' });
    }
  };

  const handleSavePin = async () => {
    const cleaned = pinInput.trim();
    if (cleaned && !/^\d{4}$/.test(cleaned)) {
      setPinMsg({ type: 'error', text: 'Vault PIN must be exactly 4 digits (e.g. 1234).' });
      return;
    }
    await updatePin(cleaned || null);
    setPinMsg({
      type: 'success',
      text: cleaned ? '4-digit Vault Lock PIN enabled.' : 'Vault Lock PIN disabled.'
    });
    if (addToast) {
      addToast(cleaned ? 'Vault PIN lock enabled' : 'Vault PIN lock removed', 'info');
    }
  };

  const handleCopyAccountId = () => {
    navigator.clipboard.writeText(user.id || '');
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  };

  const tabs = [
    { key: 'profile', label: 'Account', icon: <User size={14} /> },
    { key: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
    { key: 'storage', label: 'Storage & Plan', icon: <HardDrive size={14} /> },
    { key: 'security', label: 'Security', icon: <Shield size={14} /> }
  ];

  const labelStyle = {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    display: 'block',
    marginBottom: '6px'
  };

  return (
    <div style={{
      maxWidth: '860px',
      margin: '0 auto',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      paddingBottom: '32px'
    }}>
      {/* ── Top Matte Account Header Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '16px 20px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
            title="Change profile photo"
          >
            <img
              src={avatarPreview || user.avatar}
              alt={user.username}
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '10px',
                objectFit: 'cover',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-input)',
                display: 'block'
              }}
            />
            <div style={{
              position: 'absolute',
              bottom: '-3px',
              right: '-3px',
              width: '20px',
              height: '20px',
              borderRadius: '6px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-strong)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)'
            }}>
              <Camera size={10} />
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {user.username || 'Vault Owner'}
              </h2>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '5px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)'
              }}>
                {planInfo.displayName}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {user.email}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setIsSubscriptionOpen(true)}
            style={{ fontSize: '0.78rem', padding: '7px 12px', borderRadius: '7px' }}
          >
            <HardDrive size={13} />
            <span>Manage Plan</span>
          </button>
          <button
            className="btn btn-ghost"
            onClick={signOut}
            style={{
              fontSize: '0.78rem',
              padding: '7px 12px',
              borderRadius: '7px',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* ── Matte Segmented Navigation Bar ── */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '4px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        overflowX: 'auto'
      }}>
        {tabs.map(t => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                if (t.key === 'security') setSecurityLogs(getSecurityAuditLogs());
              }}
              style={{
                flex: '1 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: active ? '1px solid var(--border-subtle)' : '1px solid transparent',
                background: active ? 'var(--bg-surface)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: '0.79rem',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.14s ease'
              }}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* 1. ACCOUNT TAB */}
      {activeTab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <MatteCard
            title="Profile & Identity"
            subtitle="Manage your workspace display name and avatar"
            icon={<User size={14} />}
          >
            {profileMsg && <StatusBanner type={profileMsg.type}>{profileMsg.text}</StatusBanner>}

            {/* Avatar Row */}
            <div>
              <label style={labelStyle}>AVATAR</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <img
                  src={avatarPreview}
                  alt="Preview"
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '10px',
                    objectFit: 'cover',
                    border: '1px solid var(--border-strong)',
                    background: 'var(--bg-input)',
                    flexShrink: 0
                  }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {MATTE_AVATARS.map((url, idx) => {
                      const isSelected = avatarPreview === url;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAvatarPreview(url)}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '7px',
                            padding: 0,
                            border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                            background: 'transparent',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            transition: 'border-color 0.14s ease'
                          }}
                          title={`Monogram Preset ${idx + 1}`}
                        >
                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ height: '36px', padding: '0 12px', fontSize: '0.76rem', borderRadius: '7px' }}
                    >
                      <Camera size={13} />
                      <span>Upload Photo</span>
                    </button>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Select a matte monogram or upload a custom JPG, PNG, or WebP up to 4 MB.
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileAvatar}
                />
              </div>
            </div>

            {/* Form Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div>
                <label style={labelStyle}>DISPLAY NAME</label>
                <input
                  type="text"
                  className="input-text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveProfile()}
                  placeholder="Enter display name"
                  style={{ height: '38px', fontSize: '0.84rem', borderRadius: '7px' }}
                />
              </div>

              <div>
                <label style={labelStyle}>EMAIL ADDRESS</label>
                <input
                  type="email"
                  className="input-text"
                  value={user.email}
                  readOnly
                  style={{ height: '38px', fontSize: '0.84rem', borderRadius: '7px', opacity: 0.6, cursor: 'default' }}
                />
              </div>
            </div>

            {/* Vault ID Row */}
            <div>
              <label style={labelStyle}>VAULT IDENTIFIER</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  className="input-text"
                  value={user.id}
                  readOnly
                  style={{
                    height: '36px',
                    fontSize: '0.78rem',
                    fontFamily: 'monospace',
                    borderRadius: '7px',
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-input)'
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCopyAccountId}
                  style={{ height: '36px', padding: '0 12px', fontSize: '0.76rem', borderRadius: '7px', flexShrink: 0 }}
                >
                  {copiedId ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                  <span>{copiedId ? 'Copied' : 'Copy ID'}</span>
                </button>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-subtle)'
            }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveProfile}
                disabled={profileSaving}
                style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: '7px' }}
              >
                {profileSaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                <span>{profileSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </MatteCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* 2. APPEARANCE TAB */}
      {activeTab === 'appearance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <MatteCard
            title="Workspace Finish & Theme"
            subtitle="Matte architectural color palettes engineered for low eye strain"
            icon={<Palette size={14} />}
            rightBadge="4 Matte Finishes"
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '12px'
            }}>
              {MATTE_THEMES.map((t) => {
                const isActive = theme === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => changeTheme(t.key)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      padding: '12px',
                      borderRadius: '8px',
                      background: isActive ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                      border: isActive ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.14s ease'
                    }}
                  >
                    {/* Mini UI Wireframe Swatch */}
                    <div style={{
                      width: '100%',
                      height: '58px',
                      borderRadius: '6px',
                      background: t.bg,
                      border: `1px solid ${t.border}`,
                      padding: '8px',
                      display: 'flex',
                      gap: '8px',
                      boxSizing: 'border-box'
                    }}>
                      {/* Mini Sidebar */}
                      <div style={{
                        width: '26%',
                        height: '100%',
                        borderRadius: '4px',
                        background: t.surface,
                        border: `1px solid ${t.border}`,
                        padding: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px'
                      }}>
                        <div style={{ width: '70%', height: '4px', borderRadius: '2px', background: t.accent }} />
                        <div style={{ width: '90%', height: '3px', borderRadius: '2px', background: t.border }} />
                        <div style={{ width: '60%', height: '3px', borderRadius: '2px', background: t.border }} />
                      </div>
                      {/* Mini Main Content */}
                      <div style={{
                        flex: 1,
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '4px'
                      }}>
                        <div style={{ borderRadius: '4px', background: t.surface, border: `1px solid ${t.border}` }} />
                        <div style={{ borderRadius: '4px', background: t.surface, border: `1px solid ${t.border}` }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {t.label}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {t.desc}
                        </div>
                      </div>
                      {isActive && <CheckCircle2 size={15} color="var(--accent-primary)" style={{ flexShrink: 0 }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </MatteCard>

          <MatteCard
            title="Default File Layout"
            subtitle="Choose how folders and files are presented across your vault"
            icon={<LayoutGrid size={14} />}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {[
                { key: 'grid', label: 'Matte Card Grid', desc: 'Visual thumbnails & document badges', icon: <LayoutGrid size={15} /> },
                { key: 'list', label: 'Compact Data Table', desc: 'High-density rows with metadata columns', icon: <List size={15} /> }
              ].map((opt) => {
                const active = viewMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setViewMode(opt.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: active ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                      border: active ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '7px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      flexShrink: 0
                    }}>
                      {opt.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{opt.label}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{opt.desc}</div>
                    </div>
                    {active && <CheckCircle2 size={14} color="var(--accent-primary)" />}
                  </button>
                );
              })}
            </div>
          </MatteCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* 3. STORAGE & PLAN TAB */}
      {activeTab === 'storage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Quota Summary Bar */}
          <MatteCard
            title="Vault Storage Allocation"
            subtitle={storageStats?.cloudSyncStatus || 'Encrypted Cloud Vault Active'}
            icon={<HardDrive size={14} />}
            rightBadge={planInfo.displayName}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
              gap: '10px'
            }}>
              {[
                { label: 'Used Space', value: formatBytes(usedBytes) },
                { label: 'Plan Allocation', value: formatBytes(quotaBytes) },
                { label: 'Stored Files', value: `${storageStats?.totalFiles || 0} items` },
                { label: 'Cloud Sync', value: 'Active' }
              ].map((m, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {formatBytes(usedBytes)} used of {formatBytes(quotaBytes)}
                </span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {usagePercent}%
                </span>
              </div>
              <div style={{
                width: '100%',
                height: '6px',
                borderRadius: '999px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.max(1, Number(usagePercent))}%`,
                  height: '100%',
                  background: 'var(--accent-primary)',
                  borderRadius: '999px'
                }} />
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Active Plan: <strong style={{ color: 'var(--text-primary)' }}>{planInfo.name}</strong> ({planInfo.price})
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsSubscriptionOpen(true)}
                style={{ fontSize: '0.78rem', padding: '7px 14px', borderRadius: '7px' }}
              >
                <span>Upgrade or Change Plan</span>
                <ArrowUpRight size={13} />
              </button>
            </div>
          </MatteCard>

          {/* Category Breakdown */}
          {storageStats?.categories && (
            <MatteCard
              title="Category Distribution"
              subtitle="Breakdown of files stored across vault categories"
              icon={<Database size={14} />}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(storageStats.categories).map(([key, cat]) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      borderRadius: '7px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.8rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '2px',
                        background: cat.color,
                        flexShrink: 0
                      }} />
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{cat.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {cat.count} {cat.count === 1 ? 'file' : 'files'}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600, minWidth: '68px', textAlign: 'right' }}>
                        {formatBytes(cat.bytes)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </MatteCard>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* 4. SECURITY TAB */}
      {activeTab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <MatteCard
            title="Account Password"
            subtitle="Update the password used to sign in to your vault"
            icon={<Lock size={14} />}
          >
            {passMsg && <StatusBanner type={passMsg.type}>{passMsg.text}</StatusBanner>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div>
                <label style={labelStyle}>NEW PASSWORD</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNew ? 'text' : 'password'}
                    className="input-text"
                    placeholder="Minimum 6 characters"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    style={{ height: '38px', fontSize: '0.84rem', borderRadius: '7px', paddingRight: '36px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(v => !v)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex'
                    }}
                  >
                    {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>CONFIRM NEW PASSWORD</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className="input-text"
                    placeholder="Repeat new password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                    style={{ height: '38px', fontSize: '0.84rem', borderRadius: '7px', paddingRight: '36px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex'
                    }}
                  >
                    {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-subtle)'
            }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleChangePassword}
                disabled={passSaving}
                style={{ padding: '8px 18px', fontSize: '0.82rem', borderRadius: '7px' }}
              >
                {passSaving ? <Loader2 size={14} className="spin" /> : <Lock size={14} />}
                <span>{passSaving ? 'Updating...' : 'Update Password'}</span>
              </button>
            </div>
          </MatteCard>

          <MatteCard
            title="Vault Session Lock (4-Digit PIN)"
            subtitle="Require a 4-digit passcode when opening or refreshing your vault session"
            icon={<KeyRound size={14} />}
            rightBadge={user.pin ? 'PIN Active' : 'Disabled'}
          >
            {pinMsg && <StatusBanner type={pinMsg.type}>{pinMsg.text}</StatusBanner>}

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={labelStyle}>4-DIGIT PASSCODE</label>
                <input
                  type="password"
                  maxLength={4}
                  className="input-text"
                  placeholder="Leave empty to disable PIN lock"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  style={{ height: '38px', fontSize: '0.86rem', borderRadius: '7px', letterSpacing: '0.2em' }}
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSavePin}
                style={{ height: '38px', padding: '0 16px', fontSize: '0.8rem', borderRadius: '7px' }}
              >
                <Shield size={14} />
                <span>{pinInput ? 'Save PIN Lock' : 'Disable PIN Lock'}</span>
              </button>
              {user.pin && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('storagebank:lock-vault'));
                    if (addToast) addToast('Vault session locked immediately', 'info');
                  }}
                  style={{ height: '38px', padding: '0 14px', fontSize: '0.8rem', borderRadius: '7px', gap: '6px' }}
                >
                  <Lock size={13} />
                  <span>Lock Vault Now</span>
                </button>
              )}
            </div>
          </MatteCard>

          {/* Zero-Trust Anti-Hacker Protection & AES-256 Encryption Suite */}
          <MatteCard
            title="Zero-Trust Anti-Hacker Shield & AES-256 Encryption"
            subtitle="Active client-side cryptographic defenses against unauthorized access, brute-force attacks, and payload spoofing"
            icon={<Shield size={14} />}
            rightBadge="5 Shields Active"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Active Protection Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '10px'
              }}>
                {[
                  {
                    title: 'AES-256-GCM File Encryption',
                    desc: 'Right-click any vault file → Encrypt (AES-256) with PBKDF2 100,000-iteration key derivation.'
                  },
                  {
                    title: 'Brute-Force Rate Limiter',
                    desc: 'Automatically locks out PIN & login cracking tools for 30s after 5 failed attempts.'
                  },
                  {
                    title: 'SHA-256 Integrity Fingerprinting',
                    desc: 'Computes cryptographic SHA-256 digests on uploaded files to detect tampering.'
                  },
                  {
                    title: 'Malicious Payload & XSS Shield',
                    desc: 'Neutralizes path traversal (../), null-byte injection, and double-extension (.pdf.exe) spoofs.'
                  }
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '11px 13px',
                      borderRadius: '8px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.title}
                      </span>
                      <CheckCircle2 size={13} color="var(--accent-emerald)" />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {item.desc}
                    </span>
                  </div>
                ))}
              </div>

              {/* Idle Auto-Lock Watchdog Selector */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                padding: '11px 13px',
                borderRadius: '8px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)'
              }}>
                <div>
                  <div style={{ fontSize: '0.79rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Idle Session Auto-Lock Watchdog
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Automatically locks your vault with your 4-digit PIN when left unattended
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Off', val: 0 },
                    { label: '5m', val: 5 },
                    { label: '15m', val: 15 },
                    { label: '30m', val: 30 }
                  ].map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => {
                        setAutoLockMinsState(opt.val);
                        setAutoLockMinutes(opt.val);
                        updateUserProfile({ autoLockMinutes: opt.val });
                        setSecurityLogs(getSecurityAuditLogs());
                        if (addToast) addToast(opt.val > 0 ? `Auto-lock set to ${opt.val} minutes (synced across devices)` : 'Idle auto-lock disabled', 'info');
                      }}
                      style={{
                        padding: '5px 11px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: autoLockMins === opt.val ? 'var(--accent-primary)' : 'var(--bg-surface)',
                        color: autoLockMins === opt.val ? '#ffffff' : 'var(--text-secondary)',
                        border: autoLockMins === opt.val ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Security Audit Log */}
              {securityLogs.length > 0 && (
                <div style={{
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-input)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: 'var(--bg-secondary)'
                  }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Security &amp; Encryption Audit Log ({securityLogs.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        clearSecurityAuditLogs();
                        setSecurityLogs([]);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: '0.7rem',
                        cursor: 'pointer'
                      }}
                    >
                      Clear Log
                    </button>
                  </div>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {securityLogs.slice(0, 10).map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.73rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{
                            color: item.severity === 'danger'
                              ? 'var(--accent-rose)'
                              : item.severity === 'warning'
                              ? 'var(--accent-amber)'
                              : 'var(--text-primary)'
                          }}>
                            {item.event}
                          </strong>
                          {item.details && <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>&mdash; {item.details}</span>}
                        </div>
                        <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </MatteCard>
        </div>
      )}

      {/* Architectural Matte Attribution Footer with Restricted Staff Admin Gateway */}
      <div style={{
        marginTop: '24px',
        padding: '12px 16px',
        borderRadius: '8px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        fontSize: '0.73rem',
        color: 'var(--text-muted)'
      }}>
        <span>
          StorageBank Cloud Vault &bull; Developed By <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Arpon Chakraborty</strong>
        </span>

        <button
          type="button"
          onClick={() => setActiveCategory('admin')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            borderRadius: '5px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
            fontSize: '0.67rem',
            fontWeight: 500,
            cursor: 'pointer'
          }}
          title="Restricted to platform system administrators only"
        >
          <span>Staff Only: System Admin</span>
        </button>
      </div>
    </div>
  );
}

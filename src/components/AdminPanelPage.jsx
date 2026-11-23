import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStorage } from '../context/StorageContext';
import { STORAGE_PLANS, getPlanQuota, formatBytes } from '../utils/planQuotas';
import { getSecurityAuditLogs } from '../utils/securityEngine';
import { supabase, isLiveSupabase } from '../lib/supabaseClient';
import {
  Shield,
  Users,
  HardDrive,
  Database,
  Search,
  Lock,
  Unlock,
  CheckCircle2,
  Ban,
  UserPlus,
  RefreshCw,
  Eye,
  X,
  KeyRound,
  CreditCard
} from 'lucide-react';

const LOCAL_USERS_DB_KEY = 'storagebank_registered_accounts';
const LOCAL_USER_KEY = 'storagebank_local_user';
const BKASH_TX_LOG_KEY = 'storagebank_bkash_transactions';
const ADMIN_PASSKEY_STORAGE = 'storagebank_admin_master_key';
const ADMIN_SESSION_STORAGE = 'storagebank_admin_session_unlocked';
const DEFAULT_ADMIN_PASSKEY = 'ARPON-ADMIN';

export function AdminPanelPage() {
  const { user, updateUserProfile } = useAuth();
  const { files, folders, setActiveCategory, addToast, requestConfirm } = useStorage();

  // Admin Master Passkey Gate (auto-unlocked if signed-in email contains 'arpon' or already verified in session)
  const isOwnerEmail = Boolean(user?.email && user.email.toLowerCase().includes('arpon'));
  const [adminUnlocked, setAdminUnlocked] = useState(() => {
    return isOwnerEmail || sessionStorage.getItem(ADMIN_SESSION_STORAGE) === 'true';
  });
  const [passkeyInput, setPasskeyInput] = useState('');
  const [passkeyError, setPasskeyError] = useState('');

  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'storage' | 'payments'
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [accountsMap, setAccountsMap] = useState({});
  const [remoteFiles, setRemoteFiles] = useState([]);
  const [bkashList, setBkashList] = useState(() => {
    try {
      const raw = localStorage.getItem(BKASH_TX_LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [inspectTarget, setInspectTarget] = useState(null);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPlan, setNewUserPlan] = useState(STORAGE_PLANS.FREE.displayName);
  const [refreshing, setRefreshing] = useState(false);

  const loadAllAccounts = async () => {
    setRefreshing(true);
    try {
      const raw = localStorage.getItem(LOCAL_USERS_DB_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const merged = { ...parsed };

      // Always ensure the currently signed-in account is present and up-to-date
      if (user && user.email) {
        merged[user.email.toLowerCase()] = {
          ...(merged[user.email.toLowerCase()] || {}),
          ...user,
          role: 'Owner / Admin',
          status: merged[user.email.toLowerCase()]?.status || 'active',
          lastActive: new Date().toISOString()
        };
      }

      // If live Supabase is reachable, merge any remote profiles
      if (isLiveSupabase) {
        try {
          const { data: profs } = await Promise.race([
            supabase.from('profiles').select('*').limit(100),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))
          ]);
          if (Array.isArray(profs)) {
            profs.forEach(p => {
              const em = (p.email || `${p.username || p.id}@storagebank.vault`).toLowerCase();
              merged[em] = {
                id: p.id,
                email: em,
                username: p.username || em.split('@')[0],
                plan: p.plan || STORAGE_PLANS.FREE.displayName,
                pin: p.pin || null,
                status: p.status || 'active',
                role: p.id === user?.id ? 'Owner / Admin' : 'User',
                createdAt: p.created_at || new Date().toISOString(),
                ...(merged[em] || {})
              };
            });
          }

          const { data: allSupaFiles } = await Promise.race([
            supabase.from('vault_files').select('id, user_id, name, category, size, in_trash').limit(1000),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))
          ]);
          if (Array.isArray(allSupaFiles) && allSupaFiles.length > 0) {
            setRemoteFiles(allSupaFiles);
          }
        } catch {}
      }

      localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(merged));
      setAccountsMap(merged);
    } catch {}
    setRefreshing(false);
  };

  useEffect(() => {
    loadAllAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.plan, user?.pin]);

  // Combine IndexedDB files + remote metadata without double counting
  const allKnownFiles = useMemo(() => {
    const map = new Map();
    (remoteFiles || []).forEach(rf => {
      map.set(rf.id, {
        id: rf.id,
        userId: rf.user_id,
        name: rf.name,
        category: rf.category || 'document',
        size: rf.size || 0,
        inTrash: !!rf.in_trash
      });
    });
    (files || []).forEach(lf => {
      map.set(lf.id, {
        id: lf.id,
        userId: lf.userId || user?.id,
        name: lf.name,
        category: lf.category || 'document',
        size: lf.size || 0,
        inTrash: !!lf.inTrash
      });
    });
    return Array.from(map.values());
  }, [files, remoteFiles, user?.id]);

  // Build enriched user directory list with real per-user storage statistics
  const enrichedUsers = useMemo(() => {
    const list = Object.values(accountsMap);
    return list.map(acc => {
      const isCurrentUser = acc.id === user?.id || acc.email?.toLowerCase() === user?.email?.toLowerCase();
      const userFiles = allKnownFiles.filter(f => {
        if (isCurrentUser) {
          return !f.userId || f.userId === acc.id || f.userId === user?.id || f.userId === 'local';
        }
        return f.userId === acc.id;
      });
      const activeUserFiles = userFiles.filter(f => !f.inTrash);
      const trashUserFiles = userFiles.filter(f => f.inTrash);
      const userFolders = (folders || []).filter(fd => {
        if (isCurrentUser) {
          return !fd.userId || fd.userId === acc.id || fd.userId === user?.id || fd.userId === 'local';
        }
        return fd.userId === acc.id;
      });

      const usedBytes = activeUserFiles.reduce((sum, f) => sum + (f.size || 0), 0);
      const trashBytes = trashUserFiles.reduce((sum, f) => sum + (f.size || 0), 0);
      const planInfo = getPlanQuota(acc.plan);
      const quotaBytes = planInfo.quotaBytes;
      const usagePct = Math.min(100, (usedBytes / quotaBytes) * 100);

      const catBytes = {};
      activeUserFiles.forEach(f => {
        const c = f.category || 'other';
        catBytes[c] = (catBytes[c] || 0) + (f.size || 0);
      });

      return {
        ...acc,
        isCurrentUser,
        role: isCurrentUser ? 'Owner / Admin' : (acc.role || 'User'),
        status: acc.status || 'active',
        planDisplay: planInfo.displayName,
        planKey: planInfo.key,
        quotaBytes,
        usedBytes,
        trashBytes,
        usagePct,
        fileCount: activeUserFiles.length,
        trashCount: trashUserFiles.length,
        folderCount: userFolders.filter(fd => !fd.inTrash).length,
        catBytes,
        largestFiles: [...activeUserFiles].sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 5)
      };
    });
  }, [accountsMap, allKnownFiles, folders, user?.id, user?.email]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return enrichedUsers.filter(u => {
      if (planFilter !== 'all' && u.planKey !== planFilter) return false;
      if (!q) return true;
      return (
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.id || '').toLowerCase().includes(q)
      );
    });
  }, [enrichedUsers, searchQuery, planFilter]);

  // Platform-wide Totals
  const platformStats = useMemo(() => {
    const totalUsers = enrichedUsers.length;
    const activeUsersCount = enrichedUsers.filter(u => u.status !== 'suspended').length;
    const totalUsedBytes = enrichedUsers.reduce((sum, u) => sum + u.usedBytes, 0);
    const totalAllocatedQuota = enrichedUsers.reduce((sum, u) => sum + u.quotaBytes, 0);
    const totalFiles = enrichedUsers.reduce((sum, u) => sum + u.fileCount, 0);
    const totalFolders = enrichedUsers.reduce((sum, u) => sum + u.folderCount, 0);
    const paidUsers = enrichedUsers.filter(u => u.planKey === 'pro' || u.planKey === 'ultra').length;
    const pinProtectedUsers = enrichedUsers.filter(u => Boolean(u.pin)).length;

    const categoryTotals = {
      video: { label: 'Videos', bytes: 0, count: 0 },
      image: { label: 'Photos & Media', bytes: 0, count: 0 },
      document: { label: 'Documents', bytes: 0, count: 0 },
      audio: { label: 'Audio', bytes: 0, count: 0 },
      code: { label: 'Code & Scripts', bytes: 0, count: 0 },
      archive: { label: 'Archives', bytes: 0, count: 0 }
    };

    allKnownFiles.filter(f => !f.inTrash).forEach(f => {
      const key = categoryTotals[f.category] ? f.category : 'document';
      categoryTotals[key].bytes += f.size || 0;
      categoryTotals[key].count += 1;
    });

    return {
      totalUsers,
      activeUsersCount,
      totalUsedBytes,
      totalAllocatedQuota,
      totalFiles,
      totalFolders,
      paidUsers,
      pinProtectedUsers,
      categoryTotals
    };
  }, [enrichedUsers, allKnownFiles]);

  const securityLogs = getSecurityAuditLogs();

  const handleUnlockAdmin = (e) => {
    e.preventDefault();
    const expectedKey = localStorage.getItem(ADMIN_PASSKEY_STORAGE) || DEFAULT_ADMIN_PASSKEY;
    if (passkeyInput.trim() === expectedKey) {
      sessionStorage.setItem(ADMIN_SESSION_STORAGE, 'true');
      setAdminUnlocked(true);
      setPasskeyError('');
      if (addToast) addToast('Admin Console unlocked', 'success');
    } else {
      setPasskeyError('Invalid Admin Master Key.');
    }
  };

  const handleApproveBkash = async (txIndex) => {
    const tx = bkashList[txIndex];
    if (!tx) return;

    const updatedTxList = bkashList.map((item, idx) =>
      idx === txIndex ? { ...item, status: 'approved', verifiedAt: new Date().toISOString() } : item
    );
    setBkashList(updatedTxList);
    localStorage.setItem(BKASH_TX_LOG_KEY, JSON.stringify(updatedTxList));

    // Upgrade target user's plan quota
    const emKey = (tx.userEmail || '').toLowerCase();
    const updatedMap = { ...accountsMap };
    if (emKey) {
      updatedMap[emKey] = {
        ...(updatedMap[emKey] || { email: emKey, username: tx.userName || emKey.split('@')[0] }),
        plan: tx.plan
      };
      localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(updatedMap));
      setAccountsMap(updatedMap);
    }

    if (user?.email?.toLowerCase() === emKey) {
      await updateUserProfile({ plan: tx.plan });
    } else if (isLiveSupabase && tx.userId) {
      try {
        await supabase.from('profiles').update({ plan: tx.plan }).eq('id', tx.userId);
      } catch {}
    }

    if (addToast) addToast(`Approved TrxID ${tx.trxId} • Upgraded ${tx.userEmail} to ${tx.plan}`, 'success');
  };

  const handleRejectBkash = (txIndex) => {
    const tx = bkashList[txIndex];
    if (!tx) return;
    const updatedTxList = bkashList.map((item, idx) =>
      idx === txIndex ? { ...item, status: 'rejected' } : item
    );
    setBkashList(updatedTxList);
    localStorage.setItem(BKASH_TX_LOG_KEY, JSON.stringify(updatedTxList));
    if (addToast) addToast(`Rejected TrxID ${tx.trxId}`, 'info');
  };

  // Admin Action: Change User Plan Quota
  const handleChangeUserPlan = async (targetUser, newPlanDisplayName) => {
    const updatedMap = { ...accountsMap };
    const emKey = targetUser.email.toLowerCase();
    updatedMap[emKey] = {
      ...(updatedMap[emKey] || targetUser),
      plan: newPlanDisplayName
    };
    localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(updatedMap));
    setAccountsMap(updatedMap);

    if (targetUser.isCurrentUser) {
      await updateUserProfile({ plan: newPlanDisplayName });
    }
    if (inspectTarget && inspectTarget.email.toLowerCase() === emKey) {
      setInspectTarget(prev => prev ? { ...prev, planDisplay: newPlanDisplayName } : null);
    }
    if (addToast) addToast(`Updated ${targetUser.username}'s plan to ${newPlanDisplayName}`, 'success');
  };

  // Admin Action: Toggle Suspend / Activate User
  const handleToggleUserStatus = (targetUser) => {
    if (targetUser.isCurrentUser) {
      if (addToast) addToast('Cannot suspend your own active admin account.', 'error');
      return;
    }
    const nextStatus = targetUser.status === 'suspended' ? 'active' : 'suspended';
    const updatedMap = { ...accountsMap };
    const emKey = targetUser.email.toLowerCase();
    updatedMap[emKey] = {
      ...(updatedMap[emKey] || targetUser),
      status: nextStatus
    };
    localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(updatedMap));
    setAccountsMap(updatedMap);
    if (addToast) addToast(`${targetUser.username} is now ${nextStatus}.`, 'info');
  };

  // Admin Action: Reset Forgotten PIN for User
  const handleResetUserPin = async (targetUser) => {
    requestConfirm({
      title: 'Reset User Security PIN',
      message: `Clear the 4-digit session lock PIN for "${targetUser.username}" (${targetUser.email})?`,
      confirmText: 'Reset PIN',
      danger: false,
      onConfirm: async () => {
        const updatedMap = { ...accountsMap };
        const emKey = targetUser.email.toLowerCase();
        updatedMap[emKey] = {
          ...(updatedMap[emKey] || targetUser),
          pin: null
        };
        localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(updatedMap));
        setAccountsMap(updatedMap);

        if (targetUser.isCurrentUser) {
          localStorage.removeItem('storagebank_vault_pin');
          const savedLocal = localStorage.getItem(LOCAL_USER_KEY);
          if (savedLocal) {
            try {
              const p = JSON.parse(savedLocal);
              p.pin = null;
              localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(p));
            } catch {}
          }
          await updateUserProfile({ pin: null });
        }
        if (addToast) addToast(`Cleared 4-digit PIN for ${targetUser.username}`, 'success');
      }
    });
  };

  // Admin Action: Provision New User Account
  const handleCreateUser = (e) => {
    e.preventDefault();
    const em = newUserEmail.trim().toLowerCase();
    const nm = newUserName.trim();
    if (!nm || !em || !em.includes('@')) {
      if (addToast) addToast('Enter a valid name and email address.', 'error');
      return;
    }
    if (accountsMap[em]) {
      if (addToast) addToast('A user with this email already exists.', 'error');
      return;
    }

    const id = 'usr_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    const created = {
      id,
      email: em,
      username: nm,
      plan: newUserPlan,
      theme: 'dark',
      pin: null,
      role: 'User',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const updatedMap = { ...accountsMap, [em]: created };
    localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(updatedMap));
    setAccountsMap(updatedMap);
    setNewUserName('');
    setNewUserEmail('');
    setIsAddUserOpen(false);
    if (addToast) addToast(`Provisioned vault account for ${nm}`, 'success');
  };

  if (!adminUnlocked) {
    return (
      <div style={{
        maxWidth: '430px',
        margin: '48px auto',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
        padding: '24px 22px'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 8px',
          borderRadius: '4px',
          background: 'rgba(244, 63, 94, 0.12)',
          border: '1px solid rgba(244, 63, 94, 0.28)',
          color: 'var(--accent-rose)',
          fontSize: '0.65rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '12px'
        }}>
          <Lock size={11} />
          <span>Restricted Area &bull; Staff &amp; System Administrators Only</span>
        </div>

        <h3 style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
          Internal System Governance Console
        </h3>
        <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '16px' }}>
          This area is reserved strictly for the platform administrator (<strong style={{ color: 'var(--text-secondary)' }}>Arpon Chakraborty</strong>) and is not intended for standard vault users. If you are a regular user, please return to your vault workspace.
        </p>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setActiveCategory('all')}
          style={{
            width: '100%',
            height: '36px',
            fontSize: '0.8rem',
            fontWeight: 600,
            borderRadius: '6px',
            justifyContent: 'center',
            marginBottom: '18px'
          }}
        >
          &larr; Return to My Vault (Standard Users)
        </button>

        <div style={{
          paddingTop: '14px',
          borderTop: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Administrator Master Key Verification
          </div>
          <form onSubmit={handleUnlockAdmin} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              className="input-text"
              placeholder="Enter Staff Master Passkey"
              value={passkeyInput}
              onChange={(e) => { setPasskeyInput(e.target.value); setPasskeyError(''); }}
              style={{ height: '34px', fontSize: '0.8rem', borderRadius: '6px', flex: 1 }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ height: '34px', padding: '0 14px', fontSize: '0.78rem', fontWeight: 600, borderRadius: '6px' }}
            >
              Unlock
            </button>
          </form>
          {passkeyError && (
            <div style={{ fontSize: '0.72rem', color: 'var(--accent-rose)', marginTop: '6px' }}>{passkeyError}</div>
          )}
        </div>
      </div>
    );
  }

  const pendingBkashCount = bkashList.filter(t => t.status === 'pending').length;

  return (
    <div style={{
      maxWidth: '1080px',
      margin: '0 auto',
      paddingBottom: '48px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {/* ── Top Architectural Admin Header ── */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)'
          }}>
            <Shield size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.02rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Admin Console
              </h2>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: '4px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                System Governance
              </span>
            </div>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Monitor registered users, storage consumption, quota allocations, and security events
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadAllAccounts}
            style={{ height: '32px', padding: '0 11px', fontSize: '0.76rem', borderRadius: '6px', gap: '6px' }}
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            <span>Sync</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsAddUserOpen(prev => !prev)}
            style={{ height: '32px', padding: '0 12px', fontSize: '0.76rem', borderRadius: '6px', gap: '6px' }}
          >
            <UserPlus size={13} />
            <span>Provision User</span>
          </button>
        </div>
      </div>

      {/* ── Provision New User Collapsible Panel ── */}
      {isAddUserOpen && (
        <form
          onSubmit={handleCreateUser}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '10px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Display Name
            </label>
            <input
              type="text"
              className="input-text"
              placeholder="e.g. Nafis Rahman"
              value={newUserName}
              onChange={e => setNewUserName(e.target.value)}
              style={{ height: '34px', fontSize: '0.8rem', borderRadius: '6px' }}
            />
          </div>
          <div style={{ flex: '1 1 210px' }}>
            <label style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Email Address
            </label>
            <input
              type="email"
              className="input-text"
              placeholder="user@domain.com"
              value={newUserEmail}
              onChange={e => setNewUserEmail(e.target.value)}
              style={{ height: '34px', fontSize: '0.8rem', borderRadius: '6px' }}
            />
          </div>
          <div style={{ flex: '0 1 180px' }}>
            <label style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Initial Storage Quota
            </label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[STORAGE_PLANS.FREE, STORAGE_PLANS.PRO, STORAGE_PLANS.ULTRA].map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setNewUserPlan(p.displayName)}
                  style={{
                    flex: 1,
                    height: '34px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: newUserPlan === p.displayName ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                    border: newUserPlan === p.displayName ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                    color: newUserPlan === p.displayName ? 'var(--text-primary)' : 'var(--text-muted)'
                  }}
                >
                  {p.quotaLabel}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="submit" className="btn btn-primary" style={{ height: '34px', padding: '0 14px', fontSize: '0.78rem', borderRadius: '6px' }}>
              Create Account
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setIsAddUserOpen(false)} style={{ height: '34px', padding: '0 10px', fontSize: '0.78rem', borderRadius: '6px' }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── 4 Executive Summary Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
        gap: '12px'
      }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '9px',
          padding: '14px 16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.71rem', fontWeight: 600, textTransform: 'uppercase' }}>
            <span>Registered Users</span>
            <Users size={14} />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '6px' }}>
            {platformStats.totalUsers}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {platformStats.activeUsersCount} active &bull; {platformStats.paidUsers} upgraded
          </div>
        </div>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '9px',
          padding: '14px 16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.71rem', fontWeight: 600, textTransform: 'uppercase' }}>
            <span>Total Storage Used</span>
            <HardDrive size={14} />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '6px' }}>
            {formatBytes(platformStats.totalUsedBytes)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            of {formatBytes(platformStats.totalAllocatedQuota)} allocated capacity
          </div>
        </div>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '9px',
          padding: '14px 16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.71rem', fontWeight: 600, textTransform: 'uppercase' }}>
            <span>Vault Inventory</span>
            <Database size={14} />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '6px' }}>
            {platformStats.totalFiles} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-muted)' }}>files</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Across {platformStats.totalFolders} organized folders
          </div>
        </div>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '9px',
          padding: '14px 16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.71rem', fontWeight: 600, textTransform: 'uppercase' }}>
            <span>Security Coverage</span>
            <Lock size={14} />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '6px' }}>
            {platformStats.pinProtectedUsers}/{platformStats.totalUsers}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            PIN-locked &bull; AES-256 Guard Active
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '4px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        overflowX: 'auto'
      }}>
        {[
          { key: 'users', label: `Users & Quotas (${enrichedUsers.length})`, icon: <Users size={13} /> },
          { key: 'storage', label: 'Storage Distribution', icon: <HardDrive size={13} /> },
          {
            key: 'payments',
            label: pendingBkashCount > 0
              ? `Subscriptions & Logs (${pendingBkashCount} Pending)`
              : 'Subscriptions & Security Logs',
            icon: <CreditCard size={13} />
          }
        ].map(t => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: '1 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                padding: '7px 12px',
                borderRadius: '6px',
                border: active ? '1px solid var(--border-subtle)' : '1px solid transparent',
                background: active ? 'var(--bg-surface)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: '0.78rem',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: USERS & QUOTAS DIRECTORY */}
      {activeTab === 'users' && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          {/* Filter & Search Bar */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '360px' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="input-text"
                placeholder="Filter users by name or email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ height: '32px', paddingLeft: '30px', fontSize: '0.78rem', borderRadius: '6px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {[
                { key: 'all', label: 'All Tiers' },
                { key: 'free', label: '512 GB Free' },
                { key: 'pro', label: '2 TB Pro' },
                { key: 'ultra', label: '10 TB Ultra' }
              ].map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setPlanFilter(f.key)}
                  style={{
                    padding: '5px 10px',
                    fontSize: '0.72rem',
                    fontWeight: planFilter === f.key ? 600 : 500,
                    borderRadius: '6px',
                    background: planFilter === f.key ? 'var(--bg-surface-hover)' : 'var(--bg-input)',
                    border: planFilter === f.key ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                    color: planFilter === f.key ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Users Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>User</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Storage Used</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Files / Folders</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Quota Tier</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Security</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>Manage</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const initials = (u.username || u.email || 'U').slice(0, 2).toUpperCase();
                  return (
                    <tr key={u.email} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '7px',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            flexShrink: 0
                          }}>
                            {initials}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.username}</span>
                              {u.isCurrentUser && (
                                <span style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 600,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'var(--bg-input)',
                                  border: '1px solid var(--border-subtle)',
                                  color: 'var(--text-secondary)'
                                }}>
                                  Admin
                                </span>
                              )}
                              {u.status === 'suspended' && (
                                <span style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 600,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(244, 63, 94, 0.14)',
                                  color: 'var(--accent-rose)'
                                }}>
                                  Suspended
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Storage Used + Progress Bar */}
                      <td style={{ padding: '11px 14px', minWidth: '175px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatBytes(u.usedBytes)}</span>
                          <span style={{ color: 'var(--text-muted)' }}>/ {formatBytes(u.quotaBytes)}</span>
                        </div>
                        <div style={{
                          width: '100%',
                          height: '4px',
                          borderRadius: '999px',
                          background: 'var(--bg-input)',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${Math.max(u.usedBytes > 0 ? 3 : 0, u.usagePct)}%`,
                            height: '100%',
                            background: 'var(--accent-primary)',
                            borderRadius: '999px'
                          }} />
                        </div>
                      </td>

                      {/* Files / Folders */}
                      <td style={{ padding: '11px 14px', color: 'var(--text-secondary)', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                        <div><strong>{u.fileCount}</strong> files &bull; <strong>{u.folderCount}</strong> folders</div>
                        {u.trashCount > 0 && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {u.trashCount} in trash ({formatBytes(u.trashBytes)})
                          </div>
                        )}
                      </td>

                      {/* Quota Tier Switcher */}
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'inline-flex', gap: '3px', background: 'var(--bg-input)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                          {[
                            { key: 'free', label: '512G', plan: STORAGE_PLANS.FREE.displayName },
                            { key: 'pro', label: '2TB', plan: STORAGE_PLANS.PRO.displayName },
                            { key: 'ultra', label: '10TB', plan: STORAGE_PLANS.ULTRA.displayName }
                          ].map(tier => {
                            const active = u.planKey === tier.key;
                            return (
                              <button
                                key={tier.key}
                                type="button"
                                onClick={() => handleChangeUserPlan(u, tier.plan)}
                                title={`Set quota to ${tier.plan}`}
                                style={{
                                  padding: '3px 7px',
                                  fontSize: '0.68rem',
                                  fontWeight: active ? 600 : 500,
                                  borderRadius: '4px',
                                  border: 'none',
                                  background: active ? 'var(--bg-surface-hover)' : 'transparent',
                                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                                  cursor: 'pointer'
                                }}
                              >
                                {tier.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      {/* Security PIN Status */}
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        {u.pin ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>
                            <Lock size={12} /> PIN Active
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <Unlock size={12} /> Standard
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setInspectTarget(u)}
                            title="Inspect user storage breakdown"
                            style={{ height: '28px', padding: '0 9px', fontSize: '0.72rem', borderRadius: '5px', gap: '4px' }}
                          >
                            <Eye size={12} />
                            <span>Inspect</span>
                          </button>

                          {u.pin && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => handleResetUserPin(u)}
                              title="Reset user 4-digit PIN"
                              style={{ height: '28px', padding: '0 8px', fontSize: '0.72rem', borderRadius: '5px', border: '1px solid var(--border-subtle)' }}
                            >
                              <KeyRound size={12} />
                            </button>
                          )}

                          {!u.isCurrentUser && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => handleToggleUserStatus(u)}
                              title={u.status === 'suspended' ? 'Reactivate user' : 'Suspend user'}
                              style={{
                                height: '28px',
                                padding: '0 8px',
                                fontSize: '0.72rem',
                                borderRadius: '5px',
                                border: '1px solid var(--border-subtle)',
                                color: u.status === 'suspended' ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                              }}
                            >
                              {u.status === 'suspended' ? <CheckCircle2 size={12} /> : <Ban size={12} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: STORAGE DISTRIBUTION ACROSS CATEGORIES & USERS */}
      {activeTab === 'storage' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
          {/* Category Breakdown */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Storage Consumption by Category
            </div>
            {Object.entries(platformStats.categoryTotals).map(([key, item]) => {
              const pct = platformStats.totalUsedBytes > 0
                ? Math.min(100, (item.bytes / platformStats.totalUsedBytes) * 100)
                : 0;
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.label} ({item.count} files)</span>
                    <span style={{ color: 'var(--text-muted)' }}>{formatBytes(item.bytes)} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '5px', borderRadius: '999px', background: 'var(--bg-input)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(item.bytes > 0 ? 2 : 0, pct)}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: '999px' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-User Storage Leaderboard */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              User Storage Utilization Ranking
            </div>
            {[...enrichedUsers].sort((a, b) => b.usedBytes - a.usedBytes).map(u => (
              <div
                key={u.email}
                style={{
                  padding: '10px 12px',
                  borderRadius: '7px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>{u.username}</div>
                  <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>{u.email} &bull; {u.fileCount} files</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>{formatBytes(u.usedBytes)}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Quota: {formatBytes(u.quotaBytes)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: SUBSCRIPTIONS & SECURITY AUDIT LOGS */}
      {activeTab === 'payments' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
          {/* bKash Subscription Ledger */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              bKash Subscription Upgrade Requests
            </div>
            {bkashList.length === 0 ? (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', padding: '16px 0' }}>
                No bKash TrxID transactions recorded yet. Upgrades submitted via bKash checkout appear here for Admin verification.
              </div>
            ) : (
              bkashList.map((tx, i) => {
                const status = tx.status || 'approved';
                return (
                  <div
                    key={tx.id || i}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '7px',
                      background: 'var(--bg-input)',
                      border: status === 'pending' ? '1px solid var(--accent-amber)' : '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      flexWrap: 'wrap',
                      fontSize: '0.74rem'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {tx.plan} ({tx.amount || 'BDT'})
                      </div>
                      <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {tx.userEmail} &bull; bKash: {tx.senderBkash} &bull; TrxID: <strong style={{ color: 'var(--text-primary)' }}>{tx.trxId}</strong>
                      </div>
                    </div>

                    {status === 'pending' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleApproveBkash(i)}
                          style={{ height: '26px', padding: '0 9px', fontSize: '0.7rem', borderRadius: '5px' }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleRejectBkash(i)}
                          style={{ height: '26px', padding: '0 8px', fontSize: '0.7rem', borderRadius: '5px', color: 'var(--accent-rose)', border: '1px solid var(--border-subtle)' }}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{
                        fontSize: '0.66rem',
                        color: status === 'rejected' ? 'var(--accent-rose)' : 'var(--accent-emerald)',
                        fontWeight: 600,
                        textTransform: 'capitalize'
                      }}>
                        {status}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Security & Access Events */}
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Recent Platform Security Events
            </div>
            {securityLogs.length === 0 ? (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', padding: '16px 0' }}>
                No security anomalies or encryption events logged yet.
              </div>
            ) : (
              securityLogs.slice(0, 12).map(ev => (
                <div
                  key={ev.id}
                  style={{
                    padding: '8px 11px',
                    borderRadius: '7px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    fontSize: '0.73rem'
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: ev.severity === 'danger' ? 'var(--accent-rose)' : 'var(--text-primary)' }}>
                      {ev.event}
                    </div>
                    {ev.details && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{ev.details}</div>}
                  </div>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── User Storage Inspection Modal ── */}
      {inspectTarget && (
        <div
          className="modal-overlay"
          onClick={() => setInspectTarget(null)}
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', zIndex: 2600 }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '460px',
              width: '92vw',
              background: 'var(--bg-modal)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: 0,
              overflow: 'hidden'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '13px 16px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)'
            }}>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {inspectTarget.username} &mdash; Storage Profile
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{inspectTarget.email}</div>
              </div>
              <button
                type="button"
                onClick={() => setInspectTarget(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.78rem' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px'
              }}>
                <div style={{ padding: '10px', borderRadius: '7px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Used Storage</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {formatBytes(inspectTarget.usedBytes)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>of {formatBytes(inspectTarget.quotaBytes)}</div>
                </div>
                <div style={{ padding: '10px', borderRadius: '7px', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vault Items</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {inspectTarget.fileCount} files
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{inspectTarget.folderCount} folders &bull; {inspectTarget.trashCount} trashed</div>
                </div>
              </div>

              {/* Category Summary for User */}
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Storage by Category
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Object.entries(inspectTarget.catBytes || {}).length === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>No active files stored</span>
                  ) : (
                    Object.entries(inspectTarget.catBytes).map(([cat, bytes]) => (
                      <span
                        key={cat}
                        style={{
                          padding: '4px 9px',
                          borderRadius: '5px',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '0.72rem',
                          color: 'var(--text-secondary)',
                          textTransform: 'capitalize'
                        }}
                      >
                        {cat}: <strong style={{ color: 'var(--text-primary)' }}>{formatBytes(bytes)}</strong>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Largest Files for User */}
              {inspectTarget.largestFiles?.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Top Files by Size
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {inspectTarget.largestFiles.map(f => (
                      <div
                        key={f.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '6px 9px',
                          borderRadius: '5px',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '0.73rem'
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px', color: 'var(--text-primary)' }}>
                          {f.name}
                        </span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatBytes(f.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '10px 16px',
              borderTop: '1px solid var(--border-subtle)',
              background: 'var(--bg-secondary)'
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setInspectTarget(null)}
                style={{ height: '30px', padding: '0 12px', fontSize: '0.76rem', borderRadius: '6px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

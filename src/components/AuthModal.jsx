import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useStorage } from '../context/StorageContext';
import { getPlanQuota } from '../utils/planQuotas';
import {
  User,
  X,
  LogOut,
  CheckCircle2,
  Shield
} from 'lucide-react';

export function AuthModal() {
  const { isAuthModalOpen, setIsAuthModalOpen, setIsSubscriptionOpen, addToast } = useStorage();
  const { user, signOut } = useAuth();

  if (!isAuthModalOpen) return null;

  const handleSignOut = async () => {
    await signOut();
    setIsAuthModalOpen(false);
    if (addToast) addToast('Signed out of vault.', 'info');
  };

  const cleanPlanTitle = (plan) => {
    return getPlanQuota(plan).displayName;
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 4000 }} onClick={() => setIsAuthModalOpen(false)}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '400px', width: '92vw', padding: 0 }}
      >
        <div className="modal-header" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={17} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '0.96rem', fontWeight: '600' }}>Vault Account</h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={() => setIsAuthModalOpen(false)} style={{ padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '18px' }}>
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* User Info */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                borderRadius: '8px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)'
              }}>
                <img
                  src={user.avatar}
                  alt={user.username}
                  style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-strong)' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {user.username && !user.username.startsWith('local_') ? user.username : 'Vault Master'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.email || 'user@storagebank.vault'}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.68rem',
                      color: 'var(--accent-emerald)',
                      fontWeight: '500'
                    }}>
                      <CheckCircle2 size={10} /> Active Session
                    </span>
                  </div>
                </div>
              </div>

              {/* Plan Info */}
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={15} color="var(--accent-primary)" />
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>PLAN TIER</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: '600' }}>{cleanPlanTitle(user.plan)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsAuthModalOpen(false);
                    if (setIsSubscriptionOpen) setIsSubscriptionOpen(true);
                  }}
                  style={{ fontSize: '0.74rem', padding: '4px 10px', borderRadius: '6px' }}
                >
                  Manage
                </button>
              </div>

              {/* Sign Out */}
              <button
                className="btn btn-secondary"
                onClick={handleSignOut}
                style={{
                  width: '100%',
                  padding: '9px',
                  borderRadius: '7px',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  color: '#fca5a5',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <LogOut size={14} />
                <span>Sign Out of Vault</span>
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              No active vault session found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

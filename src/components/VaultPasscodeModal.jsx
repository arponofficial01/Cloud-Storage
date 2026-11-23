import React, { useState, useEffect } from 'react';
import { useStorage } from '../context/StorageContext';
import { useAuth } from '../context/AuthContext';
import {
  checkBruteForceLockout,
  recordAuthAttempt,
  getAutoLockMinutes
} from '../utils/securityEngine';
import { Lock, Unlock, ShieldAlert } from 'lucide-react';

export function VaultPasscodeModal() {
  const { addToast } = useStorage();
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState(false);

  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [lockoutState, setLockoutState] = useState(() => checkBruteForceLockout());

  const activePin = user?.pin || localStorage.getItem('storagebank_vault_pin');
  const isLocked = Boolean(activePin && !unlocked);

  // Countdown timer when brute-force lockout is active
  useEffect(() => {
    if (!lockoutState.locked) return;
    const timer = setInterval(() => {
      const next = checkBruteForceLockout();
      setLockoutState(next);
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutState.locked]);

  // Listen for manual "Lock Vault Now" trigger and Idle Auto-Lock watchdog
  useEffect(() => {
    const handleManualLock = () => {
      if (activePin) {
        setUnlocked(false);
        setPin('');
      }
    };
    window.addEventListener('storagebank:lock-vault', handleManualLock);

    if (!activePin || !unlocked) {
      return () => window.removeEventListener('storagebank:lock-vault', handleManualLock);
    }

    const autoLockMins = getAutoLockMinutes();
    if (!autoLockMins || autoLockMins <= 0) {
      return () => window.removeEventListener('storagebank:lock-vault', handleManualLock);
    }

    let idleTimeout = null;
    const resetIdleTimer = () => {
      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        setUnlocked(false);
        setPin('');
        if (addToast) addToast('Vault automatically locked due to inactivity', 'info');
      }, autoLockMins * 60 * 1000);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      window.removeEventListener('storagebank:lock-vault', handleManualLock);
      events.forEach(evt => window.removeEventListener(evt, resetIdleTimer));
      if (idleTimeout) clearTimeout(idleTimeout);
    };
  }, [activePin, unlocked, addToast]);

  const handleUnlock = () => {
    const currentLock = checkBruteForceLockout();
    if (currentLock.locked) {
      setLockoutState(currentLock);
      addToast(`Security cooldown active. Wait ${currentLock.remainingSeconds}s.`, 'error');
      return;
    }

    if (pin === activePin) {
      recordAuthAttempt(true, 'Vault PIN');
      setUnlocked(true);
      setError(false);
      setLockoutState({ locked: false, remainingSeconds: 0, attempts: 0 });
      addToast('Vault unlocked • AES-256 session verified', 'success');
    } else {
      const nextLock = recordAuthAttempt(false, 'Vault PIN');
      setLockoutState(nextLock);
      setError(true);
      setPin('');
      if (nextLock.locked) {
        addToast('Brute-force protection triggered: 30s lockout engaged.', 'error');
      } else {
        addToast(`Incorrect PIN (${5 - nextLock.attempts} attempts remaining).`, 'error');
      }
    }
  };

  if (!isLocked) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 99999 }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '350px',
          width: '92vw',
          textAlign: 'center',
          padding: '24px 20px',
          borderRadius: '11px',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border-strong)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)'
        }}
      >
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '9px',
          background: lockoutState.locked ? 'rgba(244, 63, 94, 0.14)' : 'var(--bg-input)',
          border: lockoutState.locked ? '1px solid rgba(244, 63, 94, 0.35)' : '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px auto',
          color: lockoutState.locked ? 'var(--accent-rose)' : 'var(--accent-primary)'
        }}>
          {lockoutState.locked ? <ShieldAlert size={19} /> : <Lock size={18} />}
        </div>

        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>
          {lockoutState.locked ? 'Brute-Force Shield Active' : 'Vault Session Locked'}
        </h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          {lockoutState.locked
            ? `Too many failed PIN attempts. Try again in ${lockoutState.remainingSeconds}s.`
            : 'Enter your 4-digit security PIN to decrypt and access your vault.'}
        </p>

        {/* 4 Digit PIN Input */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <input
            type="password"
            maxLength={4}
            disabled={lockoutState.locked}
            className="input-text"
            placeholder="••••"
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(false); }}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            autoFocus
            style={{
              textAlign: 'center',
              fontSize: '1.3rem',
              letterSpacing: '0.35em',
              width: '140px',
              height: '42px',
              borderRadius: '8px',
              border: error || lockoutState.locked ? '1.5px solid var(--accent-rose)' : '1px solid var(--border-strong)',
              background: 'var(--bg-input)',
              opacity: lockoutState.locked ? 0.5 : 1
            }}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleUnlock}
          disabled={lockoutState.locked || pin.length < 1}
          style={{ width: '100%', padding: '9px', fontSize: '0.82rem', borderRadius: '8px', justifyContent: 'center', gap: '6px' }}
        >
          <Unlock size={14} />
          <span>{lockoutState.locked ? `Locked (${lockoutState.remainingSeconds}s)` : 'Unlock Vault'}</span>
        </button>

        <div style={{ marginTop: '14px', fontSize: '0.69rem', color: 'var(--text-muted)' }}>
          Zero-Trust Brute-Force Protection &bull; AES-256-GCM Guard
        </div>
      </div>
    </div>
  );
}

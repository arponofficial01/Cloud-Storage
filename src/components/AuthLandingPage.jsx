import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Cloud,
  UserPlus,
  LogIn,
  Lock,
  ArrowRight,
  Database,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  Mail,
  User,
  ShieldCheck
} from 'lucide-react';

export function AuthLandingPage() {
  const { signUp, signIn, authLoading } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(() => {
    const saved = localStorage.getItem('storagebank_remember_email');
    return saved || '';
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (rememberMe) {
      localStorage.setItem('storagebank_remember_email', email.trim());
    } else {
      localStorage.removeItem('storagebank_remember_email');
    }

    setIsSubmitting(true);
    try {
      if (isRegistering) {
        if (!username.trim()) {
          setErrorMsg('Please enter your display name.');
          return;
        }
        const res = await signUp(email.trim(), password, username.trim());
        if (!res.success) {
          setErrorMsg(res.error || 'Registration failed. Please try again.');
        } else {
          setSuccessMsg('Account created successfully! Loading your vault...');
        }
      } else {
        const res = await signIn(email.trim(), password);
        if (!res.success) {
          setErrorMsg(res.error || 'Invalid email or password.');
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100vw',
        background: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0
      }}>
        <Loader2 size={32} color="var(--accent-primary)" className="spin" />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: 'radial-gradient(circle at 50% 8%, rgba(99, 102, 241, 0.09) 0%, var(--bg-primary) 70%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 9999,
      overflowY: 'auto',
      padding: '24px 16px'
    }}>
      {/* Matte Obsidian Center Card */}
      <div style={{
        width: '100%',
        maxWidth: '430px',
        borderRadius: '14px',
        padding: '32px 28px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.55), 0 0 0 1px var(--border-subtle)',
        position: 'relative',
        zIndex: 10,
        margin: 'auto'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '11px',
            background: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px auto',
            color: '#ffffff',
            boxShadow: '0 8px 20px rgba(99, 102, 241, 0.28)'
          }}>
            <Cloud size={24} />
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            StorageBank
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '10px' }}>
            Private, Encrypted Personal Cloud Vault
          </p>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 9px',
            borderRadius: '6px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.7rem',
            color: 'var(--text-secondary)',
            fontWeight: '500'
          }}>
            <ShieldCheck size={12} color="var(--accent-primary)" />
            <span>AES-256 Zero-Knowledge Security</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-input)',
          padding: '2px',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '1px solid var(--border-subtle)'
        }}>
          <button
            type="button"
            onClick={() => { setIsRegistering(false); setErrorMsg(''); setSuccessMsg(''); }}
            style={{
              flex: 1,
              padding: '7px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              background: !isRegistering ? 'var(--bg-surface-hover)' : 'transparent',
              color: !isRegistering ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'all 0.15s ease'
            }}
          >
            <LogIn size={13} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegistering(true); setErrorMsg(''); setSuccessMsg(''); }}
            style={{
              flex: 1,
              padding: '7px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              background: isRegistering ? 'var(--bg-surface-hover)' : 'transparent',
              color: isRegistering ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'all 0.15s ease'
            }}
          >
            <UserPlus size={13} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            Register
          </button>
        </div>

        {/* Error / Success Alerts */}
        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#fca5a5',
            padding: '9px 12px',
            borderRadius: '7px',
            fontSize: '0.8rem',
            marginBottom: '14px',
            textAlign: 'center'
          }}>
            <div>{errorMsg}</div>
          </div>
        )}

        {successMsg && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: '#6ee7b7',
            padding: '9px 12px',
            borderRadius: '7px',
            fontSize: '0.8rem',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            justifyContent: 'center'
          }}>
            <CheckCircle2 size={14} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isRegistering && (
            <div>
              <label className="form-label" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.73rem' }}>
                <User size={12} color="var(--accent-primary)" />
                <span>DISPLAY NAME</span>
              </label>
              <input
                type="text"
                className="input-text"
                placeholder="e.g. Alex Mercer"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                style={{ padding: '8px 12px', fontSize: '0.86rem', borderRadius: '7px', width: '100%' }}
              />
            </div>
          )}

          <div>
            <label className="form-label" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.73rem' }}>
              <Mail size={12} color="var(--accent-primary)" />
              <span>EMAIL ADDRESS</span>
            </label>
            <input
              type="email"
              className="input-text"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={!isRegistering}
              style={{ padding: '8px 12px', fontSize: '0.86rem', borderRadius: '7px', width: '100%' }}
            />
          </div>

          <div>
            <label className="form-label" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.73rem' }}>
              <Lock size={12} color="var(--accent-primary)" />
              <span>PASSWORD</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-text"
                placeholder="Min. 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ padding: '8px 36px 8px 12px', fontSize: '0.86rem', borderRadius: '7px', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  padding: 0
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Remember Me Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
              />
              <span>Remember credentials</span>
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '9px',
              fontSize: '0.86rem',
              fontWeight: '600',
              borderRadius: '7px',
              marginTop: '4px',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            {isSubmitting ? (
              <><Loader2 size={15} className="spin" /> {isRegistering ? 'Creating Account...' : 'Signing In...'}</>
            ) : (
              <><span>{isRegistering ? 'Create Cloud Account' : 'Sign In to Vault'}</span><ArrowRight size={14} /></>
            )}
          </button>
        </form>

        {/* Minimal Footer */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          marginTop: '20px',
          paddingTop: '14px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '0.72rem',
          color: 'var(--text-muted)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Lock size={11} color="var(--accent-primary)" /> Client Encrypted
            </span>
            <span>&bull;</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Database size={11} color="var(--accent-primary)" /> 512 GB Cloud Vault
            </span>
          </div>
          <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
            Developed By <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Arpon Chakraborty</span>
          </div>
        </div>
      </div>
    </div>
  );
}

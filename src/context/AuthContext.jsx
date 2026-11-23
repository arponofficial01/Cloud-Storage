import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isLiveSupabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

const LOCAL_USER_KEY = 'storagebank_local_user';
const LOCAL_USERS_DB_KEY = 'storagebank_registered_accounts';

// Safely write to localStorage without ever crashing on QuotaExceededError
function safeSetLocalStorage(key, valueStr) {
  try {
    localStorage.setItem(key, valueStr);
    return true;
  } catch {
    // Quota exceeded — purge non-essential cached keys and shrink oversized base64 avatars
    try {
      ['aether_ai_chat_history', 'storagebank_ai_chat_history', 'converter_session_history', 'storagebank_activity_logs'].forEach(k => {
        if (k !== key) localStorage.removeItem(k);
      });
      localStorage.setItem(key, valueStr);
      return true;
    } catch {
      return false;
    }
  }
}

// Ensure avatar strings stored in localStorage never exceed ~30KB
function sanitizeAvatarForStorage(avatar) {
  if (!avatar || typeof avatar !== 'string') return '';
  // If an oversized raw base64 image (> 60KB) slipped in, replace with a compact SVG monogram for localStorage safety
  if (avatar.startsWith('data:image/') && !avatar.startsWith('data:image/svg') && avatar.length > 65000) {
    return `data:image/svg+xml;utf8,` + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" rx="24" fill="#18181b"/><circle cx="92" cy="28" r="36" fill="#312e81" opacity="0.65"/><text x="60" y="68" font-family="sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">SB</text></svg>`
    );
  }
  return avatar;
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [theme, setTheme]     = useState('dark');
  const [authLoading, setAuthLoading] = useState(true);

  const applyTheme = (t) => {
    setTheme(t || 'dark');
    document.documentElement.setAttribute('data-theme', t || 'dark');
  };

  const getLocalAccounts = () => {
    try {
      const data = localStorage.getItem(LOCAL_USERS_DB_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  };

  const saveLocalAccount = (acc) => {
    try {
      const accounts = getLocalAccounts();
      const safeAcc = { ...acc, avatar: sanitizeAvatarForStorage(acc.avatar) };
      accounts[acc.email.toLowerCase()] = safeAcc;
      safeSetLocalStorage(LOCAL_USERS_DB_KEY, JSON.stringify(accounts));
    } catch {}
  };

  const buildUser = (supaUser, prof) => {
    if (!supaUser) return null;
    const meta = supaUser.user_metadata || {};

    // Compare timestamps so whichever record (Auth metadata vs profiles table) was updated most recently ALWAYS wins
    const metaTime = meta.settings_updated_at ? new Date(meta.settings_updated_at).getTime() : 0;
    const profTime = prof?.updated_at ? new Date(prof.updated_at).getTime() : 0;
    const preferMeta = metaTime >= profTime;

    const pick = (metaVal, profVal, fallback) => {
      if (preferMeta) {
        if (metaVal !== undefined && metaVal !== null && metaVal !== '') return metaVal;
        if (profVal !== undefined && profVal !== null && profVal !== '') return profVal;
      } else {
        if (profVal !== undefined && profVal !== null && profVal !== '') return profVal;
        if (metaVal !== undefined && metaVal !== null && metaVal !== '') return metaVal;
      }
      return fallback;
    };

    const resolvedPin = preferMeta
      ? (meta.pin !== undefined ? meta.pin : (prof?.pin ?? null))
      : (prof?.pin !== undefined ? prof.pin : (meta.pin ?? null));

    const resolvedAutoLock =
      meta.autolock_minutes !== undefined ? Number(meta.autolock_minutes) : 15;

    if (resolvedPin) {
      safeSetLocalStorage('storagebank_vault_pin', String(resolvedPin));
    } else {
      try { localStorage.removeItem('storagebank_vault_pin'); } catch {}
    }
    if (!isNaN(resolvedAutoLock)) {
      safeSetLocalStorage('storagebank_autolock_minutes', String(resolvedAutoLock));
    }

    return {
      id:              supaUser.id,
      email:           supaUser.email,
      username:        pick(meta.username, prof?.username, supaUser.email?.split('@')[0] || 'Vault Owner'),
      avatar:          pick(meta.avatar_url, prof?.avatar, `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(supaUser.id)}`),
      plan:            pick(meta.plan, prof?.plan, 'Free Tier (512 GB)'),
      theme:           pick(meta.theme, prof?.theme, 'dark'),
      pin:             resolvedPin,
      status:          prof?.status || 'active',
      autoLockMinutes: resolvedAutoLock,
      isLocal:         false
    };
  };

  const createLocalUser = (username, email, password = '') => {
    const safeName = username?.trim() || 'Vault Owner';
    const safeEmail = email?.trim() || 'user@storagebank.vault';
    const id = 'usr_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    const userObj = {
      id,
      email: safeEmail,
      username: safeName,
      password: password || '',
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(safeName)}`,
      plan: 'Free Tier (512 GB)',
      theme: 'dark',
      pin: null,
      isLocal: false
    };
    saveLocalAccount(userObj);
    return userObj;
  };

  const fetchProfile = async (supaUser) => {
    if (!supaUser || !isLiveSupabase) return null;
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 1500));
      const queryPromise = supabase.from('profiles').select('*').eq('id', supaUser.id).maybeSingle();
      const { data } = await Promise.race([queryPromise, timeoutPromise]);
      return data;
    } catch { return null; }
  };

  // Helper to purge ONLY old/deleted Supabase project tokens — NEVER delete the live project token!
  const clearDeadSupabaseTokens = () => {
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-') && (k.includes('hbecbsxdagfcmlrruoxc') || k.includes('tevidnouvazxndgzlvsl'))) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
  };

  useEffect(() => {
    let mounted = true;
    clearDeadSupabaseTokens();

    const syncFromLiveSupabase = async () => {
      if (!isLiveSupabase || !mounted) return;
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SUPABASE_TIMEOUT')), 4000)
        );
        const res = await Promise.race([supabase.auth.getUser(), timeoutPromise]);
        if (!mounted) return;
        const liveSupaUser = res?.data?.user;
        if (liveSupaUser) {
          const prof = await fetchProfile(liveSupaUser);
          if (prof?.status === 'suspended') {
            try { await supabase.auth.signOut(); } catch {}
            localStorage.removeItem(LOCAL_USER_KEY);
            if (mounted) {
              setUser(null);
              setProfile(null);
            }
            return;
          }
          const u = buildUser(liveSupaUser, prof);
          setProfile(prof);
          setUser(u);
          saveLocalAccount(u);
          safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(u));
          applyTheme(u.theme);
        }
      } catch {
        // Offline or no active cloud token — keep local session intact
      }
    };

    const init = async () => {
      // 1. Check if user was previously signed in with a cached session (instant 0ms load!)
      const savedLocal = localStorage.getItem(LOCAL_USER_KEY);
      if (savedLocal) {
        try {
          const parsed = JSON.parse(savedLocal);
          if (parsed && parsed.id) {
            if (!mounted) return;
            setUser(parsed);
            applyTheme(parsed.theme || 'dark');
            setAuthLoading(false);
          }
        } catch {
          localStorage.removeItem(LOCAL_USER_KEY);
        }
      }

      // 2. Always fetch fresh Account Settings (avatar, username, theme, PIN, plan, auto-lock) from live Supabase
      await syncFromLiveSupabase();

      if (mounted) setAuthLoading(false);
    };

    init();

    // Auto-refresh account settings whenever user switches back to this browser/mobile tab
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        syncFromLiveSupabase();
      }
    };
    window.addEventListener('focus', syncFromLiveSupabase);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // Listen to Supabase auth changes if live (handles email confirmation link redirects & token refreshes)
    let subscription = null;
    if (isLiveSupabase) {
      try {
        const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (!mounted) return;
          if (session?.user) {
            const prof = await fetchProfile(session.user);
            if (prof?.status === 'suspended') {
              try { await supabase.auth.signOut(); } catch {}
              localStorage.removeItem(LOCAL_USER_KEY);
              setUser(null);
              setProfile(null);
              setAuthLoading(false);
              return;
            }
            const u    = buildUser(session.user, prof);
            setProfile(prof);
            setUser(u);
            saveLocalAccount(u);
            safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(u));
            applyTheme(u.theme);
            try {
              await supabase.from('profiles').upsert({
                id: u.id,
                email: u.email,
                username: u.username,
                avatar: u.avatar,
                plan: u.plan,
                theme: u.theme,
                updated_at: prof?.updated_at || new Date().toISOString()
              }, { onConflict: 'id' });
            } catch {}
          } else if (event === 'SIGNED_OUT') {
            localStorage.removeItem(LOCAL_USER_KEY);
            setUser(null);
            setProfile(null);
          }
          setAuthLoading(false);
        });
        subscription = data?.subscription;
      } catch {}
    }

    return () => {
      mounted = false;
      window.removeEventListener('focus', syncFromLiveSupabase);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  // ── Auth Actions ──────────────────────────────────────────────────────────
  const signUp = async (email, password, username) => {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    // If live Supabase is active, register with Supabase Auth
    if (isLiveSupabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
            data: { username: cleanUsername }
          }
        });

        if (error) {
          const isNetError = error.message?.includes('fetch') || error.message?.includes('network') || error.status === 0;
          if (!isNetError) {
            return { success: false, error: error.message };
          }
        } else if (data?.user) {
          // Supabase returns an empty identities array if the email is already registered
          if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            return {
              success: false,
              error: 'An account with this email already exists. Please sign in.'
            };
          }

          // Cache account metadata locally so display name & admin directory stay synced
          const pendingRecord = {
            id: data.user.id,
            email: normalizedEmail,
            username: cleanUsername,
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(data.user.id)}`,
            plan: 'Free Tier (512 GB)',
            theme: 'dark',
            pin: null,
            status: 'active',
            createdAt: new Date().toISOString()
          };
          saveLocalAccount(pendingRecord);

          // If Supabase requires email confirmation, data.session will be null
          if (!data.session) {
            return {
              success: true,
              requiresEmailConfirmation: true,
              email: normalizedEmail,
              message: `Confirmation email sent to ${normalizedEmail}. Please verify your email inbox (or spam folder) and then sign in.`
            };
          }

          // If email confirmation is disabled on Supabase and session is returned immediately:
          const prof = await fetchProfile(data.user);
          const u = buildUser(data.user, prof);
          setUser(u);
          saveLocalAccount(u);
          safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(u));
          applyTheme(u.theme);
          return { success: true, user: u };
        }
      } catch {
        // Fall back to local vault account only on network offline failure
      }
    }

    // Offline / Local Vault Registration fallback
    const accounts = getLocalAccounts();
    if (accounts[normalizedEmail]) {
      return { success: false, error: 'An account with this email already exists. Please sign in.' };
    }

    const newUser = createLocalUser(cleanUsername, normalizedEmail, password);
    safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(newUser));
    setUser(newUser);
    applyTheme(newUser.theme);
    return { success: true, user: newUser };
  };

  const signIn = async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();

    // If live Supabase is active, authenticate against Supabase Auth
    if (isLiveSupabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });

        if (error) {
          const msgLower = (error.message || '').toLowerCase();
          if (msgLower.includes('email not confirmed')) {
            return {
              success: false,
              requiresEmailConfirmation: true,
              email: normalizedEmail,
              error: 'Your email is not confirmed yet. Please open the confirmation link sent to your email before signing in.'
            };
          }
          if (msgLower.includes('invalid login credentials')) {
            // Check if this is a local-only account created while offline
            const localAcc = getLocalAccounts()[normalizedEmail];
            if (localAcc && localAcc.password && localAcc.password === password) {
              if (localAcc.status === 'suspended') {
                return { success: false, error: 'This account has been suspended by the administrator.' };
              }
              const cleanExisting = { ...localAcc, avatar: sanitizeAvatarForStorage(localAcc.avatar) };
              safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(cleanExisting));
              setUser(cleanExisting);
              applyTheme(cleanExisting.theme || 'dark');
              return { success: true, user: cleanExisting };
            }
            return {
              success: false,
              error: 'Invalid email or password. If you just registered, make sure you confirmed your email first.'
            };
          }
          const isNetError = msgLower.includes('fetch') || msgLower.includes('network') || error.status === 0;
          if (!isNetError) {
            return { success: false, error: error.message };
          }
        } else if (data?.user) {
          const prof = await fetchProfile(data.user);
          const localCached = getLocalAccounts()[normalizedEmail];
          if (prof?.status === 'suspended' || (!prof && localCached?.status === 'suspended')) {
            try { await supabase.auth.signOut(); } catch {}
            localStorage.removeItem(LOCAL_USER_KEY);
            setUser(null);
            setProfile(null);
            return {
              success: false,
              error: 'This account has been suspended by the administrator.'
            };
          }
          const u = buildUser(data.user, prof || localCached);
          setUser(u);
          saveLocalAccount(u);
          safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(u));
          applyTheme(u.theme);
          try {
            await supabase.from('profiles').upsert({
              id: u.id,
              email: u.email,
              username: u.username,
              avatar: u.avatar,
              plan: u.plan,
              theme: u.theme
            }, { onConflict: 'id' });
          } catch {}
          return { success: true, user: u };
        }
      } catch {
        // Fall back to local vault account on network failure
      }
    }

    // Offline / Local Vault Sign-In fallback
    const accounts = getLocalAccounts();
    const existing = accounts[normalizedEmail];

    if (existing) {
      if (existing.status === 'suspended') {
        return { success: false, error: 'This account has been suspended by the administrator.' };
      }
      if (existing.password && existing.password !== password) {
        return { success: false, error: 'Incorrect password for this account.' };
      }
      const cleanExisting = { ...existing, avatar: sanitizeAvatarForStorage(existing.avatar) };
      safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(cleanExisting));
      setUser(cleanExisting);
      applyTheme(cleanExisting.theme || 'dark');
      return { success: true, user: cleanExisting };
    }

    return { success: false, error: 'No account found with this email. Please register first.' };
  };

  const resendConfirmationEmail = async (email) => {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !isLiveSupabase) {
      return { success: false, error: 'Enter a valid email address to resend confirmation.' };
    }
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
        }
      });
      if (error) return { success: false, error: error.message };
      return {
        success: true,
        message: `New confirmation link sent to ${normalizedEmail}. Check your inbox and spam folder.`
      };
    } catch (err) {
      return { success: false, error: err.message || 'Could not resend confirmation email.' };
    }
  };

  const resetPasswordForEmail = async (email) => {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return { success: false, error: 'Please enter your email address first.' };
    }
    if (!isLiveSupabase) {
      return { success: false, error: 'Password reset email requires an active cloud connection.' };
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
      });
      if (error) return { success: false, error: error.message };
      return {
        success: true,
        message: `Password recovery link sent to ${normalizedEmail}.`
      };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to send password reset email.' };
    }
  };

  const signOut = async () => {
    if (isLiveSupabase) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }
    localStorage.removeItem(LOCAL_USER_KEY);
    clearDeadSupabaseTokens();
    setUser(null);
    setProfile(null);
  };

  const changeTheme = async (newTheme) => {
    applyTheme(newTheme);
    if (user) {
      const now = new Date().toISOString();
      const updated = { ...user, theme: newTheme, avatar: sanitizeAvatarForStorage(user.avatar) };
      setUser({ ...user, theme: newTheme });
      saveLocalAccount(updated);
      safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(updated));
      if (!user.isLocal && isLiveSupabase) {
        try {
          await Promise.all([
            supabase.auth.updateUser({ data: { theme: newTheme, settings_updated_at: now } }),
            supabase.from('profiles').upsert({ id: user.id, email: user.email, theme: newTheme, updated_at: now }, { onConflict: 'id' })
          ]);
        } catch {}
      }
    }
  };

  const updatePin = async (pin) => {
    if (!user) return { success: false, error: 'Not authenticated' };
    const now = new Date().toISOString();
    const cleanPin = pin ? String(pin).trim() : null;
    const updated = { ...user, pin: cleanPin, avatar: sanitizeAvatarForStorage(user.avatar) };
    setUser({ ...user, pin: cleanPin });
    saveLocalAccount(updated);
    safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(updated));
    if (cleanPin) {
      safeSetLocalStorage('storagebank_vault_pin', cleanPin);
    } else {
      localStorage.removeItem('storagebank_vault_pin');
    }
    if (!user.isLocal && isLiveSupabase) {
      try {
        await Promise.all([
          supabase.auth.updateUser({ data: { pin: cleanPin, settings_updated_at: now } }),
          supabase.from('profiles').upsert({ id: user.id, email: user.email, pin: cleanPin, updated_at: now }, { onConflict: 'id' })
        ]);
      } catch {}
    }
    return { success: true };
  };

  const updatePassword = async (newPassword) => {
    if (!user) return { success: false, error: 'Not authenticated' };
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }
    try {
      const updated = { ...user, password: newPassword, avatar: sanitizeAvatarForStorage(user.avatar) };
      setUser({ ...user, password: newPassword });
      saveLocalAccount(updated);
      safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(updated));

      if (!user.isLocal && isLiveSupabase) {
        try {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000));
          await Promise.race([supabase.auth.updateUser({ password: newPassword }), timeoutPromise]);
        } catch {
          // Local vault credentials already updated cleanly
        }
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to update password.' };
    }
  };

  // Real-time profile update — instantly reflects everywhere, persists to localStorage & Supabase Auth + Profiles across all devices
  const updateUserProfile = async ({ username, avatar, plan, autoLockMinutes }) => {
    if (!user) return { success: false, error: 'Not authenticated' };
    try {
      const safeAvatar = avatar !== undefined ? sanitizeAvatarForStorage(avatar) : sanitizeAvatarForStorage(user.avatar);
      const updatedUser = {
        ...user,
        ...(username !== undefined && { username }),
        ...(avatar   !== undefined && { avatar: safeAvatar }),
        ...(plan     !== undefined && { plan }),
        ...(autoLockMinutes !== undefined && { autoLockMinutes })
      };
      setUser(updatedUser);
      saveLocalAccount(updatedUser);
      safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(updatedUser));

      if (!user.isLocal && isLiveSupabase) {
        setProfile(prev => ({
          ...prev,
          ...(username !== undefined && { username }),
          ...(avatar   !== undefined && { avatar: safeAvatar }),
          ...(plan     !== undefined && { plan })
        }));
        try {
          const now = new Date().toISOString();
          const metaUpdates = { settings_updated_at: now };
          if (username !== undefined) metaUpdates.username   = username;
          if (avatar   !== undefined) metaUpdates.avatar_url = safeAvatar;
          if (plan     !== undefined) metaUpdates.plan       = plan;
          if (autoLockMinutes !== undefined) metaUpdates.autolock_minutes = autoLockMinutes;

          const profileUpdates = { id: user.id, email: user.email, updated_at: now };
          if (username !== undefined) profileUpdates.username = username;
          if (avatar   !== undefined) profileUpdates.avatar   = safeAvatar;
          if (plan     !== undefined) profileUpdates.plan     = plan;

          const [authRes, profRes] = await Promise.all([
            supabase.auth.updateUser({ data: metaUpdates }),
            supabase.from('profiles').upsert(profileUpdates, { onConflict: 'id' })
          ]);

          if (authRes?.error) {
            console.warn('[AuthSync] auth.updateUser error:', authRes.error.message);
          }
          if (profRes?.error) {
            console.warn('[AuthSync] profiles.upsert error:', profRes.error.message);
          }
        } catch (syncErr) {
          console.warn('[AuthSync] Cloud sync warning:', syncErr);
        }
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return (
    <AuthContext.Provider value={{
      user, profile, theme, authLoading,
      signUp, signIn, signOut, resendConfirmationEmail, resetPasswordForEmail,
      changeTheme, updatePin, updatePassword, updateUserProfile,
      loginUser:    signIn,
      registerUser: (username, email, password = 'changeme123') => signUp(email, password, username),
      logoutUser:   signOut,
      users:        user ? [user] : [],
      switchUser:   () => {}
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

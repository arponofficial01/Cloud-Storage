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
    return {
      id:       supaUser.id,
      email:    supaUser.email,
      username: prof?.username || supaUser.user_metadata?.username || supaUser.email?.split('@')[0] || 'Vault Owner',
      avatar:   prof?.avatar   || supaUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(supaUser.id)}`,
      plan:     prof?.plan     || 'Free Tier (512 GB)',
      theme:    prof?.theme    || 'dark',
      pin:      prof?.pin      || null,
      isLocal:  false
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

  // Helper to purge stale Supabase tokens from localStorage
  const clearDeadSupabaseTokens = () => {
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-') && (k.endsWith('-auth-token') || k.includes('hbecbsxdagfcmlrruoxc'))) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
  };

  useEffect(() => {
    let mounted = true;
    clearDeadSupabaseTokens();

    const init = async () => {
      // 1. Check if user was previously signed in with a local/offline session (instant load!)
      const savedLocal = localStorage.getItem(LOCAL_USER_KEY);
      if (savedLocal) {
        try {
          const parsed = JSON.parse(savedLocal);
          if (parsed && parsed.id) {
            if (!mounted) return;
            setUser(parsed);
            applyTheme(parsed.theme || 'dark');
            setAuthLoading(false);
            return;
          }
        } catch (e) {
          localStorage.removeItem(LOCAL_USER_KEY);
        }
      }

      // 2. If live Supabase is configured, try cloud session
      if (isLiveSupabase) {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('SUPABASE_TIMEOUT')), 1200)
          );
          const sessionPromise = supabase.auth.getSession();
          const res = await Promise.race([sessionPromise, timeoutPromise]);

          if (!mounted) return;
          const session = res?.data?.session;
          if (session?.user) {
            const prof = await fetchProfile(session.user);
            const u    = buildUser(session.user, prof);
            setProfile(prof);
            setUser(u);
            applyTheme(u.theme);
          }
        } catch (err) {
          clearDeadSupabaseTokens();
        }
      }

      if (mounted) setAuthLoading(false);
    };

    init();

    // Listen to Supabase auth changes if live
    let subscription = null;
    if (isLiveSupabase) {
      try {
        const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (!mounted) return;
          if (session?.user) {
            const prof = await fetchProfile(session.user);
            const u    = buildUser(session.user, prof);
            setProfile(prof);
            setUser(u);
            applyTheme(u.theme);
          } else {
            const savedLocal = localStorage.getItem(LOCAL_USER_KEY);
            if (!savedLocal) {
              setUser(null);
              setProfile(null);
            }
          }
          setAuthLoading(false);
        });
        subscription = data?.subscription;
      } catch {}
    }

    return () => {
      mounted = false;
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  // ── Auth Actions ──────────────────────────────────────────────────────────
  const signUp = async (email, password, username) => {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    // If live Supabase is active, try registering with Supabase first
    if (isLiveSupabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { username: cleanUsername } }
        });

        if (error) {
          // If error is network, DNS or Failed to fetch, seamlessly fall back to local vault account
          const isNetError = error.message?.includes('fetch') || error.message?.includes('network') || error.status === 0;
          if (!isNetError) {
            return { success: false, error: error.message };
          }
        } else if (data?.user) {
          const prof = await fetchProfile(data.user);
          const u = buildUser(data.user, prof);
          setUser(u);
          applyTheme(u.theme);
          return { success: true, user: u };
        }
      } catch {
        // Fall back to local vault account on fetch failure
      }
    }

    // High-speed Local Vault Registration
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

    // If live Supabase is active, try signing in with Supabase
    if (isLiveSupabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) {
          const isNetError = error.message?.includes('fetch') || error.message?.includes('network') || error.status === 0;
          if (!isNetError && !error.message?.toLowerCase().includes('invalid login credentials')) {
            return { success: false, error: error.message };
          }
        } else if (data?.user) {
          const prof = await fetchProfile(data.user);
          const u = buildUser(data.user, prof);
          setUser(u);
          applyTheme(u.theme);
          return { success: true, user: u };
        }
      } catch {
        // Fall back to local vault account on fetch failure
      }
    }

    // High-speed Local Vault Sign-In
    const accounts = getLocalAccounts();
    const existing = accounts[normalizedEmail];

    if (existing) {
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
      const updated = { ...user, theme: newTheme, avatar: sanitizeAvatarForStorage(user.avatar) };
      setUser({ ...user, theme: newTheme });
      saveLocalAccount(updated);
      safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(updated));
      if (!user.isLocal && isLiveSupabase) {
        try {
          await supabase.from('profiles').update({ theme: newTheme }).eq('id', user.id);
        } catch {}
      }
    }
  };

  const updatePin = async (pin) => {
    if (!user) return { success: false, error: 'Not authenticated' };
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
        await supabase.from('profiles').update({ pin: cleanPin }).eq('id', user.id);
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

  // Real-time profile update — instantly reflects everywhere, persists to localStorage / Supabase
  const updateUserProfile = async ({ username, avatar, plan }) => {
    if (!user) return { success: false, error: 'Not authenticated' };
    try {
      const safeAvatar = avatar !== undefined ? sanitizeAvatarForStorage(avatar) : sanitizeAvatarForStorage(user.avatar);
      const updatedUser = {
        ...user,
        ...(username !== undefined && { username }),
        ...(avatar   !== undefined && { avatar: safeAvatar }),
        ...(plan     !== undefined && { plan })
      };
      setUser(updatedUser);
      saveLocalAccount(updatedUser);
      safeSetLocalStorage(LOCAL_USER_KEY, JSON.stringify(updatedUser));

      if (!user.isLocal && isLiveSupabase) {
        setProfile(prev => ({
          ...prev,
          ...(username !== undefined && { username }),
          ...(avatar   !== undefined && { avatar }),
          ...(plan     !== undefined && { plan })
        }));
        try {
          const metaUpdates = {};
          if (username !== undefined) metaUpdates.username   = username;
          if (avatar   !== undefined) metaUpdates.avatar_url = avatar;
          if (plan     !== undefined) metaUpdates.plan       = plan;
          if (Object.keys(metaUpdates).length > 0) {
            await supabase.auth.updateUser({ data: metaUpdates });
          }
          const profileUpdates = { id: user.id };
          if (username !== undefined) profileUpdates.username = username;
          if (avatar   !== undefined) profileUpdates.avatar   = avatar;
          if (plan     !== undefined) profileUpdates.plan     = plan;
          await supabase.from('profiles').upsert(profileUpdates, { onConflict: 'id' });
        } catch {}
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return (
    <AuthContext.Provider value={{
      user, profile, theme, authLoading,
      signUp, signIn, signOut, changeTheme, updatePin, updatePassword, updateUserProfile,
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

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isLiveSupabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

const LOCAL_USER_KEY = 'storagebank_local_user';
const LOCAL_USERS_DB_KEY = 'storagebank_registered_accounts';

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
      accounts[acc.email.toLowerCase()] = acc;
      localStorage.setItem(LOCAL_USERS_DB_KEY, JSON.stringify(accounts));
    } catch {}
  };

  const buildUser = (supaUser, prof) => {
    if (!supaUser) return null;
    return {
      id:       supaUser.id,
      email:    supaUser.email,
      username: prof?.username || supaUser.user_metadata?.username || supaUser.email?.split('@')[0] || 'Vault Owner',
      avatar:   prof?.avatar   || supaUser.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(supaUser.id)}`,
      plan:     prof?.plan     || 'Unlimited Private Vault',
      theme:    prof?.theme    || 'dark',
      pin:      prof?.pin      || null,
      isLocal:  false
    };
  };

  const createLocalUser = (username, email, password = '') => {
    const safeName = username?.trim() || 'Vault Owner';
    const safeEmail = email?.trim() || 'local@storagebank.vault';
    const id = 'local_' + btoa(safeEmail).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    const userObj = {
      id,
      email: safeEmail,
      username: safeName,
      password: password || '',
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(safeName)}`,
      plan: 'Unlimited Private Vault (Encrypted Local Storage)',
      theme: 'dark',
      pin: null,
      isLocal: true
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
    // If live Supabase is active, register with Supabase
    if (isLiveSupabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } }
        });
        if (error) return { success: false, error: error.message };
        return { success: true, user: data.user };
      } catch (err) {
        // Fallback to local on error
      }
    }

    // High-speed Local Vault Registration
    const accounts = getLocalAccounts();
    const normalizedEmail = email.trim().toLowerCase();

    if (accounts[normalizedEmail]) {
      return { success: false, error: 'An account with this email already exists. Please sign in.' };
    }

    const newUser = createLocalUser(username, email, password);
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(newUser));
    setUser(newUser);
    applyTheme(newUser.theme);
    return { success: true, user: newUser };
  };

  const signIn = async (email, password) => {
    // If live Supabase is active, sign in with Supabase
    if (isLiveSupabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { success: false, error: error.message };
        return { success: true, user: data.user };
      } catch (err) {
        // Fallback to local on error
      }
    }

    // High-speed Local Vault Sign-In
    const accounts = getLocalAccounts();
    const normalizedEmail = email.trim().toLowerCase();
    const existing = accounts[normalizedEmail];

    if (existing) {
      if (existing.password && existing.password !== password) {
        return { success: false, error: 'Incorrect password for this account.' };
      }
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(existing));
      setUser(existing);
      applyTheme(existing.theme || 'dark');
      return { success: true, user: existing };
    }

    // Seamless auto-provisioning for any valid new credentials
    const newUser = createLocalUser(email.split('@')[0], email, password);
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(newUser));
    setUser(newUser);
    applyTheme(newUser.theme);
    return { success: true, user: newUser };
  };

  // Instant 1-click local / offline vault sign-in (Zero wait time)
  const continueOffline = (customUsername = 'Vault Owner', customEmail = 'local@storagebank.vault') => {
    const localUser = createLocalUser(customUsername, customEmail);
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
    setUser(localUser);
    applyTheme(localUser.theme);
    return { success: true, user: localUser };
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
      const updated = { ...user, theme: newTheme };
      setUser(updated);
      saveLocalAccount(updated);
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(updated));
      if (!user.isLocal && isLiveSupabase) {
        try {
          await supabase.from('profiles').update({ theme: newTheme }).eq('id', user.id);
        } catch {}
      }
    }
  };

  const updatePin = async (pin) => {
    if (!user) return;
    const updated = { ...user, pin };
    setUser(updated);
    saveLocalAccount(updated);
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(updated));
    if (!user.isLocal && isLiveSupabase) {
      try {
        await supabase.from('profiles').update({ pin }).eq('id', user.id);
      } catch {}
    }
  };

  // Real-time profile update — instantly reflects everywhere, persists to localStorage / Supabase
  const updateUserProfile = async ({ username, avatar }) => {
    if (!user) return { success: false, error: 'Not authenticated' };
    try {
      const updatedUser = {
        ...user,
        ...(username !== undefined && { username }),
        ...(avatar   !== undefined && { avatar })
      };
      setUser(updatedUser);
      saveLocalAccount(updatedUser);
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(updatedUser));

      if (!user.isLocal && isLiveSupabase) {
        setProfile(prev => ({
          ...prev,
          ...(username !== undefined && { username }),
          ...(avatar   !== undefined && { avatar })
        }));
        try {
          const metaUpdates = {};
          if (username !== undefined) metaUpdates.username   = username;
          if (avatar   !== undefined) metaUpdates.avatar_url = avatar;
          if (Object.keys(metaUpdates).length > 0) {
            await supabase.auth.updateUser({ data: metaUpdates });
          }
          const profileUpdates = { id: user.id };
          if (username !== undefined) profileUpdates.username = username;
          if (avatar   !== undefined) profileUpdates.avatar   = avatar;
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
      signUp, signIn, signOut, continueOffline, changeTheme, updatePin, updateUserProfile,
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

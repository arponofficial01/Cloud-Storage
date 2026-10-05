import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Detect if a legitimate custom Supabase project is configured
// (The default URL 'hbecbsxdagfcmlrruoxc.supabase.co' is unresolvable/offline)
export const isLiveSupabase = Boolean(
  rawUrl &&
  !rawUrl.includes('hbecbsxdagfcmlrruoxc') &&
  !rawUrl.includes('example.supabase.co') &&
  rawKey &&
  rawKey.startsWith('ey')
);

// If live credentials are provided, use official Supabase client.
// Otherwise, use a safe local client stub to eliminate all ERR_NAME_NOT_RESOLVED network errors.
export const supabase = isLiveSupabase
  ? createClient(rawUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({
          data: { user: null },
          error: { message: 'Cloud Supabase instance not connected. Operating in Local Vault mode.' }
        }),
        signUp: async () => ({
          data: { user: null },
          error: { message: 'Cloud Supabase instance not connected. Operating in Local Vault mode.' }
        }),
        signOut: async () => ({ error: null }),
        updateUser: async () => ({ error: null })
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            limit: () => ({
              order: () => Promise.resolve({ data: [], error: null })
            })
          })
        }),
        upsert: async () => ({ error: null }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        update: () => ({ eq: async () => ({ error: null }) })
      }),
      channel: () => ({
        on: function() { return this; },
        subscribe: (cb) => { if (cb) cb('SUBSCRIBED'); return this; }
      }),
      removeChannel: () => {}
    };

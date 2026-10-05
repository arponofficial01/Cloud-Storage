-- ==============================================================================
-- StorageBank Cloud Vault — Supabase Database Setup & Schema
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- Project URL: https://tevidnouvazxndgzlvsl.supabase.co
-- ==============================================================================

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id text primary key,
  username text,
  avatar text,
  plan text default 'Unlimited Private Vault',
  theme text default 'dark',
  pin text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- 2. VAULT FILES TABLE
create table if not exists public.vault_files (
  id text primary key,
  user_id text not null,
  folder_id text,
  name text not null,
  type text,
  category text,
  size bigint default 0,
  starred boolean default false,
  in_trash boolean default false,
  tags text[] default '{}'::text[],
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- 3. VAULT FOLDERS TABLE
create table if not exists public.vault_folders (
  id text primary key,
  user_id text not null,
  parent_id text,
  name text not null,
  color text,
  starred boolean default false,
  in_trash boolean default false,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- 4. ACTIVITY LOGS TABLE
create table if not exists public.activity_logs (
  id text primary key,
  user_id text not null,
  action text not null,
  details text,
  timestamp timestamptz default timezone('utc'::text, now()) not null,
  status text default 'success'
);

-- 5. PERFORMANCE INDEXES
create index if not exists idx_vault_files_user on public.vault_files(user_id);
create index if not exists idx_vault_files_folder on public.vault_files(folder_id);
create index if not exists idx_vault_folders_user on public.vault_folders(user_id);
create index if not exists idx_activity_logs_user on public.activity_logs(user_id);
create index if not exists idx_activity_logs_timestamp on public.activity_logs(timestamp desc);

-- 6. ENABLE ROW LEVEL SECURITY (RLS)
alter table public.profiles enable row level security;
alter table public.vault_files enable row level security;
alter table public.vault_folders enable row level security;
alter table public.activity_logs enable row level security;

-- 7. RLS POLICIES (Allow authenticated & anon app operations)
drop policy if exists "Enable access to profiles" on public.profiles;
create policy "Enable access to profiles"
  on public.profiles for all
  using (true)
  with check (true);

drop policy if exists "Enable access to vault_files" on public.vault_files;
create policy "Enable access to vault_files"
  on public.vault_files for all
  using (true)
  with check (true);

drop policy if exists "Enable access to vault_folders" on public.vault_folders;
create policy "Enable access to vault_folders"
  on public.vault_folders for all
  using (true)
  with check (true);

drop policy if exists "Enable access to activity_logs" on public.activity_logs;
create policy "Enable access to activity_logs"
  on public.activity_logs for all
  using (true)
  with check (true);

-- 8. AUTO-CREATE PROFILE TRIGGER FOR NEW SIGNUPS
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar)
  values (
    new.id::text,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/bottts/svg?seed=' || new.id::text)
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 9. ENABLE SUPABASE REALTIME REPLICATION
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'vault_files') then
    alter publication supabase_realtime add table public.vault_files;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'vault_folders') then
    alter publication supabase_realtime add table public.vault_folders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'activity_logs') then
    alter publication supabase_realtime add table public.activity_logs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

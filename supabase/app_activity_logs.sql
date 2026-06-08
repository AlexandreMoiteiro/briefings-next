create extension if not exists pgcrypto;

create table if not exists public.app_activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  module text not null,
  action text not null,

  session_id text,
  pilot text,
  aircraft_type text,
  registration text,
  label text,

  summary jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,

  user_agent text
);

alter table public.app_activity_logs enable row level security;

create index if not exists app_activity_logs_created_at_idx
  on public.app_activity_logs (created_at desc);

create index if not exists app_activity_logs_module_idx
  on public.app_activity_logs (module);

create index if not exists app_activity_logs_registration_idx
  on public.app_activity_logs (registration);

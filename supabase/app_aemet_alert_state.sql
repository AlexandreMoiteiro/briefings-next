-- Estado exclusivo do monitor interno. Não é exposto aos visitantes.
create table if not exists public.aemet_alert_state (
  monitor_key text primary key,
  status text not null check (status in ('healthy', 'alert')),
  last_notified_at timestamptz,
  detail text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.aemet_alert_state enable row level security;
revoke all on table public.aemet_alert_state from anon, authenticated;
grant select, insert, update on table public.aemet_alert_state to service_role;

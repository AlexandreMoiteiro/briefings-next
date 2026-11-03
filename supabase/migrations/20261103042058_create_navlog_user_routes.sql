-- Private NavLog routes. The existing public library stays unchanged while the
-- new account-based experience is reviewed in Vercel Preview.
create table if not exists public.navlog_user_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  waypoints jsonb not null check (
    case when jsonb_typeof(waypoints) = 'array'
      then jsonb_array_length(waypoints) between 2 and 120
      else false
    end
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint navlog_user_routes_waypoints_size check (octet_length(waypoints::text) <= 65536)
);

create index if not exists navlog_user_routes_user_updated_idx
  on public.navlog_user_routes (user_id, updated_at desc);

alter table public.navlog_user_routes enable row level security;
revoke all on table public.navlog_user_routes from anon, authenticated;
grant select, insert, update, delete on table public.navlog_user_routes to authenticated;

create policy "NavLog users select their routes"
  on public.navlog_user_routes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "NavLog users insert their routes"
  on public.navlog_user_routes for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "NavLog users update their routes"
  on public.navlog_user_routes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "NavLog users delete their routes"
  on public.navlog_user_routes for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.navlog_user_routes_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger navlog_user_routes_touch_updated_at
  before update on public.navlog_user_routes
  for each row execute function public.navlog_user_routes_touch_updated_at();

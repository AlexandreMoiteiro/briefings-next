-- Public, read-only metadata for the routes selected by Briefings admin.
-- Keep it separate from the legacy route table: that table still has old
-- permissive write policies until the new NavLog reaches production.
create table public.navlog_route_curation (
  route_id uuid primary key references public.navlog_perfect_routes(id) on delete cascade,
  is_default boolean not null default false,
  category text check (category in ('VFR', 'IFR')),
  updated_at timestamptz not null default now()
);

create index navlog_route_curation_default_idx
  on public.navlog_route_curation (is_default) where is_default = true;

alter table public.navlog_route_curation enable row level security;
revoke all on public.navlog_route_curation from anon, authenticated;
grant select on public.navlog_route_curation to anon, authenticated;

create policy "Read Briefings route curation"
  on public.navlog_route_curation for select to anon, authenticated
  using (true);

-- The write API calls this function from the server using an encrypted,
-- short-lived admin cookie. The code must also match the DB admin code.
create function public.admin_update_navlog_route(
  p_admin_code text,
  p_route_id uuid,
  p_name text,
  p_description text,
  p_waypoints jsonb,
  p_category text,
  p_is_default boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_code text;
  next_route_text text;
  updated_count integer;
begin
  select value into expected_code
  from public.app_admin_settings where key = 'admin_usage_code';
  if expected_code is null or p_admin_code is distinct from expected_code then
    raise exception 'Not authorized' using errcode = '28000';
  end if;

  if p_route_id is null or char_length(btrim(coalesce(p_name, ''))) not between 1 and 100
    or char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'Invalid route details' using errcode = '22023';
  end if;
  if p_category is not null and p_category not in ('VFR','IFR') then
    raise exception 'Invalid category' using errcode = '22023';
  end if;
  if p_waypoints is null or jsonb_typeof(p_waypoints) <> 'array' then
    raise exception 'Invalid route points' using errcode = '22023';
  end if;
  if jsonb_array_length(p_waypoints) not between 2 and 120
    or octet_length(p_waypoints::text) > 65536 then
    raise exception 'Route too large' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_waypoints) as p(value)
    where jsonb_typeof(p.value) <> 'object'
      or jsonb_typeof(p.value->'lat') <> 'number'
      or jsonb_typeof(p.value->'lon') <> 'number'
      or char_length(coalesce(p.value->>'code','')) not between 1 and 16
  ) then
    raise exception 'Invalid waypoint' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_waypoints) as p(value)
    where (p.value->>'lat')::numeric not between -90 and 90
      or (p.value->>'lon')::numeric not between -180 and 180
  ) then
    raise exception 'Invalid waypoint coordinates' using errcode = '22023';
  end if;

  select string_agg(upper(p.value->>'code'), ' ' order by p.ord)
  into next_route_text
  from jsonb_array_elements(p_waypoints) with ordinality as p(value, ord);

  update public.navlog_perfect_routes
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description,'')),''),
      route_text = next_route_text,
      waypoints = p_waypoints,
      tags = array_remove(array_remove(coalesce(tags, '{}'::text[]), 'VFR'), 'IFR')
        || case when p_category is null then '{}'::text[] else array[p_category] end,
      updated_at = now()
  where id = p_route_id and is_public = true;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Route not found' using errcode = 'P0002';
  end if;

  insert into public.navlog_route_curation(route_id, is_default, category, updated_at)
  values (p_route_id, coalesce(p_is_default, false), p_category, now())
  on conflict(route_id) do update
  set is_default = excluded.is_default,
      category = excluded.category,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.admin_update_navlog_route(text,uuid,text,text,jsonb,text,boolean) from public;
grant execute on function public.admin_update_navlog_route(text,uuid,text,text,jsonb,text,boolean) to anon, authenticated;

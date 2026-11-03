-- Edit a legacy route's title, description and visibility without changing its
-- waypoints. Some of the 95 imported routes use `name` instead of `code` on
-- waypoints, so curation alone must not silently rewrite their flight paths.
create function public.admin_update_navlog_route_metadata(
  p_admin_code text,
  p_route_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_is_default boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_code text;
  updated_count integer;
begin
  select value into expected_code from public.app_admin_settings where key = 'admin_usage_code';
  if expected_code is null or p_admin_code is distinct from expected_code then
    raise exception 'Not authorized' using errcode = '28000';
  end if;
  if p_route_id is null or char_length(btrim(coalesce(p_name, ''))) not between 1 and 100
    or char_length(coalesce(p_description, '')) > 1000
    or (p_category is not null and p_category not in ('VFR', 'IFR')) then
    raise exception 'Invalid route details' using errcode = '22023';
  end if;

  update public.navlog_perfect_routes
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description,'')),''),
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

revoke all on function public.admin_update_navlog_route_metadata(text,uuid,text,text,text,boolean) from public;
grant execute on function public.admin_update_navlog_route_metadata(text,uuid,text,text,text,boolean) to anon, authenticated;

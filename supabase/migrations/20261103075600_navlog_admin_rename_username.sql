-- Account administration is gated by the same Admin session and DB code
-- as the existing NavLog route curation tools.
create function public.update_navlog_username_admin(
  p_admin_code text,
  p_user_id uuid,
  p_username text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  expected_code text;
  trimmed_username text := btrim(coalesce(p_username, ''));
begin
  select value into expected_code from public.app_admin_settings where key = 'admin_usage_code';
  if expected_code is null or p_admin_code is distinct from expected_code then
    raise exception 'Not authorized' using errcode = '28000';
  end if;
  if trimmed_username !~ '^[A-Za-z0-9._-]{3,24}$' then
    raise exception 'Invalid username' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    return false;
  end if;

  insert into public.navlog_user_profiles(user_id, username)
  values (p_user_id, trimmed_username)
  on conflict(user_id) do update set username = excluded.username;
  return true;
end;
$$;

revoke all on function public.update_navlog_username_admin(text,uuid,text) from public;
grant execute on function public.update_navlog_username_admin(text,uuid,text) to anon, authenticated;

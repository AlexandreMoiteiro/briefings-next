-- Public-facing users may choose a FlightLogger-style nickname, but the
-- nickname never acts as an authorization claim. Private routes still use
-- Supabase auth.uid() and are inaccessible to other users.
create table public.navlog_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9._-]{3,24}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index navlog_user_profiles_username_ci
  on public.navlog_user_profiles (lower(username));

alter table public.navlog_user_profiles enable row level security;
revoke all on public.navlog_user_profiles from anon, authenticated;
grant select, update on public.navlog_user_profiles to authenticated;

create policy "Read own NavLog profile"
  on public.navlog_user_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Update own NavLog profile"
  on public.navlog_user_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.navlog_profile_created()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  nickname text;
begin
  nickname := btrim(coalesce(new.raw_user_meta_data->>'username', ''));
  if nickname ~ '^[A-Za-z0-9._-]{3,24}$' then
    insert into public.navlog_user_profiles(user_id, username)
    values (new.id, nickname);
  end if;
  return new;
end;
$$;

create trigger navlog_profile_on_auth_signup
  after insert on auth.users
  for each row execute function public.navlog_profile_created();

create function public.navlog_profile_touch()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger navlog_profile_touch
  before update on public.navlog_user_profiles
  for each row execute function public.navlog_profile_touch();

-- Only the existing encrypted Admin session plus matching DB admin code
-- can access account details. Never expose auth.users through a view.
create function public.get_navlog_accounts_admin(
  p_admin_code text,
  p_limit integer default 500
) returns table (
  user_id uuid,
  email text,
  username text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  route_count bigint,
  last_route_updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  expected_code text;
begin
  select value into expected_code from public.app_admin_settings where key = 'admin_usage_code';
  if expected_code is null or p_admin_code is distinct from expected_code then
    raise exception 'Not authorized' using errcode = '28000';
  end if;

  return query
    select u.id, u.email::text, p.username,
      u.created_at, u.last_sign_in_at, u.email_confirmed_at,
      count(r.id)::bigint, max(r.updated_at)
    from auth.users u
    left join public.navlog_user_profiles p on p.user_id = u.id
    left join public.navlog_user_routes r on r.user_id = u.id
    group by u.id, u.email, p.username, u.created_at, u.last_sign_in_at, u.email_confirmed_at
    order by u.created_at desc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

revoke all on function public.get_navlog_accounts_admin(text,integer) from public;
grant execute on function public.get_navlog_accounts_admin(text,integer) to anon, authenticated;

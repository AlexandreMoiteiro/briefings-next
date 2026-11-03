-- A modest per-account cap helps prevent accidental or abusive storage usage.
-- The route payload is also limited to 64 KiB and 120 points in the base schema.
create or replace function public.navlog_user_routes_limit_per_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialise concurrent inserts by the same account to prevent quota races.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  if (select count(*) from public.navlog_user_routes where user_id = new.user_id) >= 100 then
    raise exception 'Maximum of 100 saved routes per account reached'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger navlog_user_routes_limit_per_user
  before insert on public.navlog_user_routes
  for each row execute function public.navlog_user_routes_limit_per_user();

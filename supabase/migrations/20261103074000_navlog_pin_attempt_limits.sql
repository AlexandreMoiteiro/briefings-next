-- A four-digit PIN has very low entropy, so application sign-in must be
-- rate-limited persistently in Postgres rather than in Vercel process memory.
create table public.navlog_pin_attempt_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0,
  started_at timestamptz not null default now()
);

alter table public.navlog_pin_attempt_limits enable row level security;
revoke all on public.navlog_pin_attempt_limits from anon, authenticated;

create function public.navlog_pin_attempt_guard(
  p_identity_hash text,
  p_ip_hash text,
  p_clear_identity boolean default false
) returns table (is_allowed boolean, retry_after_seconds integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  next_attempts integer;
  current_start timestamptz;
  request_time timestamptz := now();
  first_key text;
  second_key text;
  next_key text;
  max_attempts integer;
  wait_seconds integer := 0;
  allowed_result boolean := true;
begin
  if p_identity_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid auth rate limit key';
  end if;

  if p_clear_identity then
    delete from public.navlog_pin_attempt_limits where key_hash = p_identity_hash;
    return query select true, 0;
    return;
  end if;

  first_key := p_identity_hash;
  second_key := p_ip_hash;
  for next_key, max_attempts in
    select first_key, 5 union all select second_key, 30
  loop
    insert into public.navlog_pin_attempt_limits (key_hash, attempts, started_at)
    values (next_key, 1, request_time)
    on conflict (key_hash) do update
      set attempts = case when navlog_pin_attempt_limits.started_at < request_time - interval '15 minutes'
        then 1 else navlog_pin_attempt_limits.attempts + 1 end,
        started_at = case when navlog_pin_attempt_limits.started_at < request_time - interval '15 minutes'
          then request_time else navlog_pin_attempt_limits.started_at end
    returning attempts, started_at into next_attempts, current_start;

    if next_attempts > max_attempts then
      allowed_result := false;
      wait_seconds := greatest(wait_seconds, ceil(extract(epoch from current_start + interval '15 minutes' - request_time))::integer);
    end if;
  end loop;

  return query select allowed_result, greatest(wait_seconds, 0);
end;
$$;

revoke all on function public.navlog_pin_attempt_guard(text,text,boolean) from public, anon, authenticated;
grant execute on function public.navlog_pin_attempt_guard(text,text,boolean) to service_role;

create or replace function public.get_app_usage_events_admin(
  p_admin_code text,
  p_limit integer default 100
)
returns table(
  id uuid,
  created_at timestamptz,
  client_id text,
  event_type text,
  module text,
  title text,
  aircraft_type text,
  registration text,
  summary jsonb,
  payload jsonb,
  user_agent text,
  url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_code text;
  safe_limit integer;
begin
  select value
  into expected_code
  from public.app_admin_settings
  where key = 'admin_usage_code';

  if expected_code is null or p_admin_code is distinct from expected_code then
    raise exception 'Invalid admin code' using errcode = '28000';
  end if;

  safe_limit := least(greatest(coalesce(p_limit, 100), 1), 100);

  return query
  select
    e.id,
    e.created_at,
    e.client_id,
    e.event_type,
    e.module,
    e.title,
    e.aircraft_type,
    e.registration,
    e.summary,
    e.payload,
    e.user_agent,
    e.url
  from public.app_usage_events e
  order by e.created_at desc
  limit safe_limit;
end;
$$;

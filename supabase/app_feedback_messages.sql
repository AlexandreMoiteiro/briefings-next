create table if not exists public.app_feedback_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id text not null,
  name text not null,
  email text,
  kind text not null default 'suggestion' check (kind in ('suggestion', 'question', 'issue', 'other')),
  subject text not null default '',
  message text not null,
  page_url text,
  user_agent text,
  status text not null default 'open' check (status in ('open', 'read', 'resolved'))
);

create index if not exists app_feedback_messages_created_at_idx
  on public.app_feedback_messages (created_at desc);
create index if not exists app_feedback_messages_status_idx
  on public.app_feedback_messages (status, created_at desc);
create index if not exists app_feedback_messages_client_id_idx
  on public.app_feedback_messages (client_id, created_at desc);

alter table public.app_feedback_messages enable row level security;
revoke all on table public.app_feedback_messages from anon, authenticated;

create or replace function public.submit_app_feedback_message(
  p_client_id text,
  p_name text,
  p_email text,
  p_kind text,
  p_subject text,
  p_message text,
  p_page_url text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result_id uuid;
  clean_client text := left(trim(coalesce(p_client_id, '')), 200);
  clean_name text := left(trim(coalesce(p_name, '')), 120);
  clean_email text := nullif(left(trim(coalesce(p_email, '')), 200), '');
  clean_kind text := lower(left(trim(coalesce(p_kind, 'suggestion')), 20));
  clean_subject text := left(trim(coalesce(p_subject, '')), 160);
  clean_message text := left(trim(coalesce(p_message, '')), 4000);
begin
  if clean_client = '' then
    raise exception 'Missing client identifier';
  end if;
  if char_length(clean_name) < 2 then
    raise exception 'Enter your name';
  end if;
  if clean_kind not in ('suggestion', 'question', 'issue', 'other') then
    clean_kind := 'other';
  end if;
  if clean_email is not null and (position('@' in clean_email) < 2 or position('.' in split_part(clean_email, '@', 2)) < 2) then
    raise exception 'Enter a valid email address or leave it blank';
  end if;
  if char_length(clean_message) < 10 then
    raise exception 'Message is too short';
  end if;

  select id into result_id
  from public.app_feedback_messages
  where client_id = clean_client
    and message = clean_message
    and created_at > now() - interval '1 minute'
  order by created_at desc
  limit 1;

  if result_id is not null then
    return result_id;
  end if;

  insert into public.app_feedback_messages (
    client_id, name, email, kind, subject, message, page_url, user_agent
  ) values (
    clean_client,
    clean_name,
    clean_email,
    clean_kind,
    clean_subject,
    clean_message,
    left(coalesce(p_page_url, ''), 1000),
    left(coalesce(p_user_agent, ''), 500)
  ) returning id into result_id;

  return result_id;
end;
$$;

create or replace function public.get_app_feedback_messages_admin(
  p_admin_code text,
  p_limit integer default 200
)
returns table(
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  client_id text,
  name text,
  email text,
  kind text,
  subject text,
  message text,
  page_url text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_code text;
  safe_limit integer;
begin
  select value into expected_code
  from public.app_admin_settings
  where key = 'admin_usage_code';

  if expected_code is null or p_admin_code is distinct from expected_code then
    raise exception 'Invalid admin code' using errcode = '28000';
  end if;

  safe_limit := least(greatest(coalesce(p_limit, 200), 1), 500);

  return query
  select
    m.id,
    m.created_at,
    m.updated_at,
    m.client_id,
    m.name,
    m.email,
    m.kind,
    m.subject,
    m.message,
    m.page_url,
    m.status
  from public.app_feedback_messages m
  order by m.created_at desc
  limit safe_limit;
end;
$$;

create or replace function public.set_app_feedback_message_status_admin(
  p_admin_code text,
  p_message_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_code text;
  clean_status text := lower(trim(coalesce(p_status, '')));
begin
  select value into expected_code
  from public.app_admin_settings
  where key = 'admin_usage_code';

  if expected_code is null or p_admin_code is distinct from expected_code then
    raise exception 'Invalid admin code' using errcode = '28000';
  end if;

  if clean_status not in ('open', 'read', 'resolved') then
    raise exception 'Invalid status';
  end if;

  update public.app_feedback_messages
  set status = clean_status,
      updated_at = now()
  where id = p_message_id;
end;
$$;

grant execute on function public.submit_app_feedback_message(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_app_feedback_messages_admin(text, integer) to anon, authenticated;
grant execute on function public.set_app_feedback_message_status_admin(text, uuid, text) to anon, authenticated;

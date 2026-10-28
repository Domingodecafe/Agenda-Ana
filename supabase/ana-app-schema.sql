-- Agenda Ana independente. Não altera agenda_snapshots nem a agenda original.
begin;
create schema if not exists ana_private;
revoke all on schema ana_private from public, anon;
grant usage on schema ana_private to authenticated, service_role;

create table ana_private.admin_emails (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table ana_private.admin_emails enable row level security;
revoke all on ana_private.admin_emails from public, anon, authenticated;
grant all on ana_private.admin_emails to service_role;

create function ana_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join ana_private.admin_emails a on a.email = lower(u.email)
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null
      and not coalesce((u.raw_app_meta_data->>'is_anonymous')::boolean,false)
      and (u.banned_until is null or u.banned_until < now())
  );
$$;
revoke all on function ana_private.is_admin() from public, anon;
grant execute on function ana_private.is_admin() to authenticated, service_role;
create function public.ana_app_is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$ select ana_private.is_admin(); $$;
revoke all on function public.ana_app_is_admin() from public, anon;
grant execute on function public.ana_app_is_admin() to authenticated, service_role;

create table public.ana_app_state (
  owner_id uuid primary key references auth.users(id),
  revision bigint not null check (revision > 0),
  payload jsonb not null check (
    jsonb_typeof(payload) is not distinct from 'object'
    and jsonb_typeof(payload->'clients') is not distinct from 'array'
    and jsonb_typeof(payload->'appointments') is not distinct from 'array'
    and jsonb_typeof(payload->'settings') is not distinct from 'object'
  ),
  updated_at timestamptz not null default now()
);
create table public.ana_app_events (
  owner_id uuid primary key references auth.users(id),
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null default now()
);
create table public.ana_app_agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  agent_user_id uuid not null unique references auth.users(id),
  name text not null,
  enabled boolean not null default false,
  scopes text[] not null default '{}',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  check (owner_id <> agent_user_id),
  check (scopes <@ array['availability','sessions','book','reschedule','cancel','forward']::text[])
);
create index ana_app_agents_owner on public.ana_app_agents(owner_id);
create table public.ana_app_tool_contexts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  agent_user_id uuid not null references auth.users(id),
  phone text not null check (phone ~ '^[0-9]{10,15}$'),
  patient_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index ana_app_tool_context_owner on public.ana_app_tool_contexts(owner_id,agent_user_id);

alter table public.ana_app_state enable row level security;
alter table public.ana_app_events enable row level security;
alter table public.ana_app_agents enable row level security;
alter table public.ana_app_tool_contexts enable row level security;
revoke all on public.ana_app_state,public.ana_app_events,public.ana_app_agents,public.ana_app_tool_contexts from public,anon,authenticated;
grant all on public.ana_app_state,public.ana_app_events,public.ana_app_agents,public.ana_app_tool_contexts to service_role;
grant select on public.ana_app_events to authenticated;
create policy ana_app_events_owner on public.ana_app_events for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.ana_app_is_admin()));

create function public.ana_app_commit(p_owner_id uuid,p_expected_revision bigint,p_payload jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare next_revision bigint;
begin
  if p_owner_id is null or p_expected_revision is null or p_expected_revision < 0 then raise exception 'DADOS_INVALIDOS'; end if;
  if p_expected_revision=0 then
    insert into public.ana_app_state(owner_id,revision,payload) values(p_owner_id,1,p_payload)
    on conflict(owner_id) do nothing returning revision into next_revision;
  else
    update public.ana_app_state set revision=revision+1,payload=p_payload,updated_at=now()
    where owner_id=p_owner_id and revision=p_expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'CONFLITO_REVISAO'; end if;
  insert into public.ana_app_events(owner_id,revision,updated_at) values(p_owner_id,next_revision,now())
    on conflict(owner_id) do update set revision=excluded.revision,updated_at=excluded.updated_at;
  return next_revision;
end;
$$;
revoke all on function public.ana_app_commit(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.ana_app_commit(uuid,bigint,jsonb) to service_role;

alter publication supabase_realtime add table public.ana_app_events;
commit;

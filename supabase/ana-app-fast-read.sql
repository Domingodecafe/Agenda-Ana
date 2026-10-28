begin;
-- Leitura autenticada em uma ida ao banco; apenas o próprio administrador.
create function ana_private.open_admin_agenda() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  if not ana_private.is_admin() then return null; end if;
  select jsonb_build_object('revision',revision,'payload',payload) into snapshot
    from public.ana_app_state where owner_id=(select auth.uid());
  return jsonb_build_object('ownerId',(select auth.uid()),'snapshot',snapshot);
end;
$$;
revoke all on function ana_private.open_admin_agenda() from public,anon;
grant execute on function ana_private.open_admin_agenda() to authenticated;
create function public.ana_app_open() returns jsonb
language sql stable security invoker set search_path = '' as $$ select ana_private.open_admin_agenda(); $$;
revoke all on function public.ana_app_open() from public,anon;
grant execute on function public.ana_app_open() to authenticated;
commit;

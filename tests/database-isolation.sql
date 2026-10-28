-- Somente fixtures fictícias; a transação é revertida no final.
begin;
create temp table ana_test_ids(a uuid,b uuid) on commit drop;
insert into ana_test_ids values(gen_random_uuid(),gen_random_uuid());
grant select on ana_test_ids to authenticated,service_role;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
select a,'ana-test-a-'||a::text||'@example.invalid',now(),'{}'::jsonb from ana_test_ids
union all select b,'ana-test-b-'||b::text||'@example.invalid',now(),'{}'::jsonb from ana_test_ids;
insert into ana_private.admin_emails(email)
select 'ana-test-a-'||a::text||'@example.invalid' from ana_test_ids
union all select 'ana-test-b-'||b::text||'@example.invalid' from ana_test_ids;
set local role service_role;
select public.ana_app_commit(a,0,'{"clients":[],"appointments":[],"settings":{}}') from ana_test_ids;
select public.ana_app_commit(b,0,'{"clients":[],"appointments":[],"settings":{}}') from ana_test_ids;
do $$ begin
  begin
    perform public.ana_app_commit((select a from ana_test_ids),0,'{"clients":[],"appointments":[],"settings":{}}');
    raise exception 'TESTE_FALHOU: duplicação aceita';
  exception when others then
    if sqlerrm not like '%CONFLITO_REVISAO%' then raise; end if;
  end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',a::text,'role','authenticated')::text,true) from ana_test_ids;
do $$ begin
  if not public.ana_app_is_admin() then raise exception 'TESTE_FALHOU: administrador não reconhecido'; end if;
  if (select count(*) from public.ana_app_events)<>1 then raise exception 'TESTE_FALHOU: RLS dos eventos'; end if;
  if has_table_privilege(current_user,'public.ana_app_state','SELECT') then raise exception 'TESTE_FALHOU: snapshot direto exposto'; end if;
  if has_table_privilege(current_user,'public.ana_app_agents','INSERT') then raise exception 'TESTE_FALHOU: criação de agente direta'; end if;
  if has_function_privilege(current_user,'public.ana_app_commit(uuid,bigint,jsonb)','EXECUTE') then raise exception 'TESTE_FALHOU: escrita privilegiada exposta'; end if;
end $$;
set local role anon;
do $$ begin
  if has_table_privilege(current_user,'public.ana_app_events','SELECT') then raise exception 'TESTE_FALHOU: eventos anônimos'; end if;
end $$;
reset role;
rollback;

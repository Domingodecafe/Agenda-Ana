import {test} from 'node:test';import assert from 'node:assert/strict';
import '../ana-policy.js';import '../ana-agenda-model.js';
import {createHandler} from '../supabase/functions/agenda-ana/handler.mjs';
const now=AnaPolicy.stamp('2026-10-28','08:00');
function setup({kind='agent',scopes=['availability','sessions','book','cancel','forward'],context=true}={}){
  let s=AnaPolicy.execute(AnaPolicy.empty(),{requestId:'setup',role:'henrique',action:'patient',name:'TESTE PRIVADO',phone:'5543999990501',modality:'Online'},now).state;
  s.clients[0].notes='NOTA QUE NÃO PODE CHEGAR AO AGENTE';
  const handler=createHandler({authenticate:async()=>({id:'agent-user'}),authorize:async()=>kind?{kind,ownerId:'owner-user',scopes}:null,policy:AnaPolicy,model:AnaAgendaModel,now:()=>now,
    repository:{async read(owner){assert.equal(owner,'owner-user');return {revision:s.revision,payload:s};},async write(_owner,_token,revision,next){assert.equal(revision,s.revision);s=next;return next.revision;},async context(owner,agent,id){assert.equal(owner,'owner-user');assert.equal(agent,'agent-user');return context&&id==='trusted-context'?{phone:'5543999990501',expires_at:'2026-10-29T12:00:00Z'}:null;}}
  });
  return body=>handler(new Request('http://localhost',{method:'POST',headers:{Authorization:'Bearer test-token'},body:JSON.stringify(body)}));
}
test('usuário autenticado sem autorização não acessa a agenda',async()=>{const call=setup({kind:null});assert.equal((await call({operation:'read'})).status,403);});
test('agente não recebe snapshot nem faz gravação administrativa',async()=>{const call=setup();for(const operation of ['read','save','command','profile'])assert.equal((await call({operation})).status,403);});
test('agente só utiliza ferramentas explicitamente autorizadas',async()=>{const call=setup({scopes:['sessions']});assert.equal((await call({operation:'tool',tool:'book',contextId:'trusted-context',requestId:'x'})).status,403);});
test('contexto verificado é obrigatório e identidade não vem dos argumentos',async()=>{const call=setup();assert.equal((await call({operation:'tool',tool:'sessions',contextId:'other',requestId:'x'})).status,403);assert.equal((await call({operation:'tool',tool:'sessions',contextId:'trusted-context',requestId:'x',args:{phone:'5543999999999'}})).status,400);});
test('resultado de ferramenta não contém snapshot, observações ou sessão administrativa',async()=>{const call=setup();const r=await call({operation:'tool',tool:'availability',contextId:'trusted-context',requestId:'x'});assert.equal(r.status,200);const text=await r.text();assert.ok(!text.includes('NOTA QUE'));assert.ok(!text.includes('"state"'));assert.ok(!text.includes('access_token'));assert.ok(JSON.parse(text).result.options.length>0);});
test('agendamento e reenvio do agente usam idempotência sem revelar estado',async()=>{const call=setup();const body={operation:'tool',tool:'book',contextId:'trusted-context',requestId:'book',args:{date:'2026-10-29',start:'14:00',modality:'Online'}};assert.equal((await call(body)).status,200);const repeat=await (await call(body)).json();assert.equal(repeat.result.repeated,true);assert.equal(repeat.state,undefined);});

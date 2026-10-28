import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../ana-policy.js';
import '../ana-agenda-model.js';
import '../ana-supabase-adapter.js';
import {createHandler} from '../supabase/functions/agenda-ana/handler.mjs';
const policy=globalThis.AnaPolicy,model=globalThis.AnaAgendaModel,now=policy.stamp('2026-10-28','08:00');
const owner='00000000-0000-4000-8000-000000000001';
function setup({anonymous=false,writeFailure=false}={}){
  let row=null,writes=0,reads=[];
  const repository={async read(id){reads.push(id);return structuredClone(row);},async write(id,_token,expected,payload){assert.equal(id,owner);if(writeFailure)throw new Error('sensitive database failure');if((row?.revision||0)!==expected)throw new Error('CONFLITO_REVISAO');row={revision:expected+1,payload:structuredClone(payload)};writes++;return row.revision;}};
  const handler=createHandler({authenticate:async token=>token==='test-session'?{id:owner,is_anonymous:anonymous}:null,authorize:async()=>({kind:'admin',ownerId:owner}),repository,policy,model,now:()=>now});
  const request=(body,headers={})=>handler(new Request('http://localhost/functions/v1/agenda-ana',{method:'POST',headers:{Authorization:'Bearer test-session','Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
  return {request,handler,get writes(){return writes;},get row(){return row;},reads};
}
const patient={requestId:'patient-test',expectedRevision:0,role:'henrique',action:'patient',name:'TESTE API',phone:'5543999990201',defaultValue:170,modality:'Online'};

test('API Supabase preparada autentica antes de consultar qualquer agenda',async()=>{
  const x=setup();const res=await x.request({operation:'read'},{Authorization:''});assert.equal(res.status,401);assert.equal(x.reads.length,0);
  const y=setup({anonymous:true});assert.equal((await y.request({operation:'read'})).status,401);assert.equal(y.reads.length,0);
});
test('proprietário vem da autenticação; owner_id no corpo é recusado',async()=>{
  const x=setup();assert.equal((await x.request({operation:'read',owner_id:'other'})).status,400);assert.equal(x.reads.length,0);
  const r=await x.request({operation:'read'});assert.equal(r.status,200);assert.deepEqual(x.reads,[owner]);assert.equal((await r.json()).state.clients.length,0);
});
test('comando confirmado é persistido por CAS e reenvio não cria outra revisão',async()=>{
  const x=setup(),first=await x.request({operation:'command',command:patient});assert.equal(first.status,200);assert.equal(x.writes,1);
  const again=await x.request({operation:'command',command:patient});assert.equal(again.status,200);assert.equal((await again.json()).result.repeated,true);assert.equal(x.writes,1);
});
test('API recusa edição desatualizada sem alterar estado',async()=>{
  const x=setup();const stale=await (await x.request({operation:'read'})).json();await x.request({operation:'command',command:patient});
  const conflict=await x.request({operation:'save',state:stale.state});assert.equal(conflict.status,409);assert.equal(x.row.payload.clients.length,1);assert.equal(x.writes,1);
});
test('duas requisições simultâneas não ocupam a mesma vaga',async()=>{
  const x=setup();await x.request({operation:'command',command:patient});
  const make=requestId=>x.request({operation:'command',command:{requestId,phone:patient.phone,action:'book',date:'2026-10-29',start:'14:00'}});
  const results=await Promise.all([make('book-a'),make('book-b')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(x.row.payload.appointments.length,1);
});
test('falha ao gravar não responde agendamento concluído nem vaza detalhes internos',async()=>{
  const x=setup({writeFailure:true});const r=await x.request({operation:'command',command:patient});assert.equal(r.status,500);assert.equal(await r.text(),'{"error":"OPERACAO_NAO_CONFIRMADA"}');assert.equal(x.row,null);
});
test('CORS, métodos e JSON inválido são recusados',async()=>{
  const x=setup();assert.equal((await x.request({operation:'read'},{Origin:'https://other.example'})).status,403);
  assert.equal((await x.handler(new Request('http://localhost',{method:'GET'}))).status,405);
  const r=await x.handler(new Request('http://localhost',{method:'POST',headers:{Authorization:'Bearer test-session'},body:'{'}));assert.equal(r.status,400);
});
test('adaptador Supabase é opt-in e não faz chamadas na criação',async()=>{
  let calls=0;const adapter=AnaSupabaseAdapter.create({url:'https://dpdxzbbzymkygutwefww.supabase.co',publishableKey:'sb_publishable_FICTICIO',getAccessToken:async()=>null,fetchImpl:async()=>{calls++;}});
  assert.equal(calls,0);await assert.rejects(adapter.read(),/conta administrativa/);assert.equal(calls,0);
  assert.throws(()=>AnaSupabaseAdapter.create({url:'https://other.supabase.co'}),/Secretaria Ana/);
});
test('adaptador comunica conflito sem criar confirmação local',async()=>{
  const adapter=AnaSupabaseAdapter.create({url:'https://dpdxzbbzymkygutwefww.supabase.co',publishableKey:'sb_publishable_FICTICIO',getAccessToken:async()=>'test-session',fetchImpl:async()=>new Response('{}',{status:409})});
  await assert.rejects(adapter.dispatch({requestId:'test',action:'book'}),/mudou no servidor/);
});

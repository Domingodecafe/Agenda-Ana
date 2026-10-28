// Execução manual com fixtures descartáveis em test-results (fora do Git).
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import '../ana-public-config.js';import '../ana-supabase-adapter.js';
const fixtures=JSON.parse(await readFile(new URL('../test-results/auth-fixtures.local.json',import.meta.url),'utf8'));
assert.ok(fixtures.length===2&&fixtures.every(f=>f.email.endsWith('@example.invalid')),'Somente contas fictícias');
const {cloudUrl:url,publishableKey:key}=AnaPublicConfig;
const clients=[],channels=[];let passed=0;
async function session(fixture){const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const {error}=await client.auth.signInWithPassword(fixture);if(error)throw error;clients.push(client);return client;}
const adapter=client=>AnaSupabaseAdapter.create({url,publishableKey:key,getAccessToken:async()=>(await client.auth.getSession()).data.session?.access_token});
const command=(remote,action,fields={})=>remote.dispatch({requestId:crypto.randomUUID(),action,...fields});
try{
  const a=await session(fixtures[0]),a2=await session(fixtures[0]),b=await session(fixtures[1]);
  const remote=adapter(a),second=adapter(a2),other=adapter(b);
  assert.equal((await remote.profile()).displayName,'HenriqueFerreira');passed++;
  const original=await remote.read();assert.equal(original.clients.length,0);passed++;
  let eventResolve;const event=new Promise(resolve=>{eventResolve=resolve;});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Realtime não conectou em 15 segundos.')),15000);
    a2.auth.getSession().then(async({data})=>{await a2.realtime.setAuth(data.session.access_token);
      const channel=a2.channel('fixture-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'ana_app_events',filter:'owner_id=eq.'+fixtures[0].id},payload=>eventResolve(payload.new))
        .on('system',{},payload=>{if(payload.status==='ok'&&payload.extension==='postgres_changes'){clearTimeout(timeout);resolve();}})
        .subscribe(status=>{if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timeout);reject(new Error(status));}});channels.push([a2,channel]);
    }).catch(reject);
  });
  const started=performance.now();
  const created=await command(remote,'patient',{role:'henrique',name:'TESTE NUVEM A',phone:'5543999990601',defaultValue:170,modality:'Online'});
  let eventTimer;const signal=await Promise.race([event,new Promise((_,reject)=>{eventTimer=setTimeout(()=>reject(new Error('Evento Realtime ausente.')),15000);})]);clearTimeout(eventTimer);
  assert.deepEqual(Object.keys(signal).sort(),['owner_id','revision','updated_at']);assert.equal((await second.read()).clients[0].name,'TESTE NUVEM A');
  const latencyMs=Math.round(performance.now()-started);passed++;
  assert.equal((await other.read()).clients.length,0);passed++;
  const tomorrow=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  // Escolhe um dia útil futuro independentemente do dia da execução.
  let date=tomorrow;while([0,6].includes(new Date(date+'T15:00:00-03:00').getUTCDay()))date=new Date(Date.parse(date+'T15:00:00-03:00')+86400000).toISOString().slice(0,10);
  const results=await Promise.allSettled([command(remote,'book',{phone:'5543999990601',date,start:'14:00',modality:'Online'}),command(second,'book',{phone:'5543999990601',date,start:'14:00',modality:'Online'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await remote.read()).appointments.length,1);passed++;
  await assert.rejects(remote.save(original),/mudou/);passed++;
  const direct=await a.from('ana_app_state').select('*');assert.ok(direct.error);passed++;
  await command(remote,'forward',{phone:'5543999990601',text:'PEDIDO FICTÍCIO PARA HENRIQUE'});
  let current=await second.read();assert.equal(current.requests.at(-1).status,'pending');passed++;
  await command(remote,'takeover',{role:'henrique',phone:'5543999990601'});assert.equal((await second.read()).conversations['5543999990601'].mode,'human');passed++;
  await command(remote,'resolve',{role:'henrique',pendingId:current.requests.at(-1).id});current=await second.read();assert.equal(current.requests.at(-1).status,'resolved');passed++;
  await command(remote,'resume',{role:'henrique',phone:'5543999990601'});assert.equal((await second.read()).conversations['5543999990601'].mode,'ana');passed++;
  const repeated={requestId:crypto.randomUUID(),action:'forward',phone:'5543999990601',text:'TESTE IDEMPOTÊNCIA'};await remote.dispatch(repeated);const first=(await remote.read()).revision;assert.equal((await remote.dispatch(repeated)).result.repeated,true);assert.equal((await remote.read()).revision,first);passed++;
  assert.equal((await other.read()).requests.length,0);passed++;
  const summary={checksPassed:passed,realtimeToSecondDeviceIncludingReadMs:latencyMs,latencyGoalMs:2000,goalMet:latencyMs<=2000,realPatientDataUsed:false,testAccountsRequireCleanup:true};
  await writeFile(new URL('../test-results/cloud-integration.json',import.meta.url),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{for(const [client,channel]of channels)await client.removeChannel(channel);for(const c of clients)await c.auth.signOut({scope:'local'});}

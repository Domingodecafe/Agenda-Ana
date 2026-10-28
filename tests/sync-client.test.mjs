import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../ana-sync-client.js';
const state=revision=>({revision,clients:[],appointments:[],settings:{}});
function setup({online=true,cached,remoteState=state(1),failure=false}={}){
  let connected=online,server=remoteState,failed=failure,callback,reads=0,writes=0;const saved=new Map(cached?[[cached.ownerId,cached]]:[]),scheduled=[];
  const remote={async read(){reads++;if(failed)throw new Error('Falha simulada');return structuredClone(server);},async save(s){writes++;return {...s,revision:s.revision+1};},async dispatch(){writes++;return {state:state(server.revision+1),result:{text:'Concluído'}};},subscribe(fn){callback=fn;return()=>{};}};
  const client=AnaSyncClient.create({remote,ownerId:'owner-a',cache:{async get(o){return saved.get(o);},async set(o,v){saved.set(o,v);},async remove(o){saved.delete(o);}},online:()=>connected,clock:()=>12345,schedule:(fn,delay)=>{scheduled.push({fn,delay});return scheduled.length;},cancel:()=>{}});
  return {client,saved,scheduled,change:()=>callback(),connect:v=>{connected=v;},fail:v=>{failed=v;},server:s=>{server=s;},get reads(){return reads;},get writes(){return writes;}};
}
test('busca inicial salva cache com proprietário e instante de sincronização',async()=>{
  const x=setup();assert.equal((await x.client.read()).revision,1);assert.equal(x.client.info().readOnly,false);assert.equal(x.saved.get('owner-a').syncedAt,12345);
});
test('offline permite consulta da cópia e recusa todas as escritas',async()=>{
  const x=setup({online:false,cached:{ownerId:'owner-a',state:state(4),syncedAt:100}});
  assert.equal((await x.client.read()).revision,4);await assert.rejects(x.client.save(state(4)),/Conecte-se/);await assert.rejects(x.client.dispatch({}),/Conecte-se/);assert.equal(x.writes,0);
});
test('cache de outra conta nunca é exibido',async()=>{
  const x=setup({online:false,cached:{ownerId:'owner-b',state:state(9)}});await assert.rejects(x.client.read(),/Nenhuma cópia/);
});
test('reconexão busca versão atual; não transmite alterações locais offline',async()=>{
  const x=setup();await x.client.read();x.connect(false);await x.client.refresh();x.server(state(5));x.connect(true);await x.client.refresh();assert.equal((await x.client.read()).revision,5);assert.equal(x.writes,0);
});
test('eventos Realtime são agrupados sem consultas constantes',async()=>{
  const x=setup();await x.client.read();x.change();assert.equal(x.scheduled[0].delay,100);assert.equal(x.reads,1);x.server(state(3));await x.scheduled[0].fn();await x.client.refresh();assert.equal((await x.client.read()).revision,3);
});
test('erros de rede usam cópia somente leitura e programam nova tentativa',async()=>{
  const x=setup();await x.client.read();x.fail(true);await x.client.refresh();assert.equal(x.client.info().readOnly,true);assert.equal(x.scheduled[0].delay,1000);assert.equal((await x.client.read()).revision,1);
});
test('logout remove cache e impede novos acessos',async()=>{
  const x=setup();await x.client.read();await x.client.stop();assert.equal(x.saved.size,0);await assert.rejects(x.client.refresh(),/encerrada/);
});
test('gravação só retorna após confirmação remota e atualiza revisão',async()=>{
  const x=setup();await x.client.read();assert.equal((await x.client.save(state(1))).revision,2);assert.equal((await x.client.read()).revision,2);
});

test('logout aguarda gravação em curso e impede recriação tardia do cache',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});const saved=new Map();
  const x=AnaSyncClient.create({ownerId:'a',online:()=>true,remote:{async read(){return state(1);},async save(){await gate;return state(2);},subscribe(){return()=>{};}},cache:{async get(){return saved.get('a');},async set(o,v){saved.set(o,v);},async remove(o){saved.delete(o);}}});
  await x.read();const writing=x.save(state(1));const stopping=x.stop();release();await assert.rejects(writing,/encerrada/);await stopping;assert.equal(saved.size,0);
});
test('falha do cache não transforma gravação confirmada no servidor em falha de operação',async()=>{
  const x=AnaSyncClient.create({ownerId:'a',online:()=>true,remote:{async read(){return state(1);},async save(){return state(2);},subscribe(){return()=>{};}},cache:{async get(){return null;},async set(){throw new Error('quota');},async remove(){}}});
  await x.read();assert.equal((await x.save(state(1))).revision,2);assert.equal(x.info().readOnly,false);assert.match(x.info().error,/Salvo no servidor/);
});

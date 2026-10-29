import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const environment=await read('ana-environment.js'),worker=await read('sw.js');
const base='http://127.0.0.1:43189/ana-app/';
function setup(scope=base){
  const events=new Map(),matches=[],cached=[];
  const c=vm.createContext({URL,location:new URL('sw.js',base),registration:{scope},
    addEventListener:(name,fn)=>events.set(name,fn),importScripts(){},
    clients:{claim:async()=>{}},
    caches:{async open(name){assert.equal(name,'ana-app-pwa-v5');return {async match(key){matches.push(key);return 'COPY-ONLY';},async addAll(files){cached.push(...files);}}},match(){throw new Error('Proibido consultar cache global');},keys(){throw new Error('Proibido enumerar caches');},delete(){throw new Error('Proibido excluir caches');}},
    fetch(){throw new Error('Requisição externa inesperada');}
  });c.self=c;vm.runInContext(environment,c);
  return {c,events,matches,cached};
}
test('PWA copiada não aceita worker na raiz nem identidade da original',async()=>{
  const x=setup('http://127.0.0.1:43189/');assert.throws(()=>vm.runInContext(worker,x.c),/Escopo/);
  const m=JSON.parse(await read('manifest.webmanifest'));assert.equal(m.id,'/ana-app/agenda-ana-local');assert.equal(m.scope,'/ana-app/');
});
test('worker usa somente cache próprio e inclui modelo compartilhado no offline',async()=>{
  const x=setup();vm.runInContext(worker,x.c);let pending;x.events.get('install')({waitUntil(p){pending=p;}});await pending;
  assert.ok(x.cached.includes('./ana-agenda-model.js?v=ana-app-4'));
  for(const path of x.cached)if(!path.includes('vendor/'))await read(path.slice(2).split('?')[0]);
});
test('navegação para o painel mantém sua página em vez de receber a agenda',async()=>{
  const x=setup();vm.runInContext(worker,x.c);
  for(const path of ['','ana-console.html']){
    let result;const req={url:base+path,method:'GET',mode:'navigate'};
    x.events.get('fetch')({request:req,respondWith:p=>{result=p;}});assert.equal(await result,'COPY-ONLY');
    assert.equal(path===''?x.matches.at(-1):x.matches.at(-1).url,path===''?'./index.html':base+path);
  }
});
test('worker ignora origem original, laboratório anterior e endpoints de servidor',()=>{
  const x=setup();vm.runInContext(worker,x.c);
  for(const url of ['https://domingodecafe.github.io/Agenda/','http://127.0.0.1:43188/ana-dev/',base+'functions/agenda-ana'])x.events.get('fetch')({request:{url,method:'GET',mode:'cors'},respondWith(){assert.fail('Não deve interceptar.');}});
});

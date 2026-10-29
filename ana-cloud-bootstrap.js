/* Conta, conexão e cache da cópia; nenhuma chave privada é usada no cliente. */
(() => {
  'use strict';
  const env=globalThis.AnaEnvironment;
  if(!env?.isAllowed()||!env.networkEnabled)return;
  const sdk=globalThis.AnaSupabaseSDK;
  const client=sdk.createClient(env.cloudUrl,env.publishableKey,{auth:{storageKey:'ana-app-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  let sync,remote,account,changing=false,initialized=false;
  let generation=0;
  const listeners=new Set();
  function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('ana-app-cloud-cache-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('accounts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  let cacheQueue=Promise.resolve();
  function cacheOperation(owner,value,remove=false){
    const operation=cacheQueue.then(async()=>{const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('accounts',value||remove?'readwrite':'readonly'),store=tx.objectStore('accounts');const req=remove?store.delete(owner):value?store.put(value,owner):store.get(owner);let result;req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}});
    cacheQueue=operation.catch(()=>{});return operation;
  }
  const cache={get:o=>cacheOperation(o),set:(o,v)=>cacheOperation(o,v),remove:o=>cacheOperation(o,null,true)};
  const $=s=>document.querySelector(s);
  function tell(message){$('#auth-error').textContent=message;}
  function status(){return sync?.info()||{status:account?'connecting':'signed-out',readOnly:true,syncedAt:null,revision:0};}
  function emit(){const info=status();listeners.forEach(fn=>fn(info));document.dispatchEvent(new CustomEvent('ana-connection',{detail:info}));}
  function gate(show){$('#auth-gate').hidden=!show;$('#app')?.setAttribute('aria-hidden',String(show));$('#app')?.classList.toggle('hidden',show);document.querySelector('main')?.classList.toggle('auth-locked',show);}
  const ready=new Promise(resolve=>{globalThis.AnaCloudReady=resolve;});
  async function connect(session){
    if(changing)return;changing=true;const g=++generation;
    gate(true);document.dispatchEvent(new Event('ana-account-changing'));
    try{
      if(sync){await sync.stop();await remote?.close();sync=null;}
      account=session?.user||null;
      if(!account){gate(true);emit();return;}
      const expectedOwner=account.id;
      remote=AnaSupabaseAdapter.create({url:env.cloudUrl,publishableKey:env.publishableKey,client,ownerId:expectedOwner,
        getAccessToken:async()=>{const {data,error}=await client.auth.getSession();if(error)throw error;if(data.session?.user?.id!==expectedOwner)throw new Error('A conta mudou. Entre novamente.');return data.session?.access_token;},
        onRealtimeStatus:s=>{if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(s))$('#realtime-status')?.replaceChildren(document.createTextNode('Reconectando atualizações…'));else if(s==='READY')$('#realtime-status')?.replaceChildren(document.createTextNode('Atualizações automáticas entre dispositivos'));}
      });
      if(navigator.onLine)await remote.profile();
      sync=AnaSyncClient.create({remote,cache,ownerId:account.id});sync.subscribe(emit);
      await sync.read();if(g!==generation)return;
      gate(false);tell('');emit();
      if(!initialized){initialized=true;globalThis.AnaCloudReady();}else document.dispatchEvent(new Event('ana-account-ready'));
    }catch(error){await remote?.close();tell(error.message);gate(true);if(account&&!navigator.onLine)tell('Não há uma cópia offline disponível para essa sessão. Conecte-se para entrar.');}
    finally{changing=false;}
  }
  const requireSync=()=>{if(!sync)throw new Error('Entre com sua conta para abrir a agenda.');return sync;};
  const store={ready,read:()=>requireSync().read(),save:s=>requireSync().save(s),dispatch:c=>requireSync().dispatch(c),refresh:()=>requireSync().refresh(),info:status,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  globalThis.AnaAgendaStore=store;globalThis.AnaLocalStore=store;
  globalThis.AnaCloud={store,client,async logout(){
    generation++;gate(true);
    const previous=account;account=null;
    await Promise.allSettled([sync?.stop(),remote?.close()]);sync=null;
    await client.auth.signOut({scope:'local'});if(previous)await cache.remove(previous.id).catch(()=>{});
    // A memória da página também é descartada; nenhum dado da outra conta permanece na UI.
    location.replace(env.basePath);
  }};
  document.addEventListener('DOMContentLoaded',async()=>{
    const panel=document.createElement('section');panel.id='auth-gate';panel.className='auth-gate';
    panel.innerHTML=`<div class="auth-card"><span class="eyebrow">AGENDA ANA</span><h1>Seu atendimento, em um só lugar.</h1><p>Entre com seu e-mail e senha para acessar a agenda.</p><form id="auth-form"><label>E-mail<input id="auth-email" type="email" autocomplete="email" required></label><label>Senha<input id="auth-password" type="password" autocomplete="current-password" required minlength="6"></label><button class="primary-button" type="submit">Entrar</button></form><p id="auth-error" role="status" aria-live="polite"></p><p class="auth-note">HenriqueFerreira · Acesso administrativo restrito.</p></div>`;
    document.body.append(panel);gate(true);
    let sending=false;
    $('#auth-form').addEventListener('submit',async e=>{
      e.preventDefault();if(sending)return;
      if(!navigator.onLine){tell('Conecte-se à internet para entrar.');return;}
      sending=true;const button=$('#auth-form button');button.disabled=true;tell('Entrando…');
      try{
        const password=$('#auth-password').value;$('#auth-password').value='';
        const {data,error}=await client.auth.signInWithPassword({email:$('#auth-email').value.trim(),password});
        if(error)throw error;
        await connect(data.session);
      }catch(error){tell(error.code==='invalid_credentials'?'E-mail ou senha incorretos. Confira e tente novamente.':error.status===429?'Muitas tentativas. Aguarde um minuto e tente novamente.':error.message);}
      finally{sending=false;button.disabled=false;}
    });
    try{const {data,error}=await client.auth.getSession();if(error)throw error;if(data.session)await connect(data.session);}catch(e){tell(e.message);}
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'){generation++;const old=sync;sync=null;account=null;gate(true);document.dispatchEvent(new Event('ana-account-changing'));old?.stop().catch(()=>{});remote?.close().catch(()=>{});emit();}
      if(event==='SIGNED_IN'&&session&&(!account||account.id!==session.user.id))setTimeout(()=>connect(session),0);
      if(event==='TOKEN_REFRESHED'&&session)setTimeout(()=>sync?.refresh().catch(()=>{}),0);
    });
    for(const ev of ['online','focus','pageshow'])window.addEventListener(ev,()=>sync?.refresh().catch(()=>{}));
    window.addEventListener('offline',()=>sync?.refresh().catch(()=>{}));
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync?.refresh().catch(()=>{});});
  });
})();

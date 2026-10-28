/* Conexão compartilhada, cache por conta e apenas consultas quando offline. */
(() => {
  'use strict';
  function create({remote,cache,ownerId,online=()=>navigator.onLine,clock=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}){
    let snapshot=null,syncedAt=null,readOnly=true,status='connecting',error='',attempt=0,timer=null,pending=null,generation=0,stopped=false;
    const listeners=new Set();
    const activeWrites=new Set();
    const info=()=>({status,readOnly,syncedAt,revision:snapshot?.revision??0,error});
    const emit=()=>listeners.forEach(fn=>fn(info()));
    const notifyFailure=e=>{error=e?.message||'Falha de conexão.';readOnly=true;status=online()?'error':'offline';emit();};
    async function cached(){const value=await cache.get(ownerId);if(value?.ownerId===ownerId){snapshot=value.state;syncedAt=value.syncedAt;}return snapshot;}
    function retry(){if(stopped||timer||!online())return;const delay=[1000,2000,4000,8000,15000,30000][Math.min(attempt++,5)];timer=schedule(()=>{timer=null;refresh().catch(()=>{});},delay);}
    function refresh(){
      if(stopped)return Promise.reject(new Error('Sessão encerrada.'));
      if(pending)return pending;
      const currentGeneration=generation;
      const operation=(async()=>{
        if(!online()){if(!snapshot)await cached();status='offline';readOnly=true;emit();return snapshot;}
        try{
          const next=await remote.read();if(stopped||generation!==currentGeneration)throw new Error('Sessão encerrada.');
          let warning='';
          if(!snapshot||next.revision>=snapshot.revision){snapshot=next;syncedAt=clock();try{await cache.set(ownerId,{ownerId,state:next,syncedAt});}catch{warning='A cópia offline não pôde ser atualizada neste dispositivo.';}}
          attempt=0;status='online';readOnly=false;error=warning;emit();return snapshot;
        }catch(e){if(stopped)throw e;await cached();notifyFailure(e);retry();if(!snapshot)throw e;return snapshot;}
      })();
      pending=operation.finally(()=>{pending=null;});return pending;
    }
    async function performWrite(action,value){
      if(stopped||!online()||readOnly)throw new Error('Conecte-se e atualize a agenda para salvar alterações.');
      if(pending)await pending;
      const g=generation;
      try{
        const response=await remote[action](value);
        if(stopped||g!==generation)throw new Error('Sessão encerrada.');
        snapshot=action==='save'?response:response.state;syncedAt=clock();
        error='';try{await cache.set(ownerId,{ownerId,state:snapshot,syncedAt});}catch{error='Salvo no servidor; a cópia offline não pôde ser atualizada.';}status='online';emit();return response;
      }catch(e){notifyFailure(e);retry();throw e;}
    }
    function write(action,value){const operation=performWrite(action,value);activeWrites.add(operation);return operation.finally(()=>activeWrites.delete(operation));}
    let debounce=null;
    function changed(){if(debounce)cancel(debounce);debounce=schedule(()=>{debounce=null;refresh().catch(()=>{});},100);}
    const unsubscribe=remote.subscribe(changed);
    return {
      async read(){if(snapshot)return structuredClone(snapshot);await cached();await refresh();if(!snapshot)throw new Error('Nenhuma cópia disponível. Entre e conecte-se ao servidor.');return structuredClone(snapshot);},
      refresh,save:s=>write('save',s),dispatch:c=>write('dispatch',c),
      subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},info,
      async stop(){stopped=true;generation++;if(timer)cancel(timer);if(debounce)cancel(debounce);unsubscribe?.();await Promise.allSettled([pending,...activeWrites].filter(Boolean));snapshot=null;listeners.clear();await cache.remove(ownerId);}
    };
  }
  globalThis.AnaSyncClient={create};
})();

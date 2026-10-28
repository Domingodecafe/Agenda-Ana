/* Agenda e Ana usam uma fonte única. Escritas são atômicas e verificam revisão. */
(() => {
  'use strict';
  const env=globalThis.AnaEnvironment;
  if(!env?.isAllowed()||env.networkEnabled)return;
  const clone=value=>structuredClone(value);
  const {normalize,materialize,prepareManual}=globalThis.AnaAgendaModel;
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(env.database+'-changes'):null;
  const listeners=new Set();
  channel?.addEventListener('message',()=>listeners.forEach(fn=>fn()));
  function open(){return new Promise((resolve,reject)=>{
    const req=indexedDB.open(env.database,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(env.store);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });}
  async function transaction(mutator){
    const db=await open();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction(env.store,mutator?'readwrite':'readonly');
      const store=tx.objectStore(env.store),req=store.get(env.stateKey);
      let result,error;
      req.onsuccess=()=>{
        try{
          const current=normalize(req.result);
          result=mutator?mutator(current):current;
          if(mutator)store.put(result.state,env.stateKey);
        }catch(e){error=e;tx.abort();}
      };
      tx.oncomplete=()=>{if(mutator)channel?.postMessage({revision:result.state.revision});resolve(result);};
      tx.onabort=()=>reject(error||tx.error||new Error('Não foi possível salvar a agenda local.'));
    });}finally{db.close();}
  }
  async function save(draft,now=Date.now()){
    const snapshot=clone(draft);
    return (await transaction(current=>({state:prepareManual(current,snapshot,now)}))).state;
  }
  async function dispatch(command,now=Date.now()){
    return transaction(current=>{
      if(command.expectedRevision!=null&&command.expectedRevision!==current.revision&&!Object.hasOwn(current.receipts,command.requestId))throw new Error('A agenda mudou. Recarregue os dados antes de salvar a edição do cadastro.');
      const answer=AnaPolicy.execute(current,command,now);
      answer.state=materialize(answer.state);return answer;
    });
  }
  globalThis.AnaAgendaStore={read:()=>transaction(),save,dispatch,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  // Interface reaproveitada pelo painel da Ana; não existe uma segunda agenda.
  globalThis.AnaLocalStore=globalThis.AnaAgendaStore;
})();

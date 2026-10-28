/* Adaptador opt-in para a API administrativa; não conecta nem autentica ao importar. */
(() => {
  'use strict';
  function create({url,publishableKey,getAccessToken,fetchImpl=globalThis.fetch,client,ownerId,onRealtimeStatus=()=>{}}){
    if(url!=='https://dpdxzbbzymkygutwefww.supabase.co')throw new Error('Use somente o projeto Secretaria Ana DEV nesta etapa.');
    if(!/^sb_publishable_[\w-]+$/.test(publishableKey||''))throw new Error('Chave publishable necessária.');
    if(typeof getAccessToken!=='function')throw new Error('Sessão administrativa necessária.');
    const listeners=new Set();
    let channel,closed=false;
    if(client&&ownerId){Promise.resolve().then(async()=>{
      const token=await getAccessToken();if(closed||!token)return;
      await client.realtime.setAuth(token);if(closed)return;
      channel=client.channel('ana-app-'+ownerId)
        .on('postgres_changes',{event:'*',schema:'public',table:'ana_app_events',filter:'owner_id=eq.'+ownerId},()=>listeners.forEach(fn=>fn()))
        .on('system',{},payload=>{if(payload.extension==='postgres_changes'&&payload.status==='ok'){onRealtimeStatus('READY');listeners.forEach(fn=>fn());}else if(payload.status==='error')onRealtimeStatus('CHANNEL_ERROR');})
        .subscribe(onRealtimeStatus);
    }).catch(()=>onRealtimeStatus('CHANNEL_ERROR'));}
    async function call(body){
      const token=await getAccessToken();if(!token)throw new Error('Entre com a conta administrativa.');
      const response=await fetchImpl(url+'/functions/v1/agenda-ana',{method:'POST',headers:{'Content-Type':'application/json',apikey:publishableKey,Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:globalThis.AbortSignal?.timeout?.(15000)});
      if(response.status===409)throw new Error('A agenda mudou no servidor. Recarregue e revise a alteração.');
      if(response.status===401)throw new Error('Sua sessão expirou. Entre novamente.');
      if(response.status===403)throw new Error('Essa conta não está autorizada para esta agenda.');
      if(response.status===400){const body=await response.json();throw new Error(body.message||'Confira os dados da operação.');}
      if(!response.ok)throw new Error('O servidor não confirmou a operação.');
      const result=await response.json();
      if(body.operation==='profile')return result;
      if(!result.state||!Number.isSafeInteger(result.state.revision))throw new Error('Resposta inválida do servidor.');
      return result;
    }
    return {
      read:async()=>(await call({operation:'read'})).state,
      profile:async()=>(await call({operation:'profile'})).profile,
      save:async state=>{const result=await call({operation:'save',state});listeners.forEach(fn=>fn());return result.state;},
      dispatch:async command=>{const result=await call({operation:'command',command});listeners.forEach(fn=>fn());return result;},
      subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
      async close(){closed=true;listeners.clear();if(channel)await client.removeChannel(channel);}
    };
  }
  globalThis.AnaSupabaseAdapter={create};
})();

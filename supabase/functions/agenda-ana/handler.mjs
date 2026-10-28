/* API administrativa preparada localmente; nenhuma função é publicada por este arquivo. */
export function createHandler({authenticate,authorize=async()=>null,repository,policy,model,now=()=>Date.now(),allowedOrigin='http://127.0.0.1:43189',allowedOrigins=[allowedOrigin,'https://domingodecafe.github.io']}) {
  return async request=>{
    const origin=request.headers.get('origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    if(allowedOrigins.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'});
    const reply=(status,value)=>new Response(JSON.stringify(value),{status,headers});
    if(origin&&!allowedOrigins.includes(origin))return reply(403,{error:'ORIGEM_NAO_PERMITIDA'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return reply(405,{error:'METODO_NAO_PERMITIDO'});
    const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    if(!token)return reply(401,{error:'AUTENTICACAO_NECESSARIA'});
    let account;
    try{account=await authenticate(token);}catch{return reply(401,{error:'AUTENTICACAO_INVALIDA'});}
    if(!account?.id||account.is_anonymous)return reply(401,{error:'AUTENTICACAO_INVALIDA'});
    try{
      const principal=await authorize(account,token);
      if(!principal?.ownerId)return reply(403,{error:'ACESSO_NAO_AUTORIZADO'});
      if(Number(request.headers.get('content-length')||0)>1048576)return reply(413,{error:'REQUISICAO_MUITO_GRANDE'});
      const raw=await request.text();if(raw.length>1048576)return reply(413,{error:'REQUISICAO_MUITO_GRANDE'});
      let body;try{body=JSON.parse(raw);}catch{return reply(400,{error:'JSON_INVALIDO'});}
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['operation','state','command','tool','contextId','args','requestId'].includes(k)))return reply(400,{error:'CAMPOS_INVALIDOS'});
      if(!['read','save','command','tool','profile'].includes(body.operation))return reply(400,{error:'OPERACAO_INVALIDA'});
      if(principal.kind!=='admin'&&body.operation!=='tool')return reply(403,{error:'FERRAMENTA_NAO_AUTORIZADA'});
      if(body.operation==='profile')return reply(200,{profile:{displayName:'HenriqueFerreira',ownerId:principal.ownerId,role:'admin'}});
      let toolCommand;
      if(body.operation==='tool'){
        if(principal.kind!=='agent'||!principal.scopes?.includes(body.tool))return reply(403,{error:'FERRAMENTA_NAO_AUTORIZADA'});
        const schemas={availability:['date'],sessions:['date','month'],book:['date','start','modality','count'],reschedule:['appointmentId','date','start','modality'],cancel:['appointmentId','date'],forward:['text']};
        const keys=schemas[body.tool],args=body.args||{};
        if(!keys||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!keys.includes(k)))return reply(400,{error:'ARGUMENTOS_INVALIDOS'});
        const context=await repository.context(principal.ownerId,account.id,body.contextId);
        if(!context||!Number.isFinite(Date.parse(context.expires_at))||Date.parse(context.expires_at)<=now())return reply(403,{error:'CONTEXTO_NAO_VERIFICADO'});
        toolCommand={...args,requestId:body.requestId,action:body.tool,phone:context.phone,...(context.patient_id?{patientId:context.patient_id}:{})};
      }
      const remote=principal.snapshotProvided?principal.snapshot:await repository.read(principal.ownerId,token);
      const current=model.normalize(remote?.payload);current.revision=remote?.revision||0;
      if(body.operation==='read')return reply(200,{state:current});
      let next,result;
      if(body.operation==='save'){
        if(!body.state||!Array.isArray(body.state.clients)||!Array.isArray(body.state.appointments)||!Number.isSafeInteger(body.state.revision))return reply(400,{error:'ESTADO_INVALIDO'});
        if(body.state.revision!==current.revision)return reply(409,{error:'CONFLITO_REVISAO'});
        try{next=model.prepareManual(current,body.state,now());}catch(e){e.name='ValidationError';throw e;}
      }else{
        const command=toolCommand||body.command;
        if(!command||!command.requestId||!command.action)return reply(400,{error:'COMANDO_INVALIDO'});
        // Somente o proprietário autenticado usa esta API administrativa.
        // O número representa simulação do administrador, não identidade de WhatsApp.
        if(command.expectedRevision!=null&&command.expectedRevision!==current.revision&&!Object.hasOwn(current.receipts,command.requestId))return reply(409,{error:'CONFLITO_REVISAO'});
        let answer;try{answer=policy.execute(current,command,now());}catch(e){e.name='ValidationError';throw e;}next=model.materialize(answer.state);result=answer.result;
        if(principal.kind==='agent'&&!result.repeated)next.audit.at(-1).agentId=account.id;
        if(result.repeated)return reply(200,principal.kind==='agent'?{result}:{state:current,result});
      }
      const savedRevision=await repository.write(principal.ownerId,token,current.revision,next);
      if(savedRevision!==current.revision+1)throw new Error('INVALID_REVISION');
      next.revision=savedRevision;
      return reply(200,principal.kind==='agent'?{result}:{state:next,...(result?{result}:{})});
    }catch(error){
      if(/CONFLITO_REVISAO/.test(error?.message||''))return reply(409,{error:'CONFLITO_REVISAO'});
      if(error?.name==='ValidationError')return reply(400,{error:'OPERACAO_RECUSADA',message:error.message});
      return reply(500,{error:'OPERACAO_NAO_CONFIRMADA'});
    }
  };
}

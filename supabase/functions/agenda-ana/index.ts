import {createClient} from 'npm:@supabase/supabase-js@2.110.3';
import '../../../ana-policy.js';
import '../../../ana-agenda-model.js';
import {createHandler} from './handler.mjs';

const apiUrl=Deno.env.get('SUPABASE_URL')||'';
const publicKey=Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||Deno.env.get('SUPABASE_ANON_KEY')||'';
// A chave privilegiada é exclusiva da função, nunca do navegador ou dos agentes.
const server=createClient(apiUrl,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const client=(token:string)=>createClient(apiUrl,publicKey,{
  global:{headers:{Authorization:`Bearer ${token}`}},
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});
const handler=createHandler({
  policy:(globalThis as any).AnaPolicy,model:(globalThis as any).AnaAgendaModel,
  allowedOrigin:Deno.env.get('ANA_ALLOWED_ORIGIN')||'http://127.0.0.1:43189',
  async authenticate(token:string){const {data,error}=await client(token).auth.getClaims(token);if(error)throw error;return data?.claims?{id:data.claims.sub,is_anonymous:data.claims.is_anonymous}:null;},
  async authorize(account:any,token:string){
    const {data:admin,error}=await client(token).rpc('ana_app_open');if(error)throw error;
    if(admin)return {kind:'admin',ownerId:account.id,snapshotProvided:true,snapshot:admin.snapshot};
    const {data:user,error:userError}=await client(token).auth.getUser(token);if(userError||!user.user)return null;
    const {data,error:agentError}=await server.from('ana_app_agents').select('owner_id,scopes').eq('agent_user_id',account.id).eq('enabled',true).maybeSingle();
    if(agentError)throw agentError;return data?{kind:'agent',ownerId:data.owner_id,scopes:data.scopes}:null;
  },
  repository:{
    async read(owner:string){const {data,error}=await server.from('ana_app_state').select('revision,payload').eq('owner_id',owner).maybeSingle();if(error)throw error;return data;},
    async context(owner:string,agent:string,id:string){const {data,error}=await server.from('ana_app_tool_contexts').select('phone,patient_id,expires_at').eq('id',id).eq('owner_id',owner).eq('agent_user_id',agent).maybeSingle();if(error)throw error;return data;},
    async write(owner:string,_token:string,expected:number,payload:unknown){const {data,error}=await server.rpc('ana_app_commit',{p_owner_id:owner,p_expected_revision:expected,p_payload:payload});if(error)throw error;return Number(data);}
  }
});
Deno.serve(handler);

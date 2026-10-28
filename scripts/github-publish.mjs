/* Publicação apenas no repositório novo. Credenciais ficam na memória do processo. */
import {spawn} from 'node:child_process';
const owner='Domingodecafe',name='Agenda-Ana',repository=owner+'/'+name;
const credential=await new Promise((resolve,reject)=>{
  const proc=spawn('git',['credential','fill'],{env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},stdio:['pipe','pipe','pipe']});
  let result='';proc.stdout.on('data',chunk=>{result+=chunk;});proc.stderr.resume();
  proc.on('error',()=>reject(new Error('Git Credential Manager indisponível.')));
  proc.on('close',code=>{if(code)reject(new Error('Autenticação GitHub não disponível.'));else resolve(Object.fromEntries(result.trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];})));});
  proc.stdin.end('protocol=https\nhost=github.com\n\n');
});
async function api(path,method='GET',body){
  if(!['/user','/user/repos'].includes(path)&&!path.startsWith('/repos/'+repository))throw new Error('Destino bloqueado.');
  const r=await fetch('https://api.github.com'+path,{method,headers:{Authorization:`Bearer ${credential.password}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=r.status===204?null:await r.json();return {status:r.status,data};
}
const user=await api('/user');if(user.status!==200||user.data.login.toLowerCase()!==owner.toLowerCase())throw new Error('A conta GitHub não corresponde ao proprietário esperado.');
const mode=process.argv[2];
if(mode==='create'){
  const existing=await api('/repos/'+repository);
  if(existing.status===404){const result=await api('/user/repos','POST',{name,description:'Agenda Ana: painel administrativo com Supabase e sincronização, separado da agenda original.',private:false,auto_init:false});if(result.status!==201)throw new Error('Não foi possível criar o repositório: HTTP '+result.status);console.log('Repositório criado: '+result.data.html_url);}
  else if(existing.status===200)console.log('Repositório já existe: '+existing.data.html_url);
  else throw new Error('Falha ao verificar repositório: HTTP '+existing.status);
}else if(mode==='pages'){
  const current=await api('/repos/'+repository+'/pages');
  const result=await api('/repos/'+repository+'/pages',current.status===404?'POST':'PUT',{build_type:'workflow'});
  if(![201,204].includes(result.status))throw new Error('Falha ao configurar Pages: HTTP '+result.status);
  console.log('GitHub Pages configurado para Actions em '+repository);
}else if(mode==='status'){
  const runs=await api('/repos/'+repository+'/actions/runs?per_page=2');
  console.log(JSON.stringify({runs:runs.data.workflow_runs?.map(r=>({id:r.id,status:r.status,conclusion:r.conclusion,url:r.html_url}))},null,2));
}else console.log('Conta GitHub confirmada: '+user.data.login+'; alvo: '+repository);

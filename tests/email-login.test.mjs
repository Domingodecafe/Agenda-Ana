import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

async function loginHarness(send=async()=>({error:{code:'invalid_credentials'}}),online=true){
  const elements=new Map(),events=new Map(),calls=[];
  function element(key){if(!elements.has(key))elements.set(key,{value:'',textContent:'',classList:{toggle(){}},setAttribute(){},addEventListener(type,fn){events.set(key+':'+type,fn);}});return elements.get(key);}
  const document={querySelector:element,createElement:()=>({}),body:{append(){}},addEventListener:(name,fn)=>events.set(name,fn)};
  const context={AnaEnvironment:{isAllowed:()=>true,networkEnabled:true,basePath:'/Agenda-Ana/'},AnaSupabaseSDK:{createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){},signInWithPassword:async args=>{calls.push(args);return send(args);}}})},document,location:{origin:'https://domingodecafe.github.io'},navigator:{onLine:online},window:{addEventListener(){}},setTimeout};
  vm.runInNewContext(readFileSync(new URL('../ana-cloud-bootstrap.js',import.meta.url),'utf8'),context);
  await events.get('DOMContentLoaded')();
  element('#auth-email').value=' admin@example.invalid ';
  element('#auth-password').value='fictional-password';
  return {submit:()=>events.get('#auth-form:submit')({preventDefault(){}}),element,calls};
}

test('password login sends credentials to Auth and clears the password field on failure',async()=>{
  const h=await loginHarness();await h.submit();
  assert.equal(h.calls[0].email,'admin@example.invalid');
  assert.equal(h.calls[0].password,'fictional-password');
  assert.equal(h.element('#auth-password').value,'');
  assert.match(h.element('#auth-error').textContent,/E-mail ou senha incorretos/);
  assert.equal(h.element('#auth-gate').hidden,false);
});
test('offline login does not send a request',async()=>{
  const h=await loginHarness(undefined,false);await h.submit();assert.equal(h.calls.length,0);
  assert.match(h.element('#auth-error').textContent,/internet/);
});
test('email errors allow retry and duplicate submissions are suppressed',async()=>{
  let finish;const h=await loginHarness(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=h.submit();await h.submit();assert.equal(h.calls.length,1);
  finish({error:{status:429}});await pending;
  assert.equal(h.element('#auth-form button').disabled,false);
  assert.match(h.element('#auth-error').textContent,/Aguarde/);
});

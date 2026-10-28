import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const env=await readFile(new URL('../ana-environment.js',import.meta.url),'utf8');
const policy=await readFile(new URL('../ana-policy.js',import.meta.url),'utf8');
const model=await readFile(new URL('../ana-agenda-model.js',import.meta.url),'utf8');
const source=await readFile(new URL('../ana-agenda-store.js',import.meta.url),'utf8');
const ctx=vm.createContext({location:new URL('http://127.0.0.1:43189/ana-app/'),structuredClone,crypto,console,Date});
vm.runInContext(env,ctx);vm.runInContext(policy,ctx);vm.runInContext(model,ctx);vm.runInContext(source,ctx);
const P=ctx.AnaPolicy,M=ctx.AnaAgendaModel,at=P.stamp('2026-10-28','08:00');
let seq=0;
const dispatch=(s,cmd)=>P.execute(s,{requestId:'r'+ ++seq,...cmd},at).state;
function fixture(){return M.normalize(dispatch(P.empty(),{role:'henrique',action:'patient',name:'TESTE COMPARTILHADO',phone:'5543999990001',modality:'Presencial',defaultValue:150,financial:true}));}
const appointment=(s,fields={})=>({id:crypto.randomUUID(),kind:'appointment',clientId:s.clients[0].id,clientName:s.clients[0].name,date:'2026-10-29',start:'14:00',end:'15:00',modality:'Presencial',value:150,financialStatus:'A receber',recurrence:'none',...fields});

test('identidades independentes; execução fora do endereço bloqueia armazenamento',()=>{
  assert.equal(ctx.AnaEnvironment.database,'ana-app-agenda-db-v1');
  for(const url of ['https://domingodecafe.github.io/Agenda/','http://127.0.0.1:43188/ana-dev/','http://127.0.0.1:43189/']){
    const c=vm.createContext({location:new URL(url),document:{addEventListener(){}}});vm.runInContext(env,c);
    Object.defineProperty(c,'indexedDB',{get(){throw new Error('Proibido');}});vm.runInContext(source,c);assert.equal(c.AnaAgendaStore,undefined);
  }
});
test('edição manual desatualizada não sobrescreve agendamento da Ana',()=>{
  const s=fixture(),old=structuredClone(s),latest=dispatch(s,{phone:s.clients[0].phone,action:'book',date:'2026-10-29',start:'14:00'});
  old.clients[0].notes='EDIÇÃO ANTIGA';assert.throws(()=>M.prepareManual(latest,old,at),/mudou/);assert.equal(latest.appointments.length,1);
});
test('cadastro manual com telefone formatado é identificado pela Ana',()=>{
  const s=M.normalize();s.clients.push({id:'c1',name:'TESTE FORMATADO',phone:'+55 (43) 99999-0001',defaultValue:160});
  const saved=M.prepareManual(M.normalize(),s,at);
  assert.equal(P.targets(saved,'5543999990001')[0].patient.name,'TESTE FORMATADO');
});
test('bloqueio manual é consultado pela Ana, inclusive sobreposição parcial',()=>{
  const s=fixture(),draft=structuredClone(s);draft.appointments.push({id:'b1',kind:'block',date:'2026-10-29',start:'14:30',end:'16:00'});
  const next=M.prepareManual(s,draft,at);assert.equal(P.slotAvailable(next,'2026-10-29','14:00',at),false);
});
test('bloqueio feito no painel da Ana é materializado no calendário',()=>{
  const s=fixture(),next=M.materialize(dispatch(s,{role:'henrique',action:'block',date:'2026-10-29',start:'14:00',end:'16:00'}));
  assert.equal(next.appointments[0].kind,'block');assert.equal(next.appointments[0].end,'16:00');
});
test('sessão manual compatível remove lista de espera e conclui reserva',()=>{
  let s=fixture();s=dispatch(s,{phone:s.clients[0].phone,action:'waitlist',modality:'Presencial'});s=dispatch(s,{role:'henrique',action:'offer',date:'2026-10-29',start:'14:00'});
  const draft=structuredClone(s);draft.appointments.push(appointment(s));
  const next=M.prepareManual(s,draft,at);assert.equal(next.waitlist.length,0);assert.equal(next.reservations[0].status,'completed');
});
test('reserva da Ana impede agendamento manual de outro paciente',()=>{
  let s=fixture();s=dispatch(s,{phone:s.clients[0].phone,action:'waitlist',modality:'Presencial'});s=dispatch(s,{role:'henrique',action:'offer',date:'2026-10-29',start:'14:00'});
  const draft=structuredClone(s);draft.appointments.push(appointment(s,{clientId:'other'}));assert.throws(()=>M.prepareManual(s,draft,at),/reservado/);
});
test('bloco manual sobre oferta encerra reserva e prepara aviso local',()=>{
  let s=fixture();s=dispatch(s,{phone:s.clients[0].phone,action:'waitlist',modality:'Presencial'});s=dispatch(s,{role:'henrique',action:'offer',date:'2026-10-29',start:'14:00'});
  const draft=structuredClone(s);draft.appointments.push({id:'b1',kind:'block',date:'2026-10-29',start:'14:00',end:'15:00'});
  const next=M.prepareManual(s,draft,at);assert.equal(next.reservations[0].status,'blocked');assert.equal(next.outbox.at(-1).kind,'reservation');
});
test('pagamento manual é lido pela Ana sem apagar auditoria nem campos da agenda',()=>{
  let s=fixture();s=dispatch(s,{phone:s.clients[0].phone,action:'book',date:'2026-10-29',start:'14:00'});
  const draft=structuredClone(s);draft.settings.hideSummaryValues=true;draft.clients[0].notes='OBSERVAÇÃO FICTÍCIA';draft.appointments[0].financialStatus='Pago';draft.appointments[0].payment={method:'PIX',date:'2026-10-28'};
  const next=M.prepareManual(s,draft,at),result=P.execute(next,{requestId:'finance-test',phone:s.clients[0].phone,action:'finance'},at);
  assert.equal(next.settings.hideSummaryValues,true);assert.equal(next.clients[0].notes,'OBSERVAÇÃO FICTÍCIA');assert.match(result.result.text,/Pagamentos registrados: 1/);assert.equal(result.state.appointments[0].payment.method,'PIX');
});
test('recorrência manual define frequência sem apagar campos individuais',()=>{
  const s=fixture(),draft=structuredClone(s);draft.appointments.push(appointment(s,{recurrence:'weekly',seriesId:'series-test'}));
  const next=M.prepareManual(s,draft,at);assert.equal(next.clients[0].frequency,'weekly');assert.equal(next.clients[0].financial,true);
});
test('operações manuais recusam sobreposição e números próprios duplicados',()=>{
  const s=fixture(),draft=structuredClone(s);draft.appointments.push(appointment(s),appointment(s,{start:'14:30',end:'15:30'}));assert.throws(()=>M.prepareManual(s,draft,at),/sobrepõe/);
  const duplicate=structuredClone(s);duplicate.clients.push({...duplicate.clients[0],id:'other',phone:'+55 (43) 99999-0001'});assert.throws(()=>M.prepareManual(s,duplicate,at),/outro cadastro/);
});
test('série manual não inclui sessões canceladas pela Ana ao editar próximas ocorrências',async()=>{
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  const i=app.indexOf('  function seriesOccurrencesFrom('),j=app.indexOf('  function chooseSeriesScope',i);
  vm.runInContext(app.slice(i,j)+'globalThis.seriesOccurrencesFrom=seriesOccurrencesFrom;',vm.createContext({state:{appointments:[]}}));
  const c=vm.createContext({state:{appointments:[{id:'a',seriesId:'s',date:'2026-10-29',start:'14:00'},{id:'b',seriesId:'s',date:'2026-11-05',start:'14:00',status:'cancelled'}]}});
  vm.runInContext(app.slice(i,j)+'globalThis.results=seriesOccurrencesFrom(state.appointments[0]);',c);assert.equal(c.results.length,1);
});

test('ações do formulário permanecem visíveis ao criar bloqueio',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');const form=html.slice(html.indexOf('<form id="appointment-form"'),html.indexOf('</form>',html.indexOf('<form id="appointment-form"')));
  const stack=[];
  for(const m of form.matchAll(/<\/?div\b[^>]*>/g)){
    if(m[0].startsWith('</'))stack.pop();else{if(m[0].includes('modal-actions'))assert.ok(!stack.includes('appointment-extra'));stack.push(m[0].match(/id="([^"]+)"/)?.[1]||'div');}
  }
  assert.equal(stack.length,0);
});
test('cancelamento preserva pagamento registrado sem criar cobrança ou próxima sessão',async()=>{
  let s=fixture();s=dispatch(s,{phone:s.clients[0].phone,action:'book',date:'2026-10-29',start:'14:00'});s.appointments[0].financialStatus='Pago';s=dispatch(s,{phone:s.clients[0].phone,action:'cancel'});
  const answer=P.execute(s,{requestId:'paid-cancelled',phone:s.clients[0].phone,action:'finance'},at);assert.match(answer.result.text,/Pagamentos registrados: 1/);
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  const f=app.slice(app.indexOf('  function financialAppointments('),app.indexOf('  function summaryModeTitle('));
  const context=vm.createContext({state:s,summaryMode:'upcoming',summaryUndated:false,appointmentEnd:a=>new Date(a.date+'T'+a.end+':00-03:00'),Date});
  vm.runInContext(f+"globalThis.received=financialAppointments();globalThis.upcoming=summaryItems('upcoming','2026-10',new Date('2026-10-28T08:00:00-03:00'));",context);
  assert.equal(context.received.length,1);assert.equal(context.upcoming.length,0);
});

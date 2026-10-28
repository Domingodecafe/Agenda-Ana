/* Mesmo mapeamento e validações no navegador e na função Supabase. */
(() => {
  'use strict';
  const clone=value=>structuredClone(value);
  const active=a=>a.status!=='cancelled';
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const revision=s=>s?.revision||0;
  function normalize(value){
    const s={...AnaPolicy.empty(),...clone(value||{})};
    s.settings||={view:'week'};
    s.blocks=s.appointments.filter(a=>a.kind==='block'&&active(a));
    return s;
  }
  function materialize(s){
    const ids=new Set(s.appointments.map(a=>a.id));
    for(const b of s.blocks)if(!ids.has(b.id))s.appointments.push({...b,kind:'block',label:b.label||'Horário bloqueado'});
    return normalize(s);
  }
  function prepareManual(current,draft,now){
    if(revision(draft)!==revision(current))throw new Error('A agenda mudou em outra aba ou pela Ana. A versão atual será recarregada; revise a alteração antes de salvar novamente.');
    const s=normalize(draft);
    const number=n=>String(n||'').replace(/\D/g,'');
    const seen=new Set();
    for(const c of s.clients){const n=number(c.phone);if(n&&seen.has(n))throw new Error('Esse número próprio já pertence a outro cadastro.');if(n)seen.add(n);}
    const previous=new Map(current.appointments.map(a=>[a.id,a]));
    const changed=s.appointments.filter(a=>!same(a,previous.get(a.id)));
    const schedule=a=>a&&[a.kind,a.clientId,a.date,a.start,a.end,a.status];
    for(const a of changed.filter(a=>a.kind==='appointment'&&active(a)&&!same(schedule(a),schedule(previous.get(a.id))))){
      const from=AnaPolicy.stamp(a.date,a.start),to=AnaPolicy.stamp(a.date,a.end);
      if(to<=from)throw new Error('Confira o horário final da sessão.');
      const overlaps=b=>active(b)&&AnaPolicy.stamp(b.date,b.start)<to&&AnaPolicy.stamp(b.date,b.end||AnaPolicy.timeAt(AnaPolicy.stamp(b.date,b.start)+3600000))>from;
      if(s.appointments.some(b=>b.id!==a.id&&overlaps(b)))throw new Error('O horário se sobrepõe a uma sessão ou bloqueio.');
      if(current.reservations.some(r=>r.status==='active'&&r.expiresAt>now&&r.patientId!==a.clientId&&overlaps(r)))throw new Error('Esse horário está reservado pela lista de espera da Ana.');
      const p=s.clients.find(p=>p.id===a.clientId);
      if(p){
        if(['weekly','biweekly'].includes(a.recurrence))p.frequency=a.recurrence;
        else if(previous.get(a.id)?.recurrence&&previous.get(a.id).recurrence!==a.recurrence)p.frequency='none';
        if(!p.modality)p.modality=a.modality;
      }
      const match=w=>w.patientId===a.clientId&&(!w.dates.length||w.dates.includes(a.date))&&(!w.times.length||w.times.includes(a.start))&&(w.modality==='Ambas'||w.modality===a.modality);
      s.waitlist=s.waitlist.filter(w=>!match(w));
      for(const r of s.reservations.filter(r=>r.patientId===a.clientId&&r.status==='active'&&r.date===a.date&&r.start===a.start))r.status='completed';
    }
    // A edição de cadastro pelo app também revoga imediatamente reservas/vínculos inválidos.
    const removed=current.clients.filter(p=>!s.clients.some(c=>c.id===p.id)).map(p=>p.id);
    s.contacts=s.contacts.filter(c=>!removed.includes(c.patientId));
    s.waitlist=s.waitlist.filter(w=>!removed.includes(w.patientId));
    for(const r of s.reservations.filter(r=>removed.includes(r.patientId)&&r.status==='active'))r.status='revoked';
    const reconciled=AnaPolicy.reconcile(s,now);
    reconciled.revision=revision(current)+1;
    reconciled.audit.push({id:crypto.randomUUID(),requestId:crypto.randomUUID(),actor:'henrique',action:'manual-save',at:now,patientId:null,changedAppointments:changed.map(a=>a.id),removedAppointments:current.appointments.filter(a=>!s.appointments.some(b=>b.id===a.id)).map(a=>a.id)});
    return reconciled;
  }
  globalThis.AnaAgendaModel={normalize,prepareManual,materialize};
})();

/* Cópia local independente da Agenda original e do laboratório Ana DEV. */
(() => {
  'use strict';
  const published=globalThis.location?.origin==='https://domingodecafe.github.io';
  const env=Object.freeze({
    origin:published?'https://domingodecafe.github.io':'http://127.0.0.1:43189',basePath:published?'/Agenda-Ana/':'/ana-app/',
    database:'ana-app-agenda-db-v1',store:'ana-app-agenda',stateKey:'ana-app-main',
    cacheName:'ana-app-pwa-v6',networkEnabled:!!globalThis.AnaPublicConfig,
    cloudUrl:globalThis.AnaPublicConfig?.cloudUrl,
    publishableKey:globalThis.AnaPublicConfig?.publishableKey,
    isAllowed(location=globalThis.location){return location.origin===this.origin&&location.pathname.startsWith(this.basePath);}
  });
  globalThis.AnaEnvironment=env;
  if(typeof document!=='undefined'&&!env.isAllowed())document.addEventListener('DOMContentLoaded',()=>{
    const p=document.createElement('p');p.setAttribute('role','alert');
    p.textContent='Endereço não autorizado para a Agenda Ana. Nenhum dado foi carregado.';
    document.body.replaceChildren(p);
  },{once:true});
})();

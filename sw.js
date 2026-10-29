'use strict';
importScripts('./ana-environment.js?v=ana-app-5');
const env=self.AnaEnvironment;
if(!env.isAllowed()||self.registration.scope!==env.origin+env.basePath)throw new Error('Escopo da cópia Ana inválido.');
const FILES=['./index.html','./styles.css?v=30','./ana-panel.css?v=ana-app-5','./app.js?v=ana-app-5','./manifest.webmanifest','./icon.svg',
  './ana-public-config.js?v=ana-app-5','./ana-environment.js?v=ana-app-5','./ana-policy.js?v=ana-app-5','./ana-agenda-model.js?v=ana-app-5','./ana-agenda-store.js?v=ana-app-5',
  './vendor/supabase.js?v=ana-app-5','./ana-supabase-adapter.js?v=ana-app-5','./ana-sync-client.js?v=ana-app-5','./ana-cloud-bootstrap.js?v=ana-app-5',
  './ana-console.html','./ana-console.css','./ana-console.js?v=ana-app-5'];
const urls=new Set(FILES.map(p=>new URL(p,self.registration.scope).href));
self.addEventListener('install',e=>e.waitUntil(caches.open(env.cacheName).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')e.waitUntil(self.skipWaiting());});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin!==env.origin||!url.pathname.startsWith(env.basePath))return;
  let key=e.request;
  if(e.request.mode==='navigate'&&url.pathname===env.basePath)key='./index.html';
  else if(!urls.has(url.href))return;
  // Cada página conserva sua identidade. O painel nunca recebe o HTML da agenda.
  e.respondWith(caches.open(env.cacheName).then(c=>c.match(key)).then(cached=>cached||fetch(e.request)));
});

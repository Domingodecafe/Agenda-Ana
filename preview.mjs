import http from 'node:http';
import {readFile} from 'node:fs/promises';
const host='127.0.0.1',port=43189,base='/ana-app/';
const files=new Map([
  ['index.html','text/html'],['app.js','text/javascript'],['styles.css','text/css'],
  ['manifest.webmanifest','application/manifest+json'],['icon.svg','image/svg+xml'],['sw.js','text/javascript'],
  ['ana-environment.js','text/javascript'],['ana-policy.js','text/javascript'],['ana-agenda-store.js','text/javascript'],
  ['ana-agenda-model.js','text/javascript'],
  ['ana-panel.css','text/css'],['ana-public-config.js','text/javascript'],['vendor/supabase.js','text/javascript'],
  ['ana-supabase-adapter.js','text/javascript'],['ana-sync-client.js','text/javascript'],['ana-cloud-bootstrap.js','text/javascript'],
  ['ana-console.html','text/html'],['ana-console.js','text/javascript'],['ana-console.css','text/css']
]);
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self' https://dpdxzbbzymkygutwefww.supabase.co wss://dpdxzbbzymkygutwefww.supabase.co; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if(req.headers.host!==`${host}:${port}`){res.writeHead(403).end();return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  const path=new URL(req.url,`http://${host}:${port}`).pathname;
  if(path==='/'){res.writeHead(302,{Location:base}).end();return;}
  if(!path.startsWith(base)){res.writeHead(404).end();return;}
  const name=path===base?'index.html':path.slice(base.length);
  if(!files.has(name)){res.writeHead(404).end();return;}
  if(name==='sw.js')res.setHeader('Service-Worker-Allowed',base);
  try{let content=await readFile(new URL('./site/'+name,import.meta.url));if(name==='manifest.webmanifest')content=Buffer.from(content.toString().replaceAll('/Agenda-Ana/','/ana-app/'));res.writeHead(200,{'Content-Type':files.get(name)+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:content);}
  catch{res.writeHead(500).end('Falha ao abrir arquivo local.');}
});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
server.listen(port,host,()=>console.log(`Agenda Ana: http://${host}:${port}${base}`));

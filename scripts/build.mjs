import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=resolve(root,'site');
if(dirname(out)!==root||out!==join(root,'site'))throw new Error('Diretório de build inválido.');
await rm(out,{recursive:true,force:true});await mkdir(join(out,'vendor'),{recursive:true});
const files=['index.html','app.js','styles.css','ana-panel.css','manifest.webmanifest','icon.svg','sw.js','ana-public-config.js','ana-environment.js','ana-policy.js','ana-agenda-model.js','ana-agenda-store.js','ana-supabase-adapter.js','ana-sync-client.js','ana-cloud-bootstrap.js','ana-console.html','ana-console.css','ana-console.js'];
for(const file of files){let content=await readFile(join(root,file),'utf8');
  if(file==='manifest.webmanifest')content=content.replaceAll('/ana-app/','/Agenda-Ana/');
  if(file.endsWith('.html')){const csp=`<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' https://dpdxzbbzymkygutwefww.supabase.co wss://dpdxzbbzymkygutwefww.supabase.co; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'">`;content=content.replace('<head>','<head>\n  '+csp);}
  await writeFile(join(out,file),content);
}
await build({stdin:{contents:"import {createClient} from '@supabase/supabase-js'; globalThis.AnaSupabaseSDK={createClient};",resolveDir:root},outfile:join(out,'vendor','supabase.js'),bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
await writeFile(join(out,'.nojekyll'),'');
console.log('Build público concluído: '+out+' (somente arquivos autorizados).');

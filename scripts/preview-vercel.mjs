import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {handleApi} from '../lib/vercel-api.mjs';
import {createNeonStore} from '../lib/neon-store.mjs';
import {hashPassword} from '../lib/owner-auth.mjs';
import {videoResponse} from '../worker/static-media.mjs';
const root=resolve('public');
const mock=process.argv.includes('--fixture');
const origin='http://127.0.0.1:4195';
let store,env=process.env;
if(mock){
 const saved=JSON.parse(await readFile('../migration-backups/2026-11-14/snapshot.json','utf8'));
 let row={revision:saved.revision,snapshot:{data:saved.data,photos:saved.photos},updated_at:saved.updatedAt};
 const user={id:'local-owner',email:'owner@example.test',email_confirmed_at:'2026-01-01'};
 env={AUTH_PROVIDER:'credentials',SESSION_SECRET:'local-preview-secret-not-used-in-production',TEAM_ADMIN_EMAIL:'admin',OWNER_PASSWORD_HASH:await hashPassword('preview-only-password')};
 store={consumeLoginAttempt:async()=>true,read:async()=>structuredClone(row),user:async t=>t==='preview-token'?user:null,refresh:async()=>null,
 signIn:async(email,password)=>email===user.email&&password==='preview-only'?{user,session:{access_token:'preview-token'}}:null,signOut:async()=>{},
 save:async(snapshot,revision)=>{if(revision!==row.revision)return null;row={revision:revision+1,snapshot,updated_at:new Date().toISOString()};return row;},
 mediaUrl:async hash=>origin+'/fixture-media/'+hash,signUpload:async()=>{throw Error('Use the upload API tests');},download:async()=>null};
}else store=createNeonStore(env);
const mimes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.mp4':'video/mp4','.m4a':'audio/mp4'};
createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname==='/mobile-preview'){res.setHeader('Content-Type','text/html');res.end('<body style="margin:0;background:#101411;display:grid;place-items:center;height:100vh"><iframe title="모바일 앱" src="/#players" style="width:390px;height:740px;max-height:100vh;border:0"></iframe></body>');return;}
 if(mock&&url.pathname.startsWith('/fixture-media/')){const hash=url.pathname.split('/').pop();if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Bad hash');const manifest=JSON.parse(await readFile('../migration-backups/2026-11-14/manifest.json'));const media=manifest.media.find(m=>m.hash===hash);res.setHeader('Content-Type',media.type);res.end(await readFile('../migration-backups/2026-11-14/media/'+hash));return;}
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const c of req)chunks.push(c);
  const response=await handleApi(new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),env,store);
  res.statusCode=response.status;response.headers.forEach((v,k)=>{if(k!=='set-cookie')res.setHeader(k,v);});const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+sep))throw Error('Bad path');
 const data=await readFile(file),type=mimes[extname(file)]||'application/octet-stream';
 if(type==='video/mp4'||type==='audio/mp4'){
  const response=videoResponse(new Request(url,{method:req.method,headers:req.headers}),data,{'Content-Type':type});
  res.statusCode=response.status;response.headers.forEach((v,k)=>{if(k!=='set-cookie')res.setHeader(k,v);});const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 res.setHeader('Content-Type',type);res.end(data);
}catch{res.statusCode=404;res.end('Not found');}}).listen(4195,'127.0.0.1',()=>console.log(`Local: ${origin}${mock?' (isolated fixture; no live writes)':''}`));

import {createStore} from '../lib/supabase-store.mjs';
import {createNeonStore} from '../lib/neon-store.mjs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {handleApi} from '../lib/vercel-api.mjs';
export default async function handler(req,res){
 try{
  const host=req.headers['x-forwarded-host']||req.headers.host;
  const protocol=req.headers['x-forwarded-proto']||'https';
  const url=new URL(req.url,`${protocol}://${host}`);
  if(url.pathname==='/api/index'&&url.searchParams.has('route'))url.pathname='/api/'+url.searchParams.get('route');
  url.searchParams.delete('route');
  let body;
  if(!['GET','HEAD'].includes(req.method)){
   if(req.body!==undefined)body=Buffer.isBuffer(req.body)||typeof req.body==='string'?req.body:JSON.stringify(req.body);
   else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4000000){res.statusCode=413;res.end(JSON.stringify({error:'데이터가 너무 큽니다.'}));return;}chunks.push(chunk);}body=Buffer.concat(chunks);}
  }
  const request=new Request(url,{method:req.method,headers:req.headers,body});
  const response=await handleApi(request,process.env,process.env.AUTH_PROVIDER==='credentials'?createNeonStore(process.env):createStore(process.env));
  res.statusCode=response.status;response.headers.forEach((v,k)=>{if(k!=='set-cookie')res.setHeader(k,v);});
  const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
  if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
 }catch{res.statusCode=503;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'새 앱의 연결을 준비하고 있습니다.'}));}
}

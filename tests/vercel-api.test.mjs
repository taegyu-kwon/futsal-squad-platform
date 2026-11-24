import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleApi} from '../lib/vercel-api.mjs';
import {sealSession,openSession,sessionCookie} from '../lib/session.mjs';
const env={SESSION_SECRET:'test-secret-at-least-32-characters-long',TEAM_ADMIN_EMAIL:'owner@example.test'};
const owner={id:'owner',email:env.TEAM_ADMIN_EMAIL,email_confirmed_at:'2026-01-01'};
const token={access_token:'valid',refresh_token:'refresh'};
const cookie=sessionCookie(sealSession(token,env.SESSION_SECRET));
function fixture(){
 let row={id:'team',revision:114,snapshot:{data:{'unit-fc-player-traits-v1':JSON.stringify({'9':{status:'injured',traits:['패스']}})},photos:{}},updated_at:'2026-11-14'};
 const store={read:async()=>structuredClone(row),user:async t=>t==='valid'?owner:null,refresh:async()=>null,
  save:async(snapshot,expected,id)=>{if(row.revision!==expected)return null;row={...row,snapshot,revision:expected+1,updated_by:id};return row;},
  signIn:async(email,password)=>password==='correct'?{user:owner,session:token}:null,signOut:async()=>{},
  mediaUrl:async()=>null,signUpload:async()=>({signedUrl:'https://storage.example/upload'}),download:async()=>null};
 return store;
}
const request=(path,{method='GET',body,admin=false,origin='https://team.example',headers={}}={})=>new Request('https://team.example/api/'+path,{method,headers:{...(admin?{cookie}:{}),...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
test('public roster remains read-only, forged Sites identity headers are ignored',async()=>{
 const store=fixture();const r=await handleApi(request('shared',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':owner.email}}),env,store);
 assert.equal(r.status,200);const data=await r.json();assert.equal(data.canEdit,false);assert.equal(data.revision,114);
 const write=await handleApi(request('shared',{method:'PUT',body:{expectedRevision:114,data:{},photos:{}}}),env,store);assert.equal(write.status,403);
});
test('admin auth is verified against Supabase and cookies are HttpOnly',async()=>{
 const store=fixture();assert.equal((await (await handleApi(request('shared',{admin:true}),env,store)).json()).canEdit,true);
 const login=await handleApi(request('auth/login',{method:'POST',body:{email:owner.email,password:'correct'}}),env,store);
 assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/Secure/);assert.match(login.headers.get('set-cookie'),/SameSite=Lax/);
 const rejected=await handleApi(request('auth/login',{method:'POST',body:{email:owner.email,password:'wrong'}}),env,store);assert.equal(rejected.status,401);
 store.user=async()=>({...owner,email:'visitor@example.test'});assert.equal((await(await handleApi(request('shared',{admin:true}),env,store)).json()).canEdit,false);
});
test('cross-site requests are denied even with an admin cookie',async()=>{
 const r=await handleApi(request('shared',{method:'PUT',admin:true,origin:'https://evil.example',body:{expectedRevision:114,data:{}}}),env,fixture());assert.equal(r.status,403);
});
test('save uses revision conflict checks and preserves traits from older clients',async()=>{
 const store=fixture();const payload={expectedRevision:114,data:{'unit-fc-v1':'{}'},photos:{}};
 const [a,b]=await Promise.all([handleApi(request('shared',{method:'PUT',admin:true,body:payload}),env,store),handleApi(request('shared',{method:'PUT',admin:true,body:payload}),env,store)]);
 assert.deepEqual([a.status,b.status].sort(),[200,409]);assert.equal((await store.read()).snapshot.data['unit-fc-player-traits-v1'],JSON.stringify({'9':{status:'injured',traits:['패스']}}));
});
test('malformed and oversized snapshots cannot be saved',async()=>{
 const store=fixture();const bad=await handleApi(request('shared',{method:'PUT',admin:true,body:{expectedRevision:-1,data:{}}}),env,store);assert.equal(bad.status,400);
 const large=await handleApi(request('shared',{method:'PUT',admin:true,body:{expectedRevision:114,data:{'unit-fc-v1':'x'.repeat(4000001)}}}),env,store);assert.equal(large.status,413);assert.equal((await store.read()).revision,114);
});
test('signed uploads require admin and final content hash verification',async()=>{
 const store=fixture();const bytes=Buffer.from([137,80,78,71,13,10,26,10]),hash=createHash('sha256').update(bytes).digest('hex');
 const params={hash,type:'image/png',size:bytes.length};
 assert.equal((await handleApi(request('media/sign',{method:'POST',body:params}),env,store)).status,403);
 const signed=await handleApi(request('media/sign',{method:'POST',admin:true,body:params}),env,store);assert.equal(signed.status,200);assert.match((await signed.json()).uploadUrl,/storage.example/);
 store.download=async()=>new Blob([bytes],{type:'image/png'});
 assert.equal((await handleApi(request('media/complete',{method:'POST',admin:true,body:{hash}}),env,store)).status,200);
 assert.equal((await handleApi(request('media/complete',{method:'POST',admin:true,body:{hash:'a'.repeat(64)}}),env,store)).status,400);
});
test('cookie encryption rejects tampering; identity is never inferred from the cookie',()=>{
 const value=sealSession(token,env.SESSION_SECRET);assert.equal(openSession(value,env.SESSION_SECRET).access_token,'valid');
 assert.equal(openSession(value.slice(0,20)+'AAAA'+value.slice(24),env.SESSION_SECRET),null);assert.equal(openSession(value,'different-key-at-least-32-characters'),null);
});

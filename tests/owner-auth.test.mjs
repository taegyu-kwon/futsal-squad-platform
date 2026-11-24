import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword} from '../lib/owner-auth.mjs';
import {handleApi} from '../lib/vercel-api.mjs';
const origin='https://futsal.example.test';
const env={AUTH_PROVIDER:'credentials',SESSION_SECRET:'test-only-session-secret-with-at-least-32-characters',TEAM_ADMIN_EMAIL:'owner@example.test',OWNER_PASSWORD_HASH:await hashPassword('test-only-password-123')};
function client(store){
 const jar=new Map();
 return async(path,body,other={})=>{
  const request=new Request(origin+'/api/'+path,{method:body?'POST':'GET',headers:{cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{'Content-Type':'application/json',Origin:origin}:{}),...other},body:body?JSON.stringify(body):undefined});
  const response=await handleApi(request,env,store);
  for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
  return response;
 };
}
test('real Auth.js CSRF/login/session/logout flow and failed authentication',async()=>{
 const store={consumeLoginAttempt:async()=>true,read:async()=>({revision:1,snapshot:{data:{},photos:{}}})};
 const call=client(store);
 assert.equal((await(await call('auth/session')).json()).canEdit,false);
 const csrf=(await(await call('auth/csrf')).json()).csrfToken;
 assert.ok(csrf);
 assert.equal((await call('auth/login',{email:env.TEAM_ADMIN_EMAIL,password:'test-only-password-123',csrfToken:'wrong'})).status,401);
 assert.equal((await call('auth/login',{email:env.TEAM_ADMIN_EMAIL,password:'incorrect',csrfToken:csrf})).status,401);
 const login=await call('auth/login',{email:env.TEAM_ADMIN_EMAIL,password:'test-only-password-123',csrfToken:csrf});
 assert.equal(login.status,200);
 assert.ok(login.headers.getSetCookie().some(x=>x.includes('session-token')&&x.includes('HttpOnly')&&x.includes('Secure')&&x.includes('SameSite=Lax')));
 assert.equal((await(await call('shared')).json()).canEdit,true);
 const logoutCsrf=(await(await call('auth/csrf')).json()).csrfToken;
 assert.equal((await call('auth/logout',{csrfToken:logoutCsrf})).status,200);
 assert.equal((await(await call('auth/session')).json()).canEdit,false);
});
test('password verifier, owner restriction, rate limits, cross-origin and forged identity',async()=>{
 assert.equal(await verifyPassword('wrong',env.OWNER_PASSWORD_HASH),false);
 assert.equal(await verifyPassword('test-only-password-123',env.OWNER_PASSWORD_HASH),true);
 let permitted=true;
 const call=client({consumeLoginAttempt:async()=>permitted,read:async()=>({revision:1,snapshot:{data:{},photos:{}}})});
 const csrf=(await(await call('auth/csrf')).json()).csrfToken;
 assert.equal((await call('auth/login',{email:'visitor@example.test',password:'test-only-password-123',csrfToken:csrf})).status,401);
 permitted=false;
 assert.equal((await call('auth/login',{email:env.TEAM_ADMIN_EMAIL,password:'test-only-password-123',csrfToken:csrf})).status,401);
 assert.equal((await call('auth/login',{email:env.TEAM_ADMIN_EMAIL,password:'test-only-password-123',csrfToken:csrf},{Origin:'https://evil.example'})).status,403);
 assert.equal((await(await call('shared',undefined,{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':env.TEAM_ADMIN_EMAIL})).json()).canEdit,false);
});

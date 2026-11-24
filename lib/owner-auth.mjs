import {Auth} from '@auth/core';
import Credentials from '@auth/core/providers/credentials';
import {scrypt as scryptCallback,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
const opts={N:32768,r:8,p:1,maxmem:64*1024*1024};
export async function hashPassword(password){
 if(typeof password!=='string'||password.length<12||password.length>128)throw Error('비밀번호는 12~128자로 입력해 주세요.');
 const salt=randomBytes(32).toString('hex');
 const digest=await scrypt(password,salt,64,opts);
 return `scrypt:${salt}:${Buffer.from(digest).toString('hex')}`;
}
export async function verifyPassword(password,encoded){
 if(typeof password!=='string'||password.length>128||!/^scrypt:[a-f0-9]{64}:[a-f0-9]{128}$/.test(encoded||''))return false;
 const [,salt,value]=encoded.split(':');
 const digest=await scrypt(password,salt,64,opts);
 return timingSafeEqual(Buffer.from(digest),Buffer.from(value,'hex'));
}
const version=env=>createHash('sha256').update(env.OWNER_PASSWORD_HASH||'').digest('hex');
const config=(env,store)=>({
 secret:env.SESSION_SECRET,basePath:'/api/auth',trustHost:true,
 session:{strategy:'jwt',maxAge:86400},
 providers:[Credentials({credentials:{email:{type:'email'},password:{type:'password'}},
  async authorize(credentials,request){
   const ip=request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
   if(!await store.consumeLoginAttempt(ip))return null;
   if(typeof credentials.email!=='string'||credentials.email.trim().toLowerCase()!==env.TEAM_ADMIN_EMAIL?.toLowerCase())return null;
   if(!await verifyPassword(credentials.password,env.OWNER_PASSWORD_HASH))return null;
   return {id:'owner',email:env.TEAM_ADMIN_EMAIL,name:'관리자'};
  }
 })],
 callbacks:{
  jwt({token,user}){if(user)token.ownerVersion=version(env);return token.ownerVersion===version(env)?token:null;},
  session({session,token}){session.user={id:token.sub,email:token.email,name:'관리자'};return session;}
 },
 logger:{error(error){console.error('Authentication failed:',error.type||error.name);},warn(){},debug(){}}
});
function cookies(from,to){for(const cookie of from.headers.getSetCookie())to.headers.append('Set-Cookie',cookie);return to;}
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function ownerSession(request,env,store){
 if(!env.OWNER_PASSWORD_HASH||!env.SESSION_SECRET)return null;
 const url=new URL('/api/auth/session',request.url);
 const result=await Auth(new Request(url,{headers:{cookie:request.headers.get('cookie')||''}}),config(env,store));
 const session=await result.json();
 return session?.user?.id==='owner'&&session.user.email===env.TEAM_ADMIN_EMAIL?{...session.user,email_confirmed_at:'owner-configured'}:null;
}
export async function ownerAuthRoute(request,env,store){
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/api/auth/'))return null;
 if(!env.OWNER_PASSWORD_HASH||!env.SESSION_SECRET)return json({error:'관리자 계정 설정을 준비하고 있습니다.'},503);
 if(path==='/api/auth/session'&&request.method==='GET')return json({canEdit:Boolean(await ownerSession(request,env,store))});
 if(path==='/api/auth/csrf'&&request.method==='GET')return Auth(request,config(env,store));
 if((path==='/api/auth/login'||path==='/api/auth/logout')&&request.method==='POST'){
  const input=await request.json();
  if(typeof input.csrfToken!=='string')return json({error:'로그인 화면을 새로고침해 주세요.'},403);
  const login=path.endsWith('/login');
  const destination=new URL(login?'/api/auth/callback/credentials':'/api/auth/signout',url);
  const form=new URLSearchParams({csrfToken:input.csrfToken,callbackUrl:url.origin});
  if(login){form.set('email',typeof input.email==='string'?input.email:'');form.set('password',typeof input.password==='string'?input.password:'');}
  const response=await Auth(new Request(destination,{method:'POST',headers:{cookie:request.headers.get('cookie')||'','Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1',Origin:url.origin},body:form}),config(env,store));
  const body=await response.json();
  const failed=response.status>=400||new URL(body.url||url.origin).searchParams.has('error');
  return cookies(response,failed?json({error:'이메일 또는 비밀번호를 확인해 주세요. 반복 시도했다면 15분 후 다시 시도해 주세요.'},401):json({canEdit:login,ok:true}));
 }
 return json({error:'지원하지 않는 요청입니다.'},404);
}

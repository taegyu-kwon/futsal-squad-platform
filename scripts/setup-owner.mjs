import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {hashPassword} from '../lib/owner-auth.mjs';
const port=4210,origin=`http://127.0.0.1:${port}`,nonce=randomBytes(32).toString('hex');
let complete=false;
const page=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FUTSAL LEAGUE 관리자 설정</title><style>body{background:#10190f;color:#ecf4e5;font:17px system-ui;max-width:440px;margin:64px auto;padding:24px}h1{font-size:28px}p{line-height:1.7;color:#adba9f}label{display:block;margin:24px 0}input,button{box-sizing:border-box;width:100%;padding:16px;margin-top:10px;border-radius:12px;border:1px solid #536b40;background:#1d2b19;color:inherit;font:inherit}button{background:#c2f766;color:#18230e;font-weight:bold;cursor:pointer}.message{color:#c2f766}</style><h1>FUTSAL LEAGUE 관리자 설정</h1><p>새 앱의 관리자 아이디는 <strong>admin</strong>입니다.<br>사용할 비밀번호를 직접 정해 주세요.</p><form><label>새 비밀번호<input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>비밀번호 확인<input type="password" name="confirm" autocomplete="new-password" minlength="12" maxlength="128" required></label><p>12자 이상으로 입력해 주세요. 비밀번호는 채팅으로 전송되지 않으며 검증용 해시만 저장됩니다.</p><button>관리자 비밀번호 설정</button><p class="message" role="status"></p></form><script>const f=document.querySelector('form'),m=document.querySelector('.message');f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;try{const r=await fetch('/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:f.password.value,confirm:f.confirm.value,nonce:'${nonce}'})});const d=await r.json();m.textContent=d.message;if(r.ok){f.reset();b.textContent='설정 완료';}else b.disabled=false;}catch{m.textContent='연결을 확인해 주세요.';b.disabled=false;}};</script></html>`;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
 if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(complete?'<h1>관리자 설정이 완료되었습니다.</h1>':page);return;}
 if(req.method!=='POST'||req.url!=='/setup'||req.headers.origin!==origin||complete){res.writeHead(403);res.end();return;}
 try{
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('입력값이 너무 큽니다.');chunks.push(chunk);}
  const data=JSON.parse(Buffer.concat(chunks));
  if(typeof data.nonce!=='string'||data.nonce.length!==nonce.length||!timingSafeEqual(Buffer.from(data.nonce),Buffer.from(nonce)))throw Error('화면을 새로고침해 주세요.');
  if(data.password!==data.confirm)throw Error('비밀번호가 일치하지 않습니다.');
  const hash=await hashPassword(data.password);
  const vars={AUTH_PROVIDER:'credentials',TEAM_ADMIN_EMAIL:'admin',OWNER_PASSWORD_HASH:hash,SESSION_SECRET:randomBytes(48).toString('base64url')};
  await writeFile(new URL('../.env.admin',import.meta.url),Object.entries(vars).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600,flag:'wx'});
  complete=true;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:'설정 완료. 이 창을 닫아도 됩니다. 비밀번호를 기억해 주세요.'}));console.log('Owner credentials configured (password not logged).');
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({message:e.code==='EEXIST'?'이미 관리자 설정이 저장되어 있습니다.':e.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Owner setup ready at ${origin}`));

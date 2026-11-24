(()=>{
 const link=document.createElement('button');link.type='button';link.className='admin-account-link';link.textContent='관리자 로그인';
 document.querySelector('footer')?.append(link);
 const dialog=document.createElement('dialog');dialog.className='admin-auth-dialog';dialog.setAttribute('aria-labelledby','admin-auth-title');
 dialog.innerHTML='<form id="admin-auth-form"><div class="admin-auth-heading"><h2 id="admin-auth-title">관리자 로그인</h2><button type="button" class="admin-auth-close" aria-label="닫기">×</button></div><p>선수 정보와 팀 설정을 관리합니다.</p><label>관리자 아이디<input name="email" type="text" value="admin" autocomplete="username" required></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label><p class="admin-auth-error" role="alert"></p><button type="submit" class="btn primary">로그인</button></form>';
 document.body.append(dialog);const form=dialog.querySelector('form'),error=dialog.querySelector('.admin-auth-error'),submit=form.querySelector('[type=submit]');let admin=false;
 const call=async(path,body)=>{if(body){const csrf=await fetch('/api/auth/csrf',{credentials:'same-origin',cache:'no-store'});if(!csrf.ok)throw Error('로그인 연결을 확인해 주세요.');body={...body,csrfToken:(await csrf.json()).csrfToken};}const response=await fetch('/api/auth/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'로그인에 실패했습니다.');return data;};
 call('session').then(data=>{admin=data.canEdit;link.textContent=admin?'관리자 로그아웃':'관리자 로그인';}).catch(()=>{});
 link.addEventListener('click',async()=>{
  if(admin){link.disabled=true;try{await window.TeamSync?.save();if(window.TeamSync?.hasPending)throw Error('저장 대기 중');await call('logout',{});location.reload();}catch(e){link.disabled=false;link.textContent='로그아웃 다시 시도';}return;}
  error.textContent='';dialog.showModal();form.elements.email.focus();
 });
 dialog.querySelector('.admin-auth-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{form.elements.password.value='';});
 form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;error.textContent='';try{await call('login',{email:form.elements.email.value,password:form.elements.password.value});form.elements.password.value='';location.reload();}catch(e){error.textContent=e.message;}finally{submit.disabled=false;}});
})();

/* Shared team snapshot bootstraps before the application reads its browser cache. */
(async()=>{
 const keys=['unit-fc-club-v1','unit-fc-pilot-roster-v1','unit-fc-player-info-v1','unit-fc-player-traits-v1','unit-fc-squads-v1','unit-fc-v1'];
 const rawGet=Storage.prototype.getItem,rawSet=Storage.prototype.setItem;
 const local=()=>Object.fromEntries(keys.map(k=>[k,rawGet.call(localStorage,k)]).filter(([,v])=>v!==null));
 const original=local();let data={},photos={},revision=0,canEdit=false,busy=false,dirty=false,ready=false,conflicted=false,timer,change=0,refreshing=false,remotePending=false,readError=false;
 const banner=document.createElement('section');banner.id='shared-banner';banner.setAttribute('aria-live','polite');document.querySelector('.app-shell').insertBefore(banner,document.querySelector('main'));
 function status(text,action,visible=true){banner.hidden=!visible;banner.replaceChildren();const span=document.createElement('span');span.textContent=text+(revision?' · 공용 v'+revision:'')+' · 동기화 3';banner.append(span);if(action){const button=document.createElement('button');button.type='button';button.textContent=action.label;button.addEventListener('click',action.run);banner.append(button);}if(canEdit&&rawGet.call(localStorage,'unit-fc-sync-recovered')==='1'){const recover=document.createElement('button');recover.textContent='기기 입력 백업 받기';recover.addEventListener('click',downloadBackup);banner.append(recover);}}
 async function backup(snapshot){return new Promise((resolve,reject)=>{const req=indexedDB.open('unit-fc-sharing-backups',1);req.onupgradeneeded=()=>req.result.createObjectStore('snapshots',{autoIncrement:true});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').add({createdAt:new Date().toISOString(),data:snapshot});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};});}
 async function downloadBackup(){
  const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('unit-fc-sharing-backups',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  try{const saved=await new Promise((resolve,reject)=>{const req=db.transaction('snapshots').objectStore('snapshots').openCursor(null,'prev');req.onsuccess=()=>resolve(req.result?.value);req.onerror=()=>reject(req.error);});if(!saved)return;const url=URL.createObjectURL(new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='선수정보-기기백업.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}finally{db.close();}
 }
 async function request(url,options){const r=await fetch(url,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000),...options});let result;try{result=await r.json();}catch{throw Error('서버 응답을 읽지 못했습니다. 다시 시도해 주세요.');}if(!r.ok){const e=Error(result.error||'공유 저장에 실패했습니다.');e.status=r.status;throw e;}return result;}
 status('공유 데이터를 불러오는 중…',undefined,false);
 let initial;
 try{initial=await request('/api/shared?fresh='+Date.now());}catch(error){status(error.message,{label:'다시 시도',run:()=>location.reload()});AppLoading.fail(error.message);return;}
 canEdit=initial.canEdit;revision=initial.revision;photos=initial.photos||{};
 const oldDirty=rawGet.call(localStorage,'unit-fc-sync-dirty')==='1';
 data=SharedStore.initialData({initial,original,canEdit});
 // Preserve interrupted drafts before retiring their marker. They must never replace the live roster on boot.
 if(canEdit&&initial.revision>0&&oldDirty){
  try{await backup(original);rawSet.call(localStorage,'unit-fc-sync-dirty','0');rawSet.call(localStorage,'unit-fc-sync-recovered','1');}
  catch{AppLoading.fail('이 기기의 미전송 입력을 백업하지 못했습니다. 다시 시도해 주세요.');status('이 기기의 미전송 입력을 백업하지 못했습니다. 원본을 보존하고 연결을 중단했습니다.',{label:'다시 시도',run:()=>location.reload()});return;}
 }
 if(canEdit&&initial.revision>0)rawSet.call(localStorage,'unit-fc-sync-revision',String(revision));
 window.TeamStore=SharedStore.create({keys,readData:()=>data,writeData:(key,value)=>{data[key]=value;markDirty();},storage:localStorage,canEdit:()=>canEdit});
 function markDirty(){dirty=true;change++;rawSet.call(localStorage,'unit-fc-sync-dirty','1');if(revision>0&&!conflicted){clearTimeout(timer);timer=setTimeout(saveShared,450);}if(ready)updateStatus();}
 function updateStatus(){
  if(readError){status('공유 정보 연결 실패 · 현재 화면은 최신 정보가 아닐 수 있습니다.',{label:'다시 확인',run:()=>AppLoading.during('최신 정보를 확인하고 있어요',refreshShared,{mode:'background'})});return;}
  if(remotePending&&!dirty&&!busy&&!conflicted){status('다른 기기에서 새 정보를 저장했습니다. 편집을 마치면 적용됩니다.',{label:'최신 정보 확인',run:()=>AppLoading.during('최신 정보를 확인하고 있어요',refreshShared,{mode:'background'})});return;}
  if(!canEdit){status(revision?'공유 보기 · 15초마다 최신 정보를 확인합니다.':'관리자가 데이터를 공유할 준비를 하고 있습니다.',{label:'최신 정보 확인',run:()=>AppLoading.during('최신 정보를 확인하고 있어요',refreshShared,{mode:'background'})},!revision);return;}
  if(conflicted){status('다른 기기의 변경과 겹쳤습니다. 현재 입력은 이 기기에 보관되어 있습니다.',{label:'최신 공유본 불러오기',run:async()=>{await backup(local());rawSet.call(localStorage,'unit-fc-sync-dirty','0');location.reload();}});return;}
  if(busy){status('팀 데이터를 공유 저장소에 저장 중…',undefined,false);return;}
  if(!revision){status('이 기기에 입력한 선수·사진·팀 설정을 한 번 공유하면 폰에서도 볼 수 있습니다.',{label:'이 기기 데이터 공유하기',run:importLocal});return;}
  status(dirty?'변경 사항 저장 대기 중…':'공유 저장 완료 · 15초마다 최신 정보를 확인합니다.',dirty?{label:'다시 저장',run:saveShared}:{label:'최신 정보 확인',run:()=>AppLoading.during('최신 정보를 확인하고 있어요',refreshShared,{mode:'background'})},false);
 }
 function editingNow(){
  const dialog=document.querySelector('dialog[open]');
  if(document.querySelector('.pitch-player.dragging'))return true;
  if(!canEdit&&location.hash==='#squad'&&typeof SquadUI!=='undefined'&&SquadUI.previewChanged)return true;
  if(dialog&&(dialog.querySelector('form')||dialog.querySelector('#modal-title')?.textContent!=='선수 상세'))return true;
  const focused=document.activeElement;
  if(focused?.matches('input,textarea,select,[contenteditable="true"]'))return true;
  // These pages contain drafts which have not necessarily been saved yet.
  return canEdit&&['#reviews','#tactics','#inhouse'].includes(location.hash);
 }
 function reloadLatest(){
  try{const dialog=document.querySelector('dialog[open]');const detailId=dialog?.querySelector('#modal-title')?.textContent==='선수 상세'?dialog.querySelector('[data-action=pilot-edit]')?.dataset.id:null;sessionStorage.setItem('unit-fc-sync-scroll',JSON.stringify({hash:location.hash,y:window.scrollY,detailId,detailScroll:dialog?.scrollTop||0}));}catch{}
  location.reload();
 }
 async function refreshShared(){
  if(!ready||refreshing||busy)return;
  refreshing=true;const startedChange=change,startedRevision=revision;
  try{
   const next=await request('/api/shared?fresh='+Date.now());readError=false;
   const decision=SharedRefreshPolicy.decide({revision,remoteRevision:next.revision,changedDuringRequest:change!==startedChange||revision!==startedRevision,busy,dirty,conflicted,editing:editingNow(),identityChanged:next.canEdit!==canEdit});
   if(decision==='reload'){reloadLatest();return;}
   if(decision==='conflict')conflicted=true;
   if(decision==='defer')remotePending=true;
   if(decision==='unchanged')remotePending=false;
   updateStatus();
  }catch{readError=true;updateStatus();}finally{refreshing=false;}
 }
 async function saveShared(){
  if(!canEdit||busy||conflicted)return;busy=true;readError=false;updateStatus();const version=change;const endLoading=AppLoading.begin('팀 정보를 저장하고 있어요',{mode:'background',delay:250});
  try{const result=await request('/api/shared',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:revision,data,photos})});revision=result.revision;rawSet.call(localStorage,'unit-fc-sync-revision',String(revision));dirty=change!==version;rawSet.call(localStorage,'unit-fc-sync-dirty',dirty?'1':'0');busy=false;updateStatus();if(dirty)timer=setTimeout(saveShared,450);}
  catch(error){busy=false;if(error.status===409)conflicted=true;if(conflicted)updateStatus();else if(error.status===403)status('현재 계정에는 저장 권한이 없습니다. 입력값은 이 기기에 보관되어 있습니다.');else status(error.message,{label:'다시 저장',run:saveShared});}
  finally{endLoading();}
 }
 async function uploadPhoto(id,blob){if(!canEdit)throw Error('관리자만 사진을 수정할 수 있습니다.');if(blob){const bytes=await blob.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');const upload=await request('/api/media/sign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash,type:blob.type||'image/png',size:blob.size})});if(!upload.exists&&upload.uploadId){for(let offset=0,part=0;offset<blob.size;offset+=upload.chunkSize,part++){await request('/api/media/chunk/'+upload.uploadId+'/'+part,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:blob.slice(offset,offset+upload.chunkSize)});}}else if(!upload.exists){const response=await fetch(upload.uploadUrl,{method:'PUT',headers:{'Content-Type':blob.type||'image/png'},body:blob,signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('사진 업로드에 실패했습니다. 다시 시도해 주세요.');}const result=await request('/api/media/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash,uploadId:upload.uploadId})});photos[id]=result.url;}else photos[id]='';markDirty();}
 async function importLocal(){
  if(busy)return;busy=true;updateStatus();const endLoading=AppLoading.begin('선수 정보와 사진을 공유하고 있어요');
  try{await backup(original);const records=await window.PlayerPhotos.exportLocal();for(const [id,blob] of records)await uploadPhoto(id,blob);busy=false;await saveShared();}
  catch(error){busy=false;status('기존 데이터는 보존되어 있습니다. '+error.message,{label:'공유 다시 시도',run:importLocal});}
  finally{endLoading();}
 }
 const editActions=new Set(['player-traits-edit','pilot-edit','photo-edit','photo-remove','player-info-edit','club-settings','create-match','record-match','save-tactics','strategy','save-squad','best','random','formation','slot','assign','sub','squad-preset','squad-template-undo','squad-template-save','squad-template-rename','squad-template-update','squad-template-delete','squad-save']);
 document.documentElement.dataset.sharedReadonly=canEdit?'false':'true';
 document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!canEdit&&action&&editActions.has(action)){e.preventDefault();e.stopImmediatePropagation();status('현재 읽기 전용 화면입니다.');}},true);
 document.addEventListener('submit',e=>{if(!canEdit&&!['squad-slot-form','admin-auth-form'].includes(e.target.id)){e.preventDefault();e.stopImmediatePropagation();status('관리자만 저장할 수 있습니다.');}},true);
 window.TeamSync={get hasPending(){return dirty||busy||conflicted;},refresh:refreshShared,get canEdit(){return canEdit;},photoUrl:id=>Object.hasOwn(photos,id)?photos[id]:undefined,photoSaved:uploadPhoto,save:saveShared};
 const scripts=JSON.parse(document.getElementById('app-scripts').textContent);
 try{for(const src of scripts)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;const timeout=setTimeout(()=>reject(Error('화면 준비 시간이 길어지고 있습니다. 다시 시도해 주세요.')),15000);script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);reject(Error('화면 파일을 불러오지 못했습니다.'));};document.body.append(script);});ready=true;updateStatus();try{const position=JSON.parse(sessionStorage.getItem('unit-fc-sync-scroll')||'null');sessionStorage.removeItem('unit-fc-sync-scroll');if(position?.hash===location.hash)requestAnimationFrame(()=>{window.scrollTo(0,position.y);if(position.detailId){pilotPlayerModal(Number(position.detailId));document.querySelector('#modal').scrollTop=position.detailScroll;}});}catch{}if(dirty&&revision&&!conflicted)saveShared();await AppLoading.finishBoot();}
 catch(error){status(error.message,{label:'다시 시도',run:()=>location.reload()});AppLoading.fail(error.message);}
 setInterval(()=>{if(document.visibilityState==='visible')refreshShared();},15000);
 window.addEventListener('focus',refreshShared);
 window.addEventListener('pageshow',event=>{if(event.persisted)refreshShared();});
 window.addEventListener('online',refreshShared);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshShared();});
 document.addEventListener('close',()=>{if(remotePending)setTimeout(refreshShared,0);},true);
 window.addEventListener('hashchange',()=>{if(remotePending)setTimeout(refreshShared,0);});
 window.addEventListener('beforeunload',e=>{if(canEdit&&dirty){e.preventDefault();e.returnValue='';}});
})();

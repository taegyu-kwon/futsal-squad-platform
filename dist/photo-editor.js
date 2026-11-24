/* Photo editing stays on device; the applied portrait is shared through TeamSync. */
let photoDraft=null,photoRevision=0;
function clearPhotoDraft(){photoDraft?.loadingEnd?.();photoRevision++;BackgroundRemover.cancel();for(const url of photoDraft?.ownedUrls||[])URL.revokeObjectURL(url);photoDraft=null;photoGesture=null;photoPointers.clear();}
function photoError(message){const node=document.getElementById('photo-error');if(node){node.hidden=false;node.textContent=message}}
function refreshPhotoCards(){document.querySelectorAll('.player-card[data-id]:not(.photo-layer-card) .card-person').forEach(node=>{const p=getPlayer(node.closest('.player-card').dataset.id);if(p)node.innerHTML=portrait(p)});window.AppLoading?.prepare($('#main'));if($('#modal').open)window.AppLoading?.prepare($('#modal'));}
function openPhotoEditor(id){
  const p=getPlayer(id);if(!p)return;
  if($('#modal').open)closeModal();clearPhotoDraft();
  const preview=card(p).replace('<button ','<div ').replace('class="player-card','class="photo-layer-card player-card').replace('data-action="player"','').replace('</button>','</div>');
  modal('카드에서 사진 조정',`<div class="photo-editor-scroll"><div class="photo-layer-preview">${preview}</div><p class="photo-layer-help" id="photo-layer-help">사진을 끌어 위치 조정 · 두 손가락으로 확대·축소<br>컴퓨터에서는 마우스 휠 또는 아래 − / + 버튼을 사용하세요.</p><fieldset id="photo-adjustments" class="photo-zoom-tools" disabled><legend class="visually-hidden">사진 크기 조절</legend><button type="button" data-action="photo-zoom-out" aria-label="사진 축소">−</button><output id="photo-zoom-level" aria-live="polite">100%</output><button type="button" data-action="photo-zoom-in" aria-label="사진 확대">+</button><button type="button" data-action="photo-reset">초기화</button></fieldset><div class="photo-picker"><label class="btn secondary wide" for="player-photo-file">사진 선택 · 교체</label><input id="player-photo-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="선수 사진 파일" data-player-id="${id}"></div><p class="photo-format">JPG · PNG · WebP / 최대 20MB</p><div class="photo-background-tools"><button class="btn wide" id="photo-bg-remove" data-action="photo-bg-remove" disabled>배경 자동 제거</button><div class="photo-background-toggle" id="photo-bg-toggle" hidden><button data-action="photo-bg-view" data-value="original" aria-pressed="false">원본 보기</button><button data-action="photo-bg-view" data-value="cutout" aria-pressed="true">제거 결과</button></div><p id="photo-bg-status" role="status">사진을 선택하면 사용할 수 있습니다.</p></div><p id="photo-error" class="form-error" role="alert" hidden></p><p class="prototype-note">적용한 사진은 팀 공유 화면에 반영됩니다.<br>원본과 편집 위치는 이 기기에 보관됩니다.</p></div><div class="modal-actions photo-apply-actions"><button class="btn secondary" data-action="photo-cancel" data-id="${id}">취소</button><button class="btn" id="photo-save" data-action="photo-save" data-id="${id}" disabled>카드에 적용</button></div>`);
  $('#modal').classList.add('photo-editor-modal');
  const target=$('.photo-layer-card .card-person');target.id='photo-crop';target.tabIndex=0;target.setAttribute('role','img');target.setAttribute('aria-label','선수 사진 조정 영역');target.setAttribute('aria-describedby','photo-layer-help');
  const saved=PlayerPhotos.editorState(id),existing=PlayerPhotos.url(id,p.photo);if(existing)loadPhotoSource(id,saved?.source||existing,false,saved?'':PlayerPhotos.originalUrl(id),saved);

}
function drawPhotoPreview(){
  if(!photoDraft?.image)return;const d=photoDraft,r=PlayerPhotos.cropRect(d.image.naturalWidth,d.image.naturalHeight,d.zoom,d.x,d.y);
  const img=document.getElementById('photo-preview');if(!img)return;
  $('#photo-zoom-level').textContent=Math.round(d.zoom*100)+'%';
  document.querySelector('[data-action="photo-zoom-out"]').disabled=d.zoom<=.25;document.querySelector('[data-action="photo-zoom-in"]').disabled=d.zoom>=4;
  img.style.cssText=`width:${d.image.naturalWidth/r.width*100}%;height:${d.image.naturalHeight/r.height*100}%;left:${-r.x/r.width*100}%;top:${-r.y/r.height*100}%`;
}
async function choosePlayerPhoto(input){
  const file=input.files?.[0];if(!file)return;
  const id=Number(input.dataset.playerId);input.value='';
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){photoError('JPG, PNG 또는 WebP 이미지를 선택해 주세요. HEIC 사진은 JPG로 변환해 주세요.');return;}
  if(file.size>20*1024*1024){photoError('사진은 20MB 이하로 선택해 주세요.');return;}
  loadPhotoSource(id,URL.createObjectURL(file),true);
}
async function loadPhotoSource(id,url,owned,savedOriginal='',savedEditor=null){
  clearPhotoDraft();const revision=photoRevision;photoDraft={id,url,image:null,originalImage:null,originalUrl:url,ownedUrls:owned?[url]:[],zoom:1,x:50,y:50,backgroundBusy:false};
  $('#photo-save').disabled=true;$('#photo-adjustments').disabled=true;$('#photo-bg-remove').disabled=true;$('#photo-bg-toggle').hidden=true;$('#photo-error').hidden=true;
  $('#photo-bg-status').textContent='사진을 불러오는 중…';
  const endLoading=photoDraft.loadingEnd=AppLoading.begin('선수 사진을 준비하고 있어요');
  const img=new Image();
  try{
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('decode'));img.src=url});
    if(revision!==photoRevision||!$('#photo-crop'))return;
    if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>50000000)throw new Error('size');
    photoDraft.image=photoDraft.originalImage=img;$('#photo-crop').innerHTML=`<img id="photo-preview" src="${url}" alt="카드에 적용할 선수 사진 미리보기">`;
    if(savedEditor){
      Object.assign(photoDraft,savedEditor.crop);
      if(savedEditor.cutout){const cutout=new Image();const loaded=await new Promise(resolve=>{cutout.onload=()=>resolve(true);cutout.onerror=()=>resolve(false);cutout.src=savedEditor.cutout;});if(revision!==photoRevision)return;if(loaded){photoDraft.cutoutImage=cutout;photoDraft.cutoutUrl=savedEditor.cutout;$('#photo-bg-toggle').hidden=false;if(savedEditor.crop.view==='cutout')setPhotoBackgroundView('cutout');}}
    }
    if(savedOriginal){
      const original=new Image();const loaded=await new Promise(resolve=>{original.onload=()=>resolve(true);original.onerror=()=>resolve(false);original.src=savedOriginal});
      if(revision!==photoRevision)return;
      if(loaded){photoDraft.originalImage=original;photoDraft.originalUrl=savedOriginal;photoDraft.cutoutImage=img;photoDraft.cutoutUrl=url;$('#photo-bg-toggle').hidden=false;setPhotoBackgroundView('cutout');}
    }
    $('#photo-adjustments').disabled=false;$('#photo-save').disabled=false;$('#photo-bg-remove').disabled=false;$('#photo-bg-remove').textContent='배경 자동 제거';$('#photo-bg-status').textContent='사진은 기기 안에서 처리됩니다. 첫 실행은 조금 더 걸릴 수 있어요.';drawPhotoPreview();
  }catch(error){if(revision!==photoRevision)return;clearPhotoDraft();$('#photo-bg-status').textContent='다른 사진을 선택해 주세요.';photoError(error.message==='size'?'사진 해상도가 너무 큽니다. 5천만 화소 이하의 사진을 선택해 주세요.':'이미지를 읽을 수 없습니다. 다른 JPG, PNG 또는 WebP 사진을 선택해 주세요.');}
  finally{endLoading();}
}
async function removePhotoBackground(){
  const d=photoDraft,revision=photoRevision;if(!d?.originalImage||d.backgroundBusy)return;
  photoGesture=null;photoPointers.clear();d.backgroundBusy=true;$('#photo-adjustments').disabled=true;$('#photo-bg-remove').disabled=true;$('#photo-save').disabled=true;$('#photo-error').hidden=true;
  const endLoading=d.loadingEnd=AppLoading.begin('사진의 배경을 제거하고 있어요');
  $('#photo-bg-remove').textContent='배경 제거 중…';$('#photo-bg-status').textContent='인물 분리 도구를 준비하고 있어요…';
  try{
    const blob=await BackgroundRemover.remove(d.originalImage,stage=>{endLoading.update(stage==='loading'?'인물 분리 도구를 준비하고 있어요':'사진의 배경을 제거하고 있어요');if(revision===photoRevision)$('#photo-bg-status').textContent=stage==='loading'?'인물 분리 모델을 불러오는 중…':'인물 윤곽과 배경을 분리하고 있어요…'});
    if(revision!==photoRevision)return;
    const url=URL.createObjectURL(blob);d.ownedUrls.push(url);const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});
    if(revision!==photoRevision)return;
    d.cutoutImage=image;d.cutoutUrl=url;d.backgroundBusy=false;$('#photo-bg-toggle').hidden=false;setPhotoBackgroundView('cutout');
    $('#photo-bg-status').textContent='배경 제거 완료. 경계를 확인하고 카드에 적용하세요. 원본 보기로 되돌릴 수 있어요.';
    $('#photo-bg-remove').textContent='다시 제거';
  }catch(error){if(revision!==photoRevision)return;photoError(error.message);$('#photo-bg-status').textContent='원본 사진은 유지됩니다. 다시 시도하거나 원본으로 저장할 수 있어요.';$('#photo-bg-remove').textContent='배경 제거 다시 시도';}
  finally{endLoading();if(revision===photoRevision){d.backgroundBusy=false;$('#photo-adjustments').disabled=false;$('#photo-bg-remove').disabled=false;$('#photo-save').disabled=false;}}
}
function setPhotoBackgroundView(view){
  const d=photoDraft;if(!d||d.backgroundBusy||d.saving)return;
  if(view==='cutout'&&!d.cutoutImage)return;
  photoGesture=null;photoPointers.clear();d.image=view==='cutout'?d.cutoutImage:d.originalImage;d.url=view==='cutout'?d.cutoutUrl:d.originalUrl;
  $('#photo-preview').src=d.url;document.querySelectorAll('[data-action="photo-bg-view"]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.value===view)));drawPhotoPreview();
}

async function savePlayerPhoto(id){
  const d=photoDraft;if(!d?.image||d.id!==id||d.backgroundBusy)return;const revision=photoRevision;
  const endLoading=d.loadingEnd=AppLoading.begin('선수 카드에 사진을 적용하고 있어요');
  d.saving=true;photoGesture=null;photoPointers.clear();$('#photo-adjustments').disabled=true;$('#photo-bg-remove').disabled=true;$('#player-photo-file').disabled=true;$('#photo-save').disabled=true;$('#photo-save').textContent='저장 중…';$('#photo-error').hidden=true;
  try{
    const r=PlayerPhotos.cropRect(d.image.naturalWidth,d.image.naturalHeight,d.zoom,d.x,d.y),canvas=document.createElement('canvas');canvas.width=512;canvas.height=544;
    canvas.getContext('2d').drawImage(d.image,-r.x/r.width*512,-r.y/r.height*544,d.image.naturalWidth/r.width*512,d.image.naturalHeight/r.height*544);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));if(!blob)throw new Error('encode');
    if(revision!==photoRevision)return;
    const encodeSource=async image=>{const c=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));c.width=Math.max(1,Math.round(image.naturalWidth*scale));c.height=Math.max(1,Math.round(image.naturalHeight*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',.94));if(!blob)throw new Error('source encode');return blob;};
    const source=await encodeSource(d.originalImage),cutout=d.cutoutImage?await encodeSource(d.cutoutImage):undefined;
    if(revision!==photoRevision)return;
    const view=d.cutoutImage&&d.image===d.cutoutImage?'cutout':'original';
    await PlayerPhotos.save(id,blob,view==='cutout'?source:undefined,{source,cutout,crop:{zoom:d.zoom,x:d.x,y:d.y,view}});refreshPhotoCards();
    if(revision===photoRevision){playerModal(id);toast('선수 사진을 적용했습니다. 상단의 공유 저장 상태를 확인하세요.');}
  }catch{if(revision===photoRevision){d.saving=false;$('#photo-adjustments').disabled=false;$('#photo-bg-remove').disabled=false;$('#player-photo-file').disabled=false;photoError('사진을 저장하지 못했습니다. 브라우저 저장 공간과 개인정보 보호 설정을 확인한 후 다시 시도해 주세요. 기존 사진은 유지됩니다.');$('#photo-save').disabled=false;$('#photo-save').textContent='카드에 적용';}}
  finally{endLoading();}
}
async function removePlayerPhoto(id){
  const endLoading=AppLoading.begin('선수 사진을 변경하고 있어요');
  try{await PlayerPhotos.remove(id);refreshPhotoCards();playerModal(id);toast('사진을 삭제하고 기본 일러스트로 변경했습니다.');}
  catch{toast('사진 삭제에 실패했습니다. 다시 시도해 주세요.');}
  finally{endLoading();}
}
document.addEventListener('change',e=>{if(e.target.id==='player-photo-file')choosePlayerPhoto(e.target)});

document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el)return;const id=Number(el.dataset.id);switch(el.dataset.action){case'photo-zoom-in':zoomPhoto(photoDraft?.zoom*1.15);break;case'photo-zoom-out':zoomPhoto(photoDraft?.zoom/1.15);break;case'photo-reset':if(photoEditable()){Object.assign(photoDraft,{zoom:1,x:50,y:50});drawPhotoPreview();}break;case'photo-bg-remove':removePhotoBackground();break;case'photo-bg-view':setPhotoBackgroundView(el.dataset.value);break;case'photo-edit':openPhotoEditor(id);break;case'photo-save':savePlayerPhoto(id);break;case'photo-remove':removePlayerPhoto(id);break;case'photo-cancel':playerModal(id);break;}});
$('#modal').addEventListener('close',()=>{if(!$('#modal').open)clearPhotoDraft()});
PlayerPhotos.ready.then(refreshPhotoCards).catch(()=>{});

// Pointer events keep one-finger drag and two-finger pinch in the same photo layer.
const photoPointers=new Map();let photoGesture=null;
function photoEditable(){return Boolean(photoDraft?.image&&!photoDraft.backgroundBusy&&!photoDraft.saving);}
function zoomPhoto(value,ax=.5,ay=.5){if(!photoEditable())return;const d=photoDraft;Object.assign(d,PlayerPhotos.zoomCrop(d.image.naturalWidth,d.image.naturalHeight,d,value,ax,ay));drawPhotoPreview();}
function startPhotoGesture(target){if(!photoEditable())return;photoGesture={target,start:[...photoPointers.values()].slice(0,2).map(p=>({...p})),transform:{zoom:photoDraft.zoom,x:photoDraft.x,y:photoDraft.y},rect:target.getBoundingClientRect()};}
document.addEventListener('pointerdown',e=>{const target=e.target.closest('#photo-crop');if(!target||!photoEditable()||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();target.focus({preventScroll:true});photoPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});target.setPointerCapture(e.pointerId);target.classList.add('is-adjusting');startPhotoGesture(target);});
document.addEventListener('pointermove',e=>{if(!photoGesture||!photoPointers.has(e.pointerId)||!photoEditable())return;e.preventDefault();photoPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const d=photoDraft,g=photoGesture;Object.assign(d,PlayerPhotos.gestureCrop(d.image.naturalWidth,d.image.naturalHeight,g.transform,g.start,[...photoPointers.values()].slice(0,2),g.rect));drawPhotoPreview();});
function finishPhotoGesture(e){if(!photoPointers.has(e.pointerId))return;photoPointers.delete(e.pointerId);const target=photoGesture?.target;photoGesture=null;if(target){if(photoPointers.size)startPhotoGesture(target);else target.classList.remove('is-adjusting');}}
for(const event of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(event,finishPhotoGesture);
document.addEventListener('wheel',e=>{const target=e.target.closest('#photo-crop');if(!target||!photoEditable())return;e.preventDefault();const r=target.getBoundingClientRect();zoomPhoto(photoDraft.zoom*Math.exp(-e.deltaY*.002),(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);},{passive:false});
document.addEventListener('keydown',e=>{if(e.target.id!=='photo-crop'||!photoEditable())return;const d=photoDraft,delta=e.shiftKey?12:4;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const r=e.target.getBoundingClientRect();Object.assign(d,PlayerPhotos.panCrop(d.image.naturalWidth,d.image.naturalHeight,d,e.key==='ArrowLeft'?-delta:e.key==='ArrowRight'?delta:0,e.key==='ArrowUp'?-delta:e.key==='ArrowDown'?delta:0,r.width,r.height));drawPhotoPreview();}else if(['+','=','-'].includes(e.key)){e.preventDefault();zoomPhoto(d.zoom*(e.key==='-'?1/1.15:1.15));}});

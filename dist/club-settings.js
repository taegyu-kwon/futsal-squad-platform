const ClubSettings = (() => {
  const key = 'unit-fc-club-v1';
  const fallbackImage = 'assets/team-emblem.png'; // built-in team crest, used until an emblem image is uploaded
  const defaults = {name:'흑표범 FC', affiliation:'', emblem:'U', motto:'함께 뛰는 순간, 우리는 하나가 된다.'};
  const limits = {name:24, affiliation:40, emblem:2, motto:80};
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bounded = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const png = value => typeof value === 'string' && value.length <= 2000000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) ? value : '';
  function normalize(value) {
    const result = {...defaults};
    for (const field of Object.keys(defaults)) {
      if (typeof value?.[field] === 'string') result[field] = value[field].trim().slice(0, limits[field]);
    }
    if (!result.name) result.name = defaults.name;
    if (!result.emblem) result.emblem = defaults.emblem;
    result.image = png(value?.image);
    result.source = result.image ? (png(value?.source) || result.image) : '';
    result.crop = {zoom:bounded(value?.crop?.zoom,1,3,1), x:bounded(value?.crop?.x,-100,100,0), y:bounded(value?.crop?.y,-100,100,0)};
    return result;
  }
  let club = normalize(null), draft = null;
  try { club = normalize(JSON.parse(TeamStore.getItem(key))); } catch {}
  const html = field => escape(club[field]);
  const imageMarkup = image => `<img src="${image}" alt="팀 엠블럼">`;
  function paintBadge(node, image, letters) {
    image = image || fallbackImage;
    node.classList.toggle('club-image', Boolean(image));
    if (image) node.innerHTML = imageMarkup(image);
    else node.textContent = letters;
  }
  function identity() {
    return `<section class="club-identity"><div class="crest${' club-image'}">${imageMarkup(club.image||fallbackImage)}</div><h2>${html('name')}</h2><p>${html('affiliation')}</p><button type="button" class="btn secondary club-edit-button" data-action="club-settings">팀 설정</button></section>`;
  }
  function sync() {
    const text = (selector, value) => document.querySelectorAll(selector).forEach(el => {el.textContent = value;});
    text('.club-select strong, .profile small', club.name);
    text('.club-select small', club.affiliation);
    document.querySelectorAll('.mini-crest, .team .crest:not(.away)').forEach(el => paintBadge(el,club.image,club.emblem));
    text('.season-box strong, .club-motto p', club.motto);
    text('.hero-serial, .club-brand-name', club.name);
    const words = club.name.split(/\s+/), last = words.length > 1 ? words.pop() : '';
    const brand = last ? `${escape(words.join(' '))} <span class="lime">${escape(last)}</span>` : html('name');
    document.querySelectorAll('.brand-name').forEach(el => {el.innerHTML = brand; el.title = club.name;});
    document.querySelectorAll('.mobile-brand').forEach(el => el.setAttribute('aria-label', `${club.name} 홈`));
    const header = document.querySelector('.header-club');
    if (header) header.innerHTML = `<span class="live-dot"></span><span class="club-header-name">${html('name')}</span>`;
  }
  function error(message) {
    const node = document.querySelector('#club-settings-error');
    if (node) { node.textContent = message; node.hidden = !message; }
  }
  function active(token) {return draft === token && document.querySelector('#modal').open && Boolean(document.querySelector('#club-settings-form'));}
  function controls() {
    const form = document.querySelector('#club-settings-form');
    if (!form || !draft) return;
    form.querySelector('[type="submit"]').disabled = draft.loading;
    form.querySelector('#club-image-controls').hidden = !draft.image;
    form.querySelector('#club-image-remove').hidden = !draft.image;
    form.querySelector('#club-image-status').textContent = draft.loading ? '이미지를 불러오는 중…' : draft.image ? '팀 설정 저장을 누르면 엠블럼이 적용됩니다.' : 'PNG · JPG · WebP / 최대 10MB · 투명 배경 지원';
    for (const field of ['zoom','x','y']) {
      const input = form.elements[`crop-${field}`];
      input.disabled = draft.loading || !draft.bitmap;
      input.value = draft.crop[field];
      form.querySelector(`[data-crop-output="${field}"]`).textContent = field === 'zoom' ? `${Math.round(draft.crop[field]*100)}%` : String(draft.crop[field]);
    }
    form.querySelector('[data-action="club-image-reset"]').disabled = draft.loading || !draft.bitmap;
  }
  function preview() {
    const node = document.querySelector('[data-club-preview="emblem"]');
    if (node && draft) paintBadge(node,draft.image,document.querySelector('#club-settings-form').elements.emblem.value.trim() || 'U');
  }
  function draw() {
    if (!draft?.bitmap) return;
    const canvas = document.createElement('canvas');canvas.width=canvas.height=256;
    const context = canvas.getContext('2d');
    const scale = Math.min(256/draft.bitmap.naturalWidth,256/draft.bitmap.naturalHeight)*draft.crop.zoom;
    const width = draft.bitmap.naturalWidth*scale, height = draft.bitmap.naturalHeight*scale;
    context.drawImage(draft.bitmap,(256-width)/2+draft.crop.x*1.28,(256-height)/2+draft.crop.y*1.28,width,height);
    draft.image=canvas.toDataURL('image/png');
    preview();controls();
  }
  const decode = src => new Promise((resolve,reject) => {
    const image = new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('이미지를 읽을 수 없습니다. 다른 PNG 또는 JPG 파일을 선택해 주세요.'));image.src=src;
  });
  async function restoreImage(token) {
    if (!token.source) return;
    token.loading=true;controls();const endLoading=AppLoading.begin('팀 엠블럼을 준비하고 있어요');
    try {const bitmap=await decode(token.source);if(active(token))token.bitmap=bitmap;}
    catch (reason) {if(active(token))error(reason.message);}
    finally {endLoading();if(active(token)){token.loading=false;controls();}}
  }
  async function selectImage(file) {
    if (!file || !draft) return;
    error('');
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) {error('PNG, JPG 또는 WebP 이미지를 선택해 주세요.');return;}
    if (file.size>10*1024*1024) {error('10MB 이하의 이미지를 선택해 주세요.');return;}
    // A new object invalidates pending decoding without changing the saved emblem.
    const token = draft = {...draft, loading:true};controls();const endLoading=AppLoading.begin('팀 엠블럼을 준비하고 있어요');
    const url = URL.createObjectURL(file);
    try {
      const original = await decode(url);
      if (!active(token)) return;
      if (original.naturalWidth*original.naturalHeight>24000000) throw new Error('이미지 크기가 너무 큽니다. 2,400만 화소 이하로 줄여 주세요.');
      const canvas=document.createElement('canvas'), scale=Math.min(1,512/Math.max(original.naturalWidth,original.naturalHeight));
      canvas.width=Math.max(1,Math.round(original.naturalWidth*scale));canvas.height=Math.max(1,Math.round(original.naturalHeight*scale));
      canvas.getContext('2d').drawImage(original,0,0,canvas.width,canvas.height);
      const source=canvas.toDataURL('image/png'), bitmap=await decode(source);
      if (!active(token)) return;
      Object.assign(token,{source,bitmap,crop:{zoom:1,x:0,y:0}});draw();
    } catch(reason) {if(active(token))error(reason.message || '이미지를 불러오지 못했습니다.');}
    finally {endLoading();URL.revokeObjectURL(url);if(active(token)){token.loading=false;controls();}}
  }
  function open() {
    if (document.querySelector('#modal').open) closeModal();
    draft={image:club.image,source:club.source,crop:{...club.crop},bitmap:null,loading:false};
    modal('팀 설정', `<form id="club-settings-form"><p class="note">우리 팀의 이름과 소속을 직접 설정하세요.</p><div class="club-settings-preview" aria-label="팀 미리보기"><div class="crest${' club-image'}" data-club-preview="emblem">${imageMarkup(club.image||fallbackImage)}</div><strong data-club-preview="name">${html('name')}</strong><small data-club-preview="affiliation">${html('affiliation')}</small></div><div class="club-image-picker"><label class="btn secondary" for="club-image-file">엠블럼 이미지 선택</label><input id="club-image-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="엠블럼 이미지 파일"><button type="button" id="club-image-remove" class="text-btn" data-action="club-image-remove" ${club.image?'':'hidden'}>이미지 삭제</button></div><p class="note" id="club-image-status" role="status"></p><div id="club-image-controls" ${club.image?'':'hidden'}><div class="club-crop-heading"><strong>이미지 크기 · 위치</strong><button type="button" class="text-btn" data-action="club-image-reset">전체 맞춤</button></div>${[['zoom','크기',1,3,.05],['x','좌우 위치',-100,100,1],['y','상하 위치',-100,100,1]].map(([field,label,min,max,step])=>`<label class="club-crop-field">${label}<output data-crop-output="${field}"></output><input type="range" name="crop-${field}" min="${min}" max="${max}" step="${step}" value="${draft.crop[field]}" aria-label="엠블럼 ${label}"></label>`).join('')}<p class="note">위 미리보기를 보며 조절하세요. 전체 맞춤을 누르면 원래 비율로 돌아갑니다.</p></div><p id="club-settings-error" class="form-error" role="alert" hidden></p><label class="field">팀 이름<input name="name" value="${html('name')}" maxlength="24" required placeholder="예: 흑표범 FC" autocomplete="organization"></label><label class="field">소속<input name="affiliation" value="${html('affiliation')}" maxlength="40" placeholder="예: 서울 지역 풋살 클럽"></label><label class="field">기본 엠블럼 글자<input name="emblem" value="${html('emblem')}" maxlength="2" required placeholder="예: U"><small class="note">이미지를 등록하지 않았을 때 표시됩니다.</small></label><label class="field">팀 소개<textarea name="motto" maxlength="80" rows="2" placeholder="우리 팀을 소개하는 한마디">${html('motto')}</textarea></label><p class="note">저장한 팀 설정과 엠블럼은 공유 링크에서도 볼 수 있습니다.</p><div class="modal-actions"><button type="button" class="btn secondary" data-action="close">취소</button><button type="submit" class="btn">팀 설정 저장</button></div></form>`);
    controls();restoreImage(draft);
  }
  document.addEventListener('click', event => {
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='club-settings')open();
    if(!draft)return;
    if(action==='club-image-remove'){
      draft={image:'',source:'',bitmap:null,crop:{zoom:1,x:0,y:0},loading:false};
      document.querySelector('#club-image-file').value='';error('');preview();controls();
    }
    if(action==='club-image-reset'&&draft.bitmap){draft.crop={zoom:1,x:0,y:0};draw();}
  });
  document.addEventListener('change',event=>{
    if(event.target.id!=='club-image-file')return;
    const file=event.target.files[0];event.target.value='';selectImage(file);
  });
  document.addEventListener('close',event=>{if(event.target.id==='modal'&&!event.target.open)draft=null;},true);
  document.addEventListener('input', event => {
    if (event.target.form?.id !== 'club-settings-form' || !draft) return;
    const field = event.target.name;
    if(field.startsWith('crop-')){draft.crop[field.slice(5)]=Number(event.target.value);draw();return;}
    if(field==='emblem'){preview();return;}
    if (!['name','affiliation'].includes(field)) return;
    document.querySelector(`[data-club-preview="${field}"]`).textContent = event.target.value.trim() || (field==='name'?'팀 이름':'');
  });
  document.addEventListener('submit', event => {
    if (event.target.id !== 'club-settings-form') return;
    event.preventDefault();
    if(!draft || draft.loading)return;
    const values = Object.fromEntries(new FormData(event.target));
    for (const field of ['name','emblem']) {
      if (!values[field].trim()) {
        error(field === 'name' ? '팀 이름을 입력해 주세요.' : '기본 엠블럼 글자를 입력해 주세요.');
        event.target.elements[field].focus();return;
      }
    }
    const next = normalize({...values,image:draft.image,source:draft.source,crop:draft.crop});
    try { TeamStore.setItem(key, JSON.stringify(next)); }
    catch {error('저장하지 못했습니다. 브라우저 저장 공간을 확인하거나 더 작은 이미지를 선택해 주세요.');return;}
    club = next;closeModal();render();toast('팀 설정과 엠블럼을 저장했습니다.');
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    try { club = normalize(JSON.parse(event.newValue)); sync(); if (typeof render === 'function') render(); } catch {}
  });
  function cardEmblem() {
    return `<span class="card-team-emblem" role="img" aria-label="${html('name')} 팀 엠블럼">${`<img src="${club.image||fallbackImage}" alt="">`}</span>`;
  }
  return {html, identity, sync, cardEmblem, name: () => club.name};
})();

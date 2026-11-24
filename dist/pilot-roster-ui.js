function pilotPlayerModal(id){
  const p=getPlayer(id);if(!p?.managed)return;
  if($('#modal').open)closeModal();
  const schema=Abilities.schema(p),ready=PilotRoster.complete(p);
  modal('선수 상세',`<div class="profile-card-head">${card(p)}<span class="demo-caption">${p.randomStats?'기존 예시 세부 값 · 포지션 가중치 적용':ready?'주 포지션 가중치로 계산한 선수 카드':'선수 프로필'}</span></div><button type="button" class="btn secondary reveal-launch" data-action="reveal-player" data-id="${id}">카드 공개 연출 보기 ↗</button><div class="player-photo-actions"><button class="btn secondary" data-action="photo-edit" data-id="${id}">${PlayerPhotos.url(id,p.photo)?'사진 교체':'선수 사진 등록'}</button>${PlayerPhotos.url(id,p.photo)?`<button class="text-btn" data-action="photo-remove" data-id="${id}">사진 삭제</button>`:''}</div><div class="profile-identity"><div><h2>${p.name} <span>${p.pos}</span></h2><p>${p.role} · ${ClubSettings.html('name')}</p></div></div><button class="btn wide" data-action="pilot-edit" data-id="${id}">포지션 · 스탯 ${ready?'수정':'입력'}</button><p class="note">관리자가 직접 입력하는 초기 프로필입니다. 미입력 값은 —로 표시됩니다.</p>${playerTraitsPanel(p)}${positionOVRPanel(p)}${playerInfoPanel(p)}<div class="ratings-heading"><strong>${p.pos==='GK'?'골키퍼 전용 능력치':'6대 분류 · 세부 능력치'}</strong><span>세부 평균 · 자동 계산</span></div><div class="detail-stat-groups">${schema.map(([code,label,details],i)=>`<section class="detail-stat-group"><h3><span>${code}</span>${label}<b>${ratingText(p.stats[i])}</b></h3>${Number.isFinite(p.manual.legacyKeeper?.[code])&&!Number.isFinite(p.stats[i])?`<p class="note">이전 입력값 ${p.manual.legacyKeeper[code]} · 세부 지표 입력 대기</p>`:''}${details.map(name=>`<div class="detail-stat-row"><span>${name}</span><b>${ratingText(p.manual.detail[name])}</b><i style="--stat:${p.manual.detail[name]??0}%"></i></div>`).join('')}</section>`).join('')}</div><p class="prototype-note">기록과 동료 평가는 아직 능력치에 자동 반영되지 않습니다.<br>관리자가 저장한 프로필과 입력값은 팀 공유 저장소에 반영됩니다.</p><div class="modal-actions">${btn('닫기','close','secondary')}</div>`);
}
function pilotRatingInput(name,label,value){const hint=Abilities.descriptions[label];return `<label class="pilot-stat-field">${label}${hint?`<small class="pilot-stat-help">${hint}</small>`:''}<input type="number" aria-label="${esc(label)}" name="${esc(name)}" min="1" max="99" step="1" inputmode="numeric" placeholder="미입력" value="${value??''}"></label>`;}
function pilotFormInput(form){
  const data=new FormData(form),detail={};
  for(const [key,value] of data)if(key.startsWith('detail:'))detail[key.slice(7)]=value;
  return {pos:data.get('pos'),detail,legacyKeeper:getPlayer(Number(form.dataset.playerId))?.manual?.legacyKeeper};
}
function pilotRecalculate(form){
  let d;try{d=PilotRoster.normalize(pilotFormInput(form));}catch{return;}
  form.querySelector('[data-pilot-ovr]').textContent=ratingText(d.ovr);
  form.querySelectorAll('[data-pilot-value]').forEach(output=>{output.textContent=ratingText(d.values[output.dataset.pilotValue]);});
  const keeper=d.pos==='GK';
  form.querySelectorAll('[data-pilot-schema]').forEach(section=>{section.hidden=(section.dataset.pilotSchema==='keeper')!==keeper;});
}
function pilotEditor(id){
  const p=getPlayer(id);if(!p?.managed)return;
  if($('#modal').open)closeModal();
  const d=p.manual;
  modal('포지션 · 스탯 입력',`<form id="pilot-stats-form" data-player-id="${id}"><div class="pilot-editor-title"><span class="eyebrow">PLAYER PROFILE</span><h3>${p.name}</h3><p>세부 능력치와 선택한 포지션에 따라 OVR이 계산됩니다.</p></div><p class="note">능력치는 1~99의 정수로 입력합니다. 미입력 값은 0점으로 계산하지 않습니다. 비워두고 나중에 이어서 입력할 수 있습니다.</p><div class="two-fields"><label class="field">포지션<select name="pos" id="pilot-position">${Object.entries(PilotRoster.positions).map(([code,label])=>`<option value="${code}" ${code===d.pos?'selected':''}>${code==='미정'?'미정':`${code} · ${label}`}</option>`).join('')}</select></label><div class="field">종합 능력치 OVR<output class="pilot-calculated" data-pilot-ovr aria-live="polite">${ratingText(d.ovr)}</output><small>선택한 포지션의 가중치 적용</small></div></div>${[['field',Abilities.field],['keeper',Abilities.keeper]].map(([type,schema])=>`<section class="pilot-stat-section" data-pilot-schema="${type}" ${(type==='keeper')===(d.pos==='GK')?'':'hidden'}><h3>${type==='keeper'?'골키퍼 5대 능력치':'필드 6대 능력치'} · 자동 계산</h3><div class="pilot-stat-grid">${schema.map(([code,label])=>`<div class="pilot-stat-field">${code} · ${label}<output class="pilot-calculated" data-pilot-value="${code}">${ratingText(d.values[code])}</output></div>`).join('')}</div><div class="pilot-details"><h3>세부 능력치 입력 · ${schema.reduce((n,a)=>n+a[2].length,0)}개</h3>${schema.map(([code,label,details])=>`<fieldset><legend>${label} <small>· ${details.length}개 평균</small></legend>${type==='keeper'&&Number.isFinite(d.legacyKeeper?.[code])?`<p class="note">이전 입력값: ${d.legacyKeeper[code]} · 참고용이며 새 평균 계산에는 포함되지 않습니다.</p>`:''}<div class="pilot-stat-grid">${details.map(name=>pilotRatingInput(`detail:${name}`,name,d.detail[name])).join('')}</div></fieldset>`).join('')}</div></section>`).join('')}<p class="note">각 분류의 세부 항목을 모두 입력하면 해당 능력치가 계산됩니다. 필드는 6개, 골키퍼는 5개 능력치가 완성되면 OVR을 계산합니다. 분류별 평균을 반올림한 뒤 포지션별 가중치를 적용하고, 최종 OVR을 반올림합니다. 미정 포지션은 OVR을 표시하지 않습니다.</p><p id="pilot-stats-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="btn secondary" data-action="pilot-cancel" data-id="${id}">취소</button><button type="submit" class="btn">선수 카드 저장</button></div></form>`);
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button)return;const id=Number(button.dataset.id);if(button.dataset.action==='pilot-edit')pilotEditor(id);if(button.dataset.action==='pilot-cancel')pilotPlayerModal(id);});
document.addEventListener('input',event=>{const form=event.target.closest('#pilot-stats-form');if(form)pilotRecalculate(form);});
document.addEventListener('change',event=>{if(event.target.id==='pilot-position')pilotRecalculate(event.target.form);});
document.addEventListener('submit',event=>{
  if(event.target.id!=='pilot-stats-form')return;event.preventDefault();
  const id=Number(event.target.dataset.playerId),p=getPlayer(id),input=pilotFormInput(event.target);
  let saved;
  try{PilotRoster.normalize(input);}catch(error){$('#pilot-stats-error').hidden=false;$('#pilot-stats-error').textContent=error.message;return;}
  try{saved=PilotRoster.save(TeamStore,id,input);}catch{$('#pilot-stats-error').hidden=false;$('#pilot-stats-error').textContent='저장하지 못했습니다. 브라우저 저장 공간을 확인하고 다시 시도해 주세요.';return;}
  PilotRoster.apply(p,saved);p.randomStats=false;if(typeof SquadUI!=='undefined')SquadUI.refresh();if(inhouseDraft)inhouseDraft.saved=false;render();pilotPlayerModal(id);toast(`${p.name} 선수 카드를 저장했습니다.`);
});

function positionOVRPanel(p){const list=Object.keys(Abilities.weights).map(pos=>({pos,ovr:Abilities.positionRating(p,pos)}));return `<section class="position-ovr-panel"><div class="ratings-heading"><strong>포지션별 OVR</strong><span>주 포지션 ${p.pos}</span></div><p>같은 능력치에 포지션별 가중치를 적용합니다. 카드에는 주 포지션, 스쿼드에는 배치 포지션의 OVR을 표시합니다.</p><div class="position-ovr-grid">${list.map(({pos,ovr})=>`<div class="${pos===p.pos?'current':''}"><span>${pos}${pos===p.pos?'<small>주 포지션</small>':''}</span><b>${ratingText(ovr)}</b></div>`).join('')}</div><p class="note">—: 해당 포지션에 필요한 능력치 미입력</p><details><summary>OVR 계산 기준 보기</summary><p>각 분류 평균을 반올림 → 가중합 → 최종 반올림. 세부 능력치는 변경되지 않습니다.</p>${list.map(({pos})=>`<div class="position-weight-row"><strong>${pos}</strong><span>${Object.entries(Abilities.weights[pos]).map(([code,n])=>`${code} ${n}%`).join(' · ')}</span></div>`).join('')}</details></section>`;}

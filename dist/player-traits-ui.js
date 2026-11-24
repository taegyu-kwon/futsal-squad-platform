function playerTraitsPanel(p){
 const info=PlayerTraits.read(TeamStore,p.id),injured=info.status==='injured';
 return `<section class="player-traits-panel" aria-label="선수 현황 및 특성"><div class="player-traits-heading"><h3>선수 현황</h3>${TeamSync.canEdit?`<button type="button" class="text-btn" data-action="player-traits-edit" data-id="${p.id}">현황 · 특기 설정</button>`:''}</div><div class="player-availability ${injured?'is-injured':''}"><span class="availability-dot" aria-hidden="true"></span>${injured?'부상':'정상'}</div><h3 class="player-traits-title">선수 특성</h3>${info.traits.length?`<ul class="player-trait-tags">${info.traits.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:'<p class="player-traits-empty">등록된 특기가 없습니다.</p>'}</section>`;
}
function playerTraitsEditor(id){
 if(!TeamSync.canEdit)return;
 const p=getPlayer(id);if(!p?.managed)return;
 const info=PlayerTraits.read(TeamStore,id);if($('#modal').open)closeModal();
 modal('선수 현황 · 특기',`<form id="player-traits-form" data-player-id="${id}"><p class="traits-editor-name">${esc(p.name)} <span>${esc(p.pos)}</span></p><label class="field" for="player-availability">선수 현황<select id="player-availability" name="status"><option value="active" ${info.status==='active'?'selected':''}>정상</option><option value="injured" ${info.status==='injured'?'selected':''}>부상</option></select></label><p class="traits-editor-help">부상을 선택하면 선수 카드 정중앙에 대각선으로 ‘부상’이 표시됩니다.</p><label class="field" for="player-specialties">특기<textarea id="player-specialties" name="traits" rows="6" maxlength="400" aria-describedby="traits-editor-help" placeholder="예: 중거리 슛&#10;빠른 역습&#10;정확한 패스">${esc(info.traits.join('\n'))}</textarea></label><p id="traits-editor-help" class="traits-editor-help">한 줄에 하나씩, 최대 8개 · 각 24자<br>입력한 특기는 선수 특성에 표시됩니다.</p><p id="player-traits-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="btn secondary" data-action="player-traits-cancel" data-id="${id}">취소</button><button type="submit" class="btn">저장</button></div></form>`);
}
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-action]');if(!button)return;
 if(button.dataset.action==='player-traits-edit')playerTraitsEditor(Number(button.dataset.id));
 if(button.dataset.action==='player-traits-cancel')playerModal(Number(button.dataset.id));
});
document.addEventListener('submit',event=>{
 const form=event.target;if(form.id!=='player-traits-form')return;event.preventDefault();
 const error=form.querySelector('#player-traits-error'),id=Number(form.dataset.playerId);
 try{PlayerTraits.write(TeamStore,id,Object.fromEntries(new FormData(form)),TeamSync.canEdit);}
 catch(e){error.hidden=false;error.textContent=e.message;return;}
 render();playerModal(id);toast('선수 현황과 특기를 반영했습니다.');
});

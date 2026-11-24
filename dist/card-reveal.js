/* A bounded, pausable walkout reveal: one timer drives the stages, CSS does the motion. No canvas, animation loop or graphics engine. */
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardRevealTiming=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 const stages=[['intro',1800],['country',1500],['position',1500],['club',1700],['blackout',1000],['reveal',4000],['done',0]];
 function create(onStage,{now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
  let index=0,timer=null,deadline=0,remaining=0,active=false,paused=false,generation=0;
  function clear(){if(timer!==null)cancel(timer);timer=null;}
  function arm(){if(!active||paused||index===stages.length-1)return;deadline=now()+remaining;const token=generation;timer=schedule(()=>{timer=null;if(!active||paused||token!==generation)return;index++;remaining=stages[index][1];onStage(stages[index][0]);if(token===generation)arm();},remaining);}
  return {start({hidden=false}={}){clear();generation++;active=true;paused=hidden;index=0;remaining=stages[0][1];const token=generation;onStage(stages[0][0]);if(token===generation)arm();},pause(){if(!active||paused)return;remaining=Math.max(0,deadline-now());paused=true;clear();},resume(){if(!active||!paused)return;paused=false;arm();},stop(){active=false;generation++;clear();},get pending(){return timer!==null;}};
 }
 return {create};
});
(()=>{
 if(typeof document==='undefined')return;
 let dialog,currentId,returnFocus,timeline,loadController,endLoading,run=0;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 function stopLoading(){endLoading?.();endLoading=null;}
 function stop(){run++;timeline?.stop();timeline=null;loadController?.abort();loadController=null;stopLoading();}
 // Pre-rendered finale plate (real particle render). It only takes over when it is ready in time; otherwise the CSS effects run.
 function plate(stage){
  const v=dialog.querySelector('.fx-plate');if(!v)return;
  if(stage==='blackout'&&v.readyState>=3){v.currentTime=0;v.play().then(()=>dialog.classList.add('has-plate')).catch(()=>{});}
  if(stage==='done'&&!dialog.classList.contains('has-plate')&&v.readyState>=2){v.currentTime=Math.max(0,v.duration-2.5);v.play().then(()=>dialog.classList.add('has-plate')).catch(()=>{});}
 }
 function setStage(stage){
  if(!dialog?.open)return;dialog.dataset.stage=stage;
  plate(stage);
  const done=stage==='done';dialog.querySelector('.reveal-result').inert=!done;dialog.querySelector('.reveal-finish').hidden=!done;dialog.querySelector('.reveal-skip').hidden=done;
  if(done)dialog.querySelector('.reveal-announcement').textContent=`${getPlayer(currentId).name} 선수 카드 공개 완료`;
 }
 function finish(){stop();setStage('done');dialog.querySelector('.reveal-again').focus({preventScroll:true});}
 function close(){stop();dialog.close();dialog.replaceChildren();document.body.classList.remove('sheet-open');if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else document.querySelector('[data-action="reveal-picker"]')?.focus({preventScroll:true});}
 function choose(){
  if(document.querySelector('#modal').open)closeModal();
  modal('카드 공개',`<div class="reveal-picker-intro"><span class="eyebrow">FUTSAL LEAGUE</span><h3>우리 팀의 주인공을 만나세요.</h3><p>선수를 고르면 현재 사진과 능력치로 카드가 공개됩니다.</p></div><div class="reveal-roster">${players.map(p=>`<button type="button" data-action="reveal-player" data-id="${p.id}"><span><strong>${esc(p.name)}</strong><small>${esc(p.pos)}</small></span><b>${ratingText(p.ovr)}</b><span aria-hidden="true">↗</span></button>`).join('')}</div>`);
 }
 function prepareImages(root,signal){
  // Cached images normally resolve before the loading animation is shown.
  return new Promise(resolve=>{
   let settled=false;const finish=()=>{if(settled)return;settled=true;clearTimeout(timeout);signal.removeEventListener('abort',finish);resolve();};
   const timeout=setTimeout(finish,4000);signal.addEventListener('abort',finish,{once:true});
   Promise.allSettled([...root.querySelectorAll('img')].filter(img=>img.getAttribute('src')).map(img=>img.decode())).then(finish);
  });
 }
 async function open(id){
  const p=getPlayer(id);if(!p)return;
  if(!dialog){dialog=document.createElement('dialog');dialog.id='card-reveal';dialog.setAttribute('aria-label','선수 카드 공개');document.body.append(dialog);
   dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
   dialog.addEventListener('click',e=>{const action=e.target.closest('[data-reveal]')?.dataset.reveal;if(action==='close')close();if(action==='skip')finish();if(action==='again')open(currentId);if(action==='detail'){close();playerModal(currentId);}});
  }
  if(!dialog.open)returnFocus=document.activeElement;stop();const token=run;currentId=id;
  if(document.querySelector('#modal').open)closeModal();
  dialog.dataset.stage='loading';dialog.classList.remove('has-plate');
  dialog.innerHTML=`<div class="reveal-atmosphere" aria-hidden="true"></div><header class="reveal-top"><span>FUTSAL <b>LEAGUE</b><small>PLAYER REVEAL</small></span><button type="button" data-reveal="close" aria-label="카드 공개 닫기">×</button></header><div class="reveal-stage"><div class="reveal-fx" aria-hidden="true"><video class="fx-plate" src="assets/reveal-plate-${innerWidth>innerHeight?'landscape':'portrait'}.mp4" muted playsinline preload="auto" disablepictureinpicture tabindex="-1"></video><span class="fx-haze fx-haze-a"></span><span class="fx-haze fx-haze-b"></span><span class="fx-beam"></span><span class="fx-beam"></span><span class="fx-beam"></span><span class="fx-beam"></span><span class="fx-spot"></span><span class="fx-search fx-search-l"></span><span class="fx-search fx-search-r"></span>${[['18%','22%','0s',1],['80%','17%','.35s',.8],['50%','9%','.8s',1.15],['30%','34%','1.5s',.7],['70%','30%','1.9s',.9]].map(([x,y,d,k])=>`<span class="fx-fw" style="--x:${x};--y:${y};--d:${d};--k:${k}">${Array.from({length:26},(_,i)=>`<i style="--r:${(i*360/26+(i*53)%9).toFixed(1)}deg;--m:${[1,.82,.93,.7,1.06][i%5]}"></i>`).join('')}</span>`).join('')}${[7,27,73,93].map((x,g)=>`<span class="fx-gerb" style="--x:${x}%">${Array.from({length:16},(_,i)=>`<i style="--vx:${((i*37+g*11)%60)-30}px;--h:${30+(i*23+g*7)%26}dvh;--d:${((i*.093)+g*.05).toFixed(2)}s"></i>`).join('')}</span>`).join('')}${Array.from({length:10},(_,i)=>`<b class="fx-camera" style="--x:${(i*41+7)%96}%;--y:${64+(i*17)%28}%;--d:${((i*.37)%2.2+.4).toFixed(2)}s"></b>`).join('')}${Array.from({length:18},(_,i)=>`<i class="fx-spark" style="--x:${(i*37+11)%100}%;--d:${((i*0.29)%2.6).toFixed(2)}s;--s:${1+i%3}px"></i>`).join('')}<span class="fx-flare"></span><span class="fx-flash"></span></div><div class="reveal-sealed" aria-hidden="true"><span class="unit-card-logo"></span><strong>FUTSAL<br>LEAGUE</strong></div><div class="reveal-hint reveal-country" aria-hidden="true"><img src="assets/korea-flag.png" alt=""><span>대한민국</span></div><div class="reveal-hint reveal-position" aria-hidden="true"><strong>${esc(p.pos)}</strong><span>${esc(p.role)}</span></div><div class="reveal-hint reveal-club" aria-hidden="true">${ClubSettings.cardEmblem()}<span>${ClubSettings.html('name')}</span></div><div class="reveal-result" inert><div class="reveal-card-host">${card(p)}</div></div></div><footer class="reveal-controls"><span class="reveal-announcement" role="status" aria-live="polite"></span><button class="reveal-skip" type="button" data-reveal="skip">건너뛰기</button><div class="reveal-finish" hidden><button class="btn secondary reveal-again" type="button" data-reveal="again">다시 보기</button><button class="btn" type="button" data-reveal="detail">선수 상세</button></div></footer>`;
  const original=dialog.querySelector('.player-card'),display=document.createElement('div');display.className=original.className;display.innerHTML=original.innerHTML;display.setAttribute('role','img');display.setAttribute('aria-label',original.getAttribute('aria-label').replace('. 상세 보기',''));display.insertAdjacentHTML('beforeend','<span class="reveal-shine" aria-hidden="true"></span>');original.replaceWith(display);
  dialog.dataset.tier=!Number.isFinite(p.ovr)?'new':p.ovr>=85?'icon':p.ovr>=75?'gold':p.ovr>=65?'silver':'bronze';
  if(!dialog.open)dialog.showModal();document.body.classList.add('sheet-open');dialog.querySelector('[data-reveal=close]').focus({preventScroll:true});
  const controller=new AbortController();loadController=controller;
  const releaseLoading=AppLoading.begin('카드를 준비하고 있어요',{delay:150});endLoading=releaseLoading;
  try{await prepareImages(dialog,controller.signal);}finally{releaseLoading();if(endLoading===releaseLoading)endLoading=null;}
  if(token!==run||!dialog.open)return;stopLoading();loadController=null;
  if(motion.matches){finish();return;}
  timeline=CardRevealTiming.create(stage=>{if(token===run)setStage(stage);});timeline.start({hidden:document.hidden});
 }
 document.addEventListener('visibilitychange',()=>{if(!dialog?.open)return;const v=dialog.querySelector('.fx-plate');if(document.hidden){timeline?.pause();v?.pause();}else{timeline?.resume();if(dialog.classList.contains('has-plate')&&v&&!v.ended)v.play().catch(()=>{});}});
 motion.addEventListener?.('change',()=>{if(motion.matches&&dialog?.open)finish();});
 document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(button?.dataset.action==='reveal-picker')choose();if(button?.dataset.action==='reveal-player')open(Number(button.dataset.id));});
 window.addEventListener('hashchange',()=>{if(dialog?.open)close();});
})();

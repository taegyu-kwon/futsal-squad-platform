/* One persistent audio element; personal playback preference never changes team data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BackgroundMusic=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const key='unit-fc-background-music-v1';
 function create({audio,storage,onChange=()=>{},visible=()=>true}){
  let enabled=true,pending=false,attempted=false,error=false,destroyed=false;
  try{enabled=storage.getItem(key)!=='off';}catch{}
  audio.loop=true;audio.preload='none';audio.volume=.3;
  function state(){return {enabled,playing:!audio.paused,pending,error};}
  function emit(){onChange(state());}
  function remember(){try{storage.setItem(key,enabled?'on':'off');}catch{}}
  async function play(){
   if(destroyed||!enabled||!visible()||pending||!audio.paused)return;
   attempted=true;pending=true;error=false;emit();
   try{await audio.play();if(!enabled||!visible()||destroyed)audio.pause();}
   catch(e){if(e.name!=='NotAllowedError'&&e.name!=='AbortError')error=true;}
   finally{pending=false;if(!destroyed)emit();}
  }
  function changed(){if(!destroyed)emit();}
  function failed(){error=true;pending=false;emit();}
  ['play','pause'].forEach(type=>audio.addEventListener(type,changed));audio.addEventListener('error',failed);
  emit();
  return {
   get state(){return state();},
   interact(){if(enabled&&!error)return play();},
   toggle(){if(!audio.paused||pending){enabled=false;audio.pause();remember();emit();return;}enabled=true;remember();return play();},
   visibilityChanged(){if(!visible())audio.pause();else if(attempted&&enabled&&!error)return play();},
   destroy(){destroyed=true;audio.pause();['play','pause'].forEach(type=>audio.removeEventListener(type,changed));audio.removeEventListener('error',failed);}
  };
 }
 return {create};
});
(()=>{
 if(typeof document==='undefined')return;
 const bar=document.querySelector('.top-actions');if(!bar)return;
 const audio=document.createElement('audio');audio.id='background-music';audio.src='assets/background-music.m4a';audio.setAttribute('playsinline','');audio.hidden=true;
 const button=document.createElement('button');button.id='music-toggle';button.type='button';button.className='icon-btn music-toggle';
 button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 5 6 9H3v6h3l5 4Z"/><g class="music-waves"><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></g><path class="music-muted" d="m16 9 5 6m0-6-5 6"/></svg>';
 bar.prepend(button);document.body.append(audio);
 const controller=BackgroundMusic.create({audio,storage:localStorage,visible:()=>!document.hidden,onChange:state=>{
  const label=state.error?'배경음악 다시 재생':state.pending?'배경음악 재생 취소':state.playing?'배경음악 끄기':'배경음악 재생';
  button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(state.playing));button.title='배경 음악 · '+label;
  button.classList.toggle('is-playing',state.playing);button.classList.toggle('is-loading',state.pending);
 }});
 button.addEventListener('click',()=>controller.toggle());
 document.addEventListener('click',event=>{if(!event.target.closest('#music-toggle'))controller.interact();},true);
 document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('#music-toggle'))controller.interact();},true);
 document.addEventListener('visibilitychange',()=>controller.visibilityChanged());
})();

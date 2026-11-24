/* One fullscreen loading surface for boot, preparation and shared saves. */
window.AppLoading=(()=>{
 const overlay=document.getElementById('app-loading'),label=overlay.querySelector('.loading-label'),retry=overlay.querySelector('.loading-retry');
 const tasks=new Map(),preparations=new WeakMap(),motion=matchMedia('(prefers-reduced-motion: reduce)');
 let nextId=0,failed=false,returnFocus=null;
 const videos=[overlay.querySelector('video')];
 for(const video of videos){video.muted=true;video.addEventListener('error',()=>{video.removeAttribute('src');video.load();},{once:true});}
 overlay.addEventListener('cancel',event=>event.preventDefault());
 retry.addEventListener('click',()=>location.reload());
 // Upgrade the first-paint open attribute into a keyboard-modal top-layer dialog.
 if(overlay.open)overlay.close();
 function play(video,active){if(!active||motion.matches||document.hidden){video.pause();return;}video.play()?.catch(()=>{});}
 function display(){
  const full=[...tasks.values()].filter(task=>task.visible).at(-1);
  if(full||failed){label.textContent=failed?label.textContent:full.label;if(!overlay.open){returnFocus=document.activeElement;overlay.showModal();}play(videos[0],!failed);}
  else{if(overlay.open){overlay.close();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}play(videos[0],false);}

 }
 function begin(text='화면을 준비하고 있어요',{mode='full',delay=120}={}){
  const id=++nextId,task={label:text,mode,visible:delay===0,timer:null};tasks.set(id,task);
  if(delay>0)task.timer=setTimeout(()=>{task.visible=true;display();},delay);
  display();
  const end=()=>{clearTimeout(task.timer);tasks.delete(id);display();};
  end.update=text=>{task.label=text;display();};
  return end;
 }
 async function during(text,work,options){const end=begin(text,options);try{return await work();}finally{end();}}
 function imageReady(image){
  if(image.complete)return image.naturalWidth&&image.decode?image.decode().catch(()=>{}):Promise.resolve();
  return new Promise(resolve=>{const finish=()=>{clearTimeout(timer);image.removeEventListener('load',finish);image.removeEventListener('error',finish);resolve();};const timer=setTimeout(finish,12000);image.addEventListener('load',finish,{once:true});image.addEventListener('error',finish,{once:true});}).then(()=>image.naturalWidth&&image.decode?image.decode().catch(()=>{}):undefined);
 }
 async function images(root){await Promise.all([...root.querySelectorAll('img')].filter(image=>image.getAttribute('src')).map(imageReady));}
 async function prepare(root,text='선수 카드를 준비하고 있어요'){
  if(!root)return;preparations.get(root)?.();const end=begin(text,{mode:'background',delay:350});preparations.set(root,end);
  try{await images(root);}finally{end();if(preparations.get(root)===end)preparations.delete(root);}
 }
 function cancel(root){preparations.get(root)?.();preparations.delete(root);}
 function fail(message){failed=true;label.textContent=message;retry.hidden=false;display();}
 const boot=begin('팀 정보를 준비하고 있어요',{delay:0});
 async function finishBoot(){
  let timeout;try{await Promise.race([Promise.allSettled([window.PlayerPhotos?.ready,document.fonts?.ready]),new Promise(resolve=>{timeout=setTimeout(resolve,5000);})]);}finally{clearTimeout(timeout);}
  await images(document.getElementById('main'));
  boot();
 }
 motion.addEventListener?.('change',display);document.addEventListener('visibilitychange',display);
 return {begin,during,prepare,cancel,images,finishBoot,fail};
})();

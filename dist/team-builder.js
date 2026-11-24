/* Pure team allocation logic; shared by browser UI and Node checks. */
(function(root){
  const ratings=typeof module!=='undefined'&&module.exports?require('./abilities.js'):root.Abilities;
  function summarize(ids,roster){const list=ids.map(id=>roster.find(p=>p.id===id));const unrated=list.filter(p=>!Number.isFinite(p.ovr)).length,total=unrated?null:list.reduce((n,p)=>n+p.ovr,0);return {count:list.length,total,average:unrated||!list.length?null:total/list.length,unrated,goalkeepers:list.filter(p=>p.pos==='GK').length};}
  function build(ids,roster,mode='balanced',rng=Math.random){
    if(!Array.isArray(ids)||ids.length<4||new Set(ids).size!==ids.length)throw new Error('참가 선수를 4명 이상 선택해 주세요.');
    const selected=ids.map(id=>roster.find(p=>p.id===id));
    if(selected.some(p=>!p))throw new Error('선수 정보를 확인해 주세요.');
    const size=Math.ceil(ids.length/2);
    if(mode==='random'){
      const shuffled=[...ids];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
      return {a:shuffled.slice(0,size),b:shuffled.slice(size),mode};
    }
    if(mode!=='balanced')throw new Error('지원하지 않는 편성 방식입니다.');
    if(selected.some(p=>!Number.isFinite(p.ovr)))throw new Error('균형 편성 전에 참가 선수의 OVR을 입력해 주세요. 랜덤 편성은 바로 사용할 수 있습니다.');
    let best=null,bestGap=Infinity,bestRoles=Infinity;
    const gkCount=selected.filter(p=>p.pos==='GK').length;
    function consider(a){
      const set=new Set(a),b=ids.filter(id=>!set.has(id));
      const sa=summarize(a,roster),sb=summarize(b,roster);
      if(gkCount>=2&&Math.abs(sa.goalkeepers-sb.goalkeepers)>1)return;
      // Compare exact mean differences with cross products (same denominators for all candidates).
      const gap=Math.abs(sa.total*sb.count-sb.total*sa.count);
      const roles=['GK','defense','midfield','attack'].reduce((n,role)=>n+Math.abs(a.filter(id=>ratings.group(roster.find(p=>p.id===id).pos)===role).length-b.filter(id=>ratings.group(roster.find(p=>p.id===id).pos)===role).length),0);
      if(gap<bestGap||(gap===bestGap&&roles<bestRoles)){best={a:[...a],b,mode};bestGap=gap;bestRoles=roles;}
    }
    function choose(start,a){if(a.length===size){consider(a);return;}for(let i=start;i<=ids.length-(size-a.length);i++){a.push(ids[i]);choose(i+1,a);a.pop();}}
    choose(0,[]);return best;
  }
  const api={build,summarize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TeamBuilder=api;
})(typeof window!=='undefined'?window:globalThis);

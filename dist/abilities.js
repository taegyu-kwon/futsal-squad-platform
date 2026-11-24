/* UI fixtures only. No rating calculation or automatic match-to-attribute updates. */
(function(root){
  const field=[
    ['PAC','스피드',['스피드','가속력']],
    ['SHO','슈팅',['골 결정력','슛 파워','중거리 슛','공격 위치 선정']],
    ['PAS','패스',['짧은 패스','긴패스','시야']],
    ['DRI','드리블',['볼 컨트롤','드리블','탈압박','민첩성']],
    ['DEF','수비',['대인 수비','가로채기','수비 위치 선정','태클']],
    ['PHY','피지컬',['몸싸움','공격성','밸런스']]
  ];
  const keeper=[
    ['REF','반사신경',['근거리 슛 반응','굴절 대응','연속 선방']],
    ['POS','위치 선정',['슈팅 각도 차단','좌우 위치 조정','전진 위치 판단']],
    ['1V1','1대1 방어',['돌진 타이밍','몸으로 막기','페인트 대응']],
    ['HAN','핸들링',['캐칭','낮은 공 처리','쳐내는 방향']],
    ['BLD','빌드업',['GK 짧은 패스','던지기 정확도','배급 판단']]
  ];
  const keeperLegacy={REF:'GK 반사신경',POS:'GK 위치 선정','1V1':'GK 1대1 방어',HAN:'GK 핸들링',BLD:'GK 빌드업'};
  const descriptions={
    '근거리 슛 반응':'가까운 거리에서 날아오는 슛에 빠르게 반응하는 능력',
    '굴절 대응':'선수나 바닥에 맞아 방향이 바뀐 공에 대응하는 능력',
    '연속 선방':'첫 선방 후 자세를 회복해 이어지는 슛을 막는 능력',
    '슈팅 각도 차단':'공과 골문 사이에서 슈팅 각도를 좁히는 위치를 잡는 능력',
    '좌우 위치 조정':'공의 이동에 맞춰 골문 안에서 좌우로 움직이는 능력',
    '전진 위치 판단':'상황에 맞춰 골문에서 얼마나 앞으로 나갈지 판단하는 능력',
    '돌진 타이밍':'1대1 상황에서 공격수에게 접근하는 시점을 판단하는 능력',
    '몸으로 막기':'팔과 다리를 활용해 1대1 슈팅 경로를 막는 능력',
    '페인트 대응':'공격수의 속임 동작에 쉽게 넘어가지 않는 능력',
    '캐칭':'잡을 수 있는 공을 놓치지 않고 손으로 잡는 능력',
    '낮은 공 처리':'바닥으로 오는 슛을 안정적으로 처리하는 능력',
    '쳐내는 방향':'잡기 어려운 공을 상대가 없는 안전한 방향으로 보내는 능력',
    'GK 짧은 패스':'골키퍼로서 동료의 발에 짧은 패스를 정확하게 연결하는 능력',
    '던지기 정확도':'손으로 공을 던져 원하는 동료에게 연결하는 능력',
    '배급 판단':'누구에게 언제 공을 보낼지 선택하는 능력'
  };
  const groups={attack:['ST','CF','LW','RW'],midfield:['CAM','CM','CDM','LM','RM'],defense:['CB','LB','RB','LWB','RWB'],GK:['GK']};
  const roles={
    PIV:{name:'피보',positions:'ST · CF',keys:['골 결정력','볼 컨트롤','몸싸움','공격 위치 선정']},
    ALA:{name:'아라',positions:'LW · RW · LM · RM · CAM · CM',keys:['가속력','드리블','짧은 패스','스태미너 (별점)']},
    FIX:{name:'픽소',positions:'CB · CDM · LB · RB · LWB · RWB',keys:['대인 수비','수비 위치 선정','가로채기','짧은 패스']},
    GK:{name:'골레이로',positions:'GK',keys:['근거리 슛 반응','슈팅 각도 차단','돌진 타이밍']}
  };
  const demo={
    9:{"role":"ALA","ovrs":{"PIV":73,"ALA":82,"FIX":81},"next":83,"detail":[67,69,69,87,93,79,90,81,93,84,89,90,81,66,81,88,77,72,91,78]},
    1:{role:'PIV',ovrs:{PIV:87,ALA:84,FIX:72},next:88,detail:[88,90,94,90,87,93,85,83,81,89,86,84,85,60,65,61,61,89,83,83]},
    2:{role:'ALA',ovrs:{PIV:80,ALA:84,FIX:73},next:85,detail:[90,92,83,80,81,84,89,88,86,89,90,86,87,64,66,65,64,75,82,77]},
    3:{role:'ALA',ovrs:{PIV:79,ALA:83,FIX:75},next:84,detail:[86,88,82,81,79,82,88,87,84,87,86,83,84,69,70,71,70,79,82,79]},
    4:{role:'FIX',ovrs:{PIV:69,ALA:76,FIX:85},next:86,detail:[73,77,60,70,62,64,88,84,86,80,73,75,76,94,91,91,92,93,87,90]},
    5:{role:'GK',ovrs:{GK:82},next:83,detail:[86,88,83,80,84]},
    6:{role:'ALA',ovrs:{PIV:76,ALA:80,FIX:70},next:81,detail:[84,86,77,80,76,79,82,80,81,84,85,80,83,62,65,65,64,74,80,77]},
    7:{role:'PIV',ovrs:{PIV:79,ALA:75,FIX:66},next:80,detail:[78,82,86,83,76,83,76,72,71,82,78,77,79,58,61,58,59,85,78,80]},
    8:{role:'FIX',ovrs:{PIV:63,ALA:72,FIX:78},next:79,detail:[70,74,56,65,58,61,82,78,79,77,71,73,75,86,85,84,85,87,82,83]}
  };
  const group=pos=>Object.keys(groups).find(key=>groups[key].includes(pos));
  const schema=p=>p.pos==='GK'?keeper:field;
  function renameDetails(values){const result={...values};for(const [oldName,newName] of [['속력','스피드'],['원터치 패스','긴패스'],['침투 패스','스루 패스']]){if(!Object.hasOwn(result,newName)&&Object.hasOwn(result,oldName))result[newName]=result[oldName];delete result[oldName];}return result;}
  const weightRows={ST:[15,35,10,20,5,15],CF:[15,35,10,20,5,15],LW:[25,20,15,30,0,10],RW:[25,20,15,30,0,10],CAM:[10,20,35,25,0,10],CM:[10,10,30,20,15,15],LM:[20,10,25,25,10,10],RM:[20,10,25,25,10,10],CDM:[10,0,25,10,35,20],CB:[10,0,10,5,50,25],LB:[20,5,20,10,30,15],RB:[20,5,20,10,30,15],LWB:[20,5,20,10,30,15],RWB:[20,5,20,10,30,15],GK:[30,25,25,15,5]};
  const weights=Object.fromEntries(Object.entries(weightRows).map(([pos,row])=>[pos,Object.fromEntries(schema({pos}).map(([code],i)=>[code,row[i]]))]));
  function overall(values,pos){const rule=weights[pos];if(!rule||!Object.keys(rule).every(code=>Number.isFinite(values?.[code])))return null;return Math.round(Object.entries(rule).reduce((total,[code,weight])=>total+values[code]*weight,0)/100);}
  function positionRating(player,pos=player.pos){const values=player.manual?.values||Object.fromEntries(schema(player).map(([code],i)=>[code,player.stats?.[i]]));return overall(values,pos);}
  function forPositions(roster,assignments={}){return roster.map(p=>{const pos=(assignments[p.id]==='미정'||Object.hasOwn(weights,assignments[p.id]))?assignments[p.id]:p.pos;return {...p,pos,ovr:positionRating(p,pos)};});}
  const api={weights,overall,positionRating,forPositions,field,keeper,keeperLegacy,descriptions,groups,roles,demo,group,schema,renameDetails};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Abilities=api;
})(typeof window!=='undefined'?window:globalThis);

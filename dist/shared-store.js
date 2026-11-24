/* All devices render the server snapshot; browser values are only a recoverable draft. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SharedStore=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>({
 initialData({initial,original,canEdit}){return initial.revision>0?{...(initial.data||{})}:canEdit?{...original}:{};},
 create({keys,readData,writeData,storage,canEdit}){return {
  getItem(key){key=String(key);return keys.includes(key)?readData()[key]??null:storage.getItem(key);},
  setItem(key,value){key=String(key);value=String(value);if(!keys.includes(key))return storage.setItem(key,value);if(!canEdit())throw Error('관리자만 수정할 수 있습니다.');storage.setItem(key,value);writeData(key,value);}
 };}
}));

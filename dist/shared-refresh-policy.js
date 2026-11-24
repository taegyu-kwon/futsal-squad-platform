/* Decide when a remote snapshot may replace a visible screen without losing edits. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SharedRefreshPolicy=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>({
 decide({revision,remoteRevision,changedDuringRequest=false,busy=false,dirty=false,conflicted=false,editing=false,identityChanged=false}){
  if(busy||changedDuringRequest)return 'wait';
  if(conflicted)return 'conflict';
  if(remoteRevision<revision)return 'wait';
  if(remoteRevision===revision&&!identityChanged)return 'unchanged';
  if(dirty)return 'conflict';
  if(editing)return 'defer';
  return 'reload';
 }
}));

const {test}=require('node:test');const assert=require('node:assert/strict');const {decide}=require('../dist/shared-refresh-policy.js');
const snapshot={revision:3,remoteRevision:4};
test('newer shared data refreshes an idle viewer or manager',()=>{assert.equal(decide(snapshot),'reload');assert.equal(decide({revision:4,remoteRevision:4}),'unchanged');assert.equal(decide({revision:4,remoteRevision:3}),'wait');});
test('open editor defers refresh rather than discarding input',()=>{assert.equal(decide({...snapshot,editing:true}),'defer');assert.equal(decide({...snapshot,editing:false}),'reload');});
test('unsaved local writes conflict with newer remote data',()=>{assert.equal(decide({...snapshot,dirty:true}),'conflict');assert.equal(decide({revision:3,remoteRevision:3,dirty:true}),'unchanged');assert.equal(decide({...snapshot,conflicted:true}),'conflict');});
test('a response started before a local save cannot replace newer state',()=>{assert.equal(decide({...snapshot,busy:true}),'wait');assert.equal(decide({...snapshot,changedDuringRequest:true}),'wait');});
test('authentication changes refresh only when no draft is at risk',()=>{assert.equal(decide({revision:3,remoteRevision:3,identityChanged:true}),'reload');assert.equal(decide({revision:3,remoteRevision:3,identityChanged:true,editing:true}),'defer');});
const SharedStore=require('../dist/shared-store.js');
test('server 79 wins over a device 73 including an interrupted local draft',()=>{
 const key='unit-fc-pilot-roster-v1',local={[key]:'{"102":{"ovr":73}}'},server={[key]:'{"102":{"ovr":79}}'};
 for(const canEdit of [false,true]){
  const data=SharedStore.initialData({initial:{revision:35,data:server},original:local,canEdit});
  const store=SharedStore.create({keys:[key],readData:()=>data,writeData:()=>assert.fail('read must not upload'),storage:{getItem:k=>local[k]},canEdit:()=>canEdit});
  assert.equal(JSON.parse(store.getItem(key))[102].ovr,79);assert.equal(JSON.parse(local[key])[102].ovr,73);
 }
});
test('shared storage writes require manager permission and preserve storage failures',()=>{
 let data={roster:'79'},disk={roster:'73'},writes=0;const storage={getItem:k=>disk[k],setItem(k,v){disk[k]=v;}};
 const create=canEdit=>SharedStore.create({keys:['roster'],readData:()=>data,writeData:(k,v)=>{data[k]=v;writes++;},storage,canEdit:()=>canEdit});
 assert.throws(()=>create(false).setItem('roster','73'));assert.equal(data.roster,'79');assert.equal(writes,0);
 create(true).setItem('roster','80');assert.equal(data.roster,'80');assert.equal(disk.roster,'80');assert.equal(writes,1);
 storage.setItem=()=>{throw Error('quota')};assert.throws(()=>create(true).setItem('roster','81'));assert.equal(data.roster,'80');
});
test('only an uninitialized server can use the manager legacy data',()=>{assert.deepEqual(SharedStore.initialData({initial:{revision:0,data:null},original:{roster:'73'},canEdit:true}),{roster:'73'});assert.deepEqual(SharedStore.initialData({initial:{revision:0,data:null},original:{roster:'73'},canEdit:false}),{});});

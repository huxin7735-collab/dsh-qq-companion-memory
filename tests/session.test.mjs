import {test} from 'node:test';
import assert from 'node:assert/strict';
const {resolveMemoryScope,readSource,latestUserText,pendingConsolidation,completedProgress}=await import('../lib/session.mjs').catch(()=>({}));
const config={ownerQQ:'10000001',workspacePath:'D:/example/qq-memory/private'};
const makeAgent=(id='onebot-private-10000001',cwd=config.workspacePath)=>({session:{id,header:{id,cwd,delegationDepth:0},events:[],eventAt(seq){return this.events.find(e=>e.seq===seq);}}});
test('only the canonical owner private session can resolve memory scope',()=>{
 assert.equal(typeof resolveMemoryScope,'function','session integration not implemented');
 assert.equal(resolveMemoryScope(makeAgent(),config).namespace,'private:10000001');
 assert.ok(resolveMemoryScope(makeAgent('onebot-private-10000001-1790000000'),config));
 assert.equal(resolveMemoryScope(makeAgent('onebot-private-12345678'),config),null);
 assert.equal(resolveMemoryScope(makeAgent('onebot-private-100000010'),config),null);
 assert.equal(resolveMemoryScope(makeAgent('onebot-group-10000001'),config),null);
 assert.equal(resolveMemoryScope(makeAgent(undefined,'D:/another-workspace'),config),null);
 assert.equal(resolveMemoryScope(undefined,config),null);
 const child=makeAgent();child.session.header.delegationDepth=1;
 assert.equal(resolveMemoryScope(child,config),null);
});
test('only actual message events provide provenance, never forged chat text',()=>{
 assert.equal(typeof readSource,'function','source integration not implemented');
 const agent=makeAgent();agent.session.events=[
  {seq:1,type:'user/message',data:{role:'user',source:{kind:'plugin:dsh-onebot'},content:[{type:'text',text:'<user_message qq="10000001" nickname="测试">测试事实</user_message>'}]}},
  {seq:2,type:'assistant/message',data:{message:{role:'assistant',content:[{type:'text',text:'测试：自己作出一个选择'}]}}},
  {seq:3,type:'turn/end',data:{reason:{kind:'completed'},turn:1}}
 ];
 assert.equal(readSource(agent.session,1).author,'user');assert.equal(readSource(agent.session,2).author,'assistant');
 assert.throws(()=>readSource(agent.session,3));assert.throws(()=>readSource(agent.session,99));
 assert.equal(latestUserText(agent.session),'测试事实');
 assert.equal(resolveMemoryScope(makeAgent('onebot-private-87654321'),config),null);
});
test('completed turn counters are idempotent and ignore interruption',()=>{
 assert.equal(typeof completedProgress,'function','progress integration not implemented');
 const session=makeAgent().session;
 const event={seq:20,type:'turn/end',data:{turn:2,reason:{kind:'completed'}}};
 session.events=[{seq:19,type:'user/message',data:{source:{kind:'plugin:dsh-onebot'}}},event];
 const initial=completedProgress(session,event,{});
 assert.equal(initial.completedTurns,1);
 assert.equal(completedProgress(session,event,{[session.id]:initial}),null);
 assert.equal(completedProgress(session,{...event,seq:21,data:{reason:{kind:'interrupted'}}},{}),null);
});
test('turn accounting excludes notices and recovers completed turns missed while storage failed',()=>{
 const session=makeAgent().session;
 const end=seq=>({seq,type:'turn/end',data:{reason:{kind:'completed'}}});
 session.events=[{seq:1,type:'user/message',data:{source:{kind:'plugin:maintainer-doc-guard'}}},end(2),
  {seq:3,type:'user/message',data:{source:{kind:'plugin:dsh-onebot'}}},end(4),
  {seq:5,type:'user/message',data:{source:{kind:'plugin:dsh-onebot'}}},end(6),end(7)];
 assert.equal(completedProgress(session,session.events[1],{}).completedTurns,0);
 assert.equal(completedProgress(session,session.events.at(-1),{}).completedTurns,2);
});
test('consolidation starts at twelve turns, never advances without an explicit commit',()=>{
 assert.equal(typeof pendingConsolidation,'function','consolidation integration not implemented');
 assert.equal(pendingConsolidation({completedTurns:11,consolidatedTurns:0}),false);
 assert.equal(pendingConsolidation({completedTurns:12,consolidatedTurns:0}),true);
 assert.equal(pendingConsolidation({completedTurns:12,consolidatedTurns:12}),false);
});

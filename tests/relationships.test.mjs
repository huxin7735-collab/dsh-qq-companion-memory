import{test}from'node:test';import assert from'node:assert/strict';import{mkdtemp,readFile}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';import{MemberJournal}from'../lib/members.mjs';
import {MemoryStore} from '../lib/store.mjs';
const source=(seq,sessionId='onebot-group-20000001-first')=>({sessionId,seq,author:'user'}),open=async()=>MemberJournal.open({root:await mkdtemp(join(tmpdir(),'qq-relations-')),groupId:'20000001'});
test('different people develop distinct feelings and keep them through nickname and session changes',async()=>{
 const j=await open();await j.note({qq:'12345678',nickname:'甲',note:'认真听完了我的解释，相处舒服',source:source(1),relationship:{affection:4,trust:3,familiarity:2,comfort:4,summary:'聊得来，愿意继续接话'}});
 await j.note({qq:'23456789',nickname:'乙',note:'反复打断，想先留点距离',source:source(1),relationship:{affection:-2,comfort:-4,familiarity:1,summary:'先观察彼此分寸'}});
 assert.equal(j.read('12345678').relationship.affection,4);assert.equal(j.read('23456789').relationship.affection,-2);
 await j.note({qq:'12345678',nickname:'甲的新名字',note:'后来认真说明了误会',source:source(1,'onebot-group-20000001-second'),relationship:{trust:2}});
 const restarted=await MemberJournal.open({root:j.store.root,groupId:'20000001'});assert.equal(restarted.read('12345678').relationship.trust,5);assert.deepEqual(restarted.read('12345678').nicknames,['甲','甲的新名字']);
});
test('activity notes do not implicitly add affection; a duplicate source cannot farm points',async()=>{
 const j=await open();await j.note({qq:'12345678',note:'今天聊得比较多',source:source(1)});assert.equal(j.read('12345678').relationship??null,null);
 const update={qq:'12345678',note:'这个玩笑双方都接得住',source:source(2),relationship:{affection:3,trust:1}};
 await j.note(update);const before=j.read('12345678').relationship;assert.ok(before);
 await j.note({...update,relationship:{affection:10,trust:10}});assert.deepEqual(j.read('12345678').relationship,before);
});
test('large edits and wrong provenance are rejected; values stay bounded',async()=>{
 const j=await open();for(const relationship of [{affection:100},{trust:NaN},{comfort:1.5},{familiarity:-11},{unknown:2}])await assert.rejects(j.note({qq:'12345678',note:'测试',source:source(1),relationship}));
 await assert.rejects(j.note({qq:'12345678',note:'不能拿私聊更新群关系',source:source(1,'onebot-private-10000001'),relationship:{trust:1}}));
 for(let seq=1;seq<=12;seq++)await j.note({qq:'12345678',note:'不同真实事件下更新的有依据观察',source:source(seq),relationship:{affection:10,familiarity:10}});
 assert.equal(j.read('12345678').relationship.affection,100);assert.equal(j.read('12345678').relationship.familiarity,100);
});
test('diary correction preserves relationships; forgetting one person does not erase another from the same event',async()=>{
 const j=await open();for(const qq of ['12345678','23456789'])await j.note({qq,note:'各自的相处观察',source:source(1),relationship:{trust:3}});
 await j.note({qq:'12345678',note:'修正之前的印象',source:source(2),replace:true});assert.equal(j.read('12345678').relationship.trust,3);
 await j.forget('12345678');assert.equal(j.read('12345678'),null);assert.equal(j.read('23456789').relationship.trust,3);
 await assert.rejects(j.note({qq:'12345678',note:'不能从已遗忘旧来源复活',source:source(1),relationship:{trust:3}}),/遗忘/);
});
test('overlapping writers serialize scores and retain both independent observations',async()=>{
 const j=await open(),second=await MemberJournal.open({root:j.store.root,groupId:'20000001'});
 await Promise.all([j.note({qq:'12345678',note:'第一处相处',source:source(1),relationship:{trust:2}}),second.note({qq:'12345678',note:'另一会话的相处',source:source(1,'onebot-group-20000001-second'),relationship:{trust:3}})]);
 assert.equal(j.read('12345678').relationship.trust,5);assert.equal(j.read('12345678').notes.length,2);
});
test('existing diary records keep their ids, notes and old provenance when relationships are added',async()=>{
 const root=await mkdtemp(join(tmpdir(),'qq-legacy-member-')),store=await MemoryStore.open({root,namespace:'group:20000001'}),oldSource={...source(1),memberQQ:'12345678'};
 const old=await store.write({kind:'state',content:JSON.stringify({qq:'12345678',nicknames:['旧昵称'],notes:[{at:'2026-10-20T10:00:00Z',text:'旧观察仍然重要',source:source(1)}]}),source:oldSource});
 const j=await MemberJournal.open({root,groupId:'20000001'});await j.note({qq:'12345678',nickname:'新昵称',note:'在原有相处基础上改了想法',source:source(2),relationship:{trust:2}});
 assert.equal(j.read('12345678').recordId,old.id);assert.equal(j.read('12345678').notes[0].text,'旧观察仍然重要');assert.equal(j.read('12345678').relationship.trust,2);
 await j.forget('12345678');await assert.rejects(j.note({qq:'12345678',note:'不能把原先已忘记的观察导入',source:source(1)}),/遗忘/);
});
test('same member in another group has an independent relationship',async()=>{
 const j=await open(),other=await MemberJournal.open({root:j.store.root,groupId:'20000002'});
 await j.note({qq:'12345678',note:'本群里的相处',source:source(1),relationship:{trust:4}});
 await other.note({qq:'12345678',note:'另一群自己形成的印象',source:source(1,'onebot-group-20000002-first'),relationship:{trust:-2}});
 assert.equal(j.read('12345678').relationship.trust,4);assert.equal(other.read('12345678').relationship.trust,-2);
});

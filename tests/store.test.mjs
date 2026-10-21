import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rename, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
const { MemoryStore } = await import('../lib/store.mjs').catch(() => ({}));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-memory-test-'));
  t.after(async () => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'dsh-memory-test-'));
    await rm(root, { recursive: true, force: true });
  });
  assert.equal(typeof MemoryStore, 'function', 'memory store is not implemented');
  return { root, store: await MemoryStore.open({ root: join(root, 'memory'), namespace: 'private:10000001' }) };
}
const source = seq => ({ sessionId: 'onebot-private-10000001', seq, author: 'user' });
test('saved facts survive reopening and maintain provenance', async t => {
  const {root,store}=await fixture(t);
  const record=await store.write({kind:'fact',content:'测试用户周三有一次会议',source:source(1)});
  const reopened=await MemoryStore.open({root:join(root,'memory'),namespace:'private:10000001'});
  assert.equal(reopened.snapshot().records[0].content,record.content);
  assert.deepEqual(reopened.snapshot().records[0].source,source(1));
});
test('twenty simultaneous writes and source retries lose no facts',async t=>{
  const {store}=await fixture(t);
  await Promise.all(Array.from({length:20},(_,i)=>store.write({kind:'episode',content:`测试记录 ${i}`,source:source(i+1)})));
  await store.write({kind:'episode',content:'测试记录 0',source:source(1)});
  assert.equal(store.snapshot().records.length,20);
});
test('two store handles serialize against the same file',async t=>{
  const {root,store}=await fixture(t);
  const second=await MemoryStore.open({root:join(root,'memory'),namespace:'private:10000001'});
  await Promise.all([store.write({kind:'fact',content:'第一件测试事项',source:source(1)}),second.write({kind:'fact',content:'第二件测试事项',source:source(2)})]);
  const final=await MemoryStore.open({root:join(root,'memory'),namespace:'private:10000001'});
  assert.equal(final.snapshot().records.length,2);
});
test('corrections replace active facts and forgetting suppresses old event replay',async t=>{
  const {store}=await fixture(t);
  const old=await store.write({kind:'fact',content:'测试会议在周三',source:source(1)});
  const corrected=await store.write({kind:'fact',content:'测试会议改到周四',source:source(2),replaces:[old.id]});
  assert.equal(store.snapshot().records.find(r=>r.id===old.id).status,'superseded');
  await store.forget({ids:[corrected.id]});
  assert.equal(store.snapshot().records.length,0);
  await assert.rejects(store.write({kind:'fact',content:'测试会议在周三',source:source(1)}),/forgotten|遗忘/);
  await assert.rejects(store.write({kind:'fact',content:'测试会议改到周四',source:source(2)}),/forgotten|遗忘/);
  const disk=await readFile(store.file,'utf8');
  assert.ok(!disk.includes('测试会议'));
});
test('self notes are editable without fixing an identity',async t=>{
  const {store}=await fixture(t);
  const note=await store.write({kind:'self',content:'测试：目前想把这个名字留下',source:{...source(3),author:'self'}});
  const changed=await store.write({id:note.id,kind:'self',content:'测试：后来改变了想法',source:{...source(4),author:'self'}});
  assert.equal(changed.id,note.id);
  assert.equal(store.snapshot().records.length,1);
  await store.forget({ids:[note.id]});
  assert.equal(store.snapshot().records.length,0);
});
test('corrupt storage refuses to silently erase data',async t=>{
  const {root,store}=await fixture(t);
  await store.write({kind:'fact',content:'有效测试记忆',source:source(1)});
  await writeFile(store.file,'broken JSON');
  await assert.rejects(MemoryStore.open({root:join(root,'memory'),namespace:'private:10000001'}),/corrupt|JSON|损坏/);
  await assert.rejects(store.write({kind:'fact',content:'新测试记忆',source:source(2)}));
  assert.throws(()=>store.snapshot());
  assert.equal(await readFile(store.file,'utf8'),'broken JSON');
});
test('failed disk writes preserve last acknowledged snapshot',async t=>{
  const {root,store}=await fixture(t);
  await store.write({kind:'fact',content:'已确认测试记忆',source:source(1)});
  await rename(join(root,'memory'),join(root,'saved'));
  await writeFile(join(root,'memory'),'blocked by a file');
  await assert.rejects(store.write({kind:'fact',content:'不能确认的测试记忆',source:source(2)}));
  assert.throws(()=>store.snapshot());
  assert.ok((await readFile(join(root,'saved',(await readdir(join(root,'saved')))[0]),'utf8')).includes('已确认测试记忆'));
  await rm(join(root,'memory'));await rename(join(root,'saved'),join(root,'memory'));
  assert.equal(store.snapshot().records.length,1);
});
test('namespaces cannot be paths and progress survives reopening',async t=>{
  const {root,store}=await fixture(t);
  await assert.rejects(MemoryStore.open({root:join(root,'memory'),namespace:'../../other'}));
  await store.markProgress({sessionId:source(1).sessionId,completedTurns:12,lastSeq:30});
  const fresh=await MemoryStore.open({root:join(root,'memory'),namespace:'private:10000001'});
  assert.equal(fresh.snapshot().progress[source(1).sessionId].completedTurns,12);
});
test('replaying a superseded source does not reactivate the old fact',async t=>{
 const {store}=await fixture(t);
 const old=await store.write({kind:'fact',content:'测试：旧会议时间',source:source(1)});
 await store.write({kind:'fact',content:'测试：新会议时间',source:source(2),replaces:[old.id]});
 await assert.rejects(store.write({kind:'fact',content:'测试：旧会议时间',source:source(1)}),/superseded|替代/);
 assert.equal(store.snapshot().records.filter(r=>r.status==='active').length,1);
});
test('another open handle immediately stops returning forgotten content',async t=>{
 const {root,store}=await fixture(t);
 const item=await store.write({kind:'fact',content:'测试：随后将遗忘的内容',source:source(1)});
 const second=await MemoryStore.open({root:join(root,'memory'),namespace:'private:10000001'});
 assert.equal(second.snapshot().records.length,1);
 await store.forget({ids:[item.id]});
 assert.equal(second.snapshot().records.length,0);
});
test('a partial or stale checkpoint cannot mark all turns consolidated',async t=>{
 const {store}=await fixture(t);
 await store.markProgress({sessionId:source(1).sessionId,completedTurns:12,lastSeq:30});
 await assert.rejects(store.markProgress({sessionId:source(1).sessionId,completedTurns:12,lastSeq:30,consolidatedThrough:0}),/checkpoint|整理/);
 assert.equal(store.snapshot().progress[source(1).sessionId].consolidatedTurns,0);
});
test('historical retries cannot undo an in-place correction',async t=>{
 const {store}=await fixture(t);
 const item=await store.write({kind:'self',content:'测试：最初的想法',source:source(1)});
 await store.write({id:item.id,kind:'self',content:'测试：后来改过的想法',source:source(2)});
 await store.write({kind:'self',content:'测试：最初的想法',source:source(1)});
 assert.equal(store.snapshot().records[0].content,'测试：后来改过的想法');
 await assert.rejects(store.write({id:item.id,kind:'self',content:'测试：旧来源编辑',source:source(1)}),/stale|过时/);
});
test('independently loaded writers cannot overwrite acknowledged writes',async t=>{
 const {root,store}=await fixture(t);
 const {MemoryStore:Independent}=await import('../lib/store.mjs?independent-writer');
 const other=await Independent.open({root:join(root,'memory'),namespace:'private:10000001'});
 for(const handle of [store,other]){const read=handle.readLatest.bind(handle);handle.readLatest=async()=>{const data=await read();await new Promise(r=>setTimeout(r,40));return data;};}
 await Promise.all([store.write({kind:'fact',content:'测试：第一独立写入',source:source(1)}),other.write({kind:'fact',content:'测试：第二独立写入',source:source(2)})]);
 assert.equal(store.snapshot().records.length,2);
});

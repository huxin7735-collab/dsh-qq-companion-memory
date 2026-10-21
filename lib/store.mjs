import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const queues = new Map();
const kinds = new Set(['fact', 'episode', 'self', 'commitment', 'state']);
const hash = text => createHash('sha256').update(text).digest('hex');
const clone = value => structuredClone(value);
const cleanId = id => typeof id === 'string' && /^[\w:-]{1,180}$/.test(id) && !['__proto__','prototype','constructor'].includes(id);
export const sourceKey = source => hash(JSON.stringify([source.sessionId, source.seq ?? null, source.turn ?? null, source.callId ?? null,...(source.memberQQ!==undefined?[{memberQQ:source.memberQQ}]:[])]));
function serialize(file, fn) {
  const turn = (queues.get(file) ?? Promise.resolve()).then(fn);
  const guard = turn.catch(() => {});
  queues.set(file, guard);
  void guard.then(() => { if (queues.get(file) === guard) queues.delete(file); });
  return turn;
}
async function lockFile(file) {
  const lock=file+'.lock';const deadline=Date.now()+10000;
  while(true){
    let handle;
    try{handle=await open(lock,'wx');}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      // Never steal a lock on a timer: a slow but live writer still owns it.
      if(Date.now()>=deadline)throw new Error('Memory writer lock unavailable / 记忆写入锁被占用');
      await new Promise(resolve=>setTimeout(resolve,25));continue;
    }
    try{await handle.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));}
    catch(error){await handle.close();await unlink(lock);throw error;}
    return async()=>{try{await handle.close();}finally{await unlink(lock);}};
  }
}
function empty(namespace) { return { version: 1, namespace, revision: 0, records: [], forgotten: [], progress: {} }; }
function progressChange(next, {sessionId, completedTurns, lastSeq, consolidatedThrough}) {
  if (!cleanId(sessionId) || !Number.isSafeInteger(completedTurns) || completedTurns < 0 || !Number.isSafeInteger(lastSeq) || lastSeq < 0) throw new Error('Invalid progress');
  const old = next.progress[sessionId] ?? {completedTurns:0,lastSeq:0,consolidatedThrough:0,consolidatedTurns:0};
  const latestSeq = Math.max(old.lastSeq,lastSeq);
  if (consolidatedThrough !== undefined && (!Number.isSafeInteger(consolidatedThrough) || consolidatedThrough !== latestSeq || completedTurns !== Math.max(old.completedTurns,completedTurns))) throw new Error('Invalid checkpoint / 整理位置已过时');
  return next.progress[sessionId] = {completedTurns:Math.max(old.completedTurns,completedTurns),lastSeq:latestSeq,
    consolidatedThrough:consolidatedThrough ?? old.consolidatedThrough,
    consolidatedTurns:consolidatedThrough === undefined ? old.consolidatedTurns : Math.max(old.completedTurns,completedTurns)};
}
function validate(state, namespace) {
  if (!state || state.version !== 1 || state.namespace !== namespace || !Number.isSafeInteger(state.revision)
    || !Array.isArray(state.records) || !Array.isArray(state.forgotten) || !state.progress || typeof state.progress !== 'object'
    || Array.isArray(state.progress) || state.records.some(r => !r || !cleanId(r.id) || !kinds.has(r.kind)
      || typeof r.content !== 'string' || !['active','superseded'].includes(r.status) || !Array.isArray(r.sourceKeys))) {
    throw new Error('Memory storage corrupt / 记忆存储结构损坏');
  }
  return state;
}
async function atomicWrite(file, value) {
  const temporary = file + '.tmp-' + randomUUID();
  try {
    const handle = await open(temporary, 'wx');
    try { await handle.writeFile(JSON.stringify(value, null, 2), 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
export class MemoryStore {
  static async open({ root, namespace }) {
    if (!/^(private|group):[1-9]\d{4,15}$/.test(namespace)) throw new Error('Invalid memory namespace');
    const store = new MemoryStore(resolve(root), namespace);
    await mkdir(store.root, { recursive: true });
    store.state = await store.readLatest();
    return store;
  }
  constructor(root, namespace) {
    this.root = root; this.namespace = namespace;
    this.file = join(root, hash(namespace).slice(0, 24) + '.json');
    this.state = empty(namespace);
  }
  async readLatest() {
    try { return validate(JSON.parse(await readFile(this.file, 'utf8')), this.namespace); }
    catch (error) {
      if (error.code === 'ENOENT' && this.state.revision === 0) return empty(this.namespace);
      throw error;
    }
  }
  snapshot() {
    try { this.state = validate(JSON.parse(readFileSync(this.file,'utf8')),this.namespace); }
    catch(error) { if(error.code !== 'ENOENT' || this.state.revision !== 0) throw error; }
    return clone(this.state);
  }
  async transaction(change) {
    return serialize(this.file, async () => {
      const release=await lockFile(this.file);
      try{
      const latest = await this.readLatest();
      const next = clone(latest);
      const result = await change(next);
      next.revision++;
      validate(next, this.namespace);
      await atomicWrite(this.file, next);
      this.state = next;
      return clone(result);
      }finally{await release();}
    });
  }
  async write({ id, kind, content, source, replaces = [], checkpoint }) {
    if (!kinds.has(kind) || typeof content !== 'string' || !content.trim() || [...content].length > 12000) throw new Error('Invalid memory kind/content');
    if (!source || !cleanId(source.sessionId) || !['user','assistant','self','tool','migration'].includes(source.author)
      || (source.seq !== undefined && (!Number.isSafeInteger(source.seq) || source.seq < 0))) throw new Error('Invalid memory source');
    if(source.memberQQ!==undefined&&!/^[1-9]\d{4,15}$/.test(source.memberQQ))throw new Error('Invalid member source');
    if (id !== undefined && !cleanId(id)) throw new Error('Invalid memory id');
    if (!Array.isArray(replaces) || replaces.some(item => !cleanId(item))) throw new Error('Invalid replaced ids');
    const text = content.trim(); const key = sourceKey(source);
    return this.transaction(next => {
      if (checkpoint) progressChange(next,checkpoint);
      if (next.forgotten.includes(key)) throw new Error('Source was forgotten / 已遗忘，不能从旧事件重新导入');
      const now = new Date().toISOString();
      const recordId = id ?? 'm:' + hash(JSON.stringify([kind, text, key])).slice(0, 24);
      const previous = next.records.find(record => record.id === recordId);
      if (previous?.status === 'superseded') throw new Error('Memory superseded / 此记忆已被替代');
      if (previous && !id) return previous;
      if (id && !previous) throw new Error('Memory id does not exist');
      if(previous && ((previous.sourceKeys.includes(key)&&sourceKey(previous.source)!==key)
        || (source.sessionId===previous.source.sessionId&&source.seq<previous.source.seq))) throw new Error('Stale source / 修改来源已过时');
      const replaced = replaces.map(old => {
        const record = next.records.find(item => item.id === old);
        if (!record || old === recordId) throw new Error('Replaced memory does not exist');
        return record;
      });
      const record = { id: recordId, kind, content: text, source: clone(source),
        sourceKeys: [...new Set([...(previous?.sourceKeys ?? []), key])],
        createdAt: previous?.createdAt ?? now, updatedAt: now, status: 'active',
        replaces: [...new Set([...(previous?.replaces ?? []), ...replaces])] };
      for (const old of replaced) { old.status = 'superseded'; old.replacedBy = recordId; }
      if (previous) next.records[next.records.indexOf(previous)] = record;
      else next.records.push(record);
      return record;
    });
  }
  async forget({ ids }) {
    if (!Array.isArray(ids) || ids.some(id => !cleanId(id))) throw new Error('Invalid memory ids');
    return this.transaction(next => {
      const removedIds = new Set(ids);
      let changed = true;
      while (changed) {
        changed = false;
        for (const record of next.records) {
          if (removedIds.has(record.id) || (record.replaces ?? []).some(id => removedIds.has(id)) || removedIds.has(record.replacedBy)) {
            for (const related of [record.id, ...(record.replaces ?? []), record.replacedBy].filter(Boolean)) {
              if (!removedIds.has(related)) { removedIds.add(related); changed = true; }
            }
          }
        }
      }
      const removed = next.records.filter(record => removedIds.has(record.id));
      next.forgotten = [...new Set([...next.forgotten, ...removed.flatMap(record => record.sourceKeys)])];
      next.records = next.records.filter(record => !removedIds.has(record.id));
      return { removed: removed.length };
    });
  }
  async markProgress({ sessionId, completedTurns, lastSeq, consolidatedThrough }) {
    return this.transaction(next => progressChange(next,{sessionId,completedTurns,lastSeq,consolidatedThrough}));
  }
}

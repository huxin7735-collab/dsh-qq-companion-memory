import {MemoryStore,sourceKey} from './store.mjs';
import {evolveRelationship,validateRelationship} from './relationships.mjs';
const valid=qq=>/^[1-9]\d{4,15}$/.test(String(qq));
export class MemberJournal {
  static async open({root,groupId}){return new MemberJournal(await MemoryStore.open({root,namespace:'group:'+groupId}));}
  constructor(store){this.store=store;this.pending=Promise.resolve();}
  rows(){return this.store.snapshot().records.filter(r=>r.status==='active').map(r=>{try{return {...JSON.parse(r.content),recordId:r.id,updatedAt:r.updatedAt};}catch{return null;}}).filter(Boolean);}
  read(qq){return this.rows().find(r=>r.qq===String(qq))??null;}
  async note({qq,nickname,note,source,replace=false,relationship}){
    qq=String(qq);
    if(!valid(qq)||typeof note!=='string'||!note.trim()||Array.from(note).length>1200)throw Error('需要有效 QQ 和 1–1200 字的观察');
    const prefix='onebot-'+this.store.namespace.replace(':','-');
    if(source?.author!=='user'||!Number.isSafeInteger(source.seq)||source.seq<0||!(source.sessionId===prefix||String(source.sessionId).startsWith(prefix+'-')))throw Error('群友观察需要本群真实来源');
    if(relationship!==undefined)validateRelationship(relationship);
    source={...source,memberQQ:qq};const key=sourceKey(source);
    const task=this.pending.then(()=>this.store.transaction(next=>{
      const previous=next.records.find(r=>r.status==='active'&&JSON.parse(r.content).qq===qq),current=previous?JSON.parse(previous.content):null;
      if(next.forgotten.includes(key))throw Error('来源已遗忘，不能从旧事件重新导入');
      if(previous&&((previous.sourceKeys.includes(key)&&sourceKey(previous.source)!==key)||(source.sessionId===previous.source.sessionId&&source.seq<previous.source.seq)))throw Error('修改来源已过时');
      const at=new Date().toISOString(),nicknames=[...new Set([...(current?.nicknames??[]),...(nickname?[String(nickname).slice(0,80)]:[])])].slice(-8);
      const notes=[...(replace?[]:current?.notes??[]),{at,text:note.trim(),source}].slice(-20),data={qq,nicknames,notes};
      let relationshipApplied=false;
      if(relationship!==undefined){const evolved=evolveRelationship(current?.relationship,relationship,{note:note.trim(),source,at});data.relationship=evolved.relationship;relationshipApplied=evolved.applied;}
      else if(current?.relationship)data.relationship=current.relationship;
      while(Array.from(JSON.stringify(data)).length>11000&&notes.length>1)notes.shift();
      if(Array.from(JSON.stringify(data)).length>12000)throw Error('群友记录太长，请先整理观察');
      const record={id:previous?.id??'member:'+qq,kind:'state',content:JSON.stringify(data),source,sourceKeys:[...new Set([...(previous?.sourceKeys??[]),key])],createdAt:previous?.createdAt??at,updatedAt:at,status:'active',replaces:previous?.replaces??[]};
      if(previous)next.records[next.records.indexOf(previous)]=record;else next.records.push(record);
      return {saved:true,member:{...data,recordId:record.id,updatedAt:at},recordId:record.id,relationshipApplied};
    }));this.pending=task.catch(()=>{});return task;
  }
  async forget(qq){if(!valid(qq))throw Error('无效 QQ');const task=this.pending.then(async()=>{const row=this.read(qq);await this.store.forget({ids:row?[row.recordId]:[]});return {forgotten:true};});this.pending=task.catch(()=>{});return task;}
}

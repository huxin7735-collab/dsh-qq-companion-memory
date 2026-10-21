import { resolve, normalize } from 'node:path';
import { realpathSync } from 'node:fs';
function canonical(path) {
  try { return normalize(realpathSync.native(path)).toLowerCase(); }
  catch { return resolve(path).replaceAll('\\','/').toLowerCase(); }
}
export function resolveMemoryScope(agent, config) {
  const session=agent?.session;
  if(!session||!session.header||session.header.origin==='subagent'||(session.header.delegationDepth??0)>0)return null;
  const id=String(session.id??session.header.id??'');
  const namespace=config.groupId?'group:'+config.groupId:'private:'+config.ownerQQ;
  const prefix='onebot-'+namespace.replace(':','-');
  if(id!==prefix&&!id.startsWith(prefix+'-'))return null;
  if(typeof session.header.cwd!=='string'||canonical(session.header.cwd)!==canonical(config.workspacePath))return null;
  return {namespace,sessionId:id};
}
export function sessionEvents(session) {
  if(Array.isArray(session.events))return session.events;
  if(Array.isArray(session.log))return session.log;
  const events=[];
  const length=session.length??session.nextSeq??session.lastSeq;
  if(Number.isSafeInteger(length))for(let seq=0;seq<=length;seq++) {const event=session.eventAt?.(seq);if(event)events.push(event);}
  return events;
}
export function messageText(event) {
  const message=event?.data?.message??event?.data;
  return (message?.content??[]).filter(part=>part.type==='text').map(part=>part.text??'').join('\n');
}
export function readSource(session, seq) {
  const event=session.eventAt?.(seq)??sessionEvents(session).find(event=>event.seq===seq);
  if(!event||!['user/message','assistant/message'].includes(event.type))throw new Error('来源不是已存在的对话消息');
  if(event.type==='user/message'&&!isQQUserMessage(event)&&!isCompanionActivity(event))throw new Error('来源不是 QQ 用户原话或自己的活动');
  return {sessionId:String(session.id??session.header?.id),seq:event.seq,author:event.type==='user/message'?(isCompanionActivity(event)?'tool':'user'):'assistant'};
}
export function isCompanionActivity(event){return event?.type==='user/message'&&(event.data?.message??event.data)?.source?.kind==='plugin:dsh-qq-companion-life';}
export function isQQUserMessage(event) {
  return event?.type==='user/message'&&(event.data?.message??event.data)?.source?.kind==='plugin:dsh-onebot';
}
export function latestUserText(session) {
  const event=sessionEvents(session).findLast(isQQUserMessage);
  const text=event?messageText(event):'';
  const wrapper=text.match(/<user_message\b[^>]*>([\s\S]*)<\/user_message>/);
  return (wrapper?.[1]??text).slice(0,2000);
}
export function completedProgress(session, event, progress) {
  if(event?.type!=='turn/end'||event.data?.reason?.kind!=='completed')return null;
  const sessionId=String(session.id??session.header?.id);
  const previous=progress[sessionId]??{completedTurns:0,lastSeq:0};
  if(event.seq<=previous.lastSeq)return null;
  let hasUser=false,completed=0;
  for(const row of sessionEvents(session).filter(row=>row.seq>previous.lastSeq&&row.seq<=event.seq).sort((a,b)=>a.seq-b.seq)){
    if(isQQUserMessage(row))hasUser=true;
    if(row.type==='turn/end'&&row.data?.reason?.kind==='completed'){
      if(hasUser)completed++;
      hasUser=false;
    }
  }
  return {sessionId,completedTurns:previous.completedTurns+completed,lastSeq:event.seq};
}
export function pendingConsolidation(progress) {
  return Boolean(progress&&(progress.completedTurns??0)-(progress.consolidatedTurns??0)>=12);
}

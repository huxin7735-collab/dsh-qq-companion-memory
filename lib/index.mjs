import z from '@deepseek-ai/schemastery';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {MemoryStore} from './store.mjs';
import {search,buildMemoryContext} from './retrieval.mjs';
import {resolveMemoryScope,readSource,latestUserText,sessionEvents,isQQUserMessage,isCompanionActivity,pendingConsolidation,completedProgress} from './session.mjs';

export const name='qq-companion-memory';
export const inject=['tools','systemPrompt'];
export const Config=z.object({
  ownerQQ:z.string().required(),workspacePath:z.string().required(),memoryRoot:z.string().required(),
  groupId:z.string().default(''),contextMaxChars:z.number().default(2400),
});
const publicRecord=record=>({id:record.id,kind:record.kind,content:record.content,source:record.source,updatedAt:record.updatedAt});
const output=()=>({schema:{type:'json'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]});

export async function apply(ctx,config) {
  if(!/^[1-9]\d{4,15}$/.test(config.ownerQQ))throw new Error('Invalid owner QQ');
  if(config.groupId&&!/^[1-9]\d{4,15}$/.test(config.groupId))throw new Error('Invalid group QQ');
  let store;
  const getStore=async()=>store??=await MemoryStore.open({root:config.memoryRoot,namespace:config.groupId?'group:'+config.groupId:'private:'+config.ownerQQ});
  try{await getStore();}catch{console.warn('[qq-companion-memory] storage unavailable; chat remains usable');}
  const disposers=[];let pending=Promise.resolve();
  const requireScope=agent=>{
    const scope=resolveMemoryScope(agent,config);
    if(!scope)throw new Error('记忆 scope 不属于当前独立 QQ 会话');
    return scope;
  };
  const register=tool=>disposers.push(ctx.tools.register(defineTool(tool)));
  register({name:'memory_search',description:'找回以往事项、共同经历或自己的笔记。query 可用话题或记忆 id，空字符串查看近期记录。',
    parameters:{query:{type:'string',required:true,description:'话题、记忆 id 或空字符串'},limit:{type:'number',description:'返回条数，最多 12'}},
    output:output(),isConcurrencySafe:()=>true,
    execute:async(args,exec)=>{
      requireScope(exec.agent);await pending;
      const found=search((await getStore()).snapshot().records,String(args.query??''),{limit:Math.min(12,Number(args.limit)||6)});
      const exact=found.find(record=>record.id===args.query);
      if(exact)return {records:[publicRecord(exact)]};
      let remaining=10000;
      const records=[];
      for(const record of found){
        const full=publicRecord(record),limit=1400;
        full.content=Array.from(full.content).slice(0,Math.min(limit,remaining)).join('');
        if(full.content!==record.content)full.content+='…（可用此记忆 id 单独读取）';
        const length=Array.from(JSON.stringify(full)).length;
        if(length>remaining)break;
        remaining-=length;records.push(full);
      }
      return {records};
    },
  });
  register({name:'memory_write',description:'保存、修改真实事项或自己的笔记；保存成功后才算记住。kind 可为 fact/episode/self/commitment/state。replaces 用于更正旧记忆。仅 consolidatedThrough 可确认已整理且没有新事项。',
    parameters:{kind:{type:'string',description:'fact 事项，episode 经历，self 自己的笔记，commitment 约定，state 近况'},
      content:{type:'string',description:'要留下的内容；自己决定值得留下什么'},id:{type:'string',description:'修改已有记忆时填写 id'},
      replaces:{type:'array',items:{type:'string'},description:'被新说法替代的旧记忆 id'},
      sourceSeq:{type:'number',description:'可选的真实来源消息序号；未填用当前对话'},
      consolidatedThrough:{type:'number',description:'可选，确认已整理到提示里的 seq'}},
    output:output(),isConcurrencySafe:()=>false,
    execute:async(args,exec)=>{
      const scope=requireScope(exec.agent);await pending;let record;
      const activeStore=await getStore();let checkpoint;
      if(args.consolidatedThrough!==undefined){
        const progress=activeStore.snapshot().progress[scope.sessionId];
        if(!progress||!Number.isSafeInteger(args.consolidatedThrough)||args.consolidatedThrough!==progress.lastSeq)throw new Error('整理位置不属于最新已完成的聊天范围');
        checkpoint={...progress,sessionId:scope.sessionId,consolidatedThrough:args.consolidatedThrough};
      }
      if(args.content!==undefined){
        const events=sessionEvents(exec.agent.session);
        const latest=events.findLast(event=>isQQUserMessage(event)||isCompanionActivity(event));
        const seq=args.sourceSeq??latest?.seq;
        if(seq===undefined)throw new Error('当前会话没有可关联的真实对话来源');
        const source=readSource(exec.agent.session,seq);
        if(['fact','commitment'].includes(args.kind)&&source.author!=='user')throw new Error('用户事实和约定需要关联用户原话');
        if(args.kind==='self')source.author='self';
        record=await activeStore.write({id:args.id,kind:args.kind,content:args.content,replaces:args.replaces,source,checkpoint});
      }else if(args.consolidatedThrough===undefined)throw new Error('需要记忆内容或已整理位置');
      if(checkpoint&&!record)await activeStore.markProgress(checkpoint);
      return {saved:true,...(record?{record:publicRecord(record)}:{consolidatedThrough:args.consolidatedThrough})};
    },
  });
  register({name:'memory_forget',description:'从长期记忆中遗忘指定记录及被它替代的旧说法，不会从旧事件自动记回。只影响记忆库。',
    parameters:{ids:{type:'array',items:{type:'string'},required:true,description:'需要遗忘的记忆 id'}},
    output:output(),isConcurrencySafe:()=>false,
    execute:async(args,exec)=>{requireScope(exec.agent);await pending;return (await getStore()).forget({ids:args.ids});},
  });
  disposers.push(ctx.systemPrompt.section({
    name:'qq-companion:memory',order:10160,interpolate:false,
    text(context){
      const scope=resolveMemoryScope(context?.agent,config);if(!scope)return '';
      let snapshot;
      try{if(!store)throw new Error('unavailable');snapshot=store.snapshot();}catch{return '长期记忆暂不可用，本轮不能确认已保存或已找回；正常继续聊天。';}
      const progress=snapshot.progress[scope.sessionId];
      const note=pendingConsolidation(progress)?`近期有一段对话还未整理（到 seq ${progress.lastSeq}）。如有值得留下的事情，可用 memory_write；整理完成可传 consolidatedThrough=${progress.lastSeq}。\n`:'';
      return note+buildMemoryContext(snapshot,{query:latestUserText(context.agent.session),maxChars:Math.max(0,(config.contextMaxChars??2400)-Array.from(note).length),maxRecords:12});
    },
  }));
  // Tool guide describes capabilities; it assigns no personality or speech style.
  disposers.push(ctx.systemPrompt.section({name:'qq-companion:memory-tools',order:95,
    text:'你有可跨会话保存的记忆与自己的笔记：memory_search 找回，memory_write 留下或修改，memory_forget 遗忘。想留下什么由你决定。用户明确说要记住或忘记时，以工具实际结果为准。',
  }));
  disposers.push(ctx.on('session/event',(session,event)=>{
    if(!resolveMemoryScope({session},config)||event.type!=='turn/end')return;
    pending=pending.then(async()=>{
      const activeStore=await getStore();
      const progress=completedProgress(session,event,activeStore.snapshot().progress);
      if(progress)await activeStore.markProgress(progress);
    }).catch(error=>console.warn('[qq-companion-memory] memory checkpoint failed: '+error.message));
  },{global:true}));
  return async()=>{await pending;for(const dispose of disposers.reverse())await dispose?.();};
}

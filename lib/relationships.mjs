import{sourceKey}from'./store.mjs';
export const RELATION_AXES=['affection','trust','familiarity','comfort'];
export function validateRelationship(change){
 if(!change||typeof change!=='object'||Array.isArray(change)||Object.keys(change).length===0||Object.keys(change).some(k=>![...RELATION_AXES,'summary','boundaries'].includes(k)))throw Error('关系变化需为支持的维度或相处笔记');
 for(const key of RELATION_AXES)if(change[key]!==undefined&&(!Number.isInteger(change[key])||Math.abs(change[key])>10))throw Error('每次关系变化只能为 -10 到 10 的整数增减，不是设定绝对分数');
 if(change.summary!==undefined&&(typeof change.summary!=='string'||!change.summary.trim()||Array.from(change.summary).length>240))throw Error('相处印象需为1–240字');
 if(change.boundaries!==undefined&&(!Array.isArray(change.boundaries)||change.boundaries.length>6||change.boundaries.some(v=>typeof v!=='string'||!v.trim()||Array.from(v).length>80)))throw Error('相处分寸最多6条，每条1–80字');
}
export function evolveRelationship(previous,change,{note,source,at}){
 validateRelationship(change);
 if(previous&&(previous.version!==1||RELATION_AXES.some(k=>!Number.isInteger(previous[k]))||!Array.isArray(previous.evidenceKeys)||!Array.isArray(previous.history)))throw Error('关系记录结构损坏，保留原数据');
 const key=sourceKey(source);
 if(previous?.evidenceKeys.includes(key))return {relationship:previous,applied:false};
 const next=previous?structuredClone(previous):{version:1,affection:0,trust:0,familiarity:0,comfort:0,summary:'',boundaries:[],history:[],evidenceKeys:[]};
 const applied={};
 for(const axis of RELATION_AXES){const before=next[axis];next[axis]=Math.max(axis==='familiarity'?0:-100,Math.min(100,before+(change[axis]??0)));applied[axis]=next[axis]-before;}
 if(change.summary!==undefined)next.summary=change.summary.trim();
 if(change.boundaries!==undefined)next.boundaries=change.boundaries.map(v=>v.trim());
 next.evidenceKeys=[...next.evidenceKeys,key].slice(-32);
 next.history=[...next.history,{at,delta:applied,reason:Array.from(note).slice(0,180).join(''),source}].slice(-8);
 next.updatedAt=at;
 return {relationship:next,applied:true};
}
export function relationshipSummary(value){return value?{affection:value.affection,trust:value.trust,familiarity:value.familiarity,comfort:value.comfort,impression:value.summary,boundaries:value.boundaries,lastChange:value.history.at(-1)?.reason}:{known:false};}

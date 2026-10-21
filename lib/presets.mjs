import{isAbsolute,resolve,join}from'node:path';import{fileURLToPath}from'node:url';
const qq=v=>typeof v==='string'&&/^[1-9]\d{4,15}$/.test(v);
export function buildPresets({ownerQQ,groupId='',workspaceRoot,privateEnabled=true,groupEnabled=true,chatOnly=false,activityPath=''}){
 if(!qq(ownerQQ))throw Error('ownerQQ 应为自己的 QQ 号');
 if(groupId&&!qq(groupId))throw Error('groupId 应为群号或留空');
 if(typeof workspaceRoot!=='string'||!isAbsolute(workspaceRoot))throw Error('workspaceRoot 需要绝对路径');
 const root=resolve(workspaceRoot),rows=[],modulePath=name=>fileURLToPath(new URL(name,import.meta.url));
 if(privateEnabled){const cwd=join(root,'private');rows.push({id:'qq-companion',name:'QQ 陪伴记忆',description:'独立的私聊长期记忆与自我笔记。',order:40,plugins:[{id:'qq-memory',name:modulePath('./index.mjs'),config:{ownerQQ,workspacePath:cwd,memoryRoot:join(cwd,'.memory')}}]});}
 if(groupEnabled&&groupId){const cwd=join(root,'group-'+groupId);rows.push({id:'qq-group-persona',name:'QQ 群友记忆',description:'独立的群友画像、关系与可修改的人格笔记。',order:41,plugins:[{id:'group-identity-memory',name:modulePath('./group.mjs'),config:{ownerQQ,groupId,workspacePath:cwd,memoryRoot:join(cwd,'.memory'),activityPath,toolPolicy:chatOnly?'chat-only':'inherit'}}]});}
 return rows;
}

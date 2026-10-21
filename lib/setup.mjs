import z from '@deepseek-ai/schemastery';import{buildPresets}from'./presets.mjs';
export const name='qq-companion-memory-setup';export const inject=['agentPresets'];
export const Config=z.object({
 enabled:z.boolean().default(false),
 ownerQQ:z.string().default(''),groupId:z.string().default(''),workspaceRoot:z.string().default(''),
 privateEnabled:z.boolean().default(true),groupEnabled:z.boolean().default(true),chatOnly:z.boolean().default(false),activityPath:z.string().default(''),
});
export async function apply(ctx,config){
 if(!config.enabled)return;
 const disposers=[];
 try{for(const preset of buildPresets(config))disposers.push(await ctx.agentPresets.register(preset));}
 catch(error){for(const dispose of disposers.reverse())await dispose();throw error;}
 return async()=>{for(const dispose of disposers.reverse())await dispose();};
}

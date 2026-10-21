import{test}from'node:test';import assert from'node:assert/strict';import{resolve,join}from'node:path';import{tmpdir}from'node:os';import{buildPresets}from'../lib/presets.mjs';
const root=resolve(tmpdir(),'portable-qq-example');
test('portable presets use the configured accounts and independent paths without unrelated plugins',()=>{
 const rows=buildPresets({ownerQQ:'10000001',groupId:'20000001',workspaceRoot:root});assert.equal(rows.length,2);
 const privateMemory=rows[0].plugins.find(p=>p.id==='qq-memory'),groupMemory=rows[1].plugins.find(p=>p.id==='group-identity-memory');
 assert.equal(privateMemory.config.workspacePath,join(root,'private'));assert.equal(groupMemory.config.workspacePath,join(root,'group-20000001'));
 assert.equal(groupMemory.config.groupId,'20000001');assert.equal(groupMemory.config.toolPolicy,'inherit');assert.equal(rows.some(r=>r.plugins.some(p=>p.name.includes('bili'))),false);
});
test('group is optional and invalid accounts/relative roots are rejected',()=>{
 assert.equal(buildPresets({ownerQQ:'10000001',workspaceRoot:root}).length,1);
 for(const options of [{ownerQQ:'bad',workspaceRoot:root},{ownerQQ:'10000001',groupId:'../escape',workspaceRoot:root},{ownerQQ:'10000001',workspaceRoot:'relative'}])assert.throws(()=>buildPresets(options));
});

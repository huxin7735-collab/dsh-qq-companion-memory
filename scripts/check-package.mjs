import{readdir,readFile}from'node:fs/promises';import{fileURLToPath}from'node:url';import{join,relative}from'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),issues=[];
const forbiddenText=[/[A-Za-z]:[\\/]Users[\\/](?!Public(?:[\\/]|$))/i,/gh[pousr]_[A-Za-z0-9]{20,}/,/github_pat_[A-Za-z0-9_]{20,}/];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
 const file=join(dir,entry.name),name=relative(root,file).replaceAll('\\','/');
 if(entry.name==='.git'||entry.name==='node_modules')continue;
 if(entry.isSymbolicLink()){issues.push('symlink: '+name);continue;}
 if(entry.isDirectory()){if(['.memory','.life','sessions','qq-browser-profile'].includes(entry.name))issues.push('private directory: '+name);else await walk(file);continue;}
 if(/\.(?:zip|tgz|log|jsonl)$/.test(entry.name)||/^\.env(?:\.|$)/.test(entry.name)){issues.push('unexpected data file: '+name);continue;}
 const text=await readFile(file,'utf8');if(forbiddenText.some(re=>re.test(text)))issues.push('local identifier or secret: '+name);
 }}
await walk(root);if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}else console.log('Package check passed: no runtime data, symbolic links, user-profile paths or known token formats.');

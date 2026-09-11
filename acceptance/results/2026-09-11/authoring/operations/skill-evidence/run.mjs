import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='/tmp/repo-standards-author-aj4hqi/skill-evidence';
const cwd=base+'/fixture';
const before=Object.fromEntries(fs.readdirSync(cwd).map(n=>[n,{bytes:fs.readFileSync(cwd+'/'+n).toString('base64'),mode:fs.statSync(cwd+'/'+n).mode}]));
const records=[];
for(const args of [['--version'],['add.mjs','2','3']]) {
 const p=spawnSync('node',args,{cwd,encoding:'utf8',timeout:10000,maxBuffer:1024*1024,shell:false});
 records.push({vector:['node',...args],cwd,timeoutSeconds:10,maxBytesPerStream:1048576,exitCode:p.status,signal:p.signal,error:p.error?{code:p.error.code,message:p.error.message}:null,stdout:p.stdout,stderr:p.stderr});
 assert.equal(p.status,0);assert.equal(p.error,undefined);
 if(args[0]==='--version') assert.match(p.stdout,/^v24\./);
}
assert.equal(records[1].stdout,'23\n');
const after=Object.fromEntries(fs.readdirSync(cwd).map(n=>[n,{bytes:fs.readFileSync(cwd+'/'+n).toString('base64'),mode:fs.statSync(cwd+'/'+n).mode}]));
assert.deepEqual(after,before);
const evidence={exerciseAgent:'author_journey (same agent applying the generated ordinary-work skill)',platform:process.platform,arch:process.arch,records,before,after,fixtureUnchanged:true};
fs.writeFileSync(base+'/execution.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));

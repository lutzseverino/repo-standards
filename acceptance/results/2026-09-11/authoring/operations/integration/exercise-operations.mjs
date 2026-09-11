import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const base = '/tmp/repo-standards-author-T7NZmR';
const source = path.join(base, 'workspace/node-cli-standards');
const evidence = path.join(base, 'operation-evidence');
const semver = createRequire('/tmp/repo-standards-author-aj4hqi/cli/package.json')('semver');
fs.mkdirSync(evidence, {recursive:true});
const validation = JSON.parse(fs.readFileSync(path.join(base,'validation-current.json')));
assert.equal(validation.valid, true);
const declarations = validation.profiles['node-cli'].declarations;
const owner = declarations.find(d => d.id === 'support-file');
const operations = Object.entries({checks: owner.checks, fixes: owner.fixes})
  .flatMap(([phase, ops]) => ops.map(op => ({phase, ...op})));
for (const op of operations) {
  const retained = path.join(evidence, 'retained', op.id);
  op.retained = retained;
  for (const rel of [op.run.script, ...op.run.resources]) {
    fs.mkdirSync(path.dirname(path.join(retained,rel)),{recursive:true});
    fs.copyFileSync(path.join(source,rel),path.join(retained,rel));
  }
}
const check = operations.find(o => o.phase === 'checks');
const fix = operations.find(o => o.phase === 'fixes');
function inventory(root) {
  const entries = {};
  function walk(rel) {
    const p = path.join(root,rel), s=fs.lstatSync(p);
    entries[rel] = {mode:s.mode & 0o7777,type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':'file'};
    if(s.isSymbolicLink()) entries[rel].link=fs.readlinkSync(p);
    else if(s.isDirectory()) for(const name of fs.readdirSync(p).sort()) walk(path.join(rel,name));
    else entries[rel].bytes=fs.readFileSync(p).toString('base64');
  }
  walk('');return entries;
}
function fixture(name, content) {
  const root=path.join(evidence,'fixtures',name);
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(root,'sentinel.txt'),'Unrelated content stays exactly the same.\n');
  fs.mkdirSync(path.join(root,'.agents/skills/local'),{recursive:true});
  fs.writeFileSync(path.join(root,'.agents/skills/local/SKILL.md'),'Unrelated local skill\n',{mode:0o755});
  if(content !== undefined) {
    fs.mkdirSync(path.join(root,'docs'));
    fs.writeFileSync(path.join(root,'docs/support.json'),content,{mode:0o640});
  }
  return root;
}
const records=[];
function processRecord(p) {
  return {exitCode:p.status,signal:p.signal,error:p.error?{code:p.error.code,message:p.error.message}:null,
    stdout:p.stdout??'',stderr:p.stderr??''};
}
function probe(op,root,env=process.env) {
  const vector=[op.run.executable,...op.prerequisite['version-arguments']];
  const p=spawnSync(vector[0],vector.slice(1),{cwd:root,env,encoding:'utf8',timeout:op['timeout-seconds']*1000,maxBuffer:1024*1024,shell:false});
  const observed=[p.stdout,p.stderr].filter(s=>typeof s === 'string').map(s=>s.match(/\bv?(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)\b/)?.[1]).find(Boolean);
  const compatible=p.status===0 && !p.error && !!observed && semver.satisfies(observed,op.prerequisite.version);
  return {vector,cwd:root,range:op.prerequisite.version,observed:observed??null,compatible,process:processRecord(p)};
}
function run(name,op,root,expected,overrides={}) {
  const before=inventory(root);
  const prerequisite=probe(op,root);
  assert.equal(prerequisite.compatible,true);
  const request={format:'repo-standards/operation/v1',operation:{declaration:owner.id,phase:op.phase,id:op.id},
    projectRoot:root,standards:{repository:'https://github.com/synthetic-fixture/node-cli-standards',version:'v0.0.0',commit:'0'.repeat(40)},
    profile:'node-cli',declarations,allowedTargets:{paths:[owner.target],directories:[]},...overrides};
  const vector=[op.run.executable,path.join(op.retained,op.run.script),...op.run.arguments];
  const p=spawnSync(vector[0],vector.slice(1),{cwd:root,input:JSON.stringify(request),encoding:'utf8',timeout:op['timeout-seconds']*1000,maxBuffer:1024*1024,shell:false});
  const result=JSON.parse(p.stdout),after=inventory(root);
  assert.equal(p.status,0);assert.equal(p.error,undefined);assert.equal(p.signal,null);
  assert.deepEqual(Object.keys(result).sort(),['format','message','status']);
  assert.equal(result.format,'repo-standards/result/v1');assert.equal(typeof result.message,'string');
  assert.ok((op.phase==='checks'?['passed','failed','blocked']:['changed','unchanged','blocked']).includes(result.status));
  assert.equal(result.status,expected);
  const changes=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));
  if(op.phase==='checks'||expected!=='changed') assert.deepEqual(after,before);
  else {
    assert.ok(changes.every(k=>k==='docs'||k==='docs/support.json'));
    assert.equal(fs.readFileSync(path.join(root,owner.target)).compare(fs.readFileSync(path.join(source,fix.run.resources[0]))),0);
  }
  const record={name,prerequisite,vector,cwd:root,request,process:processRecord(p),result,before,after,changes,assertionsPassed:true};
  fs.writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(record,null,2)+'\n');records.push(record);
}
const absent=fixture('absent');
run('01-missing-check',check,absent,'failed');run('02-create',fix,absent,'changed');
run('03-repeat-fix',fix,absent,'unchanged');run('04-repaired-check',check,absent,'passed');
const configured=fixture('configured','{ "status": "configured", "reportProblems": "Email project maintainer", "custom": [1, 2] }\r\n');
run('05-configured-preserved',fix,configured,'unchanged');run('06-configured-check',check,configured,'passed');
const malformed=fixture('malformed','{ not json! destination: preserve-me\r\n');
run('07-malformed-check',check,malformed,'failed');run('08-malformed-preserved',fix,malformed,'unchanged');
const partial=fixture('partial','{"status":');
run('09-partial-retry',fix,partial,'unchanged');run('10-partial-check',check,partial,'failed');
const existingDocs=fixture('existing-docs');fs.mkdirSync(path.join(existingDocs,'docs'));
run('11-directory-only-retry',fix,existingDocs,'changed');run('12-directory-only-check',check,existingDocs,'passed');
const badShape=fixture('bad-shape','{"status":"configured","reportProblems":"  "}\n');
run('13-invalid-shape',check,badShape,'failed');
const wrongType=fixture('target-directory');fs.mkdirSync(path.join(wrongType,'docs/support.json'),{recursive:true});
run('14-directory-check',check,wrongType,'blocked');run('15-directory-fix',fix,wrongType,'blocked');
const docsFile=fixture('docs-file');fs.writeFileSync(path.join(docsFile,'docs'),'preserve');
run('16-docs-file-check',check,docsFile,'blocked');run('17-docs-file-fix',fix,docsFile,'blocked');
const outside=path.join(evidence,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'support.json'),'outside sentinel');
const outsideBefore=inventory(outside),linkedDocs=fixture('docs-symlink');fs.symlinkSync(outside,path.join(linkedDocs,'docs'));
run('18-docs-symlink-check',check,linkedDocs,'blocked');run('19-docs-symlink-fix',fix,linkedDocs,'blocked');
const linkedFile=fixture('file-symlink');fs.mkdirSync(path.join(linkedFile,'docs'));fs.symlinkSync(path.join(outside,'support.json'),path.join(linkedFile,'docs/support.json'));
run('20-file-symlink-check',check,linkedFile,'blocked');run('21-file-symlink-fix',fix,linkedFile,'blocked');assert.deepEqual(inventory(outside),outsideBefore);
run('22-scope-check',check,configured,'blocked',{allowedTargets:{paths:['other.json'],directories:[]}});
run('23-scope-fix',fix,configured,'blocked',{allowedTargets:{paths:['other.json'],directories:[]}});
run('24-reordered-scope-check',check,configured,'passed',{allowedTargets:{directories:[],paths:['docs/support.json']}});
run('25-reordered-scope-fix',fix,configured,'unchanged',{allowedTargets:{directories:[],paths:['docs/support.json']}});
const emptyPath=path.join(evidence,'empty-path');fs.mkdirSync(emptyPath);
const missingRoot=fixture('missing-node'),missingBefore=inventory(missingRoot);
const missingNode=operations.map(op=>({operation:op.id,...probe(op,missingRoot,{...process.env,PATH:emptyPath}),operationInvoked:false}));
for(const record of missingNode) {assert.equal(record.compatible,false);assert.equal(record.process.error.code,'ENOENT');}
assert.deepEqual(inventory(missingRoot),missingBefore);
fs.writeFileSync(path.join(evidence,'controlled-missing-node.json'),JSON.stringify({synthetic:true,PATH:emptyPath,records:missingNode,before:missingBefore,after:inventory(missingRoot)},null,2)+'\n');
const summary={sourceValidation:'validation-current.json',profile:'node-cli',operationRuns:records.length,
  availableNodeVersions:[...new Set(records.map(r=>r.prerequisite.observed))],
  results:records.map(r=>({name:r.name,exitCode:r.process.exitCode,status:r.result.status,changes:r.changes})),
  controlledMissingNode:missingNode.map(r=>({operation:r.operation,error:r.process.error.code,operationInvoked:r.operationInvoked})),
  limits:['Direct protocol exercise, not adoption lifecycle or CLI orchestration.','Linux only; permission-denied filesystem branch not exercised.','No concurrent hostile filesystem mutation or process-kill injection.','Partial retry exercised through directory-only and partial-file states.','No excluded declaration in the accepted single profile.']};
fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));

import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{minifySync}from'vite';
const source=readFileSync('site/test/docs.test.ts','utf8');
const body=source.slice(source.indexOf('  const html = read("index.html")'),source.indexOf('\n  assert.equal(\n    createHash("sha256").update(html)',source.indexOf('  const html = read("index.html")'))).replace('const html =','return').replace('code: string','code');
const normalize=new Function('read','ASTRO_RUNTIME','minifySync',body);
const hash=html=>createHash('sha256').update(normalize(()=>html,/astro:load|["`]astro-island["`]/,minifySync)).digest('hex');
const base=readFileSync('site/node_modules/.issue-469-base/index.html','utf8'),head=readFileSync('site/node_modules/.issue-469-head/index.html','utf8');
const rest=html=>[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const rig = ('))[0];
const report={base:hash(base),head:hash(head),headWithBaseRestScript:hash(head.replace(rest(head),rest(base)))};
assert.equal(report.base,'996723f1023796161ec4d844e2525f71ea8a2d3f1e6877c2d537495812484338');assert.equal(report.headWithBaseRestScript,report.base);console.log(report);writeFileSync('/tmp/469-evidence/html-baseline.json',JSON.stringify(report,null,2));

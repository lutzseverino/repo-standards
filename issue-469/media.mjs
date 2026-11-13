import assert from'node:assert/strict';import{writeFileSync}from'node:fs';import{preview}from'astro';import{Browser}from'../test/browser.ts';import{BrowserFixture}from'../test/fixture.ts';
const fixture=new BrowserFixture();const records=[];
try{
 const server=await preview({root:'/home/agent/workspace/site',outDir:'/home/agent/workspace/site/node_modules/.issue-469-head',logLevel:'error',server:{host:'127.0.0.1',port:0}});fixture.defer('media preview',()=>server.stop());
 const browser=await Browser.launch(process.env.SITE_BROWSER,fixture);
 for(const theme of['light','dark'])for(const mode of['touch-first','reduced-motion','contrast']){
 const tab=await browser.open('about:blank',{width:390,theme},{'story-seen':'1'});
 await tab.send('Emulation.setTouchEmulationEnabled',{enabled:mode==='touch-first'});
 await tab.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:mode==='reduced-motion'?'reduce':'no-preference'},{name:'prefers-contrast',value:mode==='contrast'?'more':'no-preference'}]});
 await tab.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.writes=[];const set=CSSStyleDeclaration.prototype.setProperty;CSSStyleDeclaration.prototype.setProperty=function(n,v,p){if([...document.querySelectorAll('.sign-tube')].some(el=>el.style===this)&&/^--(lx|ly|brx|bry|hrx|hry|hx|hy|gain)$/.test(n))window.writes.push(n);return set.call(this,n,v,p)}`});
 await tab.goto(`http://127.0.0.1:${server.port}/`);
 const result=await tab.evaluate(()=>({names:[...new Set(window.writes)].sort(),touch:matchMedia('(hover: none) and (pointer: coarse)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,contrast:matchMedia('(prefers-contrast: more)').matches}));
 assert.deepEqual(result.names,theme==='dark'?['--brx','--bry','--gain','--lx','--ly']:[]);assert.equal(result.touch,mode==='touch-first');assert.equal(result.reduced,mode==='reduced-motion');assert.equal(result.contrast,mode==='contrast');records.push({theme,mode,...result});await tab.close();
 }
 writeFileSync('/tmp/469-evidence/media.json',JSON.stringify(records,null,2));console.log('All six theme/media combinations passed');
}finally{await fixture.close()}

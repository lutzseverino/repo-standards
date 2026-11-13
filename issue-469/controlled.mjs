import assert from'node:assert/strict';import{preview}from'astro';import{Browser}from'../test/browser.ts';import{BrowserFixture}from'../test/fixture.ts';
const fixture=new BrowserFixture();
try{
const browser=await Browser.launch(process.env.SITE_BROWSER,fixture);
for(const label of['base','head']){
 const server=await preview({root:'/home/agent/workspace/site',outDir:`/home/agent/workspace/site/node_modules/.issue-469-${label}`,logLevel:'error',server:{host:'127.0.0.1',port:0}});fixture.defer(label,()=>server.stop());
 for(const theme of['light','dark']){
 const tab=await browser.open(`http://127.0.0.1:${server.port}/`,{width:1440,theme},{'story-seen':'1'});
 await tab.send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await tab.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await tab.settle();
 const factory=await tab.evaluate(()=>{
 const page=document.querySelector('.sign-page');page.replaceWith(page.cloneNode(true));
 return [...document.scripts].find(s=>s.textContent?.includes('const rig = (')).textContent.match(/const rig = (\([\s\S]*?\)\(\));/)[1];
 });
 for(const phase of['rest','pointer']){
 const result=await tab.send('Runtime.evaluate',{expression:`(()=>{const rig=${factory};const assembly=document.querySelector('.sign-assembly');if('${phase}'==='rest')rig.rest();else{rig.tilt(assembly,{x:1.25,y:2.5});rig.measure();rig.apply({x:820,y:400,r:${theme==='dark'?760:460}});}for(const a of document.getAnimations()){a.pause();a.currentTime=0;}})()`});assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));
 await tab.screenshot(`/tmp/469-evidence/controlled-${label}-1440-${theme}-${phase}.png`);
 }
 await tab.close();
 }
}
}finally{await fixture.close()}

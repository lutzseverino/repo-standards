import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { preview } from '/home/agent/workspace/site/node_modules/astro/dist/index.js';
import { Browser,Tab } from '/home/agent/workspace/site/test/browser.ts';
import { BrowserFixture } from '/home/agent/workspace/site/test/fixture.ts';
const fixture=new BrowserFixture();const records=[];
try{
 const server=await preview({root:'/home/agent/workspace/site',logLevel:'error',server:{host:'127.0.0.1',port:0}});fixture.defer('preview',()=>server.stop());
 const browser=await Browser.launch(process.env.SITE_BROWSER!,fixture);
 for(const theme of ['light','dark'] as const){
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true});
  const tab=new Tab(browser,targetId as string,sessionId as string);
  await tab.send('Page.enable');await tab.send('Runtime.enable');await tab.resize(1440);
  await tab.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('theme',${JSON.stringify(theme)});localStorage.setItem('story-seen','1')`});
  await tab.send('Network.enable');await tab.send('Network.setBlockedURLs',{urls:['*/_astro/*.js']});
  const loaded=browser.event('Page.loadEventFired',sessionId as string);
  await tab.send('Page.navigate',{url:`http://127.0.0.1:${server.port}/`});await loaded.next;
  const snapshot=()=>tab.evaluate(async()=>{
   await document.fonts.ready;for(let i=0;i<2;i++)await new Promise(requestAnimationFrame);
   const a=document.querySelector<HTMLElement>('.sign-assembly')!;
   return {unhydrated:document.querySelectorAll('astro-island[ssr]').length,torch:document.documentElement.hasAttribute('data-torch'),pose:[a.style.getPropertyValue('--tilt-x'),a.style.getPropertyValue('--tilt-y')],faces:[...a.querySelectorAll<HTMLElement>('.sign-clamp-lugs > i')].map(f=>[f.style.transform,f.style.visibility])};
  });
  const before=await snapshot();assert.ok(before.unhydrated>0);assert.equal(before.torch,false);assert.equal(before.faces.length,60);assert.ok(before.faces.every(f=>f[0].startsWith('matrix(')));
  await tab.send('Network.setBlockedURLs',{urls:[]});
  await tab.goto(`http://127.0.0.1:${server.port}/`);
  const after=await snapshot();assert.equal(after.unhydrated,0);assert.equal(after.torch,true);assert.deepEqual(after.faces,before.faces);assert.deepEqual(after.pose,before.pose);
  records.push({theme,passed:true,before,after});await tab.close();
 }
 writeFileSync('/tmp/468-evidence/firstpaint.json',JSON.stringify(records,null,2));console.log('Both themes: pre-paint script draws 60 faces; hydration preserves every transform, visibility and pose');
}finally{await fixture.close();}

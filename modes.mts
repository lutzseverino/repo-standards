import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { preview } from '/home/agent/workspace/site/node_modules/astro/dist/index.js';
import { Browser } from '/home/agent/workspace/site/test/browser.ts';
import { BrowserFixture } from '/home/agent/workspace/site/test/fixture.ts';
const fixture=new BrowserFixture();const outcomes=[];
try {
 const server=await preview({root:'/home/agent/workspace/site',logLevel:'error',server:{host:'127.0.0.1',port:0}});
 fixture.defer('preview',()=>server.stop());const url=`http://127.0.0.1:${server.port}/`;
 const browser=await Browser.launch(process.env.SITE_BROWSER!,fixture);
 for(const theme of ['light','dark'] as const) for(const mode of ['reduced','contrast','touch'] as const){
  const width=mode==='touch'?390:1440;
  const tab=await browser.open('about:blank',{width,theme},{'story-seen':'1'});
  await tab.send('Emulation.setTouchEmulationEnabled',{enabled:mode==='touch',maxTouchPoints:5});
  await tab.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:mode==='reduced'?'reduce':'no-preference'},{name:'prefers-contrast',value:mode==='contrast'?'more':'no-preference'}]});
  await tab.goto(url);
  const snapshot=()=>tab.evaluate(()=>{
   const assembly=document.querySelector<HTMLElement>('.sign-assembly')!;
   const layer=document.querySelector<HTMLElement>('[data-light-layer]')!;
   return {x:assembly.style.getPropertyValue('--tilt-x'),y:assembly.style.getPropertyValue('--tilt-y'),lx:parseFloat(layer.style.getPropertyValue('--disc-x')),ly:parseFloat(layer.style.getPropertyValue('--disc-y')),radius:parseFloat(layer.style.getPropertyValue('--disc-r')),k:Number(layer.dataset.lightLayer),touch:matchMedia('(hover: none) and (pointer: coarse)').matches,w:innerWidth,h:document.documentElement.clientHeight};
  });
  const before=await snapshot();
  if(mode==='touch'){
   assert.equal(before.touch,true);
   assert.equal(before.lx,theme==='dark'?195:75);assert.equal(before.ly,theme==='dark'?351:310);
   if(theme==='dark')assert.ok(Math.abs(before.radius-390*1.2*before.k/2)<2);
   await tab.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:200}]});
   await tab.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:145,y:215}]});
   await tab.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await new Promise(r=>setTimeout(r,2000));
   const after=await snapshot();assert.equal(after.x,before.x);assert.equal(after.y,before.y);assert.equal(after.lx,before.lx);assert.equal(after.ly,before.ly);
   await tab.evaluate(()=>scrollTo(0,100));await tab.settle();
   const scroll=await snapshot();assert.equal(scroll.lx,before.lx);assert.equal(scroll.ly,before.ly);
  } else {
   await tab.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:400,y:300});
   await new Promise(r=>setTimeout(r,3500));
   const after=await snapshot();
   if(mode==='reduced'){assert.equal(after.x,'0.00deg');assert.equal(after.y,'0.00deg');}
   else assert.ok(after.radius>Math.hypot(after.w,after.h)*1.6*after.k/2-2,'contrast keeps flood radius');
  }
  outcomes.push({theme,mode,passed:true,before});await tab.close();
 }
 writeFileSync('/tmp/468-evidence/modes.json',JSON.stringify(outcomes,null,2));console.log(outcomes);
}finally{await fixture.close();}

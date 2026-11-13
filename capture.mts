import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { preview, dev } from '/home/agent/workspace/site/node_modules/astro/dist/index.js';
import { Browser } from '/home/agent/workspace/site/test/browser.ts';
import { BrowserFixture } from '/home/agent/workspace/site/test/fixture.ts';

const out='/tmp/468-evidence';
mkdirSync(out,{recursive:true});
process.env.SITE_SEARCH_RECORDING='/home/agent/workspace/site/fixtures/search';
const fixture=new BrowserFixture();
const records=[];
try {
 const browser=await Browser.launch(process.env.SITE_BROWSER!,fixture);
 for(const [label,root,dist] of [
  ['before','/tmp/468-before/site','/tmp/468-baseline-dist'],
  ['after','/home/agent/workspace/site','/home/agent/workspace/site/dist']
 ]) {
  const mode=process.env.NODE_ENV;
  const prod=await preview({root,outDir:dist,logLevel:'error',server:{host:'127.0.0.1',port:0}});
  fixture.defer(label+' prod',()=>prod.stop());
  if(mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=mode;
  const local=await dev({root,logLevel:'error',server:{host:'127.0.0.1',port:0},devToolbar:{enabled:false}});
  fixture.defer(label+' dev',()=>local.stop());
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true});
  await browser.send('Runtime.enable',{},sessionId);
  const connected=(async()=>{for(;;){const {args}=await browser.event('Runtime.consoleAPICalled',sessionId).next;if(args[0]?.value==='[vite] connected.')return;}})();
  await Promise.all([connected,browser.send('Page.navigate',{url:`http://127.0.0.1:${local.address.port}/en-xa/`},sessionId)]);
  await browser.send('Target.closeTarget',{targetId});

  for(const [route,base] of [['/',`http://127.0.0.1:${prod.port}`],['/en-xa/',`http://127.0.0.1:${local.address.port}`]]) {
   for(const theme of ['light','dark'] as const) for(const width of [320,360,390,1440]) {
    if(route!=='/' && width===1440) continue;
    const tab=await browser.open('about:blank',{width,theme},{'story-seen':'1'});
    await tab.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.signErrors=[]; for(const kind of ['error','warn']) { const original=console[kind]; console[kind]=(...args)=>{signErrors.push(kind+': '+args.join(' '));original.apply(console,args)}; } addEventListener('error',e=>signErrors.push(e.message));addEventListener('unhandledrejection',e=>signErrors.push(String(e.reason)));`});
    await tab.send('Emulation.setTouchEmulationEnabled',{enabled:width!==1440,maxTouchPoints:5});
    await tab.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:2,mobile:width!==1440});
    await tab.goto(base+route);
    const stem=`${label}-${route==='/'?'en':'pseudo'}-${width}-${theme}`;
    assert.equal(await tab.evaluate(()=>document.querySelectorAll('.sign-assembly').length),1,stem+' homepage present');
    await tab.evaluate(()=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=0}));
    await tab.screenshot(out+'/'+stem+'-rest.png');
    const state=await tab.evaluate(()=>({errors:(window as any).signErrors,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,faces:[...document.querySelectorAll<HTMLElement>('.sign-clamp-lugs > i')].map(el=>[el.style.transform,el.style.visibility])}));
    assert.deepEqual(state.errors,[],stem+' no hydration warnings/errors');
    assert.equal(state.width,state.scrollWidth,stem+' no horizontal overflow');
    records.push({stem,...state});
    if(width===1440) for(const [x,y] of [[400,300],[1050,400]]) {
      for(let i=0;i<10;i++) await tab.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+i,y});
      await new Promise(r=>setTimeout(r,5000));
      await tab.screenshot(`${out}/${stem}-pointer-${x}-${y}.png`);
      records.push({stem:stem+'-pointer-'+x+'-'+y,...await tab.evaluate(()=>({faces:[...document.querySelectorAll<HTMLElement>('.sign-clamp-lugs > i')].map(el=>[el.style.transform,el.style.visibility]),errors:(window as any).signErrors}))});
    }
    await tab.close();
   }
  }
  await prod.stop();await local.stop();
 }
 writeFileSync(out+'/appearance.json',JSON.stringify(records,null,2));
 console.log('Captured '+records.length+' states; no hydration warnings/errors or horizontal overflow');
} finally { await fixture.close(); }

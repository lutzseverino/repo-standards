import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Browser, Tab } from '/home/agent/workspace/site/test/browser.ts';
import { BrowserFixture } from '/home/agent/workspace/site/test/fixture.ts';
import sharp from '/home/agent/workspace/site/node_modules/sharp/lib/index.js';

const output='/tmp/470-visual';mkdirSync(output,{recursive:true});
const fixture=new BrowserFixture();
const servers: Record<string, string>={};
const results: unknown[]=[];
try {
  for(const [label,root] of Object.entries({base:'/tmp/470-base-dist',head:'/home/agent/workspace/site/node_modules/.470-head-dist'})){
    const server=createServer(async(req,res)=>{
      let file=path.join(root,decodeURIComponent(new URL(req.url!, 'http://local').pathname));
      try {
        if((await stat(file)).isDirectory())file=path.join(file,'index.html');
        const mime: Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.json':'application/json'};
        res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');
        res.end(await readFile(file));
      }catch{res.writeHead(404);res.end();}
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    fixture.defer(label+' server stop',()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
    servers[label]=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  }
  const browser=await Browser.launch('/tmp/470-chrome',fixture);
  for(const width of [320,1280]) for(const theme of ['light','dark']) for(const stage of ['prepaint','hydrated']) {
    const snapshots: Record<string, unknown>={};
    for(const label of ['base','head']) {
      const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'}) as {targetId:string};
      const {sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true}) as {sessionId:string};
      const tab=new Tab(browser,targetId,sessionId);
      await tab.send('Page.enable');await tab.send('Runtime.enable');await tab.send('Network.enable');
      await tab.resize(width);
      await tab.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
      await tab.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('theme',${JSON.stringify(theme)});localStorage.setItem('story-seen','1');window.__errors=[];addEventListener('error',e=>{if(e.message)window.__errors.push(e.message)});addEventListener('unhandledrejection',e=>window.__errors.push(String(e.reason)));const original=console.error;console.error=(...args)=>{window.__errors.push(args.map(String).join(' '));original(...args)};`});
      if(stage==='prepaint') await tab.send('Network.setBlockedURLs',{urls:['*/_astro/*.js']});
      const loaded=browser.event('Page.loadEventFired',sessionId);
      await tab.send('Page.navigate',{url:servers[label]+'/'});await loaded.next;
      if(stage==='hydrated')await tab.settle();
      await tab.evaluate(async()=>{await document.fonts.ready;for(let i=0;i<2;i++)await new Promise(requestAnimationFrame);});
      const snapshot=await tab.evaluate(()=>({
        theme:document.documentElement.dataset.theme,
        errors:(window as unknown as {__errors:string[]}).__errors,
        unhydrated:document.querySelectorAll('astro-island[ssr]').length,
        styles:[document.documentElement,...document.querySelectorAll('.sign-assembly,.sign-tube,.sign-clamp,.sign-clamp-face,.signpost-name,.sign-lit-copy,.rainbow,.sign-lit-glint,.sign-lit-streak,[data-light-layer]')].map(el=>({class:el.className,style:el.getAttribute('style')})),
      }));
      assert.deepEqual(snapshot.errors,[],`${label} ${stage} ${width} ${theme}`);
      if(stage==='prepaint')assert.ok(snapshot.unhydrated>0);else assert.equal(snapshot.unhydrated,0);
      snapshots[label]=snapshot;
      await tab.screenshot(`${output}/${label}-${stage}-${width}-${theme}.png`);
      await tab.close();
    }
    // Rest placement and lighting must match exactly before hydration.
    if(stage==='prepaint')assert.deepEqual(snapshots.head,snapshots.base,`${width} ${theme} rest state`);
    const left=await sharp(`${output}/base-${stage}-${width}-${theme}.png`).raw().toBuffer();
    const right=await sharp(`${output}/head-${stage}-${width}-${theme}.png`).raw().toBuffer();
    let changed=0;for(let i=0;i<left.length;i++)if(left[i]!==right[i])changed++;
    results.push({width,theme,stage,changedChannels:changed,totalChannels:left.length,snapshots});
    console.log(width,theme,stage,changed,'changed channels of',left.length);
    if(stage==='prepaint') assert.equal(changed,0,`${width} ${theme} first-paint pixels`);
  }
} finally {writeFileSync(output+'/results.json',JSON.stringify(results,null,2));await fixture.close();}

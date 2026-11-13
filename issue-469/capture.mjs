import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {preview} from 'astro';
import {Browser} from '../test/browser.ts';
import {BrowserFixture} from '../test/fixture.ts';
const site = '/home/agent/workspace/site';
const out = '/tmp/469-evidence';
mkdirSync(out,{recursive:true});
const fixture = new BrowserFixture();
const records = [];
try {
  const browser = await Browser.launch(process.env.SITE_BROWSER ,fixture);
  for (const label of ['base','head']) {
    const server = await preview({root:site,outDir:`${site}/node_modules/.issue-469-${label}`,logLevel:'error',server:{host:'127.0.0.1',port:0}});
    fixture.defer(`${label} server`,()=>server.stop());
    for (const width of [1440,320]) for (const theme of ['light','dark']         ) {
      const tab = await browser.open('about:blank',{width,theme},{'story-seen':'1'});
      await tab.send('Emulation.setTouchEmulationEnabled',{enabled:width===320});
      await tab.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===320});
      await tab.goto(`http://127.0.0.1:${server.port}/`);
      await tab.evaluate(async()=>{await new Promise(r=>setTimeout(r,1500));});
      await tab.evaluate(()=>{ for(const animation of document.getAnimations()) { animation.pause(); animation.currentTime=0; } });
      await tab.screenshot(`${out}/${label}-${width}-${theme}-rest.png`);
      if(width===1440){
        for (const [x,y] of [[700,320],[620,260],[820,400]]) {
          await tab.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
          await tab.evaluate(async()=>{await new Promise(r=>setTimeout(r,1200));});
        }
        await tab.evaluate(async()=>{await new Promise(r=>setTimeout(r,3000));});
        await tab.evaluate(()=>{ for(const animation of document.getAnimations()) { animation.pause(); animation.currentTime=0; } });
      await tab.screenshot(`${out}/${label}-${width}-${theme}-pointer.png`);
        const factory = await tab.evaluate(()=>{
          const assembly=document.querySelector('.sign-assembly') ;
          assembly.replaceWith(assembly.cloneNode(true));
          const script=[...document.scripts].find(s=>s.textContent?.includes('const rig = ('));
          return script .textContent .match(/const rig = (\([\s\S]*?\)\(\));/) [1];
        });
        const result=await tab.send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
          const rig=${factory}; rig.measure();
          const posts=[...document.querySelectorAll('.sign-tube')];
          const writes=posts.map(()=>[]);
          const plateWrites=[];
          const set=CSSStyleDeclaration.prototype.setProperty;
          CSSStyleDeclaration.prototype.setProperty=function(name,value,priority){
            const i=posts.findIndex(p=>p.style===this);
            if(i>=0)writes[i].push([name,value]);
            const p=[...document.querySelectorAll('.sign-lit-copy')].findIndex(p=>p.style===this);
            if(p>=0)plateWrites.push([p,name,value]);
            return set.call(this,name,value,priority);
          };
          rig.apply({x:720,y:300,r:760});
          CSSStyleDeclaration.prototype.setProperty=set;
          return {writes,plateWrites:plateWrites.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
        })()`});
        assert.equal(result.exceptionDetails,undefined,JSON.stringify(result.exceptionDetails));
        records.push({label,theme,...(result.result                  ).value});
      }
      await tab.close();
    }
  }
  writeFileSync(`${out}/writes.json`,JSON.stringify(records,null,2));
  for(const theme of ['light','dark']) {
    const base=records.find(r=>r.label==='base'&&r.theme===theme) ;
    const head=records.find(r=>r.label==='head'&&r.theme===theme) ;
    assert.deepEqual(head.plateWrites,base.plateWrites,`${theme}: plate values unchanged`);
    console.log(theme,base.writes.map(w=>w.length),'->',head.writes.map(w=>w.length));
  }
} finally { await fixture.close(); }

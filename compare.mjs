import sharp from '/home/agent/workspace/site/node_modules/sharp/lib/index.js';
import {readdirSync,writeFileSync} from 'node:fs';
const dir='/tmp/468-evidence'; const all=[];
for(const file of readdirSync(dir).filter(s=>s.startsWith('before-')&&s.endsWith('.png'))){
 const before=await sharp(dir+'/'+file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const after=await sharp(dir+'/'+file.replace('before','after')).ensureAlpha().raw().toBuffer();
 let pixels=0,max=0,total=0;
 for(let i=0;i<before.data.length;i+=4){let changed=false;for(let k=0;k<3;k++){const d=Math.abs(before.data[i+k]-after[i+k]);if(d)changed=true;max=Math.max(max,d);total+=d;} if(changed)pixels++;}
 all.push({file,pixels,totalPixels:before.info.width*before.info.height,maxChannelDelta:max,totalChannelDelta:total});
}
writeFileSync(dir+'/pixel-comparison.json',JSON.stringify(all,null,2)); console.log(all);

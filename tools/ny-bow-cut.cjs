// Новогодний ивент: вырезает настоящий атласный бант с фона Nuke (assets/ny/_src/nuke-orig.webp, кусок 1120,0 320×280) → assets/ny/bow-real.webp.
// Красное без оранжевых огоньков (у банта синий ≈ зелёный), все крупные куски в области банта, дырки залиты, край смягчён. Запуск: node tools/ny-bow-cut.cjs <превью.png>
const sharp=require('D:/Кейсы/promo-video/node_modules/sharp'),fs=require('fs');(async()=>{
const src=fs.existsSync('assets/ny/_src/nuke-orig.webp')?'assets/ny/_src/nuke-orig.webp':'assets/ny/bg/nuke.webp';
const W=320,H=280;
const {data}=await sharp(src).extract({left:1120,top:0,width:W,height:H}).removeAlpha().raw().toBuffer({resolveWithObject:true});
const n=W*H,red=new Uint8Array(n);
for(let p=0;p<n;p++){const r=data[p*3],g=data[p*3+1],b=data[p*3+2];if(r>30&&r>g*1.8&&r>b*1.55&&!(g>r*.3&&b<g*.6))red[p]=1;}
const lab=new Int32Array(n).fill(-1);let best=-1,bs=0,id=0;
for(let p=0;p<n;p++){if(!red[p]||lab[p]>=0)continue;const st=[p];lab[p]=id;let c=0;while(st.length){const q=st.pop();c++;const x=q%W;for(const nb of [q-1,q+1,q-W,q+W]){if(nb<0||nb>=n)continue;if(Math.abs(nb%W-x)>1)continue;if(red[nb]&&lab[nb]<0){lab[nb]=id;st.push(nb);}}}if(c>bs){bs=c;best=id;}id++;}
const cnt=new Int32Array(id);for(let p=0;p<n;p++)if(lab[p]>=0)cnt[lab[p]]++;const m=new Uint8Array(n);for(let p=0;p<n;p++){const x=p%W,y=(p/W)|0;if(lab[p]>=0&&cnt[lab[p]]>250&&x>40&&x<290&&y<250)m[p]=1;}
let minX=W,maxX=0;for(let p=0;p<n;p++)if(m[p]){const x=p%W;if(x<minX)minX=x;if(x>maxX)maxX=x;}
for(let x=minX;x<=maxX;x++)for(let y=0;y<H;y++){const p=y*W+x;if(m[p])continue;const r=data[p*3],g=data[p*3+1],b=data[p*3+2];if(Math.min(r,g,b)>135&&Math.max(r,g,b)-Math.min(r,g,b)<95&&r-b<95){for(let k=1;k<=30&&y+k<H;k++){if(m[(y+k)*W+x]===1){m[p]=2;break;}}}}
const bg=new Uint8Array(n),st=[];const push=p=>{if(!bg[p]&&!m[p]){bg[p]=1;st.push(p);}};
for(let x=0;x<W;x++){push(x);push((H-1)*W+x);}for(let y=0;y<H;y++){push(y*W);push(y*W+W-1);}
while(st.length){const p=st.pop(),x=p%W,y=(p/W)|0;if(x>0)push(p-1);if(x<W-1)push(p+1);if(y>0)push(p-W);if(y<H-1)push(p+W);}
const a=Buffer.alloc(n);for(let p=0;p<n;p++)a[p]=bg[p]?0:255;
const af=await sharp(a,{raw:{width:W,height:H,channels:1}}).blur(.8).extractChannel(0).raw().toBuffer();
const out=Buffer.alloc(n*4);for(let p=0;p<n;p++){out[p*4]=data[p*3];out[p*4+1]=data[p*3+1];out[p*4+2]=data[p*3+2];out[p*4+3]=af[p];}
await sharp(out,{raw:{width:W,height:H,channels:4}}).trim().webp({quality:90,alphaQuality:95,effort:6}).toFile('assets/ny/bow-real.webp');
const meta=await sharp('assets/ny/bow-real.webp').metadata();console.log(meta.width,meta.height);
await sharp('assets/ny/bow-real.webp').flatten({background:'#2a2b2d'}).png().toFile(process.argv[2]);})();

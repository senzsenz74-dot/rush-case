const fs=require('fs'),path=require('path');
const R='C:/Users/Admin/tools/cs2x';
const W={ak47:'ak47/weapon_rif_ak47',usp_silencer:'usp_silencer/weapon_pist_usp_silencer',awp:'awp/weapon_snip_awp',deagle:'deagle/weapon_pist_deagle',glock18:'glock18/weapon_pist_glock18',m4a4:'m4a4/weapon_rif_m4a4',m4a1_silencer:'m4a1_silencer/weapon_rif_m4a1_silencer',knife_navaja:'knife/knife_navaja/weapon_knife_navaja',knife_gut:'knife/knife_gut/weapon_knife_gut',knife_push:'knife/knife_push/weapon_knife_push'};
const items=[
 ['ak47-uncharted','AK-47 | Uncharted','ak47','cu_ak47_aztec'],
 ['usp-lead-conduit','USP-S | Lead Conduit','usp_silencer','gs_usp_voltage'],
 ['awp-worm-god','AWP | Worm God','awp','aq_awp_twine'],
 ['deagle-sputnik','Desert Eagle | Sputnik','deagle','sp_spacerace_blue'],
 ['glock-moonrise','Glock-18 | Moonrise','glock18','aa_glock_18_urban_moon_fever'],
 ['m4a4-griffin','M4A4 | Griffin','m4a4','cu_m4a4_griffin'],
 ['ak47-phantom-disruptor','AK-47 | Phantom Disruptor','ak47','cu_ak-47_phantom_disruptor'],
 ['m4a1s-nightmare','M4A1-S | Nightmare','m4a1_silencer','cu_m4a1s_nightmare'],
 ['ak47-head-shot','AK-47 | Head Shot','ak47','cu_ak_head_shot_holo'],
 ['deagle-printstream','Desert Eagle | Printstream','deagle','cu_deag_printstream'],
 ['usp-printstream','USP-S | Printstream','usp_silencer','cu_usp_printstream'],
 ['navaja-marble-fade','★ Navaja Knife | Marble Fade','knife_navaja','am_marble_fade'],
 ['gut-tiger-tooth','★ Gut Knife | Tiger Tooth','knife_gut','an_tiger_orange'],
 ['daggers-marble-fade','★ Shadow Daggers | Marble Fade','knife_push','am_marble_fade'],
];
const glob=(d,re)=>{const out=[];(function walk(p){for(const f of fs.readdirSync(p)){const q=path.join(p,f);if(fs.statSync(q).isDirectory())walk(q);else if(re.test(f))out.push(q)}})(d);return out};
fs.mkdirSync(R+'/cfg',{recursive:true});
for(const [id,name,w,kit] of items){
  const wk=w.replace(/^knife_/,'knife_');
  const ci=glob(R+'/ci/'+w,/_composite_inputs\.vmat$/)[0];
  const pv=glob(R+'/paints/'+kit,new RegExp('^'+kit.replace(/[-]/g,'\-')+'\.vmat$'))[0];
  const cfg={id,name,root:R,model:R+'/models/weapons/models/'+W[w]+'.gltf',ci_vmat:ci,paint_vmat:pv,tmp:R+'/tmp',out:'D:/Кейсы/.claude/worktrees/factory-drop-bg-769d7e/assets/cs2case/3d/'+id+'.glb',res:2048};
  if(!ci||!pv) console.log('MISSING',id,ci,pv);
  fs.writeFileSync(R+'/cfg/'+id+'.json',JSON.stringify(cfg,null,1));
}
console.log('ok',items.length);

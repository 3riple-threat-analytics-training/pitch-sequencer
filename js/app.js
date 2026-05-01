let hand='R',pitch='4FB',zone='MM',rubber=0.5;
let tunnelOn=false,role='SETUP',batter='RHB';
let targetMode='ZONE';
let extendedAtBat=false;
let currentView='catcher';
let seq=[],pathObjs=[],landObjs=[],ghostLines=[],tunnelObjs=[];
let statics=[];
const ALL_PITCHES_LIST=[
  {key:'4FB',name:'4-seam FB',color:'#ef4444'},
  {key:'2FB',name:'2-seam FB',color:'#f97316'},
  {key:'CB', name:'Curveball', color:'#3b82f6'},
  {key:'SL', name:'Slider',    color:'#a855f7'},
  {key:'CH', name:'Changeup',  color:'#22c55e'},
  {key:'CT', name:'Cutter',    color:'#eab308'},
  {key:'SP', name:'Splitter',  color:'#06b6d4'},
  {key:'SK', name:'Sinker',    color:'#f43f5e'},
  {key:'FK', name:'Forkball',  color:'#0891b2'},
  {key:'SCR',name:'Screwball', color:'#ec4899'},
  {key:'EPH',name:'Eephus',    color:'#d97706'},
  {key:'SLV',name:'Slurve',    color:'#7c3aed'},
  {key:'SWP',name:'Sweeper',   color:'#10b981'},
  {key:'KN', name:'Knuckleball',color:'#94a3b8'},
  {key:'KC', name:'Knuckle Curve', color:'#6366f1'},
];

const AGE_SPEED={
  youth: {min:35,max:70,default:55},
  hs:    {min:55,max:85,default:72},
  college:{min:70,max:95,default:83},
  pro:   {min:80,max:102,default:90}
};

let profHand='R';
let profSelectedPitches=[];

const cv=document.getElementById('c');
const wrap=document.getElementById('cwrap');
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0x13281b,1);
const scene=new THREE.Scene();
const cam=new THREE.PerspectiveCamera(52,1,0.1,200);

function resize(){const w=wrap.clientWidth||480,h=wrap.clientHeight||560;renderer.setSize(w,h);cam.aspect=w/h;cam.updateProjectionMatrix();}
resize();
new ResizeObserver(resize).observe(wrap);

function getRP(){const rx=(rubber-0.5)*0.6,ho=hand==='R'?0.26:-0.26;return new THREE.Vector3(rx+ho,1.58,17.0);}
function setCamera(){cam.fov=52;cam.position.set(0,1.06,-1.2);cam.lookAt(0,1.06,17);cam.updateProjectionMatrix();}

function setHand(h){hand=h;document.getElementById('brhp').classList.toggle('active',h==='R');document.getElementById('blhp').classList.toggle('active',h==='L');buildStatic();rebuildPaths();refreshGhost();}
function setBatter(b){batter=b;['LHB','OFF','RHB'].forEach(x=>document.getElementById('b'+x.toLowerCase()).classList.toggle('active',x===b));buildStatic();rebuildPaths();refreshGhost();}
function selPitch(p){pitch=p;document.querySelectorAll('.pbtn').forEach(b=>b.classList.remove('sel'));document.getElementById('p'+p).classList.add('sel');refreshGhost();}
function selRole(r){role=r;document.querySelectorAll('.rpill').forEach(b=>b.classList.toggle('active',b.dataset.role===r));}
function setRubber(e){
  const rect=document.getElementById('rwrap').getBoundingClientRect();
  rubber=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  document.getElementById('rdot').style.left=(10+rubber*(rect.width-20))+'px';
  document.getElementById('tip').textContent=TIPS[rubber<0.33?'left':rubber>0.66?'right':'center'];
  buildStatic();rebuildPaths();refreshGhost();
}
function toggleTunnel(){tunnelOn=!tunnelOn;const b=document.getElementById('tunnelbtn');b.textContent=tunnelOn?'⬡ TUNNEL ON':'⬡ TUNNEL OFF';b.classList.toggle('on',tunnelOn);buildTunnels();}
function handleSpeedInput(value){document.getElementById('sval').textContent=value+' mph';refreshGhost();}
function openPrintView(){window.open('print.html','_blank');}
function setView(v){
  currentView=v;
  document.getElementById('vcatcher').classList.toggle('active',v==='catcher');
  document.getElementById('vside').classList.toggle('active',v==='side');
  document.getElementById('c').style.display=v==='catcher'?'block':'none';
  document.getElementById('sideview').style.display=v==='side'?'block':'none';
  if(v==='side') drawSideView();
}
function toggleExtendAtBat(){
  extendedAtBat=!extendedAtBat;
  const btn=document.getElementById('extendbtn');
  if(btn){
    btn.textContent=extendedAtBat?'EXTENDED (12)':'EXTEND AT BAT';
    btn.classList.toggle('active',extendedAtBat);
  }
  updateSeqUI();
}

function buildArsenalGrid(){
  const grid=document.getElementById('arsenalgrid');
  if(!grid)return;
  grid.innerHTML='';
  ALL_PITCHES_LIST.forEach(p=>{
    const btn=document.createElement('button');
    btn.className='arsenalbtn'+(profSelectedPitches.includes(p.key)?' sel':'');
    btn.dataset.key=p.key;
    btn.innerHTML=`<span style="width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0;display:inline-block;"></span>${p.name}`;
    btn.onclick=()=>toggleArsenalPitch(p.key);
    grid.appendChild(btn);
  });
  updateArsenalCount();
}

function toggleArsenalPitch(key){
  if(profSelectedPitches.includes(key)){
    if(profSelectedPitches.length<=2){
      document.getElementById('profileerror').textContent='Minimum 2 pitches required';
      return;
    }
    profSelectedPitches=profSelectedPitches.filter(k=>k!==key);
  } else {
    if(profSelectedPitches.length>=5){
      document.getElementById('profileerror').textContent='Maximum 5 pitches allowed';
      return;
    }
    profSelectedPitches.push(key);
  }
  document.getElementById('profileerror').textContent='';
  buildArsenalGrid();
}

function updateArsenalCount(){
  const el=document.getElementById('arsenalcount');
  if(el) el.textContent=`(${profSelectedPitches.length} selected — min 2, max 5)`;
}

function profSetHand(h){
  profHand=h;
  document.getElementById('prof-rhp').classList.toggle('active',h==='R');
  document.getElementById('prof-lhp').classList.toggle('active',h==='L');
}

function profAgeChanged(){
  const age=document.getElementById('prof-age').value;
  return age;
}

function openProfileOverlay(){
  const profile=getProfile();
  const overlay=document.getElementById('profileoverlay');
  document.getElementById('profileerror').textContent='';
  if(profile){
    document.getElementById('prof-name').value=profile.name||'';
    profHand=profile.hand||'R';
    profSetHand(profHand);
    document.getElementById('prof-age').value=profile.ageGroup||'youth';
    profSelectedPitches=[...(profile.arsenal||['4FB','CH'])];
    document.getElementById('profilesubtitle').textContent='Update your profile';
    document.getElementById('profsavebtn').textContent='SAVE PROFILE';
    document.getElementById('profileeditlbl').style.display='block';
  } else {
    profHand='R';
    profSetHand('R');
    profSelectedPitches=['4FB','CH'];
    document.getElementById('prof-name').value='';
    document.getElementById('prof-age').value='youth';
    document.getElementById('profilesubtitle').textContent='Set up your profile to get started';
    document.getElementById('profsavebtn').textContent='START PITCHING';
    document.getElementById('profileeditlbl').style.display='none';
  }
  buildArsenalGrid();
  overlay.classList.add('visible');
}

function closeProfileOverlay(){
  document.getElementById('profileoverlay').classList.remove('visible');
}

function saveProfileAndStart(){
  const name=(document.getElementById('prof-name').value||'').trim();
  if(!name){
    document.getElementById('profileerror').textContent='Please enter a pitcher name';
    return;
  }
  if(profSelectedPitches.length<2){
    document.getElementById('profileerror').textContent='Please select at least 2 pitches';
    return;
  }
  if(profSelectedPitches.length>5){
    document.getElementById('profileerror').textContent='Please select no more than 5 pitches';
    return;
  }
  const ageGroup=document.getElementById('prof-age').value;
  const profile={name,hand:profHand,ageGroup,arsenal:profSelectedPitches};
  saveProfile(profile);
  applyProfile(profile);
  closeProfileOverlay();
}

function applyProfile(profile){
  if(!profile)return;
  setHand(profile.hand||'R');
  const speeds=AGE_SPEED[profile.ageGroup]||AGE_SPEED.youth;
  const spdEl=document.getElementById('spd');
  if(spdEl){
    spdEl.min=speeds.min;
    spdEl.max=speeds.max;
    const cur=parseInt(spdEl.value,10);
    const nextVal=Math.max(speeds.min,Math.min(speeds.max,isNaN(cur)?speeds.default:cur));
    spdEl.value=nextVal;
    document.getElementById('sval').textContent=spdEl.value+' mph';
  }
  ALL_PITCHES_LIST.forEach(p=>{
    const btn=document.getElementById('p'+p.key);
    if(btn) btn.style.display=profile.arsenal.includes(p.key)?'flex':'none';
  });
  if(!profile.arsenal.includes(pitch)&&profile.arsenal.length){
    selPitch(profile.arsenal[0]);
  }
  const gear=document.getElementById('gearbtn');
  if(gear) gear.title=profile.name+' — Edit Profile';
}

function initProfile(){
  const profile=getProfile();
  if(!profile){
    openProfileOverlay();
  } else {
    applyProfile(profile);
  }
}

function buildBatterSilhouette(add,isRHB){
  const xOff=isRHB?0.40:-0.40;
  const zOff=-0.45;
  const mat=new THREE.MeshBasicMaterial({color:0xe8f4fd,transparent:true,opacity:0.18,depthWrite:false});
  const chalkLineMat=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.72});
  const gnd=0.41;
  const p=(geo,x,y,z)=>{
    const m=new THREE.Mesh(geo,mat);
    m.position.set(xOff+x,gnd+y,zOff+z);
    add(m);
    const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geo),chalkLineMat);
    edge.position.copy(m.position);
    edge.rotation.copy(m.rotation);
    add(edge);
  };
  p(new THREE.SphereGeometry(0.048,8,8),0,1.02,0);
  p(new THREE.BoxGeometry(0.09,0.18,0.08),0,0.86,0);
  p(new THREE.BoxGeometry(0.10,0.08,0.08),0,0.70,0);
  p(new THREE.BoxGeometry(0.045,0.15,0.055),-0.03,0.54,0);
  p(new THREE.BoxGeometry(0.045,0.15,0.055),0.03,0.54,0);
  p(new THREE.BoxGeometry(0.040,0.14,0.05),-0.04,0.36,0.02);
  p(new THREE.BoxGeometry(0.040,0.14,0.05),0.04,0.36,0.02);
  const ad=isRHB?1:-1;
  p(new THREE.BoxGeometry(0.035,0.12,0.035),ad*0.06,0.88,-0.02);
  const bat=new THREE.Mesh(new THREE.CylinderGeometry(0.009,0.014,0.32,6),mat);
  bat.position.set(xOff+ad*0.11,gnd+0.92,zOff-0.02);
  bat.rotation.z=ad*-0.45;bat.rotation.x=-0.18;add(bat);
  const batEdge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.009,0.014,0.32,6)),chalkLineMat);
  batEdge.position.copy(bat.position);
  batEdge.rotation.copy(bat.rotation);
  add(batEdge);
  const bxY=gnd+0.01,bW=0.52,bD=0.85;
  add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(xOff-bW/2,bxY,zOff-bD*0.50),new THREE.Vector3(xOff+bW/2,bxY,zOff-bD*0.50),
    new THREE.Vector3(xOff+bW/2,bxY,zOff+bD*0.50),new THREE.Vector3(xOff-bW/2,bxY,zOff+bD*0.50),
    new THREE.Vector3(xOff-bW/2,bxY,zOff-bD*0.50)]),new THREE.LineBasicMaterial({color:0xffffff,opacity:0.62,transparent:true})));
}

function buildStatic(){
  statics.forEach(o=>scene.remove(o));statics=[];
  const add=o=>{scene.add(o);statics.push(o);return o;};
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,28),new THREE.MeshBasicMaterial({color:0x13281b}));
  ground.rotation.x=-Math.PI/2;ground.position.set(0,0.40,9);add(ground);
  const dirt=new THREE.Mesh(new THREE.CircleGeometry(2.8,32),new THREE.MeshBasicMaterial({color:0x13281b}));
  dirt.rotation.x=-Math.PI/2;dirt.position.set(0,0.42,17.5);add(dirt);
  const rub=new THREE.Mesh(new THREE.BoxGeometry(0.61,0.05,0.15),new THREE.MeshBasicMaterial({color:0xffffff}));
  rub.position.set(0,0.45,17.5);add(rub);
  const rp=getRP();
  const rdot=new THREE.Mesh(new THREE.SphereGeometry(0.06,10,10),new THREE.MeshBasicMaterial({color:hand==='R'?0xc084fc:0x7ec8e3}));
  rdot.position.set(rp.x,rp.y,rp.z);add(rdot);
  const pY=CLO_Y-0.08;
  add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-ZW/2,pY,0),new THREE.Vector3(ZW/2,pY,0),new THREE.Vector3(ZW/2,pY,0.21),new THREE.Vector3(0,pY,0.35),new THREE.Vector3(-ZW/2,pY,0.21),new THREE.Vector3(-ZW/2,pY,0)]),new THREE.LineBasicMaterial({color:0xffffff,opacity:0.95,transparent:true})));
  const plateInset=0.012,plateLift=0.002;
  add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-ZW/2+plateInset,pY+plateLift,0.01),
    new THREE.Vector3(ZW/2-plateInset,pY+plateLift,0.01),
    new THREE.Vector3(ZW/2-plateInset,pY+plateLift,0.20),
    new THREE.Vector3(0,pY+plateLift,0.33),
    new THREE.Vector3(-ZW/2+plateInset,pY+plateLift,0.20),
    new THREE.Vector3(-ZW/2+plateInset,pY+plateLift,0.01)
  ]),new THREE.LineBasicMaterial({color:0xffffff,opacity:0.85,transparent:true})));
  add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-ZW/2,ZLO,0),new THREE.Vector3(ZW/2,ZLO,0),new THREE.Vector3(ZW/2,ZLO,0),new THREE.Vector3(ZW/2,ZHI,0),new THREE.Vector3(ZW/2,ZHI,0),new THREE.Vector3(-ZW/2,ZHI,0),new THREE.Vector3(-ZW/2,ZHI,0),new THREE.Vector3(-ZW/2,ZLO,0)]),new THREE.LineBasicMaterial({color:0xffffff,linewidth:2})));
  add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-ZW/6,ZLO,0),new THREE.Vector3(-ZW/6,ZHI,0),new THREE.Vector3(ZW/6,ZLO,0),new THREE.Vector3(ZW/6,ZHI,0),new THREE.Vector3(-ZW/2,ZLO+ZH/3,0),new THREE.Vector3(ZW/2,ZLO+ZH/3,0),new THREE.Vector3(-ZW/2,ZLO+ZH*2/3,0),new THREE.Vector3(ZW/2,ZLO+ZH*2/3,0)]),new THREE.LineBasicMaterial({color:0x4a7aaa,opacity:0.4,transparent:true})));
  [[-ZW/2,ZLO],[ZW/2,ZLO],[-ZW/2,ZHI],[ZW/2,ZHI]].forEach(([cx,cy])=>{const m=new THREE.Mesh(new THREE.SphereGeometry(0.022,6,6),new THREE.MeshBasicMaterial({color:0xffdd77}));m.position.set(cx,cy,0.01);add(m);});
  if(batter==='RHB') buildBatterSilhouette(add,true);
  if(batter==='LHB') buildBatterSilhouette(add,false);
  add(new THREE.AmbientLight(0xffffff,0.9));
}

function clearTunnels(){tunnelObjs.forEach(o=>scene.remove(o));tunnelObjs=[];}
function drawTunnelPair(pA,pB){
  const n=Math.min(pA.length,pB.length),s0=Math.floor(n*TUNNEL_START),s1=Math.floor(n*TUNNEL_END);
  let inT=false,seg=[];
  for(let i=s0;i<s1;i++){
    const d=pA[i].distanceTo(pB[i]),m=new THREE.Vector3().addVectors(pA[i],pB[i]).multiplyScalar(0.5);
    if(d<=TUNNEL_THRESH){if(!inT){inT=true;seg=[];}seg.push(m.clone());}
    else{if(inT&&seg.length>=3)buildTube(seg);inT=false;seg=[];}
  }
  if(inT&&seg.length>=3)buildTube(seg);
}
function buildTube(pts){
  const c=[pts[0]];for(let i=1;i<pts.length;i++)if(pts[i].distanceTo(pts[i-1])>0.001)c.push(pts[i]);
  if(c.length<3)return;
  const path=new THREE.CatmullRomCurve3(c);
  try{const m=new THREE.Mesh(new THREE.TubeGeometry(path,c.length*2,TUBE_R*1.6,8,false),new THREE.MeshBasicMaterial({color:0xeab308,transparent:true,opacity:0.08,side:THREE.DoubleSide,depthWrite:false}));scene.add(m);tunnelObjs.push(m);}catch(e){}
  try{const m=new THREE.Mesh(new THREE.TubeGeometry(path,c.length*2,TUBE_R,8,false),new THREE.MeshBasicMaterial({color:0xfde047,transparent:true,opacity:0.22,side:THREE.DoubleSide,depthWrite:false}));scene.add(m);tunnelObjs.push(m);}catch(e){}
  const ep=c[c.length-1];
  try{const ring=new THREE.Mesh(new THREE.TorusGeometry(TUBE_R*1.4,0.004,8,24),new THREE.MeshBasicMaterial({color:0xeab308,transparent:true,opacity:0.85}));ring.position.copy(ep);if(c.length>=2){const dir=new THREE.Vector3().subVectors(ep,c[c.length-2]).normalize();ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);}scene.add(ring);tunnelObjs.push(ring);}catch(e){}
}
function buildTunnels(){
  clearTunnels();if(!tunnelOn||seq.length<2)return;
  for(let a=0;a<seq.length-1;a++)for(let b=a+1;b<seq.length;b++)drawTunnelPair(seq[a].pts3d,seq[b].pts3d);
}

function bdTarget(tp,h){return{x:h*BD_BORDER,y:tp.y};}
function makeCurve(pk,zk,bd){
  const rp=getRP();
  const tp=ZPOS[zk]||{x:0,y:Y_MID};
  const h=hand==='R'?1:-1;
  const landing=bd?bdTarget(tp,h):tp;
  let endX=landing.x;
  let endY=landing.y;
  if(pk==='KN'){
    endX=landing.x+(Math.random()-0.5)*0.52;
    endY=Math.max(MIN_Y,landing.y+(Math.random()-0.5)*0.48);
  }
  const t=new THREE.Vector3(endX,endY,0.12);
  const P=PITCHES[pk];
  const[c1,c2]=bd&&P.bd?P.bd(rp,t,h):P.ctrl(rp,t,h);
  return new THREE.CubicBezierCurve3(rp.clone(),c1,c2,t.clone());
}

function line3D(pts,col,op,lw){const g=new THREE.BufferGeometry().setFromPoints(pts);const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:col,opacity:op,transparent:op<1,linewidth:lw||2}));scene.add(l);return l;}
function dashedLine(pts,col){const lines=[];for(let i=0;i<pts.length-2;i+=4){const g=new THREE.BufferGeometry().setFromPoints([pts[i],pts[Math.min(i+2,pts.length-1)]]);const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:col,opacity:0.28,transparent:true}));scene.add(l);lines.push(l);}return lines;}
function removeObj(o){if(!o)return;Array.isArray(o)?o.forEach(x=>scene.remove(x)):scene.remove(o);}
function refreshGhost(){ghostLines.forEach(o=>removeObj(o));ghostLines=[];const bd=document.getElementById('ckbd').checked;ghostLines=dashedLine(makeCurve(pitch,zone,bd).getPoints(80),PITCHES[pitch].color);}

function drawSideView(){
  const svg=document.getElementById('sidesvg');
  if(!svg)return;
  const W=svg.clientWidth||700;
  const H=svg.clientHeight||560;
  svg.innerHTML='';

  const PAD_L=80;
  const PAD_R=60;
  const PAD_T=40;
  const PAD_B=60;
  const DRAW_W=W-PAD_L-PAD_R;
  const DRAW_H=H-PAD_T-PAD_B;

  const WORLD_Z_MIN=0;
  const WORLD_Z_MAX=17;
  const WORLD_Y_MIN=0.40;
  const WORLD_Y_MAX=1.65;

  function toSVG(wz,wy){
    const sx=PAD_L+((WORLD_Z_MAX-wz)/(WORLD_Z_MAX-WORLD_Z_MIN))*DRAW_W;
    const sy=PAD_T+((WORLD_Y_MAX-wy)/(WORLD_Y_MAX-WORLD_Y_MIN))*DRAW_H;
    return {x:sx,y:sy};
  }

  function el(tag,attrs){
    const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));
    return e;
  }
  function txt(content,attrs){
    const e=el('text',attrs);
    e.textContent=content;
    return e;
  }

  svg.appendChild(el('rect',{x:0,y:0,width:W,height:H,fill:'#0a0e1a'}));

  const zoneTop=toSVG(0,1.37);
  const zoneBtm=toSVG(0,0.75);
  const groundY=toSVG(0,0.40).y;
  const highY=toSVG(0,1.55).y;

  svg.appendChild(el('rect',{x:PAD_L,y:zoneBtm.y,width:DRAW_W,height:groundY-zoneBtm.y,fill:'#1a0e06',opacity:0.4}));
  svg.appendChild(el('rect',{x:PAD_L,y:zoneTop.y,width:DRAW_W,height:zoneBtm.y-zoneTop.y,fill:'#0f2035',opacity:0.5}));
  svg.appendChild(el('rect',{x:PAD_L,y:highY,width:DRAW_W,height:zoneTop.y-highY,fill:'#091828',opacity:0.3}));

  const zoneMid1=toSVG(0,0.75+0.207);
  const zoneMid2=toSVG(0,0.75+0.414);
  [zoneMid1.y,zoneMid2.y].forEach(y=>{
    const l=el('line',{x1:PAD_L,y1:y,x2:W-PAD_R,y2:y,stroke:'#2a4a6a','stroke-width':'0.5','stroke-dasharray':'3 3'});
    svg.appendChild(l);
  });

  [zoneTop.y,zoneBtm.y].forEach(y=>{
    svg.appendChild(el('line',{x1:PAD_L,y1:y,x2:W-PAD_R,y2:y,stroke:'#4a7aaa','stroke-width':'0.5'}));
  });

  svg.appendChild(el('line',{x1:PAD_L,y1:groundY,x2:W-PAD_R,y2:groundY,stroke:'#2a3a2a','stroke-width':'1'}));

  [
    {label:'HIGH',y:(highY+zoneTop.y)/2},
    {label:'ZONE',y:(zoneTop.y+zoneBtm.y)/2},
    {label:'LOW',y:(zoneBtm.y+groundY)/2},
  ].forEach(({label,y})=>{
    const t=txt(label,{x:PAD_L-8,y,fill:'#3a5a7a','font-size':'9','font-family':'DM Mono,monospace','text-anchor':'end','dominant-baseline':'central'});
    svg.appendChild(t);
  });

  const zBarX=W-PAD_R+8;
  svg.appendChild(el('rect',{x:zBarX,y:zoneTop.y,width:18,height:zoneBtm.y-zoneTop.y,fill:'#0f2840',stroke:'#7ec8e3','stroke-width':'1.5'}));
  [zoneMid1.y,zoneMid2.y].forEach(y=>{
    svg.appendChild(el('line',{x1:zBarX,y1:y,x2:zBarX+18,y2:y,stroke:'#4a7aaa','stroke-width':'0.5'}));
  });

  const moundX=toSVG(17,0.40).x;
  const moundY=groundY;
  const mound=el('ellipse',{cx:moundX,cy:moundY,rx:18,ry:6,fill:'#1a0e06',stroke:'#2a1a06','stroke-width':'0.5'});
  svg.appendChild(mound);
  svg.appendChild(txt('60\'6"',{x:moundX,y:moundY+18,fill:'#2a3a4a','font-size':'8','font-family':'DM Mono,monospace','text-anchor':'middle'}));

  const plateX=toSVG(0,0.40).x;
  svg.appendChild(txt('PLATE',{x:plateX,y:moundY+18,fill:'#2a3a4a','font-size':'8','font-family':'DM Mono,monospace','text-anchor':'middle'}));

  [17,12,6,0].forEach(d=>{
    const px=toSVG(d,0.40).x;
    svg.appendChild(el('line',{x1:px,y1:groundY,x2:px,y2:groundY+6,stroke:'#2a3a4a','stroke-width':'0.5'}));
  });

  if(!seq.length){
    svg.appendChild(txt('No pitches thrown — throw pitches in catcher view first',{x:W/2,y:H/2,fill:'#3a5a7a','font-size':'11','font-family':'DM Mono,monospace','text-anchor':'middle'}));
    return;
  }

  for(let a=0;a<seq.length-1;a++){
    for(let b=a+1;b<seq.length;b++){
      const ptsA=seq[a].pts3d;
      const ptsB=seq[b].pts3d;
      const n=Math.min(ptsA.length,ptsB.length);
      const s0=Math.floor(n*0.15);
      const s1=Math.floor(n*0.72);
      let tunnelPts=[];
      for(let i=s0;i<s1;i++){
        const dist=ptsA[i].distanceTo(ptsB[i]);
        if(dist<=0.22){
          const mx=(ptsA[i].x+ptsB[i].x)/2;
          const my=(ptsA[i].y+ptsB[i].y)/2;
          const mz=(ptsA[i].z+ptsB[i].z)/2;
          tunnelPts.push({x:mx,y:my,z:mz});
        }else if(tunnelPts.length>3){
          break;
        }
      }
      if(tunnelPts.length>=3){
        const svgPts=tunnelPts.map(p=>toSVG(p.z,p.y));
        const pathD='M'+svgPts.map(p=>p.x+','+p.y).join(' L');
        svg.appendChild(el('path',{d:pathD,fill:'none',stroke:'#eab308','stroke-width':'12',opacity:'0.08','stroke-linecap':'round'}));
        svg.appendChild(el('path',{d:pathD,fill:'none',stroke:'#fde047','stroke-width':'4',opacity:'0.18','stroke-linecap':'round'}));
        const ep=svgPts[svgPts.length-1];
        svg.appendChild(el('circle',{cx:ep.x,cy:ep.y,r:'8',fill:'none',stroke:'#eab308','stroke-width':'1.5',opacity:'0.85'}));
        svg.appendChild(txt('DECISION',{x:ep.x,y:ep.y-14,fill:'#eab308','font-size':'7','font-family':'DM Mono,monospace','text-anchor':'middle'}));
      }
    }
  }

  seq.forEach((s,i)=>{
    const col='#'+PITCHES[s.pk].color.toString(16).padStart(6,'0');
    const pts=s.pts3d;
    if(!pts||!pts.length) return;
    const svgPts=pts.map(p=>toSVG(p.z,p.y));
    const pathD='M'+svgPts[0].x+','+svgPts[0].y+svgPts.slice(1).map(p=>' L'+p.x+','+p.y).join('');
    svg.appendChild(el('path',{d:pathD,fill:'none',stroke:col,'stroke-width':'2',opacity:'0.85','stroke-linecap':'round'}));
    const lp=svgPts[svgPts.length-1];
    svg.appendChild(el('circle',{cx:lp.x,cy:lp.y,r:'8',fill:col}));
    svg.appendChild(txt(String(i+1),{x:lp.x,y:lp.y,fill:'white','font-size':'8','font-family':'DM Mono,monospace','text-anchor':'middle','dominant-baseline':'central','font-weight':'bold'}));
  });

  if(seq.length){
    const rp=toSVG(seq[0].pts3d[0].z,seq[0].pts3d[0].y);
    svg.appendChild(el('circle',{cx:rp.x,cy:rp.y,r:'5',fill:'#c084fc'}));
    svg.appendChild(txt('REL',{x:rp.x-10,y:rp.y,fill:'#c084fc','font-size':'8','font-family':'DM Mono,monospace','text-anchor':'end','dominant-baseline':'central'}));
  }

  const legY=H-PAD_B+20;
  let legX=PAD_L;
  seq.forEach((s,i)=>{
    const col='#'+PITCHES[s.pk].color.toString(16).padStart(6,'0');
    svg.appendChild(el('circle',{cx:legX+6,cy:legY,r:'5',fill:col}));
    svg.appendChild(txt(`${i+1}. ${PITCHES[s.pk].name} ${s.spd}mph`,{x:legX+14,y:legY,fill:'#8aabb8','font-size':'9','font-family':'DM Mono,monospace','dominant-baseline':'central'}));
    legX+=Math.min(160,DRAW_W/seq.length);
  });
}

let sideReplayTimer=null;
function replaySideView(){
  if(!seq.length) return;
  if(sideReplayTimer){clearInterval(sideReplayTimer);sideReplayTimer=null;}

  const svg=document.getElementById('sidesvg');
  if(!svg) return;
  const W=svg.clientWidth||700;
  const H=svg.clientHeight||560;

  // Layout constants — must match drawSideView exactly
  const PAD_L=80;
  const PAD_R=60;
  const PAD_T=40;
  const PAD_B=60;
  const DRAW_W=W-PAD_L-PAD_R;
  const DRAW_H=H-PAD_T-PAD_B;
  const WORLD_Z_MIN=0;
  const WORLD_Z_MAX=17;
  const WORLD_Y_MIN=0.40;
  const WORLD_Y_MAX=1.65;

  function toSVG(wz,wy){
    const sx=PAD_L+((WORLD_Z_MAX-wz)/(WORLD_Z_MAX-WORLD_Z_MIN))*DRAW_W;
    const sy=PAD_T+((WORLD_Y_MAX-wy)/(WORLD_Y_MAX-WORLD_Y_MIN))*DRAW_H;
    return {x:sx,y:sy};
  }
  function el(tag,attrs){
    const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));
    return e;
  }
  function txt(content,attrs){
    const e=el('text',attrs);e.textContent=content;return e;
  }

  // Start with a clean base — draw everything EXCEPT pitch arcs and tunnels
  // Redraw the static background elements only
  drawSideView();

  // Remove all pitch arcs, landing dots, tunnel corridors and decision points
  // from the static draw so we can rebuild them incrementally
  // We do this by removing elements with specific attributes we will re-add
  // Actually — clear the svg and redraw base only
  svg.innerHTML='';

  // Redraw background, zones, zone bar, mound, plate, labels — no pitches, no tunnels
  svg.appendChild(el('rect',{x:0,y:0,width:W,height:H,fill:'#0a0e1a'}));

  const groundY=toSVG(0,0.40).y;
  const zoneTop=toSVG(0,1.37);
  const zoneBtm=toSVG(0,0.75);
  const highY=toSVG(0,1.55).y;
  const zoneMid1=toSVG(0,0.75+0.207);
  const zoneMid2=toSVG(0,0.75+0.414);

  // Zone bands
  svg.appendChild(el('rect',{x:PAD_L,y:zoneBtm.y,width:DRAW_W,
    height:groundY-zoneBtm.y,fill:'#1a0e06',opacity:0.4}));
  svg.appendChild(el('rect',{x:PAD_L,y:zoneTop.y,width:DRAW_W,
    height:zoneBtm.y-zoneTop.y,fill:'#0f2035',opacity:0.5}));
  svg.appendChild(el('rect',{x:PAD_L,y:highY,width:DRAW_W,
    height:zoneTop.y-highY,fill:'#091828',opacity:0.3}));

  // Zone dividers
  [zoneMid1.y,zoneMid2.y].forEach(y=>{
    svg.appendChild(el('line',{x1:PAD_L,y1:y,x2:W-PAD_R,y2:y,
      stroke:'#2a4a6a','stroke-width':'0.5','stroke-dasharray':'3 3'}));
  });
  [zoneTop.y,zoneBtm.y].forEach(y=>{
    svg.appendChild(el('line',{x1:PAD_L,y1:y,x2:W-PAD_R,y2:y,
      stroke:'#4a7aaa','stroke-width':'0.5'}));
  });

  // Ground line
  svg.appendChild(el('line',{x1:PAD_L,y1:groundY,x2:W-PAD_R,y2:groundY,
    stroke:'#2a3a2a','stroke-width':'1'}));

  // Zone labels
  [{label:'HIGH',y:(highY+zoneTop.y)/2},
   {label:'ZONE',y:(zoneTop.y+zoneBtm.y)/2},
   {label:'LOW', y:(zoneBtm.y+groundY)/2}].forEach(({label,y})=>{
    svg.appendChild(txt(label,{x:PAD_L-8,y,fill:'#3a5a7a','font-size':'9',
      'font-family':'DM Mono,monospace','text-anchor':'end','dominant-baseline':'central'}));
  });

  // Strike zone bar
  const zBarX=W-PAD_R+8;
  svg.appendChild(el('rect',{x:zBarX,y:zoneTop.y,width:18,
    height:zoneBtm.y-zoneTop.y,fill:'#0f2840',stroke:'#7ec8e3','stroke-width':'1.5'}));
  [zoneMid1.y,zoneMid2.y].forEach(y=>{
    svg.appendChild(el('line',{x1:zBarX,y1:y,x2:zBarX+18,y2:y,
      stroke:'#4a7aaa','stroke-width':'0.5'}));
  });

  // Mound and plate
  const moundX=toSVG(17,0.40).x;
  svg.appendChild(el('ellipse',{cx:moundX,cy:groundY,rx:18,ry:6,
    fill:'#1a0e06',stroke:'#2a1a06','stroke-width':'0.5'}));
  svg.appendChild(txt('60\'6"',{x:moundX,y:groundY+18,fill:'#2a3a4a','font-size':'8',
    'font-family':'DM Mono,monospace','text-anchor':'middle'}));
  svg.appendChild(txt('PLATE',{x:toSVG(0,0.40).x,y:groundY+18,fill:'#2a3a4a',
    'font-size':'8','font-family':'DM Mono,monospace','text-anchor':'middle'}));

  // Release point dot
  if(seq.length){
    const rp=toSVG(seq[0].pts3d[0].z,seq[0].pts3d[0].y);
    svg.appendChild(el('circle',{cx:rp.x,cy:rp.y,r:'5',fill:'#c084fc'}));
    svg.appendChild(txt('REL',{x:rp.x-10,y:rp.y,fill:'#c084fc','font-size':'8',
      'font-family':'DM Mono,monospace','text-anchor':'end','dominant-baseline':'central'}));
  }

  // Legend at bottom
  const legY=H-PAD_B+20;
  let legX=PAD_L;
  seq.forEach((s,i)=>{
    const col='#'+PITCHES[s.pk].color.toString(16).padStart(6,'0');
    svg.appendChild(el('circle',{cx:legX+6,cy:legY,r:'5',fill:col}));
    svg.appendChild(txt(`${i+1}. ${PITCHES[s.pk].name} ${s.spd}mph`,{
      x:legX+14,y:legY,fill:'#8aabb8','font-size':'9',
      'font-family':'DM Mono,monospace','dominant-baseline':'central'}));
    legX+=Math.min(160,DRAW_W/seq.length);
  });

  // Helper to check if two pitch sequences tunnel at a given index pair
  function getTunnelPath(ptsA, ptsB){
    const n=Math.min(ptsA.length,ptsB.length);
    const s0=Math.floor(n*0.15);
    const s1=Math.floor(n*0.72);
    let tunnelPts=[];
    for(let i=s0;i<s1;i++){
      const dist=ptsA[i].distanceTo(ptsB[i]);
      if(dist<=0.22){
        const mx=(ptsA[i].x+ptsB[i].x)/2;
        const my=(ptsA[i].y+ptsB[i].y)/2;
        const mz=(ptsA[i].z+ptsB[i].z)/2;
        tunnelPts.push({x:mx,y:my,z:mz});
      } else if(tunnelPts.length>3){
        break;
      }
    }
    return tunnelPts.length>=3?tunnelPts:null;
  }

  // Helper to draw a single pitch arc and landing dot
  function drawPitchArc(s, i){
    const col='#'+PITCHES[s.pk].color.toString(16).padStart(6,'0');
    const pts=s.pts3d;
    if(!pts||!pts.length) return;
    const svgPts=pts.map(p=>toSVG(p.z,p.y));
    const pathD='M'+svgPts[0].x+','+svgPts[0].y+
      svgPts.slice(1).map(p=>' L'+p.x+','+p.y).join('');
    svg.appendChild(el('path',{d:pathD,fill:'none',stroke:col,
      'stroke-width':'2',opacity:'0.85','stroke-linecap':'round'}));
    const lp=svgPts[svgPts.length-1];
    svg.appendChild(el('circle',{cx:lp.x,cy:lp.y,r:'8',fill:col}));
    svg.appendChild(txt(String(i+1),{x:lp.x,y:lp.y,fill:'white','font-size':'8',
      'font-family':'DM Mono,monospace','text-anchor':'middle',
      'dominant-baseline':'central','font-weight':'bold'}));
  }

  // Helper to draw tunnel corridor between two pitches
  function drawTunnelCorridor(tunnelPts){
    const svgPts=tunnelPts.map(p=>toSVG(p.z,p.y));
    const pathD='M'+svgPts.map(p=>p.x+','+p.y).join(' L');
    // Wide gold glow
    svg.appendChild(el('path',{d:pathD,fill:'none',stroke:'#eab308',
      'stroke-width':'12',opacity:'0.08','stroke-linecap':'round'}));
    // Inner gold line
    svg.appendChild(el('path',{d:pathD,fill:'none',stroke:'#fde047',
      'stroke-width':'4',opacity:'0.18','stroke-linecap':'round'}));
    // Decision point ring at end
    const ep=svgPts[svgPts.length-1];
    svg.appendChild(el('circle',{cx:ep.x,cy:ep.y,r:'8',fill:'none',
      stroke:'#eab308','stroke-width':'1.5',opacity:'0.85'}));
    svg.appendChild(txt('DECISION',{x:ep.x,y:ep.y-14,fill:'#eab308',
      'font-size':'7','font-family':'DM Mono,monospace','text-anchor':'middle'}));
  }

  // INCREMENTAL REPLAY — show pitches one at a time, accumulating
  // After each pitch check if it tunnels with any previous pitch
  // If yes draw the tunnel corridor immediately
  const drawnPitches=[];
  let replayIndex=0;

  sideReplayTimer=setInterval(()=>{
    if(replayIndex>=seq.length){
      clearInterval(sideReplayTimer);
      sideReplayTimer=null;
      return;
    }

    const s=seq[replayIndex];
    // Draw this pitch arc
    drawPitchArc(s,replayIndex);

    // Check if this pitch tunnels with any previously drawn pitch
    drawnPitches.forEach(prev=>{
      const tunnelPts=getTunnelPath(prev.pts3d,s.pts3d);
      if(tunnelPts){
        // Draw tunnel corridor immediately alongside this pitch
        drawTunnelCorridor(tunnelPts);
      }
    });

    // Add this pitch to the drawn list
    drawnPitches.push(s);
    replayIndex++;
  },900);
}

function makeOutcomeSprite(outcome){
  const palette=simSpritePalette(outcome);
  const tc=document.createElement('canvas');
  const cw=232,ch=54;
  tc.width=cw;tc.height=ch;
  const tx=tc.getContext('2d');
  tx.fillStyle=palette.bg;
  tx.strokeStyle=palette.bd;
  tx.lineWidth=2;
  const r=8,x=4,y=4,w=cw-8,h=ch-8;
  tx.beginPath();tx.moveTo(x+r,y);tx.lineTo(x+w-r,y);tx.quadraticCurveTo(x+w,y,x+w,y+r);tx.lineTo(x+w,y+h-r);tx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);tx.lineTo(x+r,y+h);tx.quadraticCurveTo(x,y+h,x,y+h-r);tx.lineTo(x,y+r);tx.quadraticCurveTo(x,y,x+r,y);tx.closePath();
  tx.fill();tx.stroke();
  tx.fillStyle=palette.fg;
  tx.textAlign='center';tx.textBaseline='middle';
  let fontPx=14;
  if(outcome.length>16) fontPx=12;
  if(outcome.length>22) fontPx=10;
  tx.font='bold '+fontPx+'px DM Mono, monospace';
  tx.fillText(outcome,cw/2,ch/2);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(tc),transparent:true,opacity:0.95}));
  spr.scale.set(0.2,0.048,1);
  spr.position.set(0,0.075,0);
  return spr;
}
function addLanding(pos,color,mph,outcome){
  const g=new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(ORB_R,12,12),new THREE.MeshBasicMaterial({color,wireframe:true,opacity:0.55,transparent:true})));
  const tc=document.createElement('canvas');tc.width=64;tc.height=64;const tx=tc.getContext('2d');tx.clearRect(0,0,64,64);tx.fillStyle='#ffffff';tx.textAlign='center';tx.textBaseline='middle';tx.font='bold 18px sans-serif';tx.fillText(String(mph),32,22);tx.font='bold 11px sans-serif';tx.fillText('mph',32,40);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(tc),transparent:true,opacity:0.92}));spr.scale.set(0.055,0.055,1);g.add(spr);
  if(outcome) g.add(makeOutcomeSprite(outcome));
  g.position.set(pos.x,pos.y,pos.z);scene.add(g);landObjs.push(g);
}
function animBall(pts,color,ms,onDone){
  const ball=new THREE.Mesh(new THREE.SphereGeometry(0.055,10,10),new THREE.MeshBasicMaterial({color}));scene.add(ball);const t0=performance.now();
  (function step(){const t=Math.min((performance.now()-t0)/ms,1);ball.position.copy(pts[Math.floor(t*(pts.length-1))]);t<1?requestAnimationFrame(step):(scene.remove(ball),onDone&&onDone());})();
}

function commitPitch(pts3d,pk,zk,spd,bd,rl,ct,outcome){
  // Sim mode: no pitch limit — at bat plays out naturally
  // Planning mode: 6 pitch default, 12 with extension
  if(simMode){
    // No limit in sim mode
  }else{
    const planLimit=extendedAtBat?12:6;
    if(seq.length>=planLimit)return;
  }
  const col=PITCHES[pk].color;
  pathObjs.push(line3D(pts3d,col,0.88,3));
  animBall(pts3d,col,PITCHES[pk].ms,()=>addLanding(pts3d[pts3d.length-1],col,spd,outcome));
  seq.push({pk,zk,spd,bd,role:rl,count:ct,outcome:outcome||'',pts3d:pts3d.map(v=>v.clone())});
  updateSeqUI();buildTunnels();
  if(currentView==='side') drawSideView();
  saveSimState();
}

function throwPitch(){
  if(!simMode){
    const planLimit=extendedAtBat?12:6;
    if(seq.length>=planLimit)return;
  }
  if(simMode) cancelSimScheduledClear();
  const spd=parseInt(document.getElementById('spd').value,10),bd=document.getElementById('ckbd').checked;
  const ctBefore=pitchCount;
  const strikesAtStart=strikeCount;
  let outcome='';
  if(simMode){
    simInningLogPending=false;
    pitchesInAtBat++;
    const pitchNm=PITCHES[pitch].name;
    if(isEdgeOrCornerZone(zone)){
      outcome=getEdgeZoneOutcome(zone,strikeCount,role,bd,ctBefore,strikesAtStart);
      handleSimOutcome(pitchNm,outcome);
    }else{
      let raw=simulateOutcome(zone,role,bd,ctBefore);
      raw=getContactSubOutcome(raw);
      outcome=applySimCountOutcome(raw,strikesAtStart);
      const prominent=outcome==='WALK'||outcome==='STRIKEOUT';
      const showLbl=(batterType!=='RANDOM')||batterRevealed;
      addSimLogEntry((showLbl?'['+getBatterSimLogLabel()+'] ':'')+pitchNm+' → '+outcome,outcome,prominent);
    }
    if(batterType==='RANDOM'&&!batterRevealed){
      const revealByPitch=pitchesInAtBat>=4;
      const revealByContact=['FOUL','GROUND OUT','POP FLY','SINGLE','DOUBLE','TRIPLE','HOME RUN'].includes(outcome);
      const revealByEnd=['WALK','STRIKEOUT'].includes(outcome);
      if(revealByPitch||revealByContact||revealByEnd){
        batterRevealed=true;
        addSimLogEntry('BATTER REVEALED: '+getBatterSimLogLabel(),'BATTER REVEALED',true);
      }
    }
    if(simInningLogPending){simInningLogPending=false;pushSimInningOver();}
  }
  commitPitch(makeCurve(pitch,zone,bd).getPoints(90).map(v=>v.clone()),pitch,zone,spd,bd,role,ctBefore,outcome);
}

function replaySeq(){
  if(!seq.length)return;
  pathObjs.forEach(o=>removeObj(o));pathObjs=[];landObjs.forEach(o=>scene.remove(o));landObjs=[];clearTunnels();
  let i=0;
  function next(){if(i>=seq.length){buildTunnels();return;}const s=seq[i++];const pts=s.pts3d.map(v=>new THREE.Vector3(v.x,v.y,v.z));pathObjs.push(line3D(pts,PITCHES[s.pk].color,0.88,3));animBall(pts,PITCHES[s.pk].color,PITCHES[s.pk].ms,()=>{addLanding(pts[pts.length-1],PITCHES[s.pk].color,s.spd,s.outcome);setTimeout(next,350);});}
  next();
}
function rebuildPaths(){
  pathObjs.forEach(o=>removeObj(o));pathObjs=[];landObjs.forEach(o=>scene.remove(o));landObjs=[];
  seq.forEach(s=>{const pts=s.pts3d.map(v=>new THREE.Vector3(v.x,v.y,v.z));pathObjs.push(line3D(pts,PITCHES[s.pk].color,0.88,3));addLanding(pts[pts.length-1],PITCHES[s.pk].color,s.spd,s.outcome);});
  buildTunnels();
}
function clearAll(){
  cancelSimScheduledClear();
  extendedAtBat=false;
  const btn=document.getElementById('extendbtn');
  if(btn){
    btn.textContent='EXTEND AT BAT';
    btn.classList.remove('active');
  }
  seq=[];simLog=[];outCount=0;inningNumber=1;simHalfTop=true;
  simInningBreak=false;simInningLogPending=false;pitchesInAtBat=0;batterRevealed=false;secretBatterType='';
  hideSimAdvanceButton();
  updateSimStatBar();
  pathObjs.forEach(o=>removeObj(o));pathObjs=[];landObjs.forEach(o=>scene.remove(o));landObjs=[];clearTunnels();updateSeqUI();updateSimLogUI();
  zone='MM';
  setTargetMode('ZONE');
  if(currentView==='side') drawSideView();
  clearSimStateSession();
}

function updateSeqUI(){
  const el=document.getElementById('seqlist');el.innerHTML='';
  seq.forEach((s,i)=>{
    const hex='#'+PITCHES[s.pk].color.toString(16).padStart(6,'0');
    const d=document.createElement('div');d.className='sitem';
    if(s.role==='PUTAWAY')d.style.background='rgba(239,68,68,0.06)';
    const isPitcher=PITCHER_COUNTS.includes(s.count);
    const isHitter=HITTER_COUNTS.includes(s.count);
    const r1=document.createElement('div');r1.className='srow1';
    r1.innerHTML=`<span style="color:${hex};font-size:10px;">&#9679;</span><span style="font-size:9px;color:#c8d8e8;flex:1;">${i+1}. ${PITCHES[s.pk].name}</span><span style="color:#5a8aaa;font-size:8px;">${s.spd} mph</span>`;
    const r2=document.createElement('div');r2.className='srow2';
    const ctCls='ctag'+(isPitcher?' pitcher':isHitter?' hitter':'');
    r2.innerHTML=`<span class="${ctCls}">${s.count}</span><span class="rtag rtag-${s.role}">${s.role}</span>`+(s.bd?'<span class="bdtag">BD</span>':'');
    d.appendChild(r1);d.appendChild(r2);el.appendChild(d);
  });
  document.getElementById('seqn').textContent=seq.length;
  const limitEl=document.getElementById('seqlimit');
  if(limitEl){
    if(simMode) limitEl.textContent='/∞';
    else limitEl.textContent=extendedAtBat?'/12':'/6';
  }
  const ew=document.getElementById('extendwrap');
  if(ew) ew.style.display=simMode?'none':'block';
}

let currentNotesOutcome='UNTESTED';

function showOpponentSuggestions(){
  const opps=getOpponents();
  renderOpponentSuggestions(opps);
}

function filterOpponentSuggestions(){
  const input=document.getElementById('planopp');
  if(!input)return;
  const val=input.value.toLowerCase();
  const opps=getOpponents().filter(o=>o.toLowerCase().includes(val));
  renderOpponentSuggestions(opps);
}

function renderOpponentSuggestions(opps){
  const box=document.getElementById('oppsuggest');
  if(!box)return;
  if(!opps.length){box.style.display='none';return;}
  box.innerHTML='';
  opps.forEach(o=>{
    const d=document.createElement('div');
    d.textContent=o;
    d.style.cssText='padding:5px 8px;font-size:9px;color:#8aabb8;cursor:pointer;font-family:DM Mono,monospace;';
    d.onmousedown=()=>{
      const input=document.getElementById('planopp');
      if(input) input.value=o;
      box.style.display='none';
    };
    d.onmouseover=()=>{d.style.background='#111e2e';};
    d.onmouseout=()=>{d.style.background='';};
    box.appendChild(d);
  });
  box.style.display='block';
}

function hideOpponentSuggestions(){
  setTimeout(()=>{
    const box=document.getElementById('oppsuggest');
    if(box) box.style.display='none';
  },200);
}

function filterPlansByOpponent(){
  refreshPlanDropdown();
}

function openNotesModal(){
  const planId=window.loadedPlanId;
  if(!planId)return;
  const plan=getSavedPlans().find(p=>p.id===planId);
  if(!plan)return;
  document.getElementById('notesplanname').textContent=(plan.name||'')+(plan.opponent?' · '+plan.opponent:'');
  document.getElementById('notesbaatter').value=plan.batterNotes||'';
  document.getElementById('notesgame').value=plan.gameNotes||'';
  currentNotesOutcome=plan.outcome||'UNTESTED';
  updateOutcomeBtns();
  document.getElementById('notesoverlay').style.display='flex';
}

function closeNotesModal(){
  const overlay=document.getElementById('notesoverlay');
  if(overlay) overlay.style.display='none';
}

function setOutcome(o){
  currentNotesOutcome=o;
  updateOutcomeBtns();
}

function updateOutcomeBtns(){
  document.querySelectorAll('.outcomebtn').forEach(b=>{
    b.classList.toggle('active',b.dataset.outcome===currentNotesOutcome);
  });
}

function saveNotes(){
  const planId=window.loadedPlanId;
  if(!planId)return;
  updatePlanField(planId,{
    batterNotes:document.getElementById('notesbaatter').value,
    gameNotes:document.getElementById('notesgame').value,
    outcome:currentNotesOutcome
  });
  closeNotesModal();
  refreshPlanDropdown(planId);
}

if(typeof toggleSimMode==='function'){
  const __origToggleSimMode=toggleSimMode;
  toggleSimMode=function(){
    const result=__origToggleSimMode.apply(this,arguments);
    updateSeqUI();
    return result;
  };
}

(function loop(){requestAnimationFrame(loop);renderer.render(scene,cam);})();

setCamera();
buildStatic();
buildZoneDiagram();
refreshGhost();
restoreSimState();
refreshPlanDropdown();
updateSimPanelVisibility();
updateSimStatBar();
updateSimLogUI();
initProfile();
setView('catcher');

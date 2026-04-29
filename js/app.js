let hand='R',pitch='4FB',zone='MM',rubber=0.5;
let tunnelOn=false,role='SETUP',batter='RHB';
let targetMode='ZONE';
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
  if(seq.length>=6)return;
  const col=PITCHES[pk].color;
  pathObjs.push(line3D(pts3d,col,0.88,3));
  animBall(pts3d,col,PITCHES[pk].ms,()=>addLanding(pts3d[pts3d.length-1],col,spd,outcome));
  seq.push({pk,zk,spd,bd,role:rl,count:ct,outcome:outcome||'',pts3d:pts3d.map(v=>v.clone())});
  updateSeqUI();buildTunnels();
  saveSimState();
}

function throwPitch(){
  if(seq.length>=6)return;
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
  seq=[];simLog=[];outCount=0;inningNumber=1;simHalfTop=true;
  simInningBreak=false;simInningLogPending=false;pitchesInAtBat=0;batterRevealed=false;secretBatterType='';
  hideSimAdvanceButton();
  updateSimStatBar();
  pathObjs.forEach(o=>removeObj(o));pathObjs=[];landObjs.forEach(o=>scene.remove(o));landObjs=[];clearTunnels();updateSeqUI();updateSimLogUI();
  zone='MM';
  setTargetMode('ZONE');
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

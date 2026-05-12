let hand='R',pitch='4FB',zone='MM',rubber=0.5;
let tunnelOn=false,role='SETUP',batter='RHB';
let targetMode='ZONE';
let extendedAtBat=false;
let currentView='catcher';
let knuckleballZoneDisabled=false;
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
function setBatter(b){batter=b;['LHB','OFF','RHB'].forEach(x=>document.getElementById('b'+x.toLowerCase()).classList.toggle('active',x===b));buildStatic();rebuildPaths();refreshGhost();if(typeof dismissBatterHandednessNotification==='function') dismissBatterHandednessNotification();}
function selPitch(p){
  pitch=p;
  document.querySelectorAll('.pbtn').forEach(b=>b.classList.remove('sel'));
  document.getElementById('p'+p).classList.add('sel');
  if(p==='KN'){
    // Knuckleball — force MM, disable zone controls
    zone='MM';
    if(targetMode!=='ZONE') setTargetMode('ZONE');
    const zeedge=document.getElementById('zeedge');
    if(zeedge) zeedge.classList.add('zebtn-disabled');
    const zezone=document.getElementById('zezone');
    if(zezone) zezone.classList.add('zebtn-disabled');
    knuckleballZoneDisabled=true;
  } else {
    // Any other pitch — re-enable zone controls
    const zeedge=document.getElementById('zeedge');
    if(zeedge) zeedge.classList.remove('zebtn-disabled');
    const zezone=document.getElementById('zezone');
    if(zezone) zezone.classList.remove('zebtn-disabled');
    knuckleballZoneDisabled=false;
  }
  rebuildTargetDiagram();
  refreshGhost();
}
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
  document.getElementById('vorbit').classList.toggle('active',v==='orbit');
  document.getElementById('c').style.display=v==='catcher'?'block':'none';
  document.getElementById('sideview').style.display=v==='side'?'block':'none';
  document.getElementById('orbitview').style.display=v==='orbit'?'block':'none';
  if(v==='side') drawSideView();
  if(v==='orbit') initOrbitView();
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

// ── Splash Screen ──
function initSplash(){
  const splash=document.getElementById('splashoverlay');
  if(!splash) return;

  // If profile already exists skip splash entirely
  const existingProfile=getProfile();
  const existingMode=getAppMode();
  if(existingProfile||existingMode){
    splash.classList.add('hidden');
    if(existingMode==='team') initTeamMode();
    return;
  }

  // Play splash animation
  playSplashAnimation();
}

function playSplashAnimation(){
  const s1=document.getElementById('splash-s1');
  const s2=document.getElementById('splash-s2');
  const s3=document.getElementById('splash-s3');

  // Step 1: tagline fades in
  setTimeout(()=>{s1.classList.add('visible');},200);
  // Step 1: tagline fades out
  setTimeout(()=>{s1.classList.remove('visible');},2200);
  // Step 2: logo fades in
  setTimeout(()=>{s2.classList.add('visible');},3000);
  // Step 2: logo fades out
  setTimeout(()=>{s2.classList.remove('visible');},5000);
  // Step 3: app icon + mode selection fades in
  setTimeout(()=>{s3.classList.add('visible');},5800);
}

function skipSplash(){
  const s1=document.getElementById('splash-s1');
  const s2=document.getElementById('splash-s2');
  const s3=document.getElementById('splash-s3');
  if(s1) s1.classList.remove('visible');
  if(s2) s2.classList.remove('visible');
  if(s3) s3.classList.add('visible');
}

function chooseSplashMode(mode){
  setAppMode(mode);
  document.getElementById('splashoverlay').classList.add('hidden');
  if(mode==='team'){
    initTeamMode();
    openProfileOverlay(true);
  } else {
    openProfileOverlay(false);
  }
}

// ── Team Mode ──
function initTeamMode(){
  const pill=document.getElementById('activepitcherpill');
  const rosterSection=document.getElementById('rosterSection');
  const editProfileBtn=document.getElementById('editProfileBtn');
  if(pill) pill.classList.add('visible');
  if(rosterSection) rosterSection.classList.add('visible');
  if(editProfileBtn) editProfileBtn.style.display='none';
  updateActivePitcherPill();
}

function updateActivePitcherPill(){
  const pill=document.getElementById('activepitcherpill');
  if(!pill) return;
  const pitcher=getActivePitcher();
  if(pitcher){
    pill.textContent='⚾ '+pitcher.name.toUpperCase();
  }
}

function openRosterFromPill(){
  openSettingsModal();
  renderRosterList();
}

function renderRosterList(){
  const list=document.getElementById('rosterList');
  const addBtn=document.getElementById('rosterAddBtn');
  if(!list) return;
  const roster=getRoster();
  const activeId=getActivePitcherId();
  list.innerHTML='';

  if(!roster.length){
    list.innerHTML='<div style="font-family:DM Mono,monospace;font-size:9px;color:var(--text-muted);padding:8px 0;">No pitchers added yet.</div>';
  }

  roster.forEach(pitcher=>{
    const item=document.createElement('div');
    item.className='roster-item'+(pitcher.id===activeId?' active':'');

    const info=document.createElement('div');
    info.style.flex='1';
    info.style.cursor='pointer';
    info.onclick=()=>switchToPitcher(pitcher.id);

    const name=document.createElement('div');
    name.className='roster-item-name';
    name.textContent=pitcher.name;

    const meta=document.createElement('div');
    meta.className='roster-item-meta';
    const hand=pitcher.hand==='R'?'RHP':'LHP';
    const age=pitcher.ageGroup||'';
    meta.textContent=hand+(age?' · '+age:'');

    info.appendChild(name);
    info.appendChild(meta);

    const del=document.createElement('button');
    del.className='roster-item-delete';
    del.textContent='✕';
    del.title='Remove pitcher';
    del.onclick=(e)=>{
      e.stopPropagation();
      deletePitcherConfirm(pitcher.id,pitcher.name);
    };

    item.appendChild(info);
    item.appendChild(del);
    list.appendChild(item);
  });

  if(addBtn) addBtn.disabled=roster.length>=10;
}

function switchToPitcher(id){
  const current=getActivePitcherId();
  if(current===id){
    closeSettingsModal();
    return;
  }
  if(seq&&seq.length>0){
    if(!confirm('Switch pitcher? The current sequence will be cleared.')) return;
    clearAll();
  }
  setActivePitcherId(id);
  const pitcher=getRoster().find(p=>p.id===id);
  if(pitcher){
    saveProfile(pitcher);
    applyProfile(pitcher);
  }
  updateActivePitcherPill();
  renderRosterList();
  refreshPlanDropdown('');
  closeSettingsModal();
}

function deletePitcherConfirm(id,name){
  if(!confirm('Remove '+name+' from roster? Their saved plans will remain but will be unassigned.')) return;
  deletePitcherFromRoster(id);
  renderRosterList();
  updateActivePitcherPill();
}

function openAddPitcherFromSettings(){
  closeSettingsModal();
  openProfileOverlay(true);
}

function saveAndAddAnotherPitcher(){
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
  const roster=getRoster();
  if(roster.length>=10){
    document.getElementById('profileerror').textContent='Roster is full (10 pitchers maximum)';
    return;
  }
  const newId=addPitcherToRoster(profile);
  if(!getActivePitcherId()) setActivePitcherId(newId);
  saveProfile(profile);
  applyProfile(profile);

  // Reset form for next pitcher
  document.getElementById('prof-name').value='';
  profHand='R';
  profSetHand('R');
  profSelectedPitches=['4FB','CH'];
  document.getElementById('prof-age').value='youth';
  document.getElementById('profileerror').textContent='';
  buildArsenalGrid();
  document.getElementById('profilesubtitle').textContent='Add another pitcher to your roster';
}

function openProfileOverlay(isTeamMode){
  const profile=getProfile();
  const overlay=document.getElementById('profileoverlay');
  const addAnotherBtn=document.getElementById('profaddanotherbtn');
  const cancelBtn=document.getElementById('profcancelbtn');
  const mode=isTeamMode!=null?isTeamMode:(getAppMode()==='team');

  document.getElementById('profileerror').textContent='';

  if(addAnotherBtn) addAnotherBtn.style.display=mode?'block':'none';
  if(cancelBtn) cancelBtn.style.display=profile?'block':'none';

  if(profile){
    document.getElementById('prof-name').value=profile.name||'';
    profHand=profile.hand||'R';
    profSetHand(profHand);
    document.getElementById('prof-age').value=profile.ageGroup||'youth';
    profSelectedPitches=[...(profile.arsenal||['4FB','CH'])];
    document.getElementById('profilesubtitle').textContent=mode?'Manage your roster':'Update your profile';
    document.getElementById('profsavebtn').textContent='SAVE PROFILE';
    document.getElementById('profileeditlbl').style.display='block';
  } else {
    profHand='R';
    profSetHand('R');
    profSelectedPitches=['4FB','CH'];
    document.getElementById('prof-name').value='';
    document.getElementById('prof-age').value='youth';
    document.getElementById('profilesubtitle').textContent=mode?'Add your first pitcher':'Set up your profile to get started';
    document.getElementById('profsavebtn').textContent=mode?'SAVE PITCHER':'START PITCHING';
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
  const mode=getAppMode();

  if(mode==='team'){
    const roster=getRoster();
    const activeId=getActivePitcherId();
    if(activeId){
      updatePitcherInRoster(activeId,profile);
    } else {
      const newId=addPitcherToRoster(profile);
      setActivePitcherId(newId);
    }
    updateActivePitcherPill();
  }

  saveProfile(profile);
  applyProfile(profile);
  closeProfileOverlay();
  refreshPlanDropdown('');
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
  const xOff=isRHB?-0.52:0.52;
  const zOff=0.15;
  const gnd=-0.273;
  const S=2.21;

  const mat=(color,opacity)=>new THREE.MeshBasicMaterial({
    color,transparent:true,opacity,depthWrite:false
  });

  const armDir=isRHB?1:-1;

  // Build bottom-up. Foot top = gnd+0.21*S, work upward continuously.
  // feet
  const footMat=mat(0xeeeeee,0.65);
  const frontLegX=isRHB?-0.030*S:0.030*S;
  const backLegX=isRHB?0.030*S:-0.030*S;

  const footFront=new THREE.Mesh(
    new THREE.BoxGeometry(0.048*S,0.025*S,0.082*S),footMat
  );
  footFront.position.set(xOff+frontLegX,gnd+0.200*S,zOff+0.028*S);
  add(footFront);

  const footBack=new THREE.Mesh(
    new THREE.BoxGeometry(0.048*S,0.025*S,0.082*S),footMat
  );
  footBack.position.set(xOff+backLegX,gnd+0.200*S,zOff-0.022*S);
  add(footBack);

  // lower legs — base at gnd+0.213*S, height 0.160*S, top at gnd+0.373*S
  const legMat=mat(0x111111,0.58);

  const lowerLegFront=new THREE.Mesh(
    new THREE.CylinderGeometry(0.020*S,0.018*S,0.160*S,8),legMat
  );
  lowerLegFront.position.set(xOff+frontLegX,gnd+0.293*S,zOff+0.020*S);
  lowerLegFront.rotation.x=-0.05;
  add(lowerLegFront);

  const lowerLegBack=new THREE.Mesh(
    new THREE.CylinderGeometry(0.020*S,0.018*S,0.160*S,8),legMat
  );
  lowerLegBack.position.set(xOff+backLegX,gnd+0.293*S,zOff-0.020*S);
  add(lowerLegBack);

  // upper legs — base at gnd+0.373*S, height 0.180*S, top at gnd+0.553*S
  const upperLegFront=new THREE.Mesh(
    new THREE.CylinderGeometry(0.025*S,0.023*S,0.180*S,8),legMat
  );
  upperLegFront.position.set(xOff+frontLegX,gnd+0.463*S,zOff+0.025*S);
  upperLegFront.rotation.x=-0.10;
  add(upperLegFront);

  const upperLegBack=new THREE.Mesh(
    new THREE.CylinderGeometry(0.025*S,0.023*S,0.180*S,8),legMat
  );
  upperLegBack.position.set(xOff+backLegX,gnd+0.463*S,zOff-0.025*S);
  upperLegBack.rotation.x=0.08;
  add(upperLegBack);

  // hips — center at gnd+0.553*S, height 0.065*S, top at gnd+0.585*S
  const hips=new THREE.Mesh(
    new THREE.BoxGeometry(0.105*S,0.065*S,0.075*S),
    mat(0x111111,0.58)
  );
  hips.position.set(xOff,gnd+0.553*S,zOff);
  add(hips);

  const belt=new THREE.Mesh(
    new THREE.BoxGeometry(0.108*S,0.012*S,0.076*S),
    mat(0x222222,0.68)
  );
  belt.position.set(xOff,gnd+0.588*S,zOff);
  add(belt);

  // abdomen — center at gnd+0.630*S, height 0.085*S, top at gnd+0.673*S
  const abdomen=new THREE.Mesh(
    new THREE.BoxGeometry(0.095*S,0.085*S,0.072*S),
    mat(0x2563eb,0.55)
  );
  abdomen.position.set(xOff,gnd+0.630*S,zOff);
  add(abdomen);

  // chest — center at gnd+0.743*S, height 0.14*S, top at gnd+0.813*S
  const chest=new THREE.Mesh(
    new THREE.BoxGeometry(0.10*S,0.14*S,0.075*S),
    mat(0x2563eb,0.55)
  );
  chest.position.set(xOff,gnd+0.743*S,zOff);
  add(chest);

  const numPatch=new THREE.Mesh(
    new THREE.BoxGeometry(0.030*S,0.038*S,0.002),
    mat(0xffffff,0.75)
  );
  numPatch.position.set(xOff,gnd+0.750*S,zOff-0.040*S);
  add(numPatch);

  // neck — base at gnd+0.813*S, height 0.048*S, top at gnd+0.861*S
  const neck=new THREE.Mesh(
    new THREE.CylinderGeometry(0.016*S,0.020*S,0.048*S,8),
    mat(0xc68642,0.55)
  );
  neck.position.set(xOff,gnd+0.837*S,zOff);
  add(neck);

  // head — center at gnd+0.900*S
  const head=new THREE.Mesh(
    new THREE.SphereGeometry(0.042*S,12,12),
    mat(0xc68642,0.55)
  );
  head.position.set(xOff,gnd+0.900*S,zOff);
  add(head);

  const helmet=new THREE.Mesh(
    new THREE.SphereGeometry(0.050*S,12,8),
    mat(0x6eb5e4,0.65)
  );
  helmet.position.set(xOff,gnd+0.918*S,zOff-0.005);
  helmet.scale.set(1,1.08,1);
  add(helmet);

  const brim=new THREE.Mesh(
    new THREE.CylinderGeometry(0.048*S,0.048*S,0.008,12),
    mat(0x6eb5e4,0.65)
  );
  brim.position.set(xOff,gnd+0.880*S,zOff+0.040*S);
  brim.rotation.x=Math.PI/2;
  add(brim);

  // arms — positioned at chest/shoulder level
  const armMat=mat(0x2563eb,0.42);
  const gloveMat=mat(0x222222,0.65);

  const armBack=new THREE.Mesh(
    new THREE.CylinderGeometry(0.016*S,0.014*S,0.115*S,8),armMat
  );
  armBack.position.set(xOff+armDir*0.055*S,gnd+0.775*S,zOff-0.030*S);
  armBack.rotation.z=armDir*0.45;
  armBack.rotation.x=0.20;
  add(armBack);

  const armFront=new THREE.Mesh(
    new THREE.CylinderGeometry(0.016*S,0.014*S,0.100*S,8),armMat
  );
  armFront.position.set(xOff+armDir*0.050*S,gnd+0.793*S,zOff-0.022*S);
  armFront.rotation.z=armDir*0.38;
  armFront.rotation.x=0.15;
  add(armFront);

  const glove1=new THREE.Mesh(
    new THREE.SphereGeometry(0.020*S,8,8),gloveMat
  );
  glove1.position.set(xOff+armDir*0.100*S,gnd+0.820*S,zOff-0.048*S);
  add(glove1);

  const glove2=new THREE.Mesh(
    new THREE.SphereGeometry(0.020*S,8,8),gloveMat
  );
  glove2.position.set(xOff+armDir*0.105*S,gnd+0.835*S,zOff-0.042*S);
  add(glove2);

  // bat
  const batMat=mat(0x1a1a1a,0.75);
  const pineTarMat=mat(0x6b3a1f,0.75);

  const batBarrel=new THREE.Mesh(
    new THREE.CylinderGeometry(0.011*S,0.018*S,0.195*S,8),batMat
  );
  batBarrel.position.set(
    xOff+armDir*0.132*S,
    gnd+0.915*S,
    zOff-0.058*S
  );
  batBarrel.rotation.z=armDir*0.42;
  batBarrel.rotation.x=0.28;
  add(batBarrel);

  const batHandle=new THREE.Mesh(
    new THREE.CylinderGeometry(0.009*S,0.011*S,0.105*S,8),pineTarMat
  );
  batHandle.position.set(
    xOff+armDir*0.108*S,
    gnd+0.837*S,
    zOff-0.042*S
  );
  batHandle.rotation.z=armDir*0.42;
  batHandle.rotation.x=0.28;
  add(batHandle);

  const batKnob=new THREE.Mesh(
    new THREE.SphereGeometry(0.012*S,8,8),batMat
  );
  batKnob.position.set(
    xOff+armDir*0.100*S,
    gnd+0.813*S,
    zOff-0.032*S
  );
  add(batKnob);

  // batter's box outline
  const boxW=0.48,boxD=0.78,boxY=gnd+0.01;
  const bxPts=[
    new THREE.Vector3(xOff-boxW/2,boxY,zOff-boxD*0.42),
    new THREE.Vector3(xOff+boxW/2,boxY,zOff-boxD*0.42),
    new THREE.Vector3(xOff+boxW/2,boxY,zOff+boxD*0.58),
    new THREE.Vector3(xOff-boxW/2,boxY,zOff+boxD*0.58),
    new THREE.Vector3(xOff-boxW/2,boxY,zOff-boxD*0.42),
  ];
  add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(bxPts),
    new THREE.LineBasicMaterial({color:0xaabbcc,opacity:0.22,transparent:true})
  ));
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
  const plateY=CLO_Y-0.08;
  const pp=[
    new THREE.Vector3(-ZW/2, plateY,  0.18),
    new THREE.Vector3( ZW/2, plateY,  0.18),
    new THREE.Vector3( ZW/2, plateY,  0.05),
    new THREE.Vector3(     0, plateY, -0.15),
    new THREE.Vector3(-ZW/2, plateY,  0.05),
    new THREE.Vector3(-ZW/2, plateY,  0.18),
  ];
  add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pp),new THREE.LineBasicMaterial({color:0xffffff,opacity:0.85,transparent:true})));
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
  // Detect tunnel against all previous pitches and store best tunnel found
  let tunnelData={detected:false,length:0,prevIndex:-1,prevPk:'',prevSpd:0};
  if(seq.length>0){
    const n=pts3d.length;
    const s0=Math.floor(n*TUNNEL_START);
    const s1=Math.floor(n*TUNNEL_END);
    const windowSize=s1-s0;
    let bestTunnel={detected:false,length:0,prevIndex:-1,prevPk:'',prevSpd:0};
    for(let si=seq.length-1;si>=Math.max(0,seq.length-3);si--){
      const prev=seq[si];
      if(!prev.pts3d||!prev.pts3d.length) continue;
      let tunnelPoints=0;
      for(let i=s0;i<s1;i++){
        const pA=pts3d[i];
        const pB=prev.pts3d[Math.min(i,prev.pts3d.length-1)];
        if(pA&&pB&&pA.distanceTo(pB)<=TUNNEL_THRESH) tunnelPoints++;
      }
      const tunnelLength=windowSize>0?tunnelPoints/windowSize:0;
      if(tunnelLength>0.10&&tunnelLength>bestTunnel.length){
        bestTunnel={
          detected:true,
          length:tunnelLength,
          prevIndex:si,
          prevPk:prev.pk,
          prevSpd:prev.spd
        };
      }
    }
    tunnelData=bestTunnel;
  }
  seq.push({pk,zk,spd,bd,role:rl,count:ct,outcome:outcome||'',pts3d:pts3d.map(v=>v.clone()),tunnelData});
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

  // Courage pitch and danger zone log — runs after every pitch
  if(simMode){
    const clm=window.__lastCountLocMod;
    console.log('COURAGE DEBUG end of throwPitch: clm=',clm,'outcome=',outcome,'count=',ctBefore);
    if(clm){
      if(clm.isCourage){
        if(['SWING & MISS','STRIKEOUT','CALLED STRIKE','FOUL'].includes(outcome)){
          addSimLogEntry('COURAGE PITCH — unexpected location paid off',outcome,false);
        } else if(outcome==='WALK'){
          addSimLogEntry('COURAGE PITCH — brave call, work on command',outcome,false);
        }
      }
      if(clm.isDanger&&['SINGLE','DOUBLE','TRIPLE','HOME RUN','GROUND OUT','POP FLY'].includes(outcome)){
        addSimLogEntry('DANGER ZONE — batter was sitting on that location',outcome,false);
      }
      window.__lastCountLocMod=null;
    }
  }
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

// ── ORBIT VIEW ENGINE ──
let orbitRenderer=null;
let orbitScene=null;
let orbitCamera=null;
let orbitControls=null;
let orbitAnimFrame=null;
let orbitPitchIndex=-1;
let orbitPlaying=false;
let orbitPlayTimer=null;
let orbitIsolation=[];
let orbitTunnelClusters=[];
let orbitTunnelClusterIndex=0;
let orbitBallMesh=null;
let orbitBallAnimTimer=null;
let orbitPlayMode=false;
let orbitStaticPaths=[];
let orbitStaticOrbs=[];
let orbitStaticTunnels=[];
let orbitDrawnPitchIndices=[];

function initOrbitView(){
  const container=document.getElementById('orbitview');
  const canvas=document.getElementById('orbitcanvas');
  if(!container||!canvas) return;

  // Size canvas to container
  const W=container.clientWidth||760;
  const H=container.clientHeight||560;

  // Initialize renderer once
  if(!orbitRenderer){
    orbitRenderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
    orbitRenderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    orbitRenderer.setClearColor(0x0a0e1a,1);
  }
  orbitRenderer.setSize(W,H);

  // Scene
  orbitScene=new THREE.Scene();
  orbitScene.background=new THREE.Color(0x0a0e1a);

  // Camera — start from catcher perspective looking toward mound
  orbitCamera=new THREE.PerspectiveCamera(52,W/H,0.01,100);
  orbitCamera.position.set(0,1.06,-1.2);
  orbitCamera.lookAt(0,1.06,10);

  // OrbitControls
  orbitControls=new THREE.OrbitControls(orbitCamera,canvas);
  orbitControls.target.set(0,1.06,5);
  orbitControls.enableDamping=true;
  orbitControls.dampingFactor=0.08;
  orbitControls.minDistance=0.5;
  orbitControls.maxDistance=25;
  orbitControls.enablePan=true;
  orbitControls.panSpeed=0.8;
  orbitControls.rotateSpeed=0.6;
  orbitControls.zoomSpeed=1.0;
  orbitControls.touches={
    ONE:THREE.TOUCH.ROTATE,
    TWO:THREE.TOUCH.DOLLY_PAN
  };
  orbitControls.update();

  // Initialize isolation to all pitches visible
  orbitIsolation=seq.map((_,i)=>i);
  orbitPitchIndex=-1;

  // Detect tunnel clusters (before scene so highlights can render)
  detectOrbitTunnels();

  // Build scene contents
  buildOrbitScene();

  // Build toolbar
  buildOrbitToolbar();

  // Start render loop
  if(orbitAnimFrame) cancelAnimationFrame(orbitAnimFrame);
  orbitLoop();

  // Handle resize
  window.addEventListener('resize',onOrbitResize);
}

function onOrbitResize(){
  if(currentView!=='orbit') return;
  const container=document.getElementById('orbitview');
  if(!container||!orbitRenderer||!orbitCamera) return;
  const W=container.clientWidth;
  const H=container.clientHeight;
  orbitRenderer.setSize(W,H);
  orbitCamera.aspect=W/H;
  orbitCamera.updateProjectionMatrix();
}

function orbitLoop(){
  orbitAnimFrame=requestAnimationFrame(orbitLoop);
  if(orbitControls) orbitControls.update();
  if(orbitRenderer&&orbitScene&&orbitCamera){
    orbitRenderer.render(orbitScene,orbitCamera);
  }
}

function buildOrbitScene(){
  if(!orbitScene) return;
  while(orbitScene.children.length>0) orbitScene.remove(orbitScene.children[0]);
  orbitStaticPaths=[];
  orbitStaticOrbs=[];
  orbitStaticTunnels=[];
  orbitScene.add(new THREE.AmbientLight(0xffffff,0.8));
  buildOrbitStrikeZone();
  buildOrbitHomePlate();
  buildOrbitMound();
  buildOrbitBatter();
  if(!orbitPlayMode){
    buildOrbitPitchPaths();
    buildOrbitLandingOrbs();
    buildOrbitTunnelHighlights();
  }
}

function buildOrbitStrikeZone(){
  const mat=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.85});
  const pts=[
    new THREE.Vector3(-0.24,1.37,0.12),
    new THREE.Vector3(0.24,1.37,0.12),
    new THREE.Vector3(0.24,0.75,0.12),
    new THREE.Vector3(-0.24,0.75,0.12),
    new THREE.Vector3(-0.24,1.37,0.12)
  ];
  const geo=new THREE.BufferGeometry().setFromPoints(pts);
  orbitScene.add(new THREE.Line(geo,mat));

  // Zone grid lines
  const gridMat=new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.6});
  const vLines=[[-0.08,0.75,0.12,-0.08,1.37,0.12],[0.08,0.75,0.12,0.08,1.37,0.12]];
  const hLines=[[-0.24,0.957,0.12,0.24,0.957,0.12],[-0.24,1.163,0.12,0.24,1.163,0.12]];
  [...vLines,...hLines].forEach(([x1,y1,z1,x2,y2,z2])=>{
    const g=new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1,y1,z1),new THREE.Vector3(x2,y2,z2)
    ]);
    orbitScene.add(new THREE.Line(g,gridMat));
  });
}

function buildOrbitHomePlate(){
  const shape=new THREE.Shape();
  shape.moveTo(-0.215,0);shape.lineTo(0.215,0);
  shape.lineTo(0.215,0.12);shape.lineTo(0,0.30);
  shape.lineTo(-0.215,0.12);shape.closePath();
  const geo=new THREE.ShapeGeometry(shape);
  const mat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.85,side:THREE.DoubleSide});
  const plate=new THREE.Mesh(geo,mat);
  plate.rotation.x=-Math.PI/2;
  plate.position.set(0,0.01,0);
  orbitScene.add(plate);
}

function buildOrbitMound(){
  const geo=new THREE.CylinderGeometry(0.4,0.5,0.25,16);
  const mat=new THREE.MeshBasicMaterial({color:0x3a2a1a,transparent:true,opacity:0.7});
  const mound=new THREE.Mesh(geo,mat);
  mound.position.set(0,0.125,17);
  orbitScene.add(mound);

  // Rubber
  const rubberGeo=new THREE.BoxGeometry(0.6,0.05,0.15);
  const rubberMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.9});
  const rubber=new THREE.Mesh(rubberGeo,rubberMat);
  rubber.position.set(0,0.275,17.1);
  orbitScene.add(rubber);
}

function buildOrbitBatter(){
  // Batter silhouette using simple geometry
  const batMat=new THREE.MeshBasicMaterial({color:0x1a3a5a,transparent:true,opacity:0.55,side:THREE.DoubleSide});

  // Determine batter side
  const isLHB=(typeof batter!=='undefined'&&batter==='LHB');
  const sideX=isLHB?-0.45:0.45;

  // Body
  const bodyGeo=new THREE.CylinderGeometry(0.12,0.14,0.7,8);
  const body=new THREE.Mesh(bodyGeo,batMat);
  body.position.set(sideX,0.75,0.05);
  orbitScene.add(body);

  // Head
  const headGeo=new THREE.SphereGeometry(0.12,8,8);
  const head=new THREE.Mesh(headGeo,batMat);
  head.position.set(sideX,1.17,0.05);
  orbitScene.add(head);

  // Helmet brim
  const brimGeo=new THREE.CylinderGeometry(0.14,0.14,0.04,8);
  const brim=new THREE.Mesh(brimGeo,batMat);
  brim.position.set(sideX+(isLHB?-0.06:0.06),1.22,0.05);
  orbitScene.add(brim);

  // Legs
  [-0.06,0.06].forEach(ox=>{
    const legGeo=new THREE.CylinderGeometry(0.06,0.06,0.45,6);
    const leg=new THREE.Mesh(legGeo,batMat);
    leg.position.set(sideX+ox,0.225,0.05);
    orbitScene.add(leg);
  });

  // Bat
  const batGeo=new THREE.CylinderGeometry(0.02,0.035,0.85,6);
  const batMesh=new THREE.Mesh(batGeo,new THREE.MeshBasicMaterial({color:0x8b4513,transparent:true,opacity:0.8}));
  batMesh.rotation.z=isLHB?Math.PI/6:-Math.PI/6;
  batMesh.rotation.x=-Math.PI/5;
  batMesh.position.set(isLHB?sideX-0.15:sideX+0.15,1.35,0.18);
  orbitScene.add(batMesh);
}

function buildOrbitPitchPaths(){
  if(!seq.length) return;
  seq.forEach((s,i)=>{
    if(!orbitIsolation.includes(i)) return;
    const col=PITCHES[s.pk].color;
    const pts=s.pts3d.map(v=>new THREE.Vector3(v.x,v.y,v.z));
    const mat=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.85,linewidth:2});
    const geo=new THREE.BufferGeometry().setFromPoints(pts);
    orbitScene.add(new THREE.Line(geo,mat));
  });
}

function buildOrbitLandingOrbs(){
  if(!seq.length) return;
  seq.forEach((s,i)=>{
    if(!orbitIsolation.includes(i)) return;
    const col=PITCHES[s.pk].color;
    const pts=s.pts3d;
    if(!pts||!pts.length) return;
    const last=pts[pts.length-1];
    const pos=new THREE.Vector3(last.x,last.y,last.z);
    const geo=new THREE.SphereGeometry(0.055,10,10);
    const mat=new THREE.MeshBasicMaterial({color:col,wireframe:true,transparent:true,opacity:0.6});
    const orb=new THREE.Mesh(geo,mat);
    orb.position.copy(pos);
    orbitScene.add(orb);

    // Pitch number label
    const tc=document.createElement('canvas');
    tc.width=48;tc.height=48;
    const tx=tc.getContext('2d');
    tx.fillStyle='#'+col.toString(16).padStart(6,'0');
    tx.beginPath();tx.arc(24,24,22,0,Math.PI*2);tx.fill();
    tx.fillStyle='#ffffff';tx.textAlign='center';tx.textBaseline='middle';
    tx.font='bold 20px sans-serif';tx.fillText(String(i+1),24,24);
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({
      map:new THREE.CanvasTexture(tc),transparent:true,opacity:0.95
    }));
    spr.scale.set(0.08,0.08,1);
    spr.position.copy(pos);
    spr.position.y+=0.08;
    orbitScene.add(spr);
  });
}

function orbitDrawSinglePath(pitchIdx){
  if(!orbitScene) return;
  const s=seq[pitchIdx];
  if(!s||!s.pts3d||!s.pts3d.length) return;
  const col=PITCHES[s.pk].color;
  const pts=s.pts3d.map(v=>new THREE.Vector3(v.x,v.y,v.z));
  const mat=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.85,linewidth:2});
  const geo=new THREE.BufferGeometry().setFromPoints(pts);
  const line=new THREE.Line(geo,mat);
  orbitScene.add(line);
  orbitStaticPaths.push(line);
  const last=pts[pts.length-1];
  const orbGeo=new THREE.SphereGeometry(0.025,12,12);
  const orbMat=new THREE.MeshBasicMaterial({color:col,wireframe:true,transparent:true,opacity:0.6});
  const orb=new THREE.Mesh(orbGeo,orbMat);
  orb.position.copy(last);
  orbitScene.add(orb);
  orbitStaticOrbs.push(orb);
  const tc=document.createElement('canvas');
  tc.width=48;tc.height=48;
  const tx=tc.getContext('2d');
  tx.fillStyle='#'+col.toString(16).padStart(6,'0');
  tx.beginPath();tx.arc(24,24,22,0,Math.PI*2);tx.fill();
  tx.fillStyle='#ffffff';tx.textAlign='center';tx.textBaseline='middle';
  tx.font='bold 20px sans-serif';tx.fillText(String(pitchIdx+1),24,24);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({
    map:new THREE.CanvasTexture(tc),transparent:true,opacity:0.95
  }));
  spr.scale.set(0.08,0.08,1);
  spr.position.copy(last);
  spr.position.y+=0.08;
  orbitScene.add(spr);
  orbitStaticOrbs.push(spr);
}

function orbitDrawTunnelBetween(idxA,idxB){
  if(!orbitScene) return;
  const ptsA=seq[idxA]&&seq[idxA].pts3d;
  const ptsB=seq[idxB]&&seq[idxB].pts3d;
  if(!ptsA||!ptsB) return;
  const n=Math.min(ptsA.length,ptsB.length);
  const s0=Math.floor(n*0.15);
  const s1=Math.floor(n*0.72);
  let tunnelPts=[];
  for(let i=s0;i<s1;i++){
    const pA=ptsA[i];
    const pB=ptsB[Math.min(i,ptsB.length-1)];
    if(!pA||!pB) continue;
    if(pA.distanceTo(pB)<=0.2032){
      tunnelPts.push(new THREE.Vector3(
        (pA.x+pB.x)/2,(pA.y+pB.y)/2,(pA.z+pB.z)/2
      ));
    } else if(tunnelPts.length>3) break;
  }
  if(tunnelPts.length<3) return;
  const curve=new THREE.CatmullRomCurve3(tunnelPts);
  const glowMat=new THREE.LineBasicMaterial({color:0xeab308,transparent:true,opacity:0.12,linewidth:12});
  const glowLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(tunnelPts),glowMat);
  orbitScene.add(glowLine);
  orbitStaticTunnels.push(glowLine);
  const innerMat=new THREE.LineBasicMaterial({color:0xfde047,transparent:true,opacity:0.6,linewidth:4});
  const innerLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(tunnelPts),innerMat);
  orbitScene.add(innerLine);
  orbitStaticTunnels.push(innerLine);
  const tubeGeo=new THREE.TubeGeometry(curve,tunnelPts.length*2,0.035,8,false);
  const tubeMat=new THREE.MeshBasicMaterial({color:0xeab308,transparent:true,opacity:0.18,side:THREE.DoubleSide,depthWrite:false});
  const tube=new THREE.Mesh(tubeGeo,tubeMat);
  orbitScene.add(tube);
  orbitStaticTunnels.push(tube);
  const wireMat=new THREE.MeshBasicMaterial({color:0xfde047,transparent:true,opacity:0.35,wireframe:true,depthWrite:false});
  const wire=new THREE.Mesh(new THREE.TubeGeometry(curve,tunnelPts.length*2,0.035,8,false),wireMat);
  orbitScene.add(wire);
  orbitStaticTunnels.push(wire);
  const ep=tunnelPts[tunnelPts.length-1];
  const ring=new THREE.Mesh(
    new THREE.TorusGeometry(0.06,0.008,8,24),
    new THREE.MeshBasicMaterial({color:0xeab308,transparent:true,opacity:0.9})
  );
  ring.position.copy(ep);
  orbitScene.add(ring);
  orbitStaticTunnels.push(ring);
  const sphere=new THREE.Mesh(
    new THREE.SphereGeometry(0.04,10,10),
    new THREE.MeshBasicMaterial({color:0xfde047,transparent:true,opacity:0.7,wireframe:true})
  );
  sphere.position.copy(ep);
  orbitScene.add(sphere);
  orbitStaticTunnels.push(sphere);
  const tc=document.createElement('canvas');
  tc.width=160;tc.height=40;
  const tx=tc.getContext('2d');
  tx.fillStyle='rgba(234,179,8,0.85)';
  tx.beginPath();
  if(tx.roundRect) tx.roundRect(2,2,156,36,6);
  else tx.rect(2,2,156,36);
  tx.fill();
  tx.fillStyle='#1a1500';
  tx.font='bold 14px DM Mono,monospace';
  tx.textAlign='center';tx.textBaseline='middle';
  tx.fillText('DECISION POINT',80,20);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({
    map:new THREE.CanvasTexture(tc),transparent:true,opacity:0.95
  }));
  spr.scale.set(0.22,0.055,1);
  spr.position.copy(ep);
  spr.position.y+=0.12;
  orbitScene.add(spr);
  orbitStaticTunnels.push(spr);
}

function buildOrbitTunnelHighlights(){
  if(!orbitTunnelClusters||!orbitTunnelClusters.length) return;
  orbitTunnelClusters.forEach(cluster=>{
    if(!cluster||!cluster.length) return;
    const pts=cluster.map(p=>new THREE.Vector3(p.x,p.y,p.z));
    // Outer glow
    const glowMat=new THREE.LineBasicMaterial({color:0xeab308,transparent:true,opacity:0.15,linewidth:8});
    const glowGeo=new THREE.BufferGeometry().setFromPoints(pts);
    orbitScene.add(new THREE.Line(glowGeo,glowMat));
    // Inner line
    const innerMat=new THREE.LineBasicMaterial({color:0xfde047,transparent:true,opacity:0.55,linewidth:3});
    const innerGeo=new THREE.BufferGeometry().setFromPoints(pts);
    orbitScene.add(new THREE.Line(innerGeo,innerMat));
  });
}

function detectOrbitTunnels(){
  orbitTunnelClusters=[];
  if(!seq||seq.length<2) return;
  for(let a=0;a<seq.length-1;a++){
    for(let b=a+1;b<seq.length;b++){
      const ptsA=seq[a].pts3d;
      const ptsB=seq[b].pts3d;
      if(!ptsA||!ptsB) continue;
      const n=Math.min(ptsA.length,ptsB.length);
      const s0=Math.floor(n*0.15);
      const s1=Math.floor(n*0.72);
      let tunnelPts=[];
      for(let i=s0;i<s1;i++){
        const pA=ptsA[i];
        const pB=ptsB[Math.min(i,ptsB.length-1)];
        if(!pA||!pB) continue;
        // 8 inch = 0.2032 meters threshold
        if(pA.distanceTo(pB)<=0.2032){
          tunnelPts.push({
            x:(pA.x+pB.x)/2,
            y:(pA.y+pB.y)/2,
            z:(pA.z+pB.z)/2
          });
        } else if(tunnelPts.length>3){
          break;
        }
      }
      if(tunnelPts.length>=3) orbitTunnelClusters.push(tunnelPts);
    }
  }
}

function buildOrbitToolbar(){
  // Isolation checkboxes
  const row=document.getElementById('orbitIsolationRow');
  if(!row) return;
  row.innerHTML='<span style="color:#3a5a7a;font-size:8px;letter-spacing:2px;">SHOW:</span>';
  seq.forEach((s,i)=>{
    const col='#'+PITCHES[s.pk].color.toString(16).padStart(6,'0');
    const label=document.createElement('label');
    label.style.cssText='display:flex;align-items:center;gap:3px;cursor:pointer;font-size:8px;color:#8aabb8;';
    const cb=document.createElement('input');
    cb.type='checkbox';cb.checked=true;
    cb.style.accentColor=col;
    cb.onchange=()=>{
      if(cb.checked){
        if(!orbitIsolation.includes(i)) orbitIsolation.push(i);
      } else {
        orbitIsolation=orbitIsolation.filter(x=>x!==i);
      }
      orbitPlayMode=false;
      buildOrbitScene();
      const sorted=orbitIsolation.slice().sort((a,b)=>a-b);
      sorted.forEach((idxA,pos,arr)=>{
        for(let j=pos+1;j<arr.length;j++){
          orbitDrawTunnelBetween(idxA,arr[j]);
        }
      });
    };
    const dot=document.createElement('span');
    dot.style.cssText='width:6px;height:6px;border-radius:50%;background:'+col+';display:inline-block;';
    const txt=document.createElement('span');
    txt.textContent=(i+1)+'. '+PITCHES[s.pk].name;
    label.appendChild(cb);label.appendChild(dot);label.appendChild(txt);
    row.appendChild(label);
  });

  // Scrubber chapter markers
  const scrubber=document.getElementById('orbitScrubber');
  if(!scrubber) return;
  scrubber.innerHTML='';
  if(!seq.length){
    scrubber.innerHTML='<span style="color:#3a5a7a;font-size:9px;font-family:DM Mono,monospace;">No pitches — throw pitches in catcher view first</span>';
    return;
  }
  seq.forEach((s,i)=>{
    const col='#'+PITCHES[s.pk].color.toString(16).padStart(6,'0');
    const btn=document.createElement('button');
    btn.id='orbitchapter'+i;
    btn.style.cssText='flex:1;padding:4px 2px;border-radius:4px;border:0.5px solid #1e2a3a;'+
      'background:#0d1520;color:'+col+';font-family:DM Mono,monospace;font-size:8px;'+
      'cursor:pointer;transition:all 0.15s;min-height:28px;';
    btn.textContent=(i+1)+' '+PITCHES[s.pk].name.split(' ')[0];
    btn.onclick=()=>orbitJumpToPitch(i);
    scrubber.appendChild(btn);
  });
}

function orbitHighlightChapter(idx){
  seq.forEach((_,i)=>{
    const btn=document.getElementById('orbitchapter'+i);
    if(!btn) return;
    const col='#'+PITCHES[seq[i].pk].color.toString(16).padStart(6,'0');
    if(i===idx){
      btn.style.background=col;
      btn.style.color='#ffffff';
      btn.style.borderColor=col;
    } else {
      btn.style.background='#0d1520';
      btn.style.color=col;
      btn.style.borderColor='#1e2a3a';
    }
  });
}

function orbitJumpToPitch(idx){
  orbitStopPlay();
  orbitPitchIndex=idx;
  orbitHighlightChapter(idx);
  orbitShowPitchBall(idx);
}

function orbitShowPitchBall(idx){
  if(orbitBallMesh){orbitScene.remove(orbitBallMesh);orbitBallMesh=null;}
  if(idx<0||idx>=seq.length) return;
  if(!orbitIsolation.includes(idx)) return;
  const s=seq[idx];
  const pts=s.pts3d;
  if(!pts||!pts.length) return;
  const last=pts[pts.length-1];
  const col=PITCHES[s.pk].color;
  const geo=new THREE.SphereGeometry(0.055,10,10);
  const mat=new THREE.MeshBasicMaterial({color:col});
  orbitBallMesh=new THREE.Mesh(geo,mat);
  orbitBallMesh.position.set(last.x,last.y,last.z);
  orbitScene.add(orbitBallMesh);
}

function orbitPrevPitch(){
  orbitStopPlay();
  const visible=orbitIsolation.slice().sort((a,b)=>a-b);
  if(!visible.length) return;
  const cur=orbitPitchIndex;
  const prev=visible.filter(i=>i<cur);
  const idx=prev.length?prev[prev.length-1]:visible[visible.length-1];
  orbitJumpToPitch(idx);
}

function orbitNextPitch(){
  orbitStopPlay();
  const visible=orbitIsolation.slice().sort((a,b)=>a-b);
  if(!visible.length) return;
  const cur=orbitPitchIndex;
  const next=visible.filter(i=>i>cur);
  const idx=next.length?next[0]:visible[0];
  orbitJumpToPitch(idx);
}

function orbitTogglePlay(){
  if(orbitPlaying) orbitStopPlay();
  else orbitStartPlay();
}

function orbitStartPlay(){
  if(!seq.length) return;
  if(orbitBallMesh){orbitScene.remove(orbitBallMesh);orbitBallMesh=null;}
  orbitDrawnPitchIndices=[];
  orbitPlayMode=true;
  buildOrbitScene();
  orbitPlaying=true;
  const btn=document.getElementById('orbitPlayBtn');
  if(btn){
    btn.textContent='PAUSE';
    btn.style.borderColor='#e05a5a';
    btn.style.color='#e05a5a';
    btn.style.background='#1a0a0a';
  }
  const visible=orbitIsolation.slice().sort((a,b)=>a-b);
  if(!visible.length){orbitStopPlay();return;}
  let playIdx=0;
  function playNext(){
    if(!orbitPlaying||playIdx>=visible.length){
      orbitStopPlay();
      return;
    }
    const pitchIdx=visible[playIdx];
    orbitPitchIndex=pitchIdx;
    orbitHighlightChapter(pitchIdx);
    orbitAnimateBallAlongPath(pitchIdx,()=>{
      orbitDrawSinglePath(pitchIdx);
      orbitDrawnPitchIndices.forEach(prevIdx=>{
        orbitDrawTunnelBetween(prevIdx,pitchIdx);
      });
      orbitDrawnPitchIndices.push(pitchIdx);
      playIdx++;
      if(playIdx<visible.length&&orbitPlaying){
        orbitPlayTimer=setTimeout(playNext,500);
      } else {
        orbitStopPlay();
      }
    });
  }
  playNext();
}

function orbitStopPlay(){
  orbitPlaying=false;
  orbitPlayMode=false;
  orbitDrawnPitchIndices=[];
  if(orbitPlayTimer){clearTimeout(orbitPlayTimer);orbitPlayTimer=null;}
  if(orbitBallAnimTimer){clearTimeout(orbitBallAnimTimer);orbitBallAnimTimer=null;}
  if(orbitBallMesh){orbitScene.remove(orbitBallMesh);orbitBallMesh=null;}
  const btn=document.getElementById('orbitPlayBtn');
  if(btn){
    btn.textContent='PLAY';
    btn.style.borderColor='#4a9a4a';
    btn.style.color='#4a9a4a';
    btn.style.background='#1a2a1a';
  }
  // Do NOT rebuild scene here — leave all paths, tunnels
  // and decision points exactly as they are
  // Scene only rebuilds when PLAY is hit again via orbitStartPlay
}

function orbitAnimateBallAlongPath(pitchIdx,onDone){
  if(orbitBallMesh){orbitScene.remove(orbitBallMesh);orbitBallMesh=null;}
  const s=seq[pitchIdx];
  if(!s||!s.pts3d||!s.pts3d.length){if(onDone)onDone();return;}
  const pts=s.pts3d.map(v=>new THREE.Vector3(v.x,v.y,v.z));
  const col=PITCHES[s.pk].color;
  const geo=new THREE.SphereGeometry(0.055,10,10);
  const mat=new THREE.MeshBasicMaterial({color:col,depthTest:false});
  orbitBallMesh=new THREE.Mesh(geo,mat);
  orbitBallMesh.renderOrder=999;
  orbitScene.add(orbitBallMesh);
  const totalFrames=pts.length;
  const ms=(PITCHES[s.pk].ms||1000)*1.5;
  const msPerFrame=ms/totalFrames;
  let frameIdx=0;
  let done=false;
  function step(){
    if(done) return;
    if(!orbitPlaying){
      done=true;
      if(onDone) onDone();
      return;
    }
    if(orbitBallMesh) orbitBallMesh.position.copy(pts[frameIdx]);
    frameIdx++;
    if(frameIdx<totalFrames){
      orbitBallAnimTimer=setTimeout(()=>requestAnimationFrame(step),msPerFrame);
    } else {
      done=true;
      orbitBallAnimTimer=setTimeout(()=>{
        if(onDone) onDone();
      },300);
    }
  }
  requestAnimationFrame(step);
}

function orbitResetCamera(){
  if(!orbitCamera||!orbitControls) return;
  orbitCamera.position.set(0,1.06,-1.2);
  orbitCamera.lookAt(0,1.06,10);
  orbitControls.target.set(0,1.06,5);
  orbitControls.update();
}

function orbitTunnelZoom(){
  if(!orbitTunnelClusters||!orbitTunnelClusters.length){
    const ind=document.getElementById('tunnelIndicator');
    if(ind){ind.textContent='NO TUNNELS DETECTED';ind.style.display='block';
      setTimeout(()=>{ind.style.display='none';},2000);}
    return;
  }
  const cluster=orbitTunnelClusters[orbitTunnelClusterIndex];
  if(!cluster||!cluster.length) return;

  // Find center of tunnel cluster
  const cx=cluster.reduce((s,p)=>s+p.x,0)/cluster.length;
  const cy=cluster.reduce((s,p)=>s+p.y,0)/cluster.length;
  const cz=cluster.reduce((s,p)=>s+p.z,0)/cluster.length;

  // Fly camera to tunnel zone
  if(orbitControls) orbitControls.target.set(cx,cy,cz);
  if(orbitCamera) orbitCamera.position.set(cx-1.5,cy+0.8,cz-1.5);
  if(orbitControls) orbitControls.update();

  // Update indicator
  orbitTunnelClusterIndex=(orbitTunnelClusterIndex+1)%orbitTunnelClusters.length;
  const ind=document.getElementById('tunnelIndicator');
  if(ind){
    ind.textContent='TUNNEL '+(orbitTunnelClusterIndex)+' of '+orbitTunnelClusters.length;
    ind.style.display='block';
    setTimeout(()=>{ind.style.display='none';},2500);
  }
}

(function loop(){requestAnimationFrame(loop);renderer.render(scene,cam);})();

// ── Stats Tab ──
function toggleStatsTab(){
  const tab=document.getElementById('statstab');
  const label=document.getElementById('statsTabLabel');
  if(!tab||!label) return;
  const open=tab.classList.toggle('visible');
  label.textContent=open?'STATS ▾':'STATS ▸';
}
function setStatsSubtab(mode){
  document.getElementById('subtabTable').classList.toggle('active',mode==='table');
  document.getElementById('subtabHeatmap').classList.toggle('active',mode==='heatmap');
  document.getElementById('statsTableView').classList.toggle('visible',mode==='table');
  document.getElementById('statsHeatmapView').classList.toggle('visible',mode==='heatmap');
}
function setStatsPerspective(p){
  document.getElementById('statsPitcherBtn').classList.toggle('active',p==='pitcher');
  document.getElementById('statsBatterBtn').classList.toggle('active',p==='batter');
}
function setStatsColMode(mode){
  document.getElementById('colBtnZones').classList.toggle('active',mode==='zones');
  document.getElementById('colBtnOutcomes').classList.toggle('active',mode==='outcomes');
}

window.addEventListener('load',()=>{
  initSplash();
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
});

function getSavedPlans(){
  try{
    const raw=localStorage.getItem(PLAN_STORAGE_KEY);
    const parsed=raw?JSON.parse(raw):[];
    return Array.isArray(parsed)?parsed:[];
  }catch(e){return [];}
}

function setSavedPlans(plans){localStorage.setItem(PLAN_STORAGE_KEY,JSON.stringify(plans));}

function toStorableSeq(items){
  return items.map(s=>({
    pk:s.pk,zk:s.zk,spd:s.spd,bd:!!s.bd,role:s.role,count:s.count,outcome:s.outcome||'',
    pts3d:(s.pts3d||[]).map(v=>({x:v.x,y:v.y,z:v.z}))
  }));
}

function fromStoredSeq(items){
  return (Array.isArray(items)?items:[]).map(s=>({
    pk:s.pk,zk:s.zk,spd:s.spd,bd:!!s.bd,role:s.role||'SETUP',count:s.count||'0-0',outcome:s.outcome||'',
    pts3d:(Array.isArray(s.pts3d)?s.pts3d:[]).map(v=>new THREE.Vector3(v.x,v.y,v.z))
  })).filter(s=>PITCHES[s.pk]&&s.pts3d.length>0);
}

function refreshPlanDropdown(selectedId){
  const sel=document.getElementById('planselect');
  const exportBtn=document.getElementById('exportpdfbtn');
  const plans=getSavedPlans();
  if(exportBtn) exportBtn.disabled=!plans.length;
  sel.innerHTML='';
  if(!plans.length){
    const opt=document.createElement('option');
    opt.value='';
    opt.textContent='No saved plans';
    sel.appendChild(opt);
    sel.disabled=true;
    return;
  }
  sel.disabled=false;
  plans.forEach((p,i)=>{
    const opt=document.createElement('option');
    opt.value=p.id;
    opt.textContent=p.name||('Plan '+(i+1));
    sel.appendChild(opt);
  });
  if(selectedId&&plans.some(p=>p.id===selectedId)) sel.value=selectedId;
}

function savePlan(){
  if(!seq.length)return;
  const nameInput=document.getElementById('planname');
  const nm=(nameInput.value||'').trim();
  const planName=nm||('Plan '+new Date().toLocaleString());
  const plans=getSavedPlans();
  const id='plan-'+Date.now()+'-'+Math.floor(Math.random()*100000);
  plans.push({id,name:planName,savedAt:new Date().toISOString(),sequence:toStorableSeq(seq)});
  setSavedPlans(plans);
  refreshPlanDropdown(id);
  nameInput.value='';
}

function loadPlan(){
  const sel=document.getElementById('planselect');
  if(!sel||!sel.value)return;
  const plan=getSavedPlans().find(p=>p.id===sel.value);
  if(!plan)return;
  seq=fromStoredSeq(plan.sequence).slice(0,6);
  zone=seq.length?seq[0].zk:'MM';
  setTargetMode(EDGE8_ZONE_KEYS.indexOf(zone)>=0?'EDGE':'ZONE');
  updateSeqUI();
  rebuildPaths();
  refreshGhost();
}

function deletePlan(){
  const sel=document.getElementById('planselect');
  if(!sel||!sel.value)return;
  const plans=getSavedPlans().filter(p=>p.id!==sel.value);
  setSavedPlans(plans);
  refreshPlanDropdown(plans[0]?plans[0].id:'');
}

function clearSimStateSession(){
  try{sessionStorage.removeItem(SIM_SESSION_KEY);}catch(e){}
}

function serializeSeqForSession(items){
  return (Array.isArray(items)?items:[]).map(s=>({
    pk:s.pk,zk:s.zk,spd:s.spd,bd:!!s.bd,role:s.role,count:s.count,outcome:s.outcome||'',
    pts3d:(s.pts3d||[]).map(v=>({x:v.x,y:v.y,z:v.z}))
  }));
}

function deserializeSeqForSession(items){
  return (Array.isArray(items)?items:[]).map(s=>({
    pk:s.pk,zk:s.zk,spd:s.spd,bd:!!s.bd,role:s.role||'SETUP',count:s.count||'0-0',outcome:s.outcome||'',
    pts3d:(Array.isArray(s.pts3d)?s.pts3d:[]).map(v=>new THREE.Vector3(v.x,v.y,v.z))
  })).filter(s=>PITCHES[s.pk]&&s.pts3d.length>0);
}

function saveSimState(){
  try{
    if(!simMode){clearSimStateSession();return;}
    const bt=document.getElementById('battertype');
    const payload={
      simMode:!!simMode,
      batterType:(bt&&bt.value?bt.value:batterType||'GENERIC'),
      secretBatterType:secretBatterType||'',
      batterRevealedCount:pitchesInAtBat||0,
      ballCount:ballCount||0,
      strikeCount:strikeCount||0,
      outCount:outCount||0,
      inningNumber:inningNumber||1,
      inningHalfTop:simHalfTop!==false,
      simLog:Array.isArray(simLog)?simLog:[],
      seq:serializeSeqForSession(seq)
    };
    sessionStorage.setItem(SIM_SESSION_KEY,JSON.stringify(payload));
  }catch(e){}
}

function restoreSimState(){
  try{
    const raw=sessionStorage.getItem(SIM_SESSION_KEY);
    if(!raw)return;
    const d=JSON.parse(raw);
    if(!d||d.simMode!==true){clearSimStateSession();return;}
    simMode=true;
    batterType=typeof d.batterType==='string'?d.batterType:'GENERIC';
    secretBatterType=typeof d.secretBatterType==='string'?d.secretBatterType:'';
    pitchesInAtBat=Math.max(0,Math.min(99,parseInt(d.batterRevealedCount,10)||0));
    ballCount=Math.max(0,Math.min(3,parseInt(d.ballCount,10)||0));
    strikeCount=Math.max(0,Math.min(2,parseInt(d.strikeCount,10)||0));
    outCount=Math.max(0,Math.min(3,parseInt(d.outCount,10)||0));
    inningNumber=Math.max(1,parseInt(d.inningNumber,10)||1);
    simHalfTop=d.inningHalfTop!==false;
    simLog=Array.isArray(d.simLog)?d.simLog:[];
    seq=deserializeSeqForSession(d.seq).slice(0,6);
    batterRevealed=!!secretBatterType && pitchesInAtBat>=4;
    const sb=document.getElementById('simbtn');
    if(sb){sb.textContent='SIM MODE ON';sb.classList.add('on');}
    const bt=document.getElementById('battertype');
    if(bt) bt.value=batterType;
    updateSimPanelVisibility();
    renderCount();
    updateSimStatBar();
    updateSimLogUI();
    updateSeqUI();
    rebuildPaths();
    refreshGhost();
  }catch(e){
    clearSimStateSession();
  }
}

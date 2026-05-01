const PROFILE_KEY='pitchseq-pitcher-profile';
const OPPONENTS_KEY='pitchseq-opponents';

function getProfile(){
  try{
    const raw=localStorage.getItem(PROFILE_KEY);
    return raw?JSON.parse(raw):null;
  }catch(e){return null;}
}

function saveProfile(profile){
  try{
    localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));
  }catch(e){console.error('Profile save failed',e);}
}

function clearProfile(){
  localStorage.removeItem(PROFILE_KEY);
}

function getSavedPlans(){
  try{
    const raw=localStorage.getItem(PLAN_STORAGE_KEY);
    const parsed=raw?JSON.parse(raw):[];
    if(!Array.isArray(parsed)) return [];
    return parsed.map(p=>({
      ...p,
      opponent:p&&typeof p.opponent==='string'?p.opponent:'',
      outcome:p&&typeof p.outcome==='string'?p.outcome:'UNTESTED',
      batterNotes:p&&typeof p.batterNotes==='string'?p.batterNotes:'',
      gameNotes:p&&typeof p.gameNotes==='string'?p.gameNotes:''
    }));
  }catch(e){return [];}
}

function setSavedPlans(plans){localStorage.setItem(PLAN_STORAGE_KEY,JSON.stringify(plans));}

function getOpponents(){
  try{
    const raw=localStorage.getItem(OPPONENTS_KEY);
    return raw?JSON.parse(raw):[];
  }catch(e){return [];}
}

function addOpponent(name){
  if(!name)return;
  const opps=getOpponents();
  if(!opps.includes(name)){
    opps.push(name);
    opps.sort();
    localStorage.setItem(OPPONENTS_KEY,JSON.stringify(opps));
  }
}

function updatePlanField(planId,fields){
  const plans=getSavedPlans();
  const idx=plans.findIndex(p=>p.id===planId);
  if(idx===-1)return;
  Object.assign(plans[idx],fields);
  setSavedPlans(plans);
}

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
  const oppFilter=document.getElementById('oppfilter');
  const exportBtn=document.getElementById('exportpdfbtn');
  const notesBtn=document.getElementById('notesbtn');
  const plans=getSavedPlans();

  if(!sel)return;

  if(oppFilter){
    const currentOpp=oppFilter.value;
    oppFilter.innerHTML='<option value="">ALL OPPONENTS</option>';
    const opps=[...new Set(plans.map(p=>p.opponent||'').filter(Boolean))].sort();
    opps.forEach(o=>{
      const opt=document.createElement('option');
      opt.value=o;
      opt.textContent=o;
      oppFilter.appendChild(opt);
    });
    if(currentOpp) oppFilter.value=currentOpp;
  }

  if(exportBtn) exportBtn.disabled=!plans.length;

  const filterOpp=oppFilter?oppFilter.value:'';
  const filtered=filterOpp?plans.filter(p=>(p.opponent||'')===filterOpp):plans;

  sel.innerHTML='';
  if(!filtered.length){
    const opt=document.createElement('option');
    opt.value='';
    opt.textContent='No saved plans';
    sel.appendChild(opt);
    sel.disabled=true;
    if(notesBtn) notesBtn.style.display='none';
    return;
  }

  sel.disabled=false;
  filtered.forEach((p,i)=>{
    const opt=document.createElement('option');
    opt.value=p.id;
    const outcomeIcon=p.outcome==='WORKED'?'✓':p.outcome==="DIDN'T WORK"?'✗':p.outcome==='NEEDS ADJUSTMENT'?'△':'';
    opt.textContent=(outcomeIcon?outcomeIcon+' ':'')+(p.name||('Plan '+(i+1)))+(p.opponent?' · '+p.opponent:'');
    sel.appendChild(opt);
  });

  if(selectedId&&filtered.some(p=>p.id===selectedId)) sel.value=selectedId;

  if(notesBtn){
    const loadedPlanId=window.loadedPlanId;
    const visible=!!loadedPlanId&&filtered.some(p=>p.id===loadedPlanId);
    notesBtn.style.display=visible?'block':'none';
  }
}

function savePlan(){
  if(!seq.length)return;
  const nameInput=document.getElementById('planname');
  const nm=(nameInput.value||'').trim();
  const planName=nm||('Plan '+new Date().toLocaleString());
  const plans=getSavedPlans();
  const id='plan-'+Date.now()+'-'+Math.floor(Math.random()*100000);
  // Explicitly read batter toggle state at save time
  const batterHand=typeof batter!=='undefined'?batter:'';
  plans.push({
    id,
    name:planName,
    batter:batterHand,
    batterHand:batterHand,
    opponent:(document.getElementById('planopp')?document.getElementById('planopp').value.trim():''),
    outcome:'UNTESTED',
    batterNotes:'',
    gameNotes:'',
    savedAt:new Date().toISOString(),
    sequence:toStorableSeq(seq)
  });
  setSavedPlans(plans);
  const oppName=(document.getElementById('planopp')?document.getElementById('planopp').value.trim():'');
  if(oppName) addOpponent(oppName);
  refreshPlanDropdown(id);
  nameInput.value='';
  const oppEl=document.getElementById('planopp');
  if(oppEl) oppEl.value='';
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
  const notesBtn=document.getElementById('notesbtn');
  if(notesBtn) notesBtn.style.display='block';
  window.loadedPlanId=plan.id;
  if(typeof openNotesModal==='function') openNotesModal();
}

function deletePlan(){
  const sel=document.getElementById('planselect');
  if(!sel||!sel.value)return;
  if(window.loadedPlanId===sel.value) window.loadedPlanId=null;
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

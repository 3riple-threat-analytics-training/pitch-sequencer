let simMode=false;
let batterType='GENERIC';
let secretBatterType='';
let ballCount=0;
let strikeCount=0;
let outCount=0;
let inningNumber=1;
let simLog=[];
let pitchesInAtBat=0;
let batterRevealed=false;

let simHalfTop=true;
let simInningBreak=false;
let simInningLogPending=false;
let simClearTimer=null;
let pitchCount='0-0';

const WEAK_CONTACT_TABLE=[
  {outcome:'FOUL',weight:40},
  {outcome:'GROUND OUT',weight:30},
  {outcome:'POP FLY',weight:20},
  {outcome:'SINGLE',weight:10}
];
const STRONG_CONTACT_TABLE=[
  {outcome:'FOUL',weight:25},
  {outcome:'GROUND OUT',weight:20},
  {outcome:'SINGLE',weight:30},
  {outcome:'DOUBLE',weight:15},
  {outcome:'TRIPLE',weight:7},
  {outcome:'HOME RUN',weight:3}
];

function setBatterType(v){
  batterType=v||'GENERIC';
  saveSimState();
}
function onBatterTypeChange(v){setBatterType(v);}

function toggleSimMode(){
  simMode=!simMode;
  const b=document.getElementById('simbtn');
  b.textContent=simMode?'SIM MODE ON':'SIM MODE OFF';
  b.classList.toggle('on',simMode);
  batterType='GENERIC';
  secretBatterType='';
  batterRevealed=false;
  pitchesInAtBat=0;
  const bt=document.getElementById('battertype');
  if(bt) bt.value='GENERIC';
  updateSimPanelVisibility();
  saveSimState();
}

function updateSimPanelVisibility(){
  const wrap=document.getElementById('simpanelwrap');
  if(!wrap)return;
  wrap.style.display=simMode?'block':'none';
  const btw=document.getElementById('battertypewrap');
  if(btw) btw.style.display=simMode?'block':'none';
  if(!simMode) document.getElementById('simnewbatterbtn').style.display='none';
}

function hideSimAdvanceButton(){document.getElementById('simnewbatterbtn').style.display='none';}
function showSimAdvanceButton(){
  if(!simMode)return;
  const btn=document.getElementById('simnewbatterbtn');
  btn.textContent=simInningBreak?'NEW INNING':'NEW BATTER';
  btn.style.display='block';
}

function handleNewBatter(){
  cancelSimScheduledClear();
  let startedNewInning=false;
  ballCount=0;strikeCount=0;renderCount();
  simClearSequenceOnly();
  pitchesInAtBat=0;
  batterRevealed=false;
  if(batterType==='RANDOM'){
    const pool=['GENERIC','FREE_SWINGER','PATIENT','LOW_BALL','HIGH_BALL','PULL_RHB'];
    secretBatterType=pool[Math.floor(Math.random()*pool.length)];
  }else{
    secretBatterType='';
  }
  hideSimAdvanceButton();
  if(simInningBreak){
    startedNewInning=true;
    handleNewInning();
    clearSimStateSession();
  }
  updateSimStatBar();
  if(!startedNewInning) saveSimState();
}
function onSimAdvanceClick(){handleNewBatter();}

function handleNewInning(){
  simInningBreak=false;
  outCount=0;
  inningNumber++;
  simHalfTop=!simHalfTop;
}

function addSimOutCore(){
  outCount++;
  if(outCount>=3){
    outCount=3;
    simInningBreak=true;
    simInningLogPending=true;
  }
  updateSimStatBar();
  saveSimState();
}

function pickWeightedTable(table){
  const total=table.reduce((s,e)=>s+e.weight,0);
  if(total<=0)return table[0].outcome;
  let r=Math.random()*total;
  for(let i=0;i<table.length;i++){r-=table[i].weight;if(r<=0)return table[i].outcome;}
  return table[table.length-1].outcome;
}
function pickWeightedRecord(obj){
  const entries=Object.keys(obj).map(k=>({outcome:k,weight:Math.max(0,obj[k])}));
  return pickWeightedTable(entries);
}

function simSpritePalette(tag){
  if(['STRIKE','SWING & MISS','STRIKEOUT','GROUND OUT','POP FLY','CALLED STRIKE'].includes(tag)) return {bg:'#12321f',bd:'#4ade80',fg:'#86efac'};
  if(['BALL','WALK','CALLED BALL'].includes(tag)) return {bg:'#2a1010',bd:'#f87171',fg:'#fecaca'};
  if(tag==='BATTER REVEALED') return {bg:'#3a2f08',bd:'#fde047',fg:'#fde68a'};
  if(tag==='FOUL') return {bg:'#2a2208',bd:'#facc15',fg:'#fef08a'};
  if(tag==='SINGLE') return {bg:'#2b1808',bd:'#fb923c',fg:'#ffedd5'};
  if(['DOUBLE','TRIPLE'].includes(tag)) return {bg:'#0f172a',bd:'#60a5fa',fg:'#dbeafe'};
  if(tag==='HOME RUN') return {bg:'#1e1033',bd:'#c084fc',fg:'#f3e8ff'};
  if(tag==='INNING OVER') return {bg:'#1a1500',bd:'#eab308',fg:'#fef9c3'};
  return {bg:'#12321f',bd:'#4ade80',fg:'#86efac'};
}

function addSimLogEntry(line,tag,prominent){
  simLog.push({line,tag,prominent:!!prominent});
  if(simLog.length>6) simLog=simLog.slice(simLog.length-6);
  updateSimLogUI();
  saveSimState();
}
function pushSimInningOver(){
  simLog.push({line:'',tag:'INNING OVER'});
  if(simLog.length>6) simLog=simLog.slice(simLog.length-6);
  updateSimLogUI();
  saveSimState();
}

function updateSimLogUI(){
  const el=document.getElementById('simlog');
  if(!el)return;
  if(!simLog.length){el.innerHTML='<div class="simitem">No simulation outcomes yet.</div>';return;}
  el.innerHTML='';
  simLog.forEach(item=>{
    const d=document.createElement('div');
    d.className='simitem'+(item.prominent?' simitem-prominent':'');
    if(item.tag==='INNING OVER'){
      const chip=document.createElement('span');
      chip.className='simtag sim-l-inning';
      chip.textContent='INNING OVER';
      d.appendChild(chip);
      el.appendChild(d);
      return;
    }
    if(item.tag==='BATTER REVEALED'){
      const chip=document.createElement('span');
      chip.className='simtag sim-l-reveal';
      chip.textContent=item.line||'BATTER REVEALED';
      d.appendChild(chip);
      el.appendChild(d);
      return;
    }
    const segs=item.line.split(' → ');
    const p0=document.createElement('span');
    p0.className='simline-rest';
    p0.textContent=(segs[0]||'')+' → ';
    const p1=document.createElement('span');
    const pal=simSpritePalette(item.tag);
    p1.style.color=pal.fg;
    p1.style.fontWeight='600';
    p1.textContent=segs[1]||item.tag;
    d.appendChild(p0);
    d.appendChild(p1);
    el.appendChild(d);
  });
}

function updateSimStatBar(){
  const half=simHalfTop?'↑':'↓';
  document.getElementById('siminning').textContent=inningNumber+' '+half;
  const o=Math.min(3,Math.max(0,outCount));
  for(let i=0;i<3;i++){
    const el=document.getElementById('simdot'+i);
    if(el) el.classList.toggle('filled',i<o);
  }
}

function cancelSimScheduledClear(){if(simClearTimer){clearTimeout(simClearTimer);simClearTimer=null;}}
function simClearSequenceOnly(){
  seq=[];pathObjs.forEach(o=>removeObj(o));pathObjs=[];landObjs.forEach(o=>scene.remove(o));landObjs=[];clearTunnels();updateSeqUI();refreshGhost();
  if(simMode){ballCount=0;strikeCount=0;renderCount();}
  saveSimState();
}
function scheduleSimSequenceClear(ms){
  cancelSimScheduledClear();
  simClearTimer=setTimeout(()=>{simClearTimer=null;simClearSequenceOnly();},ms);
}

function renderCount(){
  pitchCount=ballCount+'-'+strikeCount;
  document.getElementById('bnum').textContent=ballCount;
  document.getElementById('snum').textContent=strikeCount;
  const cd=document.getElementById('countdisp');
  cd.textContent=pitchCount;
  cd.style.borderColor=PITCHER_COUNTS.includes(pitchCount)?'#4ade80':HITTER_COUNTS.includes(pitchCount)?'#f87171':'#3a5a7a';
  cd.style.color=PITCHER_COUNTS.includes(pitchCount)?'#4ade80':HITTER_COUNTS.includes(pitchCount)?'#f87171':'#5a8aaa';
}

function adjCount(type,delta){
  if(type==='b') ballCount=Math.max(0,Math.min(3,ballCount+delta));
  else strikeCount=Math.max(0,Math.min(2,strikeCount+delta));
  renderCount();
}

function isEdgeOrCornerZone(zk){return EDGE8_ZONE_KEYS.includes(zk);}
function getEffectiveBatterType(){if(batterType==='RANDOM') return secretBatterType||'GENERIC'; return batterType;}
function getBatterSimLogLabel(){
  const m={GENERIC:'GENERIC',FREE_SWINGER:'FREE SWINGER',PATIENT:'PATIENT',LOW_BALL:'LOW BALL HITTER',HIGH_BALL:'HIGH BALL HITTER',PULL_RHB:'PULL HITTER'};
  return m[getEffectiveBatterType()]||'GENERIC';
}

function getBatterSwingMultiplier(zk,strikes){
  const effType=getEffectiveBatterType();
  if(effType==='GENERIC') return 1;
  if(effType==='FREE_SWINGER') return 2;
  if(effType==='PATIENT') return strikes===0?0.3:strikes===1?0.5:0.9;
  if(effType==='LOW_BALL'){if(['BOT-EDG','BL-CRN','BR-CRN'].includes(zk)) return 1.8;if(['TOP-EDG','TL-CRN','TR-CRN'].includes(zk)) return 0.5;return 1;}
  if(effType==='HIGH_BALL'){if(['TOP-EDG','TL-CRN','TR-CRN'].includes(zk)) return 1.8;if(['BOT-EDG','BL-CRN','BR-CRN'].includes(zk)) return 0.5;return 1;}
  if(effType==='PULL_RHB'){
    const pullR=['LFT-EDG','BL-CRN','TL-CRN'],oppR=['RGT-EDG','BR-CRN','TR-CRN'];
    const pullL=['RGT-EDG','BR-CRN','TR-CRN'],oppL=['LFT-EDG','BL-CRN','TL-CRN'];
    if(batter==='RHB'){if(pullR.includes(zk)) return 1.9;if(oppR.includes(zk)) return 0.4;return 1;}
    if(batter==='LHB'){if(pullL.includes(zk)) return 1.9;if(oppL.includes(zk)) return 0.4;return 1;}
  }
  return 1;
}

function getChaseZoneSwingProbability(strikes){
  const effType=getEffectiveBatterType();
  const base=strikes===0?0.10:strikes===1?0.20:0.50;
  if(effType==='PATIENT') return strikes===0?0.05:strikes===1?0.10:0.40;
  if(effType==='FREE_SWINGER') return strikes===0?0.40:strikes===1?0.55:0.75;
  if(effType==='GENERIC') return base;
  return base;
}

function getChaseZoneOutcome(zoneKey,strikesNow,roleVal,bdVal,countVal,strikesAtStart){
  const pSwing=getChaseZoneSwingProbability(strikesNow);
  if(Math.random()<pSwing){
    const w=buildSimWeights(zoneKey,roleVal,bdVal,countVal);
    delete w.BALL;
    Object.keys(w).forEach(k=>{w[k]=Math.max(1,w[k]);});
    let raw=pickWeightedRecord(w);
    raw=getContactSubOutcome(raw);
    return applySimCountOutcome(raw,strikesAtStart);
  }else{
    return applySimCountOutcome('BALL',strikesAtStart);
  }
}

function getEdgeZoneOutcome(zoneKey,strikesNow,roleVal,bdVal,countVal,strikesAtStart){
  const baseSwing=strikesNow===0?0.15:strikesNow===1?0.30:0.70;
  const pSwing=Math.min(0.95,baseSwing*getBatterSwingMultiplier(zoneKey,strikesNow));
  let outcome='';
  if(Math.random()<pSwing){
    const w=buildSimWeights(zoneKey,roleVal,bdVal,countVal);
    w['SWING & MISS']=Math.max(1,w['SWING & MISS']*1.25);
    w['WEAK CONTACT']=Math.max(1,w['WEAK CONTACT']*1.12);
    w['STRONG CONTACT']=Math.max(1,w['STRONG CONTACT']*0.7);
    let raw=pickWeightedRecord(w);
    raw=getContactSubOutcome(raw);
    outcome=applySimCountOutcome(raw,strikesAtStart);
  }else{
    const call=EDGE_LINE_KEYS.includes(zoneKey)?(Math.random()<0.8?'CALLED STRIKE':'CALLED BALL'):(Math.random()<0.6?'CALLED STRIKE':'CALLED BALL');
    outcome=applySimCountOutcome(call,strikesAtStart);
  }
  return outcome;
}

function getContactSubOutcome(raw){
  if(raw==='WEAK CONTACT') return pickWeightedTable(WEAK_CONTACT_TABLE);
  if(raw==='STRONG CONTACT') return pickWeightedTable(STRONG_CONTACT_TABLE);
  return raw;
}

function buildSimWeights(zk,rl,bd,ct){
  const inStrike=STRIKE_ZONE_KEYS.includes(zk);
  const inChase=CHASE_ZONE_KEYS.includes(zk);
  const w=inStrike?{BALL:14,STRIKE:30,FOUL:18,'WEAK CONTACT':18,'STRONG CONTACT':12,'SWING & MISS':8}:{BALL:55,FOUL:10,'WEAK CONTACT':8,'STRONG CONTACT':4,'SWING & MISS':23};
  if(inChase){w.BALL+=6;w['SWING & MISS']+=4;w['STRONG CONTACT']=Math.max(1,w['STRONG CONTACT']-2);}
  if(PITCHER_COUNTS.includes(ct)){w.BALL-=8;w['SWING & MISS']+=10;if(w.STRIKE!==undefined) w.STRIKE+=2;w.FOUL+=2;w['STRONG CONTACT']-=3;}
  if(HITTER_COUNTS.includes(ct)){w.BALL+=10;w['STRONG CONTACT']+=10;w['WEAK CONTACT']+=3;w['SWING & MISS']-=8;if(w.STRIKE!==undefined) w.STRIKE-=5;}
  if(rl==='PUTAWAY'){w['SWING & MISS']+=12;if(w.STRIKE!==undefined) w.STRIKE+=4;w['STRONG CONTACT']-=4;}
  if(rl==='CHASE'){w.BALL+=12;if(w.STRIKE!==undefined) w.STRIKE-=3;}
  if(bd){if(w.STRIKE!==undefined) w.STRIKE+=10;w.BALL-=6;}
  Object.keys(w).forEach(k=>{w[k]=Math.max(1,w[k]);});
  if(inStrike){
    const bMass=Math.max(0,w.BALL||0);
    delete w.BALL;
    const keys=Object.keys(w);
    const sumR=keys.reduce((s,k)=>s+w[k],0);
    if(sumR>0&&bMass>0) keys.forEach(k=>{w[k]+=bMass*(w[k]/sumR);});
  }
  return w;
}

function getSimOutcome(zk,rl,bd,ct){return pickWeightedRecord(buildSimWeights(zk,rl,bd,ct));}
function simulateOutcome(zk,rl,bd,ct){
  if(CHASE_ZONE_KEYS.includes(zk)){
    const pSwing=getChaseZoneSwingProbability(strikeCount);
    if(Math.random()<pSwing){
      const w=buildSimWeights(zk,rl,bd,ct);
      delete w.BALL;
      Object.keys(w).forEach(k=>{w[k]=Math.max(1,w[k]);});
      return pickWeightedRecord(w);
    }
    return 'BALL';
  }
  return getSimOutcome(zk,rl,bd,ct);
}

function applySimCountOutcome(outcome,strikesAtStart){
  let display=outcome;
  if(outcome==='BALL'||outcome==='CALLED BALL') ballCount=Math.min(3,ballCount+1);
  else if(outcome==='STRIKE'||outcome==='SWING & MISS'||outcome==='CALLED STRIKE') strikeCount=Math.min(3,strikeCount+1);
  else if(outcome==='FOUL'&&strikesAtStart<2) strikeCount=Math.min(2,strikeCount+1);
  renderCount();
  if(ballCount>=3){display='WALK';showSimAdvanceButton();saveSimState();return display;}
  if(strikeCount>=3&&(outcome==='STRIKE'||outcome==='SWING & MISS'||outcome==='CALLED STRIKE')){display='STRIKEOUT';addSimOutCore();showSimAdvanceButton();saveSimState();return display;}
  if(outcome==='GROUND OUT'||outcome==='POP FLY'){ballCount=0;strikeCount=0;renderCount();addSimOutCore();showSimAdvanceButton();saveSimState();return outcome;}
  if(outcome==='SINGLE'||outcome==='DOUBLE'||outcome==='TRIPLE'||outcome==='HOME RUN'){ballCount=0;strikeCount=0;renderCount();scheduleSimSequenceClear(2000);saveSimState();return outcome;}
  saveSimState();
  return display;
}

function handleSimOutcome(pitchName,outcome){
  const prominent=outcome==='WALK'||outcome==='STRIKEOUT';
  const showLbl=(batterType!=='RANDOM')||batterRevealed;
  const takePrefix=(outcome==='CALLED STRIKE'||outcome==='CALLED BALL')?'TAKE: ':'';
  addSimLogEntry((showLbl?'['+getBatterSimLogLabel()+'] ':'')+pitchName+' → '+takePrefix+outcome,outcome,prominent);
}

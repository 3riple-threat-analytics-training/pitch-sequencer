let simMode=false;
let batterType='GENERIC';
let batterLevel='rec12';
let gameSituation='NEUTRAL';
let umpireQuality='GOOD';
let secretBatterType='';
let lastPitchSpeed=0;
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
let atBatOver=false;
// Baserunner state — true means runner on that base
let runners={first:false, second:false, third:false};
let totalScore=0;
let inningHits=0;
let scoreboardData=[]; // array of {inning, hits, score} per completed inning
let pendingRunnerUpdate=null; // suggested runner state after a hit

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
function setBatterLevel(v){
  batterLevel=v||'rec12';
  saveSimState();
}
function onBatterLevelChange(v){setBatterLevel(v);}
function setGameSituation(s){
  const normalized=String(s||'NEUTRAL').trim().toUpperCase();
  gameSituation=SITUATION_MODIFIERS[normalized]?normalized:'NEUTRAL';
  ['NEUTRAL','AHEAD','BEHIND'].forEach(key=>{
    const btn=document.getElementById('sit'+key);
    if(btn) btn.classList.toggle('active',key===gameSituation);
  });
  saveSimState();
}

function getSituationModifier(){
  return SITUATION_MODIFIERS[gameSituation]||SITUATION_MODIFIERS['NEUTRAL'];
}

function setUmpireQuality(q){
  const normalized=String(q||'GOOD').trim().toUpperCase();
  umpireQuality=UMPIRE_SETTINGS[normalized]?normalized:'GOOD';
  ['GOOD','BAD'].forEach(key=>{
    const btn=document.getElementById('ump'+key);
    if(btn) btn.classList.toggle('active',key===umpireQuality);
  });
  saveSimState();
}

function getUmpireSetting(){
  return UMPIRE_SETTINGS[umpireQuality]||UMPIRE_SETTINGS['GOOD'];
}

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
  setGameSituation('NEUTRAL');
  setUmpireQuality('GOOD');
  if(!simMode){
    unlockThrowButton();
    runners={first:false,second:false,third:false};
    totalScore=0;
    inningHits=0;
    scoreboardData=[];
    pendingRunnerUpdate=null;
    closeDiamondModal();
  }
  updateSimPanelVisibility();
  updateSimStatBar();
  saveSimState();
}

function updateSimPanelVisibility(){
  const wrap=document.getElementById('simpanelwrap');
  if(!wrap)return;
  wrap.style.display=simMode?'block':'none';
  const btw=document.getElementById('battertypewrap');
  if(btw) btw.style.display=simMode?'block':'none';
  const blw=document.getElementById('batterlevelwrap');
  if(blw) blw.style.display=simMode?'block':'none';
  const sw=document.getElementById('situationwrap');
  if(sw) sw.style.display=simMode?'block':'none';
  const uw=document.getElementById('umpirewrap');
  if(uw) uw.style.display=simMode?'block':'none';
  const di=document.getElementById('diamondicon');
  if(di) di.style.display=simMode?'inline-flex':'none';
  if(!simMode) document.getElementById('simnewbatterbtn').style.display='none';
}

function hideSimAdvanceButton(){document.getElementById('simnewbatterbtn').style.display='none';}
function showSimAdvanceButton(){
  if(!simMode)return;
  const btn=document.getElementById('simnewbatterbtn');
  btn.textContent=simInningBreak?'NEW INNING':'NEW BATTER';
  btn.style.display='block';
}

function lockThrowButton(){
  atBatOver=true;
  const btn=document.getElementById('throwbtn');
  if(!btn)return;
  btn.disabled=true;
  btn.style.opacity='0.4';
  btn.style.cursor='not-allowed';
  btn.textContent='NEW BATTER REQUIRED';
}

function unlockThrowButton(){
  atBatOver=false;
  const btn=document.getElementById('throwbtn');
  if(!btn)return;
  btn.disabled=false;
  btn.style.opacity='1';
  btn.style.cursor='pointer';
  btn.textContent='THROW';
}

function handleNewBatter(){
  unlockThrowButton();
  cancelSimScheduledClear();
  let startedNewInning=false;
  ballCount=0;strikeCount=0;renderCount();
  simClearSequenceOnly();
  pitchesInAtBat=0;
  lastPitchSpeed=0;
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
  resetRunners();
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
  const scoreEl=document.getElementById('simscore');
  if(scoreEl) scoreEl.textContent=totalScore;
  updateDiamondIcon();
}

function updateDiamondIcon(){
  const f=document.getElementById('runfirst');
  const s=document.getElementById('runsecond');
  const t=document.getElementById('runthird');
  if(f) f.classList.toggle('occupied',runners.first);
  if(s) s.classList.toggle('occupied',runners.second);
  if(t) t.classList.toggle('occupied',runners.third);
}

function suggestRunnerAdvancement(hitType){
  let newRunners={first:false, second:false, third:false};
  let runsScored=0;

  if(hitType==='HOME RUN'){
    runsScored=(runners.first?1:0)+(runners.second?1:0)+(runners.third?1:0)+1;
    newRunners={first:false, second:false, third:false};
  } else if(hitType==='TRIPLE'){
    runsScored=(runners.first?1:0)+(runners.second?1:0)+(runners.third?1:0);
    newRunners={first:false, second:false, third:true};
  } else if(hitType==='DOUBLE'){
    runsScored=(runners.second?1:0)+(runners.third?1:0);
    newRunners={first:false, second:true, third:runners.first};
  } else if(hitType==='SINGLE'){
    runsScored=(runners.third?1:0);
    newRunners={
      first:true,
      second:runners.first,
      third:runners.second
    };
  }

  return {newRunners, runsScored};
}

function applyHitToRunners(hitType){
  const {newRunners, runsScored}=suggestRunnerAdvancement(hitType);
  pendingRunnerUpdate={newRunners, runsScored, hitType};
  runners=newRunners;
  totalScore+=runsScored;
  inningHits++;
  updateSimStatBar();
  openDiamondModal();
}

function applyWalkToRunners(){
  let runsScored=0;
  let newRunners={first:false, second:false, third:false};

  if(runners.first && runners.second && runners.third){
    runsScored=1;
    newRunners={first:true, second:true, third:true};
  } else if(runners.first && runners.second){
    newRunners={first:true, second:true, third:true};
  } else if(runners.first){
    newRunners={first:true, second:true, third:false};
  } else {
    newRunners={first:true, second:runners.second, third:runners.third};
  }

  pendingRunnerUpdate={newRunners, runsScored, hitType:'WALK'};
  runners=newRunners;
  totalScore+=runsScored;
  updateSimStatBar();
  openDiamondModal();
}

function resetRunners(){
  scoreboardData.push({
    inning:inningNumber,
    hits:inningHits,
    score:totalScore
  });
  runners={first:false,second:false,third:false};
  inningHits=0;
  updateSimStatBar();
  updateDiamondUI();
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

function getBatterLevelConfig(){
  return BATTER_LEVELS[batterLevel]||BATTER_LEVELS.rec12;
}

function getSpeedDiffModifier(currentSpeed){
  if(lastPitchSpeed===0) return 0;
  const diff=Math.abs(lastPitchSpeed-currentSpeed);
  for(let i=SPEED_DIFF_MODIFIERS.length-1;i>=0;i--){
    if(diff>=SPEED_DIFF_MODIFIERS[i].minDiff) return SPEED_DIFF_MODIFIERS[i].swingMissBonus;
  }
  return 0;
}

function getVelocityModifiers(speed,pitchKey){
  const lvl=getBatterLevelConfig();
  const min=lvl.velocityRange.min;
  const max=lvl.velocityRange.max;

  if(speed>max){
    const excessMph=speed-max;
    const bonus=Math.min(0.35,excessMph*0.008);
    return {swingMissBonus:bonus+lvl.aboveRangeSwingMiss,contactBonus:0};
  }

  if(speed<min){
    const deficitMph=min-speed;
    const scaledBonus=Math.min(0.90,deficitMph*0.025);
    return {swingMissBonus:0,contactBonus:scaledBonus};
  }

  return {swingMissBonus:0,contactBonus:0};
}

function getBreakingBallModifier(pitchKey){
  if(!BREAKING_BALL_KEYS.includes(pitchKey)) return {swingMissBonus:0};
  const lvl=getBatterLevelConfig();
  return {swingMissBonus:(1-lvl.breakingBallRecognition)*0.20};
}

function getBatterSwingMultiplier(zk,strikes){
  const effType=getEffectiveBatterType();
  if(effType==='GENERIC') return 1;
  if(effType==='FREE_SWINGER') return 2;
  if(effType==='PATIENT') return strikes===0?0.55:strikes===1?0.65:0.88;
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
  const lvl=getBatterLevelConfig();
  const baseChase=lvl.chaseSwing[strikes]||lvl.chaseSwing[2];
  const effType=getEffectiveBatterType();
  let typeMult=1;
  if(effType==='PATIENT') typeMult=strikes===0?0.55:strikes===1?0.65:0.88;
  if(effType==='FREE_SWINGER') typeMult=1.4;
  const sitMod=getSituationModifier();
  const prob=Math.min(0.97,baseChase*typeMult*sitMod.chaseSwingMult);
  if(gameSituation==='BEHIND'){
    const neutralProb=baseChase*typeMult*1.0;
    const finalProb=Math.min(0.97,Math.max(prob,neutralProb+0.15));
    return finalProb;
  }
  if(gameSituation==='AHEAD'){
    const neutralProb=baseChase*typeMult*1.0;
    const finalProb=Math.min(neutralProb,prob);
    return finalProb;
  }
  return prob;
}

function getChaseZoneOutcome(zoneKey,strikesNow,roleVal,bdVal,countVal,strikesAtStart,speed,pitchKey){
  const pSwing=getChaseZoneSwingProbability(strikesNow);
  const effSpeed=typeof speed==='number'?speed:parseInt((document.getElementById('spd')||{}).value,10)||0;
  const effPitchKey=pitchKey||pitch;
  if(Math.random()<pSwing){
    const w=buildSimWeights(zoneKey,roleVal,bdVal,countVal,effSpeed,effPitchKey);
    delete w.BALL;
    Object.keys(w).forEach(k=>{w[k]=Math.max(1,w[k]);});
    let raw=pickWeightedRecord(w);
    raw=getContactSubOutcome(raw);
    return applySimCountOutcome(raw,strikesAtStart);
  }else{
    // Batter takes chase pitch — always ball regardless of umpire
    return applySimCountOutcome('BALL',strikesAtStart);
  }
}

function getEdgeZoneOutcome(zoneKey,strikesNow,roleVal,bdVal,countVal,strikesAtStart,speed,pitchKey){
  const sitMod=getSituationModifier();
  const baseSwing=(strikesNow===0?0.15:strikesNow===1?0.30:0.70)*sitMod.edgeSwingMult;
  const edgeTypeMult=getBatterSwingMultiplier(zoneKey,strikesNow);
  const pSwing=Math.min(0.95,baseSwing*edgeTypeMult);
  const effSpeed=typeof speed==='number'?speed:parseInt((document.getElementById('spd')||{}).value,10)||0;
  const effPitchKey=pitchKey||pitch;
  let outcome='';
  if(Math.random()<pSwing){
    const w=buildSimWeights(zoneKey,roleVal,bdVal,countVal,effSpeed,effPitchKey);
    w['SWING & MISS']=Math.max(1,w['SWING & MISS']*1.25);
    w['WEAK CONTACT']=Math.max(1,w['WEAK CONTACT']*1.12);
    w['STRONG CONTACT']=Math.max(1,w['STRONG CONTACT']*0.7);
    let raw=pickWeightedRecord(w);
    raw=getContactSubOutcome(raw);
    outcome=applySimCountOutcome(raw,strikesAtStart);
  }else{
    const ump=getUmpireSetting();
    let calledStrike=false;
    if(EDGE_ZONE_KEYS.includes(zoneKey)){
      calledStrike=Math.random()<ump.edgeStrikeProb;
    }else if(CORNER_ZONE_KEYS.includes(zoneKey)){
      calledStrike=Math.random()<ump.cornerStrikeProb;
    }
    // Apply inconsistency
    if(Math.random()<ump.inconsistencyRate) calledStrike=!calledStrike;
    const call=calledStrike?'CALLED STRIKE':'CALLED BALL';
    outcome=applySimCountOutcome(call,strikesAtStart);
  }
  return outcome;
}

function getContactSubOutcome(raw){
  if(raw==='WEAK CONTACT') return pickWeightedTable(WEAK_CONTACT_TABLE);
  if(raw==='STRONG CONTACT') return pickWeightedTable(STRONG_CONTACT_TABLE);
  return raw;
}

function buildSimWeights(zk,rl,bd,ct,speed,pitchKey){
  const inStrike=STRIKE_ZONE_KEYS.includes(zk);
  const lvl=getBatterLevelConfig();
  const weakMult=lvl.weakContactPct/0.65;
  const strongMult=lvl.strongContactPct/0.35;
  const w=inStrike?{
    BALL:0,
    STRIKE:30,
    FOUL:18,
    'WEAK CONTACT':Math.round(18*weakMult),
    'STRONG CONTACT':Math.round(12*strongMult),
    'SWING & MISS':8
  }:{
    BALL:55,
    FOUL:10,
    'WEAK CONTACT':Math.round(8*weakMult),
    'STRONG CONTACT':Math.round(4*strongMult),
    'SWING & MISS':23
  };
  const sitMod=getSituationModifier();
  w['STRONG CONTACT']=Math.max(1,w['STRONG CONTACT']*sitMod.contactQualityMult);
  w['WEAK CONTACT']=Math.max(1,w['WEAK CONTACT']*(2-sitMod.contactQualityMult));

  if(PITCHER_COUNTS.includes(ct)){
    w.BALL=Math.max(0,(w.BALL||0)-8);
    w['SWING & MISS']+=10;
    if(w.STRIKE!==undefined) w.STRIKE+=2;
    w.FOUL+=2;
    w['STRONG CONTACT']-=3;
  }
  if(HITTER_COUNTS.includes(ct)){
    w.BALL=Math.max(0,(w.BALL||0)+10);
    w['STRONG CONTACT']+=10;
    w['WEAK CONTACT']+=3;
    w['SWING & MISS']-=8;
    if(w.STRIKE!==undefined) w.STRIKE-=5;
  }
  if(rl==='PUTAWAY'){w['SWING & MISS']+=12;if(w.STRIKE!==undefined)w.STRIKE+=4;w['STRONG CONTACT']-=4;}
  if(rl==='CHASE'){w.BALL=Math.max(0,(w.BALL||0)+12);if(w.STRIKE!==undefined)w.STRIKE-=3;}
  if(bd){if(w.STRIKE!==undefined)w.STRIKE+=10;w.BALL=Math.max(0,(w.BALL||0)-6);}

  if(CHASE_ZONE_KEYS.includes(zk)) delete w.STRIKE;

  if(speed){
    const velMod=getVelocityModifiers(speed,pitchKey);
    if(velMod.swingMissBonus>0){
      w['SWING & MISS']=Math.max(1,w['SWING & MISS']*(1+velMod.swingMissBonus*3));
    }
    if(velMod.contactBonus>0){
      const contactScale=1+velMod.contactBonus*4;
      w['STRONG CONTACT']=Math.max(1,w['STRONG CONTACT']*contactScale);
      if(velMod.contactBonus>0.50){
        w['SWING & MISS']=Math.max(1,w['SWING & MISS']*0.20);
        w['WEAK CONTACT']=Math.max(1,w['WEAK CONTACT']*0.50);
      }else if(velMod.contactBonus>0.25){
        w['SWING & MISS']=Math.max(1,w['SWING & MISS']*0.50);
      }
    }

    if(velMod.contactBonus>0.70){
      const totalWeight=Object.values(w).reduce((s,v)=>s+v,0);
      const currentStrongPct=w['STRONG CONTACT']/totalWeight;
      if(currentStrongPct<0.60){
        const targetWeight=totalWeight*0.60;
        w['STRONG CONTACT']=Math.max(w['STRONG CONTACT'],targetWeight);
      }
    }
  }

  if(speed){
    const diffMod=getSpeedDiffModifier(speed);
    w['SWING & MISS']=Math.max(1,w['SWING & MISS']+(diffMod*100));
  }

  if(pitchKey){
    const bbMod=getBreakingBallModifier(pitchKey);
    w['SWING & MISS']=Math.max(1,w['SWING & MISS']+(bbMod.swingMissBonus*100));
  }

  if(inStrike) delete w.BALL;
  Object.keys(w).forEach(k=>{w[k]=Math.max(1,w[k]);});
  return w;
}

function getSimOutcome(zk,rl,bd,ct,speed,pitchKey){return pickWeightedRecord(buildSimWeights(zk,rl,bd,ct,speed,pitchKey));}
function simulateOutcome(zk,rl,bd,ct,speed,pitchKey){
  if(simMode&&atBatOver) return 'BALL';
  const effSpeed=typeof speed==='number'?speed:parseInt((document.getElementById('spd')||{}).value,10)||0;
  const effPitchKey=pitchKey||pitch;
  if(CHASE_ZONE_KEYS.includes(zk)){
    const pSwing=getChaseZoneSwingProbability(strikeCount);
    if(Math.random()<pSwing){
      const w=buildSimWeights(zk,rl,bd,ct,effSpeed,effPitchKey);
      delete w.BALL;
      Object.keys(w).forEach(k=>{w[k]=Math.max(1,w[k]);});
      const result=pickWeightedRecord(w);
      if(effSpeed) lastPitchSpeed=effSpeed;
      return result;
    }
    const ump=getUmpireSetting();
    if(effSpeed) lastPitchSpeed=effSpeed;
    return 'BALL';
  }
  const result=getSimOutcome(zk,rl,bd,ct,effSpeed,effPitchKey);
  if(result==='STRIKE'){
    // Bad umpire occasionally calls in-zone pitch a ball
    const ump=getUmpireSetting();
    if(Math.random()<ump.inZoneBallProb){
      if(effSpeed) lastPitchSpeed=effSpeed;
      return 'CALLED BALL';
    }
    if(effSpeed) lastPitchSpeed=effSpeed;
    return 'CALLED STRIKE';
  }
  if(effSpeed) lastPitchSpeed=effSpeed;
  return result;
}

function applySimCountOutcome(outcome,strikesAtStart){
  let display=outcome;
  if(outcome==='BALL'||outcome==='CALLED BALL') ballCount=Math.min(4,ballCount+1);
  else if(outcome==='STRIKE'||outcome==='SWING & MISS'||outcome==='CALLED STRIKE') strikeCount=Math.min(3,strikeCount+1);
  else if(outcome==='FOUL'&&strikesAtStart<2) strikeCount=Math.min(2,strikeCount+1);
  renderCount();
  if(ballCount>=4){
    display='WALK';
    if(simMode) applyWalkToRunners();
    if(simMode) lockThrowButton();
    showSimAdvanceButton();
    saveSimState();
    return display;
  }
  if(strikeCount>=3&&(outcome==='STRIKE'||outcome==='SWING & MISS'||outcome==='CALLED STRIKE')){display='STRIKEOUT';addSimOutCore();if(simMode) lockThrowButton();showSimAdvanceButton();saveSimState();return display;}
  if(outcome==='GROUND OUT'||outcome==='POP FLY'){ballCount=0;strikeCount=0;renderCount();addSimOutCore();if(simMode) lockThrowButton();showSimAdvanceButton();saveSimState();return outcome;}
  if(outcome==='SINGLE'||outcome==='DOUBLE'||outcome==='TRIPLE'||outcome==='HOME RUN'){
    ballCount=0;strikeCount=0;renderCount();
    if(simMode) applyHitToRunners(outcome);
    if(simMode) lockThrowButton();
    showSimAdvanceButton();
    scheduleSimSequenceClear(2000);
    saveSimState();
    return outcome;
  }
  saveSimState();
  return display;
}

function openDiamondModal(){
  updateDiamondUI();
  const badge=document.getElementById('diamond-outcome-badge');
  if(badge&&pendingRunnerUpdate){
    const colors={
      'SINGLE':  {bg:'#1a0c04',border:'#f97316',text:'#f97316'},
      'DOUBLE':  {bg:'#0f172a',border:'#60a5fa',text:'#60a5fa'},
      'TRIPLE':  {bg:'#0a1a10',border:'#4ade80',text:'#4ade80'},
      'HOME RUN':{bg:'#1e1033',border:'#c084fc',text:'#c084fc'},
      'WALK':    {bg:'#0a1a10',border:'#4ade80',text:'#4ade80'},
    };
    const c=colors[pendingRunnerUpdate.hitType]||{bg:'#0d1520',border:'#7ec8e3',text:'#7ec8e3'};
    badge.textContent=pendingRunnerUpdate.hitType;
    badge.style.display='block';
    badge.style.background=c.bg;
    badge.style.border='0.5px solid '+c.border;
    badge.style.color=c.text;
  } else if(badge){
    badge.style.display='none';
  }
  const modal=document.getElementById('diamondmodal');
  if(modal) modal.style.display='flex';
}

function closeDiamondModal(){
  const modal=document.getElementById('diamondmodal');
  if(modal) modal.style.display='none';
  updateSimStatBar();
  saveSimState();
}

function updateDiamondUI(){
  ['first','second','third'].forEach(base=>{
    const btn=document.getElementById('base-'+base);
    if(btn) btn.classList.toggle('occupied',runners[base]);
  });
  const ms=document.getElementById('modal-score');
  if(ms) ms.textContent='SCORE: '+totalScore;
  const rr=document.getElementById('runs-result');
  if(rr&&pendingRunnerUpdate){
    let msg='';
    if(pendingRunnerUpdate.hitType==='WALK'){
      msg=pendingRunnerUpdate.runsScored>0?
        'Bases loaded walk - run scores':'Batter advances to 1st - forced runners advance';
    } else if(pendingRunnerUpdate.hitType==='HOME RUN'){
      const total=(pendingRunnerUpdate.runsScored);
      msg=total+' run'+(total>1?'s':'')+' score - bases clear';
    } else if(pendingRunnerUpdate.hitType==='TRIPLE'){
      msg=pendingRunnerUpdate.runsScored>0?
        pendingRunnerUpdate.runsScored+' run'+(pendingRunnerUpdate.runsScored>1?'s':'')+' score - batter on 3rd':
        'Batter on 3rd - bases clear';
    } else if(pendingRunnerUpdate.hitType==='DOUBLE'){
      msg=pendingRunnerUpdate.runsScored>0?
        pendingRunnerUpdate.runsScored+' run'+(pendingRunnerUpdate.runsScored>1?'s':'')+' score - batter on 2nd':
        'Batter on 2nd - adjust runners as needed';
    } else if(pendingRunnerUpdate.hitType==='SINGLE'){
      msg=pendingRunnerUpdate.runsScored>0?
        '1 run scores - batter on 1st':
        'Batter on 1st - adjust runners as needed';
    }
    rr.textContent=msg;
    rr.style.color=pendingRunnerUpdate.runsScored>0?'#4ade80':'#7ec8e3';
  }else if(rr){
    rr.textContent='Tap bases to adjust runner positions';
    rr.style.color='#5a8aaa';
  }
}

function toggleBase(base){
  runners[base]=!runners[base];
  updateDiamondUI();
}

function addRun(){
  totalScore++;
  updateDiamondUI();
  updateSimStatBar();
}

function removeRun(){
  totalScore=Math.max(0,totalScore-1);
  updateDiamondUI();
  updateSimStatBar();
}

function installSimThrowGuard(){
  if(typeof throwPitch==='function'&&!throwPitch.__simGuarded){
    const originalThrowPitch=throwPitch;
    const guardedThrowPitch=function(){
      if(simMode&&atBatOver) return;
      return originalThrowPitch.apply(this,arguments);
    };
    guardedThrowPitch.__simGuarded=true;
    throwPitch=guardedThrowPitch;
  }
}

if(typeof window!=='undefined'){
  if(document.readyState==='complete') installSimThrowGuard();
  else window.addEventListener('load',installSimThrowGuard);
}

function handleSimOutcome(pitchName,outcome,speed,pitchKey){
  const effSpeed=typeof speed==='number'?speed:parseInt((document.getElementById('spd')||{}).value,10)||0;
  if(effSpeed) lastPitchSpeed=effSpeed;
  const prominent=outcome==='WALK'||outcome==='STRIKEOUT';
  const showLbl=(batterType!=='RANDOM')||batterRevealed;
  const takePrefix=(outcome==='CALLED STRIKE'||outcome==='CALLED BALL')?'TAKE: ':'';
  addSimLogEntry((showLbl?'['+getBatterSimLogLabel()+'] ':'')+pitchName+' → '+takePrefix+outcome,outcome,prominent);
}

const __baseSaveSimState=(typeof saveSimState==='function')?saveSimState:null;
saveSimState=function(){
  if(__baseSaveSimState) __baseSaveSimState();
  try{
    if(!simMode) return;
    const raw=sessionStorage.getItem(SIM_SESSION_KEY);
    if(!raw) return;
    const d=JSON.parse(raw);
    const bl=document.getElementById('batterlevel');
    d.batterLevel=(bl&&bl.value?bl.value:batterLevel||'rec12');
    d.gameSituation=gameSituation||'NEUTRAL';
    d.umpireQuality=umpireQuality||'GOOD';
    d.lastPitchSpeed=lastPitchSpeed||0;
    d.runners={first:!!runners.first,second:!!runners.second,third:!!runners.third};
    d.totalScore=totalScore||0;
    d.inningHits=inningHits||0;
    d.scoreboardData=Array.isArray(scoreboardData)?scoreboardData:[];
    d.pendingRunnerUpdate=pendingRunnerUpdate||null;
    sessionStorage.setItem(SIM_SESSION_KEY,JSON.stringify(d));
  }catch(e){}
};

const __baseRestoreSimState=(typeof restoreSimState==='function')?restoreSimState:null;
restoreSimState=function(){
  if(__baseRestoreSimState) __baseRestoreSimState();
  try{
    const raw=sessionStorage.getItem(SIM_SESSION_KEY);
    if(!raw) return;
    const d=JSON.parse(raw);
    batterLevel=(typeof d.batterLevel==='string'&&BATTER_LEVELS[d.batterLevel])?d.batterLevel:'rec12';
    gameSituation=(typeof d.gameSituation==='string'&&SITUATION_MODIFIERS[d.gameSituation])?d.gameSituation:'NEUTRAL';
    umpireQuality=(typeof d.umpireQuality==='string'&&UMPIRE_SETTINGS[d.umpireQuality])?d.umpireQuality:'GOOD';
    lastPitchSpeed=Math.max(0,parseInt(d.lastPitchSpeed,10)||0);
    runners={
      first:!!(d.runners&&d.runners.first),
      second:!!(d.runners&&d.runners.second),
      third:!!(d.runners&&d.runners.third)
    };
    totalScore=Math.max(0,parseInt(d.totalScore,10)||0);
    inningHits=Math.max(0,parseInt(d.inningHits,10)||0);
    scoreboardData=Array.isArray(d.scoreboardData)?d.scoreboardData:[];
    pendingRunnerUpdate=d.pendingRunnerUpdate&&typeof d.pendingRunnerUpdate==='object'?d.pendingRunnerUpdate:null;
    const bl=document.getElementById('batterlevel');
    if(bl) bl.value=batterLevel;
    ['NEUTRAL','AHEAD','BEHIND'].forEach(key=>{
      const btn=document.getElementById('sit'+key);
      if(btn) btn.classList.toggle('active',key===gameSituation);
    });
    ['GOOD','BAD'].forEach(key=>{
      const btn=document.getElementById('ump'+key);
      if(btn) btn.classList.toggle('active',key===umpireQuality);
    });
    updateDiamondUI();
    updateSimStatBar();
  }catch(e){
    batterLevel='rec12';
    gameSituation='NEUTRAL';
    umpireQuality='GOOD';
    lastPitchSpeed=0;
    runners={first:false,second:false,third:false};
    totalScore=0;
    inningHits=0;
    scoreboardData=[];
    pendingRunnerUpdate=null;
  }
};

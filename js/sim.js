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
let totalPitchCount=0;
let fatigueWarningShown=false;
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
  ['GOOD','BAD','HOMER'].forEach(key=>{
    const btn=document.getElementById('ump'+key);
    if(btn) btn.classList.toggle('active',key===umpireQuality);
  });
  saveSimState();
}

function getUmpireSetting(){
  return UMPIRE_SETTINGS[umpireQuality]||UMPIRE_SETTINGS['GOOD'];
}

// ── Fatigue System ──
function getTotalPitchCount(){ return totalPitchCount; }

function getFatigueLevelCurrent(){
  return getFatigueLevel(totalPitchCount);
}

function getFatigueVelocityCap(){
  const profile=getProfile();
  const maxVel=profile&&profile.maxVelocity?
    profile.maxVelocity:
    (AGE_GROUP_MAX_VELOCITY[profile&&profile.ageGroup?profile.ageGroup:'hs']||80);
  const fatigue=getFatigueLevelCurrent();
  return Math.round(maxVel*fatigue.velCapPct);
}

function applyFatigueToVelocity(){
  if(!simMode) return;
  const cap=getFatigueVelocityCap();
  const slider=document.getElementById('spd');
  const sval=document.getElementById('sval');
  const rangeLabel=document.getElementById('velrangelabel');
  if(!slider) return;

  // Apply cap to slider max
  const currentPitch=typeof pitch!=='undefined'?pitch:'4FB';
  const range=typeof getPitchVelocityRange==='function'?
    getPitchVelocityRange(currentPitch):{min:45,max:100,auto:85};

  const cappedMax=Math.min(range.max,cap);
  slider.max=cappedMax;

  // If current value exceeds cap, reduce it
  if(parseInt(slider.value,10)>cappedMax){
    slider.value=cappedMax;
    if(sval) sval.textContent=cappedMax+' mph';
    if(typeof handleSpeedInput==='function') handleSpeedInput(cappedMax);
  }

  // Update range label
  if(rangeLabel){
    const fatigue=getFatigueLevelCurrent();
    if(fatigue.label!=='FRESH'){
      rangeLabel.textContent=slider.min+'-'+cappedMax+' mph · FATIGUE CAP';
      rangeLabel.style.color='#f87171';
    } else {
      rangeLabel.textContent=slider.min+'-'+cappedMax+' mph';
      rangeLabel.style.color='var(--text-muted)';
    }
  }
}

function incrementPitchCount(){
  if(!simMode) return;
  totalPitchCount++;
  updateFatigueUI();
  applyFatigueToVelocity();

  // Check for fatigue threshold warnings
  const fatigue=getFatigueLevelCurrent();
  if(totalPitchCount===51&&!fatigueWarningShown){
    fatigueWarningShown=true;
    showFatigueToast('MILD FATIGUE — velocity begins to drop');
  } else if(totalPitchCount===76){
    showFatigueToast('MODERATE FATIGUE — consider pitch count');
  } else if(totalPitchCount===91){
    showFatigueToast('PITCHER IS TIRED — consider a change');
    setTimeout(()=>showPitchingChangeModal(),1500);
  } else if(totalPitchCount===106){
    showFatigueToast('PITCHER IS GASSED — strongly consider a change');
    setTimeout(()=>showPitchingChangeModal(),1500);
  }
}

function showFatigueToast(msg){
  const existing=document.getElementById('fatigue-toast');
  if(existing) existing.remove();
  const toast=document.createElement('div');
  toast.id='fatigue-toast';
  toast.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);'
    +'background:#1a0a0a;border:1.5px solid #f87171;color:#f87171;'
    +'padding:10px 24px;border-radius:8px;font-family:DM Mono,monospace;'
    +'font-size:11px;font-weight:600;letter-spacing:1px;z-index:9999;'
    +'pointer-events:none;box-shadow:0 2px 16px rgba(0,0,0,0.5);';
  toast.textContent=msg;
  document.body.appendChild(toast);
  setTimeout(()=>{if(toast.parentNode) toast.remove();},3000);
}

function updateFatigueUI(){
  const countEl=document.getElementById('fatigue-pitch-count');
  const labelEl=document.getElementById('fatigue-level-label');
  const barEl=document.getElementById('fatigue-bar');
  const fatigue=getFatigueLevelCurrent();

  if(countEl) countEl.textContent=totalPitchCount;
  if(labelEl){
    labelEl.textContent=fatigue.label;
    labelEl.style.color=fatigue.color;
  }
  if(barEl){
    // Bar fills from 0 to 106+ pitches
    const pct=Math.min(100,(totalPitchCount/106)*100);
    barEl.style.width=pct+'%';
    barEl.style.background=fatigue.color;
  }
}

function showPitchingChangeModal(){
  const modal=document.getElementById('pitchingchangemodal');
  if(!modal) return;
  const fatigue=getFatigueLevelCurrent();
  const profile=getProfile();
  const pitcherName=profile?profile.name:'Pitcher';

  document.getElementById('pc-pitcher-name').textContent=pitcherName;
  document.getElementById('pc-pitch-count').textContent=totalPitchCount;
  document.getElementById('pc-fatigue-level').textContent=fatigue.label;
  document.getElementById('pc-fatigue-level').style.color=fatigue.color;

  // Stats summary
  document.getElementById('pc-strikeouts').textContent=
    typeof outCount!=='undefined'?outCount:0;

  modal.style.display='flex';
}

function closePitchingChangeModal(){
  const modal=document.getElementById('pitchingchangemodal');
  if(modal) modal.style.display='none';
}

function confirmPitchingChange(){
  closePitchingChangeModal();
  const mode=typeof getAppMode==='function'?getAppMode():null;
  if(mode==='team'){
    // Open roster to select new pitcher
    openSettingsModal();
    setTimeout(()=>renderRosterList(),200);
  } else {
    // Individual mode — show game summary
    showGameSummary();
  }
}

function showGameSummary(){
  const profile=getProfile();
  const pitcherName=profile?profile.name:'Pitcher';
  const summary='GAME SUMMARY\n\n'
    +'Pitcher: '+pitcherName+'\n'
    +'Total Pitches: '+totalPitchCount+'\n'
    +'Final Fatigue: '+getFatigueLevelCurrent().label+'\n\n'
    +'Great outing!';
  alert(summary);
  // Reset pitch count for next game
  totalPitchCount=0;
  fatigueWarningShown=false;
  updateFatigueUI();
  applyFatigueToVelocity();
}

function resetPitchCount(){
  totalPitchCount=0;
  fatigueWarningShown=false;
  updateFatigueUI();
  applyFatigueToVelocity();
}

function getGradientStrikeProb(zoneKey,baseStrikeProb){
  const ump=getUmpireSetting();
  if(!ump.gradientEnabled) return baseStrikeProb;

  // Get distance from zone center (0=dead center, 1=outer edge)
  const borderDist=getZoneBorderDistance(zoneKey);

  // Gradient ball probability scales with distance from center
  // Dead center: 0% extra ball chance
  // Outer edge: gradientBallProb% extra ball chance
  const gradientBallChance=borderDist*ump.gradientBallProb;

  // Apply homer bias — extra penalty for pitcher on borderline calls
  let homerPenalty=0;
  if(ump.homerBias){
    homerPenalty=borderDist*0.15;
  }

  // Final strike probability reduced by gradient and homer penalty
  const adjustedStrikeProb=Math.max(0,baseStrikeProb-gradientBallChance-homerPenalty);

  return adjustedStrikeProb;
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
  if(simMode){
    if(typeof applyFatigueToVelocity==='function')applyFatigueToVelocity();
  } else if(typeof pitch!=='undefined'&&pitch&&typeof applyPitchVelocity==='function'){
    applyPitchVelocity(pitch);
  }
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
  const fw=document.getElementById('fatiguewrap');
  if(fw) fw.style.display=simMode?'block':'none';
  if(simMode) updateFatigueUI();
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

function showBatterHandednessNotification(handedness){
  dismissBatterHandednessNotification();
  const toast=document.createElement('div');
  toast.id='batter-handedness-toast';
  toast.style.cssText=`
    position:fixed;
    top:70px;
    left:50%;
    transform:translateX(-50%);
    background:#1a1a2e;
    border:1.5px solid ${handedness==='RHB'?'#4ade80':'#f87171'};
    color:${handedness==='RHB'?'#4ade80':'#f87171'};
    padding:12px 32px;
    border-radius:8px;
    font-size:13px;
    font-weight:600;
    letter-spacing:0.08em;
    z-index:9999;
    pointer-events:none;
    box-shadow:0 2px 16px rgba(0,0,0,0.5);
  `;
  const displayHand=handedness==='RHB'?'LHB':'RHB';
  toast.textContent='CHANGE BATTER TO '+displayHand;
  document.body.appendChild(toast);
}

function dismissBatterHandednessNotification(){
  const existing=document.getElementById('batter-handedness-toast');
  if(existing) existing.remove();
}

function handleNewBatter(){
  dismissBatterHandednessNotification();
  unlockThrowButton();
  cancelSimScheduledClear();
  let startedNewInning=false;
  ballCount=0;strikeCount=0;renderCount();
  simClearSequenceOnly();
  pitchesInAtBat=0;
  lastPitchSpeed=0;
  batterRevealed=false;
  if(batterType==='RANDOM'){
    const pool=['GENERIC','FREE_SWINGER','PATIENT','LOW_BALL','HIGH_BALL','PULL'];
    secretBatterType=pool[Math.floor(Math.random()*pool.length)];
    const randomHand=Math.random()<0.5?'RHB':'LHB';
    const currentHand=(typeof batter!=='undefined'&&batter==='LHB')?'LHB':'RHB';
    console.log('DEBUG batter=',batter,'currentHand=',currentHand,'randomHand=',randomHand);
    if(randomHand!==currentHand){
      showBatterHandednessNotification(randomHand);
    }
  }else{
    secretBatterType='';
  }
  hideSimAdvanceButton();
  if(typeof onNewBatter==='function') onNewBatter();
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
  if(['STRIKE','SWING & MISS','STRIKEOUT','GROUND OUT','POP FLY','CALLED STRIKE'].includes(tag))
    return {bg:'#12321f',bd:'#4ade80',fg:'#86efac',dark:'#14532d'};
  if(['BALL','WALK','CALLED BALL'].includes(tag))
    return {bg:'#2a1010',bd:'#f87171',fg:'#fecaca',dark:'#7f1d1d'};
  if(tag==='BATTER REVEALED')
    return {bg:'#3a2f08',bd:'#fde047',fg:'#fde68a',dark:'#451a03'};
  if(tag==='FOUL')
    return {bg:'#2a2208',bd:'#facc15',fg:'#fef08a',dark:'#422006'};
  if(tag==='SINGLE')
    return {bg:'#2b1808',bd:'#fb923c',fg:'#ffedd5',dark:'#431407'};
  if(['DOUBLE','TRIPLE'].includes(tag))
    return {bg:'#0f172a',bd:'#60a5fa',fg:'#dbeafe',dark:'#1e3a5f'};
  if(tag==='HOME RUN')
    return {bg:'#1e1033',bd:'#c084fc',fg:'#f3e8ff',dark:'#3b0764'};
  if(tag==='INNING OVER')
    return {bg:'#1a1500',bd:'#eab308',fg:'#fef9c3',dark:'#451a03'};
  return {bg:'#12321f',bd:'#4ade80',fg:'#86efac',dark:'#14532d'};
}

function addSimLogEntry(line,tag,prominent){
  simLog.push({line,tag,prominent:!!prominent});
  if(simLog.length>6) simLog=simLog.slice(simLog.length-6);
  updateSimLogUI();
  saveSimState();
  if(tag==='BATTER REVEALED'&&typeof onBatterRevealed==='function') onBatterRevealed(secretBatterType);
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
    const isLight=document.body.getAttribute('data-theme')==='light';
    p1.style.color=isLight?pal.dark:pal.fg;
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
  const m={GENERIC:'GENERIC',FREE_SWINGER:'FREE SWINGER',PATIENT:'PATIENT',LOW_BALL:'LOW BALL HITTER',HIGH_BALL:'HIGH BALL HITTER',PULL:'PULL HITTER'};
  return m[getEffectiveBatterType()]||'GENERIC';
}

function getBatterLevelConfig(){
  return BATTER_LEVELS[batterLevel]||BATTER_LEVELS.rec12;
}

function getSpeedDiffModifier(currentSpeed){
  if(lastPitchSpeed===0) return 0;
  const diff=Math.abs(lastPitchSpeed-currentSpeed);
  if(diff===0) return 0;

  // Get base bonus from table
  let baseBonus=0;
  for(let i=SPEED_DIFF_MODIFIERS.length-1;i>=0;i--){
    if(diff>=SPEED_DIFF_MODIFIERS[i].minDiff){
      baseBonus=SPEED_DIFF_MODIFIERS[i].swingMissBonus;
      break;
    }
  }

  // Apply level scaling
  const lvlScale=(typeof SPEED_DIFF_LEVEL_SCALE!=='undefined'&&SPEED_DIFF_LEVEL_SCALE[batterLevel])||0.50;

  // Apply direction multiplier
  // lastPitchSpeed > currentSpeed means we went fast → slow (fastball to breaking ball)
  // lastPitchSpeed < currentSpeed means we went slow → fast (breaking ball to fastball)
  let dirMult=1.0;
  if(typeof SPEED_DIFF_DIRECTION!=='undefined'){
    dirMult=lastPitchSpeed>currentSpeed?
      SPEED_DIFF_DIRECTION.fastToBraking:
      SPEED_DIFF_DIRECTION.breakingToFast;
  }

  const finalBonus=baseBonus*lvlScale*dirMult;

  console.log('SPEED DIFF DEBUG: last=',lastPitchSpeed,'current=',currentSpeed,'diff=',diff,'baseBonus=',baseBonus,'lvlScale=',lvlScale,'dirMult=',dirMult,'finalBonus=',finalBonus,'level=',batterLevel);

  return finalBonus;
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
  if(effType==='PULL'){
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
  const effSpeed=typeof speed==='number'?speed:parseInt((document.getElementById('spd')||{}).value,10)||0;
  const effPitchKey=pitchKey||pitch;


  // Below velocity floor — higher level batters recognize slow pitch and lay off chase zones
  let pSwing=getChaseZoneSwingProbability(strikesNow);
  if(isBelowVelocityFloor(effSpeed,effPitchKey)){
    const chaseReduction={
      rec10:1.0,rec12:1.0,    // young batters still chase regardless
      club10:0.90,club12:0.85,
      comp13:0.75,
      hsjv:0.60,
      hsvar:0.45,
      college:0.25,
      pro:0.10                  // pro batters almost never chase a slow pitch off plate
    };
    const reduction=chaseReduction[batterLevel]||0.75;
    pSwing=pSwing*reduction;
  }

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
  const effSpeed=typeof speed==='number'?speed:parseInt((document.getElementById('spd')||{}).value,10)||0;
  const effPitchKey=pitchKey||pitch;


  // Below velocity floor — higher level batters sit on slow edge pitches and drive them
  // Lower level batters still struggle with edge pitches regardless of speed
  let swingMissMult=1.25;
  let weakContactMult=1.12;
  let strongContactMult=0.7;

  if(isBelowVelocityFloor(effSpeed,effPitchKey)){
    const edgeContactScale={
      rec10:1.0,rec12:1.0,
      club10:1.1,club12:1.2,
      comp13:1.3,
      hsjv:1.5,
      hsvar:1.8,
      college:2.2,
      pro:2.8
    };
    const contactScale=edgeContactScale[batterLevel]||1.3;
    // Below floor — batter times it up, more contact, less swing and miss
    swingMissMult=Math.max(0.3,1.25/contactScale);
    weakContactMult=1.12*contactScale;
    strongContactMult=0.7*contactScale;
  }

  const pSwing=Math.min(0.95,baseSwing*edgeTypeMult);
  let outcome='';
  if(Math.random()<pSwing){
    const w=buildSimWeights(zoneKey,roleVal,bdVal,countVal,effSpeed,effPitchKey);
    w['SWING & MISS']=Math.max(1,w['SWING & MISS']*swingMissMult);
    w['WEAK CONTACT']=Math.max(1,w['WEAK CONTACT']*weakContactMult);
    w['STRONG CONTACT']=Math.max(1,w['STRONG CONTACT']*strongContactMult);
    let raw=pickWeightedRecord(w);
    raw=getContactSubOutcome(raw);
    outcome=applySimCountOutcome(raw,strikesAtStart);
  }else{
    const ump=getUmpireSetting();
    let calledStrike=false;
    if(EDGE_ZONE_KEYS.includes(zoneKey)){
      const gradientProb=getGradientStrikeProb(zoneKey,ump.edgeStrikeProb);
      calledStrike=Math.random()<gradientProb;
    }else if(CORNER_ZONE_KEYS.includes(zoneKey)){
      const gradientProb=getGradientStrikeProb(zoneKey,ump.cornerStrikeProb);
      calledStrike=Math.random()<gradientProb;
    }
    // Apply inconsistency
    if(Math.random()<ump.inconsistencyRate) calledStrike=!calledStrike;
    // Homer umpire — extra inconsistency favoring batter on close calls
    if(ump.homerBias&&Math.random()<0.12) calledStrike=false;
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

function getLocationRepetitionPenalty(zk,pitchKey){
  const nopenalty={strongMult:1.0,weakMult:1.0,swingMissMult:1.0};
  if(typeof seq==='undefined'||!seq||!seq.length) return nopenalty;

  // Knuckleball exempt from location repetition penalty
  // because the ball never goes to exactly the same spot twice due to movement
  if(pitchKey==='KN') return nopenalty;

  // Level scaling factor
  const levelScale={
    rec10:0.25,rec12:0.25,
    club10:0.40,club12:0.40,
    comp13:0.55,
    hsjv:0.65,
    hsvar:0.80,
    college:0.90,
    pro:1.00
  };
  const scale=levelScale[batterLevel]||0.55;

  // Breaking ball recognition reduction
  const lvl=getBatterLevelConfig();
  const isBreakingBall=typeof BREAKING_BALL_KEYS!=='undefined'&&BREAKING_BALL_KEYS.includes(pitchKey);
  const bbReduction=isBreakingBall?(1-lvl.breakingBallRecognition):1.0;

  // Effective scale combines level scale and breaking ball recognition
  const effectiveScale=scale*bbReduction;

  const prev=seq[seq.length-1];
  const prev2=seq.length>=2?seq[seq.length-2]:null;
  const prev3=seq.length>=3?seq[seq.length-3]:null;

  // Three consecutive pitches to same zone — severe penalty
  if(prev3&&prev3.zk===zk&&prev2&&prev2.zk===zk&&prev&&prev.zk===zk){
    return{
      strongMult:1.0+(3.0-1.0)*effectiveScale,
      weakMult:1.0+(2.0-1.0)*effectiveScale,
      swingMissMult:1.0-(1.0-0.40)*effectiveScale
    };
  }

  // Two consecutive pitches to same zone — significant penalty
  if(prev2&&prev2.zk===zk&&prev&&prev.zk===zk){
    return{
      strongMult:1.0+(2.0-1.0)*effectiveScale,
      weakMult:1.0+(1.5-1.0)*effectiveScale,
      swingMissMult:1.0-(1.0-0.60)*effectiveScale
    };
  }

  // Last pitch same zone, same pitch type — moderate penalty
  if(prev&&prev.zk===zk&&prev.pk===pitchKey){
    return{
      strongMult:1.0+(1.5-1.0)*effectiveScale,
      weakMult:1.0+(1.3-1.0)*effectiveScale,
      swingMissMult:1.0-(1.0-0.75)*effectiveScale
    };
  }

  // Last pitch same zone, different pitch type — small penalty
  if(prev&&prev.zk===zk&&prev.pk!==pitchKey){
    return{
      strongMult:1.0+(1.3-1.0)*effectiveScale,
      weakMult:1.0+(1.2-1.0)*effectiveScale,
      swingMissMult:1.0-(1.0-0.85)*effectiveScale
    };
  }

  return nopenalty;
}

function getKnuckleballModifier(speed){
  if(!speed) return {swingMissMult:1.0, strongMult:1.0, weakMult:1.0};

  const sweetSpot={
    rec10:{min:38,max:48},
    rec12:{min:40,max:50},
    club10:{min:42,max:52},
    club12:{min:44,max:54},
    comp13:{min:46,max:56},
    hsjv:{min:50,max:60},
    hsvar:{min:53,max:63},
    college:{min:57,max:67},
    pro:{min:63,max:72}
  };

  const range=sweetSpot[batterLevel]||sweetSpot.rec12;
  const levelScale={
    rec10:0.25,rec12:0.25,club10:0.35,club12:0.40,
    comp13:0.50,hsjv:0.65,hsvar:0.80,college:0.90,pro:1.00
  };
  const scale=levelScale[batterLevel]||0.55;

  // Extra penalty for aggressive batter types who swing at everything
  // Free swingers get punished more by knuckleball movement
  const effType=getEffectiveBatterType();
  const aggressiveTypeMult=effType==='FREE_SWINGER'?1.4:effType==='PULL'?1.2:1.0;

  if(speed>=range.min&&speed<=range.max){
    // Sweet spot — maximum movement, genuine difficulty for all batter types
    const swingMissMult=1.0+(1.8*scale*aggressiveTypeMult); // up to 2.52x at pro FREE_SWINGER
    const strongMult=Math.max(0.15,1.0-(0.75*scale));       // down to 0.25x at pro
    const weakMult=Math.max(0.40,1.0-(0.45*scale));         // down to 0.55x at pro
    console.log('KN DEBUG: SWEET SPOT speed=',speed,'range=',range,'scale=',scale,'swingMissMult=',swingMissMult,'strongMult=',strongMult,'batterLevel=',batterLevel,'batterType=',effType);
    return {swingMissMult, strongMult, weakMult};
  }

  if(speed>range.max){
    const excess=speed-range.max;
    const penalty=Math.min(0.50,excess*0.030)*scale;
    const mod={
      swingMissMult:Math.max(0.4,1.0-penalty*2),
      strongMult:1.0+(penalty*2.0),
      weakMult:1.0+(penalty*1.2)
    };
    console.log('KN DEBUG: TOO FAST speed=',speed,'range=',range,'penalty=',penalty,'mod=',mod,'batterLevel=',batterLevel,'batterType=',effType);
    return mod;
  }

  if(speed<range.min){
    const deficit=range.min-speed;
    const penalty=Math.min(0.70,deficit*0.040)*scale;
    const mod={
      swingMissMult:Math.max(0.2,1.0-penalty*2),
      strongMult:1.0+(penalty*3.0),
      weakMult:1.0+(penalty*2.0)
    };
    console.log('KN DEBUG: TOO SLOW speed=',speed,'range=',range,'penalty=',penalty,'mod=',mod,'batterLevel=',batterLevel,'batterType=',effType);
    return mod;
  }

  return {swingMissMult:1.0, strongMult:1.0, weakMult:1.0};
}

function getTunnelReward(pitchKey,speed){
  const noReward={swingMissMult:1.0,strongMult:1.0,weakMult:1.0,overridesRepetition:0};
  if(typeof seq==='undefined'||!seq||seq.length<2) return noReward;

  const current=seq[seq.length-1];
  if(!current||!current.tunnelData||!current.tunnelData.detected) return noReward;

  const td=current.tunnelData;

  // No reward for same pitch type tunneling
  if(td.prevPk===pitchKey) return noReward;

  // Level scaling — tunneling reward scales with batter level
  // Higher level batters are more fooled by tunneling because their timing is more precise
  const levelScale={
    rec10:0.30,rec12:0.30,
    club10:0.40,club12:0.48,
    comp13:0.58,
    hsjv:0.70,
    hsvar:0.82,
    college:0.92,
    pro:1.00
  };
  const scale=levelScale[batterLevel]||0.55;

  // Base reward from tunnel length
  let swingMissMult=1.0;
  let strongMult=1.0;
  let weakMult=1.0;
  let overridesRepetition=0;

  if(td.length>=0.80){
    // Elite tunnel
    swingMissMult=1.0+(0.80*scale);
    strongMult=Math.max(0.30,1.0-(0.50*scale));
    weakMult=Math.max(0.60,1.0-(0.25*scale));
    overridesRepetition=1.0; // fully overrides repetition penalty
  }else if(td.length>=0.60){
    // Strong tunnel
    swingMissMult=1.0+(0.50*scale);
    strongMult=Math.max(0.40,1.0-(0.35*scale));
    weakMult=Math.max(0.70,1.0-(0.18*scale));
    overridesRepetition=0.60;
  }else if(td.length>=0.30){
    // Moderate tunnel
    swingMissMult=1.0+(0.30*scale);
    strongMult=Math.max(0.55,1.0-(0.22*scale));
    weakMult=Math.max(0.80,1.0-(0.12*scale));
    overridesRepetition=0.30;
  }else{
    // Weak tunnel
    swingMissMult=1.0+(0.15*scale);
    strongMult=Math.max(0.75,1.0-(0.12*scale));
    weakMult=Math.max(0.88,1.0-(0.06*scale));
    overridesRepetition=0;
  }

  // Speed differential bonus — different speed amplifies tunnel deception
  const speedDiff=Math.abs(speed-(td.prevSpd||0));
  if(speedDiff>=8){
    const speedBonus=Math.min(0.25,speedDiff*0.008)*scale;
    swingMissMult+=speedBonus;
    strongMult=Math.max(0.20,strongMult-speedBonus*0.5);
  }

  // Hesitation bonus — if previous pitch was a tunneled breaking ball
  // and current pitch is a fastball, batter hesitates
  const FAST_KEYS=['4FB','2FB','SK','CT'];
  const BREAKING_KEYS=['CB','SL','CH','SP','SCR','EPH','SLV','SWP','FK','KC'];
  if(FAST_KEYS.includes(pitchKey)&&BREAKING_KEYS.includes(td.prevPk)){
    const hesitationBonus=0.25*scale;
    swingMissMult+=hesitationBonus;
    strongMult=Math.max(0.20,strongMult-0.10*scale);
  }

  console.log('TUNNEL DEBUG: length=',td.length,'prevPk=',td.prevPk,'currentPk=',pitchKey,'speedDiff=',speedDiff,'swingMissMult=',swingMissMult,'strongMult=',strongMult,'overridesRepetition=',overridesRepetition,'level=',batterLevel);

  return {swingMissMult,strongMult,weakMult,overridesRepetition};
}

function getCountLocationModifier(zk,pitchKey){
  const noMod={
    strongMult:1.0,weakMult:1.0,swingMissMult:1.0,
    isCourage:false,isDanger:false,isTake:false
  };

  const ct=pitchCount;
  const effType=getEffectiveBatterType();

  // Level scaling — count leverage matters more at higher levels
  const levelScale={
    rec10:0.20,rec12:0.25,
    club10:0.32,club12:0.40,
    comp13:0.50,
    hsjv:0.62,
    hsvar:0.75,
    college:0.88,
    pro:1.00
  };
  const scale=levelScale[batterLevel]||0.55;

  // Get danger zones for this batter type and count
  // Handle PULL hitter handedness
  let typeKey=effType;
  if(effType==='PULL'){
    const currentHand=(typeof batter!=='undefined')?batter:'RHB';
    typeKey=currentHand==='LHB'?'PULL_LHB':'PULL_RHB';
  }

  const dangerTable=typeof DANGER_ZONES!=='undefined'?DANGER_ZONES:null;

  // HITTER'S COUNTS — danger zone logic
  if(HITTER_COUNTS.includes(ct)&&dangerTable){
    const zones=dangerTable[typeKey]&&dangerTable[typeKey][ct]?
      dangerTable[typeKey][ct]:
      (dangerTable['GENERIC'][ct]||[]);

    // 3-0 special case — check take probability
    if(ct==='3-0'){
      const takeProb=typeof TAKE_30_PROBABILITY!=='undefined'?
        (TAKE_30_PROBABILITY[effType]||0.55):0.55;
      if(Math.random()<takeProb){
        // Batter takes the pitch — treat as called strike/ball based on zone
        return {...noMod,isTake:true};
      }
    }

    const inDanger=zones.includes(zk);
    const neutralMult=ct==='2-0'?0.50:1.0; // 2-0 is 50% of full effect

    if(inDanger){
      // Pitcher threw into danger zone — batter sitting on this
      const dangerStrong=ct==='3-1'?
        1.0+(1.20*scale*neutralMult):  // 3-1 biggest danger
        1.0+(0.70*scale*neutralMult);  // 2-0 moderate danger
      const dangerWeak=ct==='3-1'?
        1.0+(0.60*scale*neutralMult):
        1.0+(0.35*scale*neutralMult);
      const dangerSwingMiss=ct==='3-1'?
        Math.max(0.30,1.0-(0.55*scale*neutralMult)):
        Math.max(0.50,1.0-(0.35*scale*neutralMult));

      console.log('COUNT-LOC DEBUG: DANGER ZONE ct=',ct,'zk=',zk,'type=',effType,'dangerStrong=',dangerStrong,'level=',batterLevel);

      return {
        strongMult:dangerStrong,
        weakMult:dangerWeak,
        swingMissMult:dangerSwingMiss,
        isCourage:false,
        isDanger:true,
        isTake:false
      };
    }else{
      // Pitcher threw OUTSIDE danger zone — courage pitch
      // Bigger bonus for chase zones, moderate for edges, small for opposite side
      let courageSwingMiss=1.0;
      let courageStrong=1.0;

      if(CHASE_ZONE_KEYS.includes(zk)){
        courageSwingMiss=1.0+(0.45*scale*neutralMult);
        courageStrong=Math.max(0.40,1.0-(0.40*scale*neutralMult));
      }else if(EDGE8_ZONE_KEYS.includes(zk)){
        courageSwingMiss=1.0+(0.28*scale*neutralMult);
        courageStrong=Math.max(0.55,1.0-(0.28*scale*neutralMult));
      }else{
        // Opposite side of zone from danger
        courageSwingMiss=1.0+(0.18*scale*neutralMult);
        courageStrong=Math.max(0.70,1.0-(0.18*scale*neutralMult));
      }

      console.log('COUNT-LOC DEBUG: COURAGE PITCH ct=',ct,'zk=',zk,'type=',effType,'courageSwingMiss=',courageSwingMiss,'level=',batterLevel);

      return {
        strongMult:courageStrong,
        weakMult:Math.max(0.75,1.0-(0.15*scale*neutralMult)),
        swingMissMult:courageSwingMiss,
        isCourage:true,
        isDanger:false,
        isTake:false
      };
    }
  }

  // PITCHER'S COUNTS — reward sweet spot and chase zones
  if(PITCHER_COUNTS.includes(ct)){
    const inSweetSpot=typeof PITCHER_COUNT_SWEET_SPOTS!=='undefined'&&
      PITCHER_COUNT_SWEET_SPOTS.includes(zk);
    const inChaseBonus=typeof PITCHER_COUNT_CHASE_BONUS!=='undefined'&&
      PITCHER_COUNT_CHASE_BONUS.includes(zk);
    const inStrikeZone=STRIKE9_ZONE_KEYS.includes(zk);

    if(inSweetSpot){
      return {
        strongMult:Math.max(0.50,1.0-(0.35*scale)),
        weakMult:Math.max(0.65,1.0-(0.22*scale)),
        swingMissMult:1.0+(0.40*scale),
        isCourage:false,isDanger:false,isTake:false
      };
    }

    if(inChaseBonus){
      return {
        strongMult:Math.max(0.60,1.0-(0.25*scale)),
        weakMult:Math.max(0.75,1.0-(0.15*scale)),
        swingMissMult:1.0+(0.30*scale),
        isCourage:false,isDanger:false,isTake:false
      };
    }

    if(inStrikeZone){
      // Batter protecting — more likely to make contact on strike zone pitches
      return {
        strongMult:1.0+(0.20*scale),
        weakMult:1.0+(0.15*scale),
        swingMissMult:Math.max(0.70,1.0-(0.20*scale)),
        isCourage:false,isDanger:false,isTake:false
      };
    }
  }

  // NEUTRAL COUNTS — 50% of hitter's count effect
  const neutralCounts=['0-0','1-0','1-1','2-1'];
  if(neutralCounts.includes(ct)&&dangerTable){
    const zones=dangerTable[typeKey]&&dangerTable[typeKey]['2-0']?
      dangerTable[typeKey]['2-0']:
      (dangerTable['GENERIC']['2-0']||[]);
    const inDanger=zones.includes(zk);

    if(inDanger){
      return {
        strongMult:1.0+(0.35*scale*0.50),
        weakMult:1.0+(0.18*scale*0.50),
        swingMissMult:Math.max(0.75,1.0-(0.18*scale*0.50)),
        isCourage:false, isDanger:true, isTake:false
      };
    } else {
      // Courage pitch in neutral count — smaller bonus than hitter's count
      const isChasezone=typeof CHASE_ZONE_KEYS!=='undefined'&&CHASE_ZONE_KEYS.includes(zk);
      const isEdgezone=typeof EDGE8_ZONE_KEYS!=='undefined'&&EDGE8_ZONE_KEYS.includes(zk);
      if(isChasezone||isEdgezone){
        return {
          strongMult:Math.max(0.80,1.0-(0.12*scale*0.50)),
          weakMult:Math.max(0.88,1.0-(0.08*scale*0.50)),
          swingMissMult:1.0+(0.15*scale*0.50),
          isCourage:true, isDanger:false, isTake:false
        };
      }
    }
  }

  return noMod;
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
    if(pitchKey==='KN'){
      // Knuckleball uses sweet spot model instead of breaking ball recognition
      const knMod=getKnuckleballModifier(speed);
      w['SWING & MISS']=Math.max(1,(w['SWING & MISS']||1)*knMod.swingMissMult);
      w['STRONG CONTACT']=Math.max(1,(w['STRONG CONTACT']||1)*knMod.strongMult);
      w['WEAK CONTACT']=Math.max(1,(w['WEAK CONTACT']||1)*knMod.weakMult);
    }else{
      const bbMod=getBreakingBallModifier(pitchKey);
      w['SWING & MISS']=Math.max(1,w['SWING & MISS']+(bbMod.swingMissBonus*100));
    }
  }

  // Location repetition penalty, tunnel reward, and count-location interaction
  if(simMode){
    const rep=getLocationRepetitionPenalty(zk,pitchKey);
    const tun=getTunnelReward(pitchKey,speed);
    const countLoc=getCountLocationModifier(zk,pitchKey);

    // Store count-location result for sim log — accessible in throwPitch
    window.__lastCountLocMod=countLoc;

    // Tunnel reward can override repetition penalty based on tunnel quality
    const repScale=1.0-tun.overridesRepetition;
    const effectiveStrongMult=1.0+((rep.strongMult-1.0)*repScale);
    const effectiveWeakMult=1.0+((rep.weakMult-1.0)*repScale);
    const effectiveSwingMissMult=1.0+((rep.swingMissMult-1.0)*repScale);

    // Apply repetition penalty (scaled by tunnel override)
    w['STRONG CONTACT']=Math.max(1,(w['STRONG CONTACT']||1)*effectiveStrongMult);
    w['WEAK CONTACT']=Math.max(1,(w['WEAK CONTACT']||1)*effectiveWeakMult);
    w['SWING & MISS']=Math.max(1,(w['SWING & MISS']||1)*effectiveSwingMissMult);

    // Apply tunnel reward on top
    w['STRONG CONTACT']=Math.max(1,(w['STRONG CONTACT']||1)*tun.strongMult);
    w['WEAK CONTACT']=Math.max(1,(w['WEAK CONTACT']||1)*tun.weakMult);
    w['SWING & MISS']=Math.max(1,(w['SWING & MISS']||1)*tun.swingMissMult);

    // Apply count-location modifier on top
    w['STRONG CONTACT']=Math.max(1,(w['STRONG CONTACT']||1)*countLoc.strongMult);
    w['WEAK CONTACT']=Math.max(1,(w['WEAK CONTACT']||1)*countLoc.weakMult);
    w['SWING & MISS']=Math.max(1,(w['SWING & MISS']||1)*countLoc.swingMissMult);
  }

  if(inStrike) delete w.BALL;
  Object.keys(w).forEach(k=>{w[k]=Math.max(1,w[k]);});
  return w;
}

function getSimOutcome(zk,rl,bd,ct,speed,pitchKey){return pickWeightedRecord(buildSimWeights(zk,rl,bd,ct,speed,pitchKey));}
function getVelocityFloor(pitchKey,level){
  const isFastball=['4FB','2FB','SK','CT'].includes(pitchKey);
  const isPowerBreaking=['SL','SWP','SLV'].includes(pitchKey);
  const isKnuckleball=pitchKey==='KN';

  if(isKnuckleball) return 0; // Knuckleball exempt from floor

  const fastballFloors={
    rec10:25,rec12:30,club10:28,club12:35,
    comp13:40,hsjv:50,hsvar:60,college:72,pro:80
  };
  const powerBreakingFloors={
    rec10:20,rec12:25,club10:25,club12:30,
    comp13:35,hsjv:42,hsvar:52,college:62,pro:68
  };
  const softBreakingFloors={
    rec10:15,rec12:20,club10:20,club12:25,
    comp13:28,hsjv:35,hsvar:42,college:52,pro:58
  };

  if(isFastball) return fastballFloors[level]||40;
  if(isPowerBreaking) return powerBreakingFloors[level]||35;
  return softBreakingFloors[level]||30;
}

function isBelowVelocityFloor(speed,pitchKey){
  if(!speed||!pitchKey) return false;
  const floor=getVelocityFloor(pitchKey,batterLevel);
  return speed<floor;
}

function getBelowFloorContactBonus(speed,pitchKey){
  const floor=getVelocityFloor(pitchKey,batterLevel);
  if(floor===0||speed>=floor) return {strongMult:1.0,weakMult:1.0};
  const deficit=floor-speed;
  const levelScale={
    rec10:0.25,rec12:0.25,club10:0.35,club12:0.40,
    comp13:0.50,hsjv:0.65,hsvar:0.80,college:0.90,pro:1.00
  };
  const scale=levelScale[batterLevel]||0.55;
  // More deficit = bigger bonus, capped at 4x strong contact at pro level
  const strongMult=1.0+Math.min(3.0,deficit*0.08)*scale;
  const weakMult=1.0+Math.min(1.5,deficit*0.04)*scale;
  return {strongMult,weakMult};
}

function simulateOutcome(zk,rl,bd,ct,speed,pitchKey){
  if(simMode&&atBatOver) return 'BALL';
  const effSpeed=typeof speed==='number'?speed:parseInt((document.getElementById('spd')||{}).value,10)||0;
  const effPitchKey=pitchKey||pitch;

  // Set count-location modifier at the start of every outcome calculation
  if(simMode){
    window.__lastCountLocMod=getCountLocationModifier(zk,effPitchKey);
  }
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
  // Below velocity floor — batter always swings at in-zone pitches
  if(isBelowVelocityFloor(effSpeed,effPitchKey) && STRIKE_ZONE_KEYS.includes(zk)){
    const w=buildSimWeights(zk,rl,bd,ct,effSpeed,effPitchKey);
    // Force swing — remove called strike possibility
    delete w.STRIKE;
    delete w.BALL;
    // Apply below-floor contact bonus
    const bonus=getBelowFloorContactBonus(effSpeed,effPitchKey);
    w['STRONG CONTACT']=Math.max(1,(w['STRONG CONTACT']||1)*bonus.strongMult);
    w['WEAK CONTACT']=Math.max(1,(w['WEAK CONTACT']||1)*bonus.weakMult);
    // Reduce swing and miss — batter can time this pitch
    w['SWING & MISS']=Math.max(1,(w['SWING & MISS']||1)*0.25);
    Object.keys(w).forEach(k=>{w[k]=Math.max(1,w[k]);});
    if(effSpeed) lastPitchSpeed=effSpeed;
    return pickWeightedRecord(w);
  }

  const result=getSimOutcome(zk,rl,bd,ct,effSpeed,effPitchKey);
  if(result==='STRIKE'){
    const ump=getUmpireSetting();
    // Gradient — inner zones less likely to be called ball than edge zones
    const gradientBallProb=ump.inZoneBallProb*getZoneBorderDistance(zk);
    if(Math.random()<gradientBallProb){
      if(effSpeed) lastPitchSpeed=effSpeed;
      return 'CALLED BALL';
    }
    // Homer umpire extra bias on in-zone pitches near border
    if(ump.homerBias&&getZoneBorderDistance(zk)>0.5&&Math.random()<0.08){
      if(effSpeed) lastPitchSpeed=effSpeed;
      return 'CALLED BALL';
    }
    if(effSpeed) lastPitchSpeed=effSpeed;
    return 'CALLED STRIKE';
  }
  if(effSpeed) lastPitchSpeed=effSpeed;
  return result;
}

function getAnimationDelay(){
  if(typeof PITCHES==='undefined'||typeof pitch==='undefined') return 1200;
  const ms=PITCHES[pitch]&&PITCHES[pitch].ms?PITCHES[pitch].ms:1000;
  return ms+300; // ball flight + small buffer
}

function applySimCountOutcome(outcome,strikesAtStart){
  let display=outcome;
  if(outcome==='BALL'||outcome==='CALLED BALL') ballCount=Math.min(4,ballCount+1);
  else if(outcome==='STRIKE'||outcome==='SWING & MISS'||outcome==='CALLED STRIKE') strikeCount=Math.min(3,strikeCount+1);
  else if(outcome==='FOUL'&&strikesAtStart<2) strikeCount=Math.min(2,strikeCount+1);
  renderCount();
  if(ballCount>=4){
    display='WALK';
    if(simMode){
      const delay=getAnimationDelay();
      setTimeout(()=>{
        applyWalkToRunners();
        lockThrowButton();
        showSimAdvanceButton();
      },delay);
    } else {
      showSimAdvanceButton();
    }
    saveSimState();
    return display;
  }
  if(strikeCount>=3&&(outcome==='STRIKE'||outcome==='SWING & MISS'||outcome==='CALLED STRIKE')){display='STRIKEOUT';addSimOutCore();if(simMode) lockThrowButton();showSimAdvanceButton();saveSimState();return display;}
  if(outcome==='GROUND OUT'||outcome==='POP FLY'){ballCount=0;strikeCount=0;renderCount();addSimOutCore();if(simMode) lockThrowButton();showSimAdvanceButton();saveSimState();return outcome;}
  if(outcome==='SINGLE'||outcome==='DOUBLE'||outcome==='TRIPLE'||outcome==='HOME RUN'){
    ballCount=0;strikeCount=0;renderCount();
    if(simMode){
      const delay=getAnimationDelay();
      setTimeout(()=>{
        applyHitToRunners(outcome);
        lockThrowButton();
        showSimAdvanceButton();
      },delay);
      scheduleSimSequenceClear(delay+2000);
    } else {
      showSimAdvanceButton();
      scheduleSimSequenceClear(2000);
    }
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
  incrementPitchCount();
  const effSpeed=typeof speed==='number'?speed:parseInt((document.getElementById('spd')||{}).value,10)||0;
  if(effSpeed) lastPitchSpeed=effSpeed;
  const prominent=outcome==='WALK'||outcome==='STRIKEOUT';
  const showLbl=(batterType!=='RANDOM')||batterRevealed;
  const takePrefix=(outcome==='CALLED STRIKE'||outcome==='CALLED BALL')?'TAKE: ':'';
  addSimLogEntry((showLbl?'['+getBatterSimLogLabel()+'] ':'')+pitchName+' → '+takePrefix+outcome,outcome,prominent);
  if(typeof onSimPitchRecorded==='function') onSimPitchRecorded(zone,pitch,outcome);

  // Add courage pitch or danger zone log entry
  const clm=window.__lastCountLocMod;
  if(clm){
    if(clm.isCourage&&['SWING & MISS','STRIKEOUT','CALLED STRIKE'].includes(outcome)){
      addSimLogEntry('COURAGE PITCH — unexpected location paid off',outcome,false);
    }
    if(clm.isDanger&&['SINGLE','DOUBLE','TRIPLE','HOME RUN','GROUND OUT','POP FLY'].includes(outcome)){
      addSimLogEntry('DANGER ZONE — batter was sitting on that location',outcome,false);
    }
    window.__lastCountLocMod=null;
  }
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
    ['GOOD','BAD','HOMER'].forEach(key=>{
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

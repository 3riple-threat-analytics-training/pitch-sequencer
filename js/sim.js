let simMode=false;
let batterType='RANDOM';
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
let totalStrikeouts=0;
let totalWalks=0;
let totalHits=0;
let pulledPitchers=[];
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
let teamScore=0;
let isHomeTeam=true;
let inningRunsAllowed=0;
let inningHits=0;
let scoreboardData=[]; // array of {inning, hits, score} per completed inning
let gameSeq=[]; // accumulates all pitches this game across all batters
let pendingRunnerUpdate=null; // suggested runner state after a hit
let lastSimDiamondBadgeText=null; // terminal outcome when opening modal without pendingRunnerUpdate

const WEAK_CONTACT_TABLE=[
  {outcome:'FOUL (STRAIGHT BACK)',weight:14},
  {outcome:'FOUL (PULLED)',weight:14},
  {outcome:'FOUL (LATE)',weight:12},
  {outcome:'GROUND OUT',weight:30},
  {outcome:'POP FLY',weight:20},
  {outcome:'SINGLE',weight:10}
];
const STRONG_CONTACT_TABLE=[
  {outcome:'FOUL (STRAIGHT BACK)',weight:9},
  {outcome:'FOUL (PULLED)',weight:9},
  {outcome:'FOUL (LATE)',weight:7},
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

  const currentPitch=typeof pitch!=='undefined'?pitch:'4FB';
  const range=typeof getPitchVelocityRange==='function'?
    getPitchVelocityRange(currentPitch):{min:45,max:100,auto:85};

  const cappedMax=Math.min(range.max,cap);
  const cappedMin=range.min;

  // Update slider bounds
  slider.min=cappedMin;
  slider.max=cappedMax;

  // Force slider value down if above cap
  const currentVal=parseInt(slider.value,10);
  if(currentVal>cappedMax){
    slider.value=cappedMax;
    if(sval) sval.textContent=cappedMax+' mph';
    if(typeof handleSpeedInput==='function') handleSpeedInput(cappedMax);
  } else {
    // Re-set value to force visual refresh
    slider.value=currentVal;
  }

  // Update range label
  const fatigue=getFatigueLevelCurrent();
  if(rangeLabel){
    if(fatigue.label!=='FRESH'){
      rangeLabel.textContent=cappedMin+'-'+cappedMax+' mph · FATIGUE CAP';
      rangeLabel.style.color='#f87171';
    } else {
      rangeLabel.textContent=cappedMin+'-'+cappedMax+' mph';
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

  // Update modal stats box to show full outing summary
  const statsBox=document.getElementById('pc-stats-box');
  if(statsBox){
    statsBox.innerHTML=
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">'
      +'<div><div id="pc-strikeouts" style="font-size:18px;font-weight:700;color:var(--text-primary);">'+totalStrikeouts+'</div>'
      +'<div style="font-size:7px;color:var(--text-muted);letter-spacing:1px;">K</div></div>'
      +'<div><div id="pc-walks" style="font-size:18px;font-weight:700;color:var(--text-primary);">'+totalWalks+'</div>'
      +'<div style="font-size:7px;color:var(--text-muted);letter-spacing:1px;">BB</div></div>'
      +'<div><div id="pc-hits" style="font-size:18px;font-weight:700;color:var(--text-primary);">'+totalHits+'</div>'
      +'<div style="font-size:7px;color:var(--text-muted);letter-spacing:1px;">H</div></div>'
      +'</div>';
  }

  modal.style.display='flex';
}

function closePitchingChangeModal(){
  const modal=document.getElementById('pitchingchangemodal');
  if(modal) modal.style.display='none';
}

function confirmPitchingChange(){
  closePitchingChangeModal();

  // Track pulled pitcher so they cannot pitch again
  const profile=getProfile();
  const activeId=typeof getActivePitcherId==='function'?getActivePitcherId():null;
  if(activeId&&!pulledPitchers.includes(activeId)){
    pulledPitchers.push(activeId);
  }

  // Save this pitcher's outing stats before reset
  const outingStats={
    pitcherId:activeId,
    name:profile?profile.name:'Pitcher',
    pitches:totalPitchCount,
    strikeouts:totalStrikeouts,
    walks:totalWalks,
    hits:totalHits,
    fatigue:getFatigueLevelCurrent().label
  };

  // Reset stats for new pitcher
  totalPitchCount=0;
  totalStrikeouts=0;
  totalWalks=0;
  totalHits=0;
  fatigueWarningShown=false;
  updateFatigueUI();
  applyFatigueToVelocity();

  const mode=typeof getAppMode==='function'?getAppMode():null;
  if(mode==='team'){
    openSettingsModal();
    setTimeout(()=>{
      renderRosterList();
    },200);
  } else {
    // Individual mode — show outing summary then end game
    const summary='OUTING SUMMARY\n\n'
      +'Pitcher: '+outingStats.name+'\n'
      +'Total Pitches: '+outingStats.pitches+'\n'
      +'Strikeouts: '+outingStats.strikeouts+'\n'
      +'Walks: '+outingStats.walks+'\n'
      +'Hits Allowed: '+outingStats.hits+'\n'
      +'Final Fatigue: '+outingStats.fatigue+'\n\n'
      +'Game over — great outing!';
    alert(summary);
    endGame();
  }
}

function saveGameHistory(){
  try{
    const profile=typeof getProfile==='function'?getProfile():null;
    const pitches=(typeof gameSeq!=='undefined'&&gameSeq.length)?gameSeq:
      (typeof seq!=='undefined'?seq:[]);
    if(!pitches.length) return; // no pitches thrown — skip
    // Build pitch mix
    const pitchMix={};
    const zoneMap={};
    const firstPitches={};
    const sequences={};
    const outcomes={};
    const countTendencies={};
    const vsBatterType={};
    const vsLHB={pitchMix:{},zoneMap:{},outcomes:{}};
    const vsRHB={pitchMix:{},zoneMap:{},outcomes:{}};
    pitches.forEach(function(p,i){
      const pk=p.pk||'';
      const zk=p.zk||'';
      const outcome=p.outcome||'';
      const count=p.count||'0-0';
      const bh=p.batterHand||'RHB';
      const bt=p.batterType||'GENERIC';
      // Pitch mix
      pitchMix[pk]=(pitchMix[pk]||0)+1;
      // Zone map
      if(zk) zoneMap[zk]=(zoneMap[zk]||0)+1;
      // First pitch of each at-bat (count===0-0)
      if(count==='0-0') firstPitches[pk]=(firstPitches[pk]||0)+1;
      // Sequences — what follows what
      if(i>0){
        const prev=pitches[i-1].pk||'';
        const key=prev+'->'+pk;
        sequences[key]=(sequences[key]||0)+1;
      }
      // Outcomes by pitch
      if(!outcomes[pk]) outcomes[pk]={};
      outcomes[pk][outcome]=(outcomes[pk][outcome]||0)+1;
      // Count tendencies
      if(!countTendencies[count]) countTendencies[count]={};
      countTendencies[count][pk]=(countTendencies[count][pk]||0)+1;
      // By batter type
      if(!vsBatterType[bt]) vsBatterType[bt]={pitchMix:{},outcomes:{}};
      vsBatterType[bt].pitchMix[pk]=(vsBatterType[bt].pitchMix[pk]||0)+1;
      if(!vsBatterType[bt].outcomes[outcome]) vsBatterType[bt].outcomes[outcome]=0;
      vsBatterType[bt].outcomes[outcome]++;
      // By batter handedness
      const side=bh==='RHB'?vsRHB:vsLHB;
      side.pitchMix[pk]=(side.pitchMix[pk]||0)+1;
      if(zk) side.zoneMap[zk]=(side.zoneMap[zk]||0)+1;
      if(!side.outcomes[outcome]) side.outcomes[outcome]=0;
      side.outcomes[outcome]++;
    });
    const game={
      date:Date.now(),
      pitcher:profile?profile.name:'Pitcher',
      ageGroup:profile?profile.ageGroup:'hsvar',
      homeAway:typeof isHomeTeam!=='undefined'?(isHomeTeam?'HOME':'AWAY'):'HOME',
      innings:typeof scoreboardData!=='undefined'&&scoreboardData.length?
        scoreboardData.length:Math.max(1,(inningNumber||1)-1),
      pitchCount:typeof totalPitchCount!=='undefined'?totalPitchCount:pitches.length,
      strikeouts:pitches.filter(function(p){
        return p.outcome==='STRIKEOUT';}).length||
        (typeof totalStrikeouts!=='undefined'?totalStrikeouts:0),
      walks:typeof totalWalks!=='undefined'?totalWalks:0,
      hits:pitches.filter(function(p){
        return p.outcome==='SINGLE'||p.outcome==='DOUBLE'||
          p.outcome==='TRIPLE'||p.outcome==='HOME RUN';}).length||
        (typeof totalHits!=='undefined'?totalHits:0),
      runsAllowed:typeof totalScore!=='undefined'?totalScore:0,
      teamScore:typeof teamScore!=='undefined'?teamScore:0,
      // Raw velocity sequence for ML velocity profiling
      velocities:pitches.map(function(p){return p.spd||0;}),
      // Velocity by pitch type for differential analysis
      veloByPitchType:(function(){
        const vbt={};
        pitches.forEach(function(p){
          const pk=p.pk||'';
          const spd=p.spd||0;
          if(!vbt[pk]) vbt[pk]=[];
          vbt[pk].push(spd);
        });
        return vbt;
      })(),
      pitchMix,zoneMap,firstPitches,sequences,
      outcomes,countTendencies,vsBatterType,vsLHB,vsRHB
    };
    // Load existing history
    const raw=localStorage.getItem('pitchseq-game-history');
    const history=raw?JSON.parse(raw):[];
    history.push(game);
    localStorage.setItem('pitchseq-game-history',JSON.stringify(history));
    // Sync to Firestore if signed in
    if(typeof fbSaveGameHistory==='function'&&typeof fbCurrentUser==='function'&&fbCurrentUser()){
      fbSaveGameHistory(game).catch(function(e){console.warn('Firestore game history sync failed:',e);});
    }
  }catch(e){console.error('saveGameHistory error:',e);}
}
function endGame(){
  // Save game history BEFORE resetting data
  saveGameHistory();
  // Reset everything to inning 1
  totalPitchCount=0;
  totalStrikeouts=0;
  totalWalks=0;
  totalHits=0;
  fatigueWarningShown=false;
  pulledPitchers=[];
  ballCount=0;
  strikeCount=0;
  outCount=0;
  inningNumber=1;
  simHalfTop=true;
  simInningBreak=false;
  totalScore=0;
  teamScore=0;
  // First time ever: always home game so tutorial runs without away opener conflict
  if(!localStorage.getItem('pitchseq-sim-first-run')){
    isHomeTeam=true;
    localStorage.setItem('pitchseq-sim-first-run','1');
  } else {
    isHomeTeam=Math.random()<0.5;
  }
  inningRunsAllowed=0;
  inningHits=0;
  scoreboardData=[];
  gameSeq=[];
  runners={first:false,second:false,third:false};
  pendingRunnerUpdate=null;
  simLog=[];
  pitchesInAtBat=0;
  batterRevealed=false;
  secretBatterType='';
  updateFatigueUI();
  applyFatigueToVelocity();
  updateSimStatBar();
  updateSimLogUI();
  renderCount();
  hideSimAdvanceButton();
  unlockThrowButton();
  clearSimStateSession();
  // Clear sequence
  if(typeof clearAll==='function') clearAll();
  showFatigueToast('NEW GAME — PLAY BALL!');
  // Run ML update after game ends
  setTimeout(function(){
    if(typeof runMLUpdate==='function') runMLUpdate();
  },800);
  // Show game report after reset
  setTimeout(function(){showGameSummary();},500);
}

function confirmEndGame(){
  const profile=getProfile();
  const name=profile?profile.name:'Pitcher';
  const msg='END GAME?\n\n'
    +name+' — '+totalPitchCount+' pitches\n'
    +'K: '+totalStrikeouts+' · BB: '+totalWalks+' · H: '+totalHits+'\n\n'
    +'This will reset the game to inning 1.\nAll pitch counts and fatigue will reset.';
  if(!confirm(msg)) return;
  endGame();
}

function showGameSummary(){
  // Load the most recently saved game
  try{
    const raw=localStorage.getItem('pitchseq-game-history');
    const history=raw?JSON.parse(raw):[];
    if(!history.length){alert('No game data available.');return;}
    const game=history[history.length-1];
    showGameReport(game,'GAME REPORT',function(){});
  }catch(e){alert('Could not load game report.');}
}
function showGameReport(game,title,onClose){
  const existing=document.getElementById('game-report-overlay');
  if(existing) existing.remove();
  const overlay=document.createElement('div');
  overlay.id='game-report-overlay';
  overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;'
    +'z-index:10000;background:#ffffff;overflow-y:auto;'
    +'font-family:\'DM Mono\',monospace;';
  const card=document.createElement('div');
  card.style.cssText='background:#ffffff;max-width:100%;width:100%;'
    +'margin:0 auto;border-radius:0;padding:20px;'
    +'border:none;';
  // Header
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;justify-content:space-between;align-items:center;'
    +'margin-bottom:16px;border-bottom:1px solid #1e3a5c;padding-bottom:12px;';
  const htitle=document.createElement('div');
  htitle.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:20px;'
    +'color:#0c4a6e;letter-spacing:3px;';
  htitle.textContent=title;
  const closeBtn=document.createElement('button');
  closeBtn.style.cssText='background:transparent;border:1px solid #0c4a6e;'
    +'color:#0c4a6e;padding:4px 10px;border-radius:4px;cursor:pointer;'
    +'font-family:\'DM Mono\',monospace;font-size:10px;';
  closeBtn.textContent='CLOSE';
  closeBtn.onclick=function(){overlay.remove();if(onClose)onClose();};
  hdr.appendChild(htitle);
  hdr.appendChild(closeBtn);
  card.appendChild(hdr);
  // Tab bar
  const tabBar=document.createElement('div');
  tabBar.style.cssText='display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid #bae6fd;';
  const tabs=['GAME','BUNDLES','CAREER'];
  const tabContents={};
  tabs.forEach(function(t){
    const btn=document.createElement('button');
    btn.id='report-tab-'+t;
    btn.style.cssText='padding:8px 16px;border:none;background:transparent;'
      +'font-family:\'Bebas Neue\',sans-serif;font-size:14px;letter-spacing:2px;'
      +'cursor:pointer;color:#5a8aaa;border-bottom:3px solid transparent;margin-bottom:-2px;';
    btn.textContent=t;
    btn.onclick=function(){
      tabs.forEach(function(t2){
        const b=document.getElementById('report-tab-'+t2);
        const c=document.getElementById('report-content-'+t2);
        if(b) b.style.cssText=b.style.cssText.replace('color:#0c4a6e;border-bottom:3px solid #0c4a6e;','color:#5a8aaa;border-bottom:3px solid transparent;');
        if(c) c.style.display='none';
      });
      btn.style.cssText=btn.style.cssText.replace('color:#5a8aaa;border-bottom:3px solid transparent;','color:#0c4a6e;border-bottom:3px solid #0c4a6e;');
      const content=document.getElementById('report-content-'+t);
      if(content) content.style.display='block';
    };
    tabBar.appendChild(btn);
    const content=document.createElement('div');
    content.id='report-content-'+t;
    content.style.display=t==='GAME'?'block':'none';
    tabContents[t]=content;
  });
  card.appendChild(tabBar);
  // Activate first tab
  const firstTab=document.getElementById('report-tab-GAME');
  if(firstTab) firstTab.style.cssText=firstTab.style.cssText.replace('color:#5a8aaa;border-bottom:3px solid transparent;','color:#0c4a6e;border-bottom:3px solid #0c4a6e;');
  // Add tab content containers to card
  tabs.forEach(function(t){card.appendChild(tabContents[t]);});
  // All game content goes into GAME tab
  const gameTab=tabContents['GAME'];
  // Summary stats
  const stats=document.createElement('div');
  stats.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;';
  function statBox(label,value,color){
    const b=document.createElement('div');
    b.style.cssText='background:#f0f9ff;border:0.5px solid #bae6fd;border-radius:6px;'
      +'padding:8px;text-align:center;';
    const v=document.createElement('div');
    v.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:22px;color:'
      +(color||'#e8f4fd')+';';
    v.textContent=value;
    const l=document.createElement('div');
    l.style.cssText='font-size:7px;color:#0c4a6e;letter-spacing:1px;margin-top:2px;font-weight:600;';
    l.textContent=label;
    b.appendChild(v);b.appendChild(l);
    return b;
  }
  stats.appendChild(statBox('PITCHES',game.pitchCount,'#0c4a6e'));
  stats.appendChild(statBox('STRIKEOUTS',game.strikeouts,'#166534'));
  stats.appendChild(statBox('WALKS',game.walks,'#991b1b'));
  stats.appendChild(statBox('HITS',game.hits,'#92400e'));
  stats.appendChild(statBox('RUNS',game.runsAllowed,'#991b1b'));
  stats.appendChild(statBox('INNINGS',game.innings,'#06b6d4'));
  gameTab.appendChild(stats);
  // Section label helper
  function sectionLabel(text){
    const s=document.createElement('div');
    s.style.cssText='font-size:8px;color:#0c4a6e;letter-spacing:2px;font-weight:700;'
      +'margin:14px 0 6px 0;text-transform:uppercase;border-top:0.5px solid #bae6fd;padding-top:10px;';
    s.textContent=text;
    gameTab.appendChild(s);
  }
  // Pitch mix chart
  sectionLabel('PITCH MIX');
  const totalPitches=Object.values(game.pitchMix||{}).reduce((a,b)=>a+b,0)||1;
  const pitchColors={'4FB':'#ef4444','2FB':'#f97316','CB':'#3b82f6','SL':'#a855f7',
    'CH':'#22c55e','CT':'#eab308','SP':'#06b6d4','SK':'#f43f5e',
    'FK':'#8b5cf6','SCR':'#ec4899','EPH':'#94a3b8','SLV':'#7c3aed',
    'SWP':'#10b981','KN':'#64748b','KC':'#6366f1'};
  Object.entries(game.pitchMix||{}).sort((a,b)=>b[1]-a[1]).forEach(function(e){
    const pk=e[0],cnt=e[1];
    const pct=Math.round(cnt/totalPitches*100);
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    const lbl=document.createElement('div');
    lbl.style.cssText='font-size:9px;color:#0c4a6e;width:40px;flex-shrink:0;font-weight:600;';
    lbl.textContent=pk;
    const bar=document.createElement('div');
    bar.style.cssText='flex:1;background:#e0f2fe;border-radius:2px;height:12px;';
    const fill=document.createElement('div');
    fill.style.cssText='height:100%;border-radius:2px;background:'
      +(pitchColors[pk]||'#5a8aaa')+';width:'+pct+'%;';
    bar.appendChild(fill);
    const pctLbl=document.createElement('div');
    pctLbl.style.cssText='font-size:9px;color:#0c4a6e;width:36px;text-align:right;flex-shrink:0;font-weight:600;';
    pctLbl.textContent=cnt+' ('+pct+'%)';
    row.appendChild(lbl);row.appendChild(bar);row.appendChild(pctLbl);
    gameTab.appendChild(row);
  });
  // Zone heat map
  sectionLabel('ZONE HEAT MAP');
  // Legend
  const legend=document.createElement('div');
  legend.style.cssText='display:flex;gap:10px;margin-bottom:6px;font-size:8px;';
  [['#ef4444','IN ZONE'],['#d97706','EDGE'],['#3b82f6','CHASE']].forEach(function(e){
    const item=document.createElement('div');
    item.style.cssText='display:flex;align-items:center;gap:3px;color:#8aabb8;';
    const dot=document.createElement('div');
    dot.style.cssText='width:8px;height:8px;border-radius:2px;background:'+e[0]+';';
    item.appendChild(dot);
    item.appendChild(document.createTextNode(e[1]));
    legend.appendChild(item);
  });
  gameTab.appendChild(legend);
  // Chase row top
  const chaseTop=document.createElement('div');
  chaseTop.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;max-width:180px;margin:0 auto 2px auto;';
  // Chase top: CUR is left on screen, CUL is right (catcher's POV swap)
  ['CUR','CUM','CUL'].forEach(function(zk){
    const cnt=game.zoneMap[zk]||0;
    const cell=document.createElement('div');
    cell.style.cssText='height:22px;border-radius:3px;display:flex;align-items:center;'
      +'justify-content:center;font-size:8px;font-weight:700;'
      +'background:rgba(59,130,246,'+(cnt>0?0.6:0.08)+');'
      +'color:'+(cnt>0?'#93c5fd':'#3a5a7a')+';border:0.5px solid #1e3a5c;';
    cell.textContent=cnt>0?cnt:'';
    chaseTop.appendChild(cell);
  });
  gameTab.appendChild(chaseTop);
  // Middle row: CIN + strike zone + COUT
  const midWrap=document.createElement('div');
  midWrap.style.cssText='display:flex;gap:2px;max-width:220px;margin:0 auto 2px auto;align-items:stretch;';
  // Left side chase (COUT = inside from catcher view)
  const coutCell=document.createElement('div');
  const coutCnt=game.zoneMap['COUT']||0;
  coutCell.style.cssText='width:28px;border-radius:3px;display:flex;align-items:center;'
    +'justify-content:center;font-size:8px;font-weight:700;'
    +'background:rgba(59,130,246,'+(coutCnt>0?0.6:0.08)+');'
    +'color:'+(coutCnt>0?'#93c5fd':'#3a5a7a')+';border:0.5px solid #1e3a5c;flex-shrink:0;';
  coutCell.textContent=coutCnt>0?coutCnt:'';
  midWrap.appendChild(coutCell);
  // Strike zone 3x3
  const strikeWrap=document.createElement('div');
  strikeWrap.style.cssText='flex:1;';
  // Edge top row
  const edgeTop=document.createElement('div');
  edgeTop.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-bottom:2px;';
  // Edge top: TR-CRN is left on screen, TL-CRN is right (catcher's POV swap)
  ['TR-CRN','TOP-EDG','TL-CRN'].forEach(function(zk){
    const cnt=game.zoneMap[zk]||0;
    const cell=document.createElement('div');
    cell.style.cssText='height:18px;border-radius:2px;display:flex;align-items:center;'
      +'justify-content:center;font-size:7px;font-weight:700;'
      +'background:rgba(217,119,6,'+(cnt>0?0.7:0.08)+');'
      +'color:'+(cnt>0?'#fcd34d':'#3a5a7a')+';border:0.5px solid #1e3a5c;';
    cell.textContent=cnt>0?cnt:'';
    edgeTop.appendChild(cell);
  });
  strikeWrap.appendChild(edgeTop);
  // Inner zone rows with edge sides
  // ZKC order matches catcher's POV display — TR/TM/TL left-to-right on screen
  [['TR','TM','TL'],['MR','MM','ML'],['BR','BM','BL']].forEach(function(row,ri){
    const rowWrap=document.createElement('div');
    rowWrap.style.cssText='display:flex;gap:2px;margin-bottom:2px;';
    const edgeKeys=[['LFT-EDG'],['RGT-EDG']];
    // Left edge
    // LFT-EDG is on the RIGHT side of screen from catcher's view
    const leftEdgeKey=ri===1?'RGT-EDG':null;
    const leftEdgeCell=document.createElement('div');
    const leftCnt=leftEdgeKey?(game.zoneMap[leftEdgeKey]||0):0;
    leftEdgeCell.style.cssText='width:18px;border-radius:2px;display:flex;align-items:center;'
      +'justify-content:center;font-size:7px;font-weight:700;flex-shrink:0;'
      +'background:rgba(217,119,6,'+(leftEdgeKey&&leftCnt>0?0.7:0.08)+');'
      +'color:'+(leftEdgeKey&&leftCnt>0?'#fcd34d':'#3a5a7a')+';border:0.5px solid #1e3a5c;';
    leftEdgeCell.textContent=leftEdgeKey&&leftCnt>0?leftCnt:'';
    rowWrap.appendChild(leftEdgeCell);
    // Inner zones
    const innerWrap=document.createElement('div');
    innerWrap.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;flex:1;';
    const maxZone=Math.max.apply(null,['TL','TM','TR','ML','MM','MR','BL','BM','BR'].map(z=>game.zoneMap[z]||0))||1;
    row.forEach(function(zk){
      const cnt=game.zoneMap[zk]||0;
      const intensity=cnt/maxZone;
      const cell=document.createElement('div');
      cell.style.cssText='height:30px;border-radius:2px;display:flex;align-items:center;'
        +'justify-content:center;font-size:9px;font-weight:700;'
        +'background:rgba(239,68,68,'+Math.max(0.05,intensity)+');'
        +'color:'+(intensity>0.5?'#fff':'#8aabb8')+';border:0.5px solid #1e3a5c;';
      cell.textContent=cnt>0?cnt:'';
      innerWrap.appendChild(cell);
    });
    rowWrap.appendChild(innerWrap);
    // Right edge
    // RGT-EDG is on the LEFT side of screen from catcher's view
    const rightEdgeKey=ri===1?'LFT-EDG':null;
    const rightEdgeCell=document.createElement('div');
    const rightCnt=rightEdgeKey?(game.zoneMap[rightEdgeKey]||0):0;
    rightEdgeCell.style.cssText='width:18px;border-radius:2px;display:flex;align-items:center;'
      +'justify-content:center;font-size:7px;font-weight:700;flex-shrink:0;'
      +'background:rgba(217,119,6,'+(rightEdgeKey&&rightCnt>0?0.7:0.08)+');'
      +'color:'+(rightEdgeKey&&rightCnt>0?'#fcd34d':'#3a5a7a')+';border:0.5px solid #1e3a5c;';
    rightEdgeCell.textContent=rightEdgeKey&&rightCnt>0?rightCnt:'';
    rowWrap.appendChild(rightEdgeCell);
    strikeWrap.appendChild(rowWrap);
  });
  // Edge bottom row
  const edgeBot=document.createElement('div');
  edgeBot.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-bottom:2px;';
  // Edge bottom: BR-CRN is left on screen, BL-CRN is right (catcher's POV swap)
  ['BR-CRN','BOT-EDG','BL-CRN'].forEach(function(zk){
    const cnt=game.zoneMap[zk]||0;
    const cell=document.createElement('div');
    cell.style.cssText='height:18px;border-radius:2px;display:flex;align-items:center;'
      +'justify-content:center;font-size:7px;font-weight:700;'
      +'background:rgba(217,119,6,'+(cnt>0?0.7:0.08)+');'
      +'color:'+(cnt>0?'#fcd34d':'#3a5a7a')+';border:0.5px solid #1e3a5c;';
    cell.textContent=cnt>0?cnt:'';
    edgeBot.appendChild(cell);
  });
  strikeWrap.appendChild(edgeBot);
  midWrap.appendChild(strikeWrap);
  // Right side chase (CIN = outside from catcher view)
  const cinCell=document.createElement('div');
  const cinCnt=game.zoneMap['CIN']||0;
  cinCell.style.cssText='width:28px;border-radius:3px;display:flex;align-items:center;'
    +'justify-content:center;font-size:8px;font-weight:700;'
    +'background:rgba(59,130,246,'+(cinCnt>0?0.6:0.08)+');'
    +'color:'+(cinCnt>0?'#93c5fd':'#3a5a7a')+';border:0.5px solid #1e3a5c;flex-shrink:0;';
  cinCell.textContent=cinCnt>0?cinCnt:'';
  midWrap.appendChild(cinCell);
  gameTab.appendChild(midWrap);
  // Chase row bottom
  const chaseBot=document.createElement('div');
  chaseBot.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;max-width:180px;margin:0 auto 2px auto;';
  // Chase bottom: CLO-L is right on screen, CLO-R is left (catcher's POV swap)
  ['CLO-L','CLO-M','CLO-R'].forEach(function(zk){
    const cnt=game.zoneMap[zk]||0;
    const cell=document.createElement('div');
    cell.style.cssText='height:22px;border-radius:3px;display:flex;align-items:center;'
      +'justify-content:center;font-size:8px;font-weight:700;'
      +'background:rgba(59,130,246,'+(cnt>0?0.6:0.08)+');'
      +'color:'+(cnt>0?'#93c5fd':'#3a5a7a')+';border:0.5px solid #1e3a5c;';
    cell.textContent=cnt>0?cnt:'';
    chaseBot.appendChild(cell);
  });
  gameTab.appendChild(chaseBot);
  // Count tendencies
  sectionLabel('COUNT TENDENCIES');
  const keyCountsOrder=['0-0','0-1','0-2','1-0','1-1','1-2','2-0','2-1','2-2','3-0','3-1','3-2'];
  keyCountsOrder.forEach(function(ct){
    const ctData=game.countTendencies[ct];
    if(!ctData) return;
    const topPitch=Object.entries(ctData).sort((a,b)=>b[1]-a[1])[0];
    if(!topPitch) return;
      const row=document.createElement('div');
      row.style.cssText='display:flex;justify-content:space-between;'
        +'font-size:9px;color:#0c4a6e;margin-bottom:3px;font-weight:600;';
    const l=document.createElement('div');
    l.textContent='COUNT '+ct;
    const r=document.createElement('div');
    r.style.color='#0c4a6e';
    r.textContent=topPitch[0]+' ('+topPitch[1]+'x)';
    row.appendChild(l);row.appendChild(r);
    gameTab.appendChild(row);
  });
  // Key patterns
  sectionLabel('PATTERN ALERTS');
  const alerts=[];
  // First pitch fastball tendency
  const fp=game.firstPitches||{};
  const fpTotal=Object.values(fp).reduce((a,b)=>a+b,0)||1;
  const fpFB=(fp['4FB']||0)+(fp['2FB']||0)+(fp['SK']||0)+(fp['CT']||0)+(fp['SP']||0);
  if(fpFB/fpTotal>0.70) alerts.push('⚠ '+Math.round(fpFB/fpTotal*100)+'% fastball first pitch — predictable opener');
  // Most used pitch
  const topPitch=Object.entries(game.pitchMix||{}).sort((a,b)=>b[1]-a[1])[0];
  if(topPitch&&topPitch[1]/totalPitches>0.55) alerts.push('⚠ '+topPitch[0]+' used '+Math.round(topPitch[1]/totalPitches*100)+'% of time — over-reliance');
  // Most used zone
  const topZone=Object.entries(game.zoneMap||{}).sort((a,b)=>b[1]-a[1])[0];
  const totalZonePitches=Object.values(game.zoneMap||{}).reduce((a,b)=>a+b,0)||1;
  if(topZone&&topZone[1]/totalZonePitches>0.30) alerts.push('⚠ '+topZone[0]+' zone used '+Math.round(topZone[1]/totalZonePitches*100)+'% of time — location pattern');
  if(!alerts.length) alerts.push('✓ No major patterns detected — good variety!');
  alerts.forEach(function(a){
    const al=document.createElement('div');
    al.style.cssText='font-size:9px;color:#0c4a6e'
      +';margin-bottom:4px;line-height:1.4;font-weight:600;';
    al.textContent=a;
    gameTab.appendChild(al);
  });
  // Strikeout pitch selection for this game
  sectionLabel('STRIKEOUT PITCH SELECTION');
  const gameSoPitches={};
  Object.entries(game.outcomes||{}).forEach(function(e){
    const pk=e[0];
    if(e[1]['STRIKEOUT']) gameSoPitches[pk]=(gameSoPitches[pk]||0)+e[1]['STRIKEOUT'];
  });
  const gameSoTotal=Object.values(gameSoPitches).reduce(function(a,b){return a+b;},0)||1;
  const gamePitchColors={'4FB':'#dc2626','2FB':'#ea580c','CB':'#2563eb','SL':'#9333ea',
    'CH':'#16a34a','CT':'#ca8a04','SP':'#0891b2','SK':'#e11d48',
    'FK':'#7c3aed','SCR':'#db2777','EPH':'#334155','SLV':'#6d28d9',
    'SWP':'#059669','KN':'#334155','KC':'#4f46e5'};
  if(Object.keys(gameSoPitches).length===0){
    const noSO=document.createElement('div');
    noSO.style.cssText='font-size:9px;color:#475569;margin-bottom:8px;';
    noSO.textContent='No strikeouts recorded this game.';
    gameTab.appendChild(noSO);
  } else {
    Object.entries(gameSoPitches).sort(function(a,b){return b[1]-a[1];}).forEach(function(e){
      const pk=e[0],cnt=e[1];
      const pct=Math.round(cnt/gameSoTotal*100);
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:5px;';
      const lbl=document.createElement('div');
      lbl.style.cssText='font-size:9px;color:#0c4a6e;width:40px;flex-shrink:0;font-weight:700;';
      lbl.textContent=pk;
      const bar=document.createElement('div');
      bar.style.cssText='flex:1;background:#bae6fd;border-radius:2px;height:14px;';
      const fill=document.createElement('div');
      fill.style.cssText='height:100%;border-radius:2px;background:'+(gamePitchColors[pk]||'#334155')+';width:'+pct+'%;';
      bar.appendChild(fill);
      const pctLbl=document.createElement('div');
      pctLbl.style.cssText='font-size:9px;color:#0c4a6e;width:60px;text-align:right;flex-shrink:0;font-weight:700;';
      pctLbl.textContent=cnt+' K ('+pct+'%)';
      row.appendChild(lbl);row.appendChild(bar);row.appendChild(pctLbl);
      gameTab.appendChild(row);
    });
  }
  // VS LHB and VS RHB heat maps
  sectionLabel('VS LEFT-HANDED VS RIGHT-HANDED BATTERS');
  const gameHandWrap=document.createElement('div');
  gameHandWrap.style.cssText='display:flex;gap:16px;flex-wrap:wrap;justify-content:center;';
  function buildGameHandHeatMap(container,zoneData,title){
    const box=document.createElement('div');
    box.style.cssText='flex:1;min-width:140px;max-width:220px;';
    const ttl=document.createElement('div');
    ttl.style.cssText='font-size:10px;color:#0c4a6e;font-weight:700;'
      +'text-align:center;margin-bottom:4px;letter-spacing:1px;';
    ttl.textContent=title;
    box.appendChild(ttl);
    const maxZ=Math.max.apply(null,['TL','TM','TR','ML','MM','MR','BL','BM','BR']
      .map(function(z){return zoneData[z]||0;}))||1;
    const grid=document.createElement('div');
    grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;';
    [['TR','TM','TL'],['MR','MM','ML'],['BR','BM','BL']].forEach(function(row){
      row.forEach(function(zk){
        const cnt=zoneData[zk]||0;
        const intensity=cnt/maxZ;
        const cell=document.createElement('div');
        cell.style.cssText='height:32px;border-radius:3px;display:flex;align-items:center;'
          +'justify-content:center;font-size:9px;font-weight:700;'
          +'background:rgba(220,38,38,'+Math.max(0.06,intensity)+');'
          +'color:'+(intensity>0.4?'#fff':'#334155')+';border:1px solid #bae6fd;';
        cell.textContent=cnt>0?cnt:'';
        grid.appendChild(cell);
      });
    });
    box.appendChild(grid);
    container.appendChild(box);
  }
  buildGameHandHeatMap(gameHandWrap,game.vsLHB&&game.vsLHB.zoneMap||{},'VS LHB');
  buildGameHandHeatMap(gameHandWrap,game.vsRHB&&game.vsRHB.zoneMap||{},'VS RHB');
  gameTab.appendChild(gameHandWrap);
  // Export PDF button
  const exportBtn=document.createElement('button');
  exportBtn.style.cssText='width:100%;margin-top:16px;padding:10px;border-radius:6px;'
    +'border:1px solid #0c4a6e;background:#e0f2fe;color:#0c4a6e;'
    +'font-family:\'Bebas Neue\',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;';
  exportBtn.textContent='EXPORT REPORT TO PDF';
  exportBtn.onclick=function(){alert('PDF export coming soon.');};
  gameTab.appendChild(exportBtn);
  // Build BUNDLES tab
  const bundlesTab=tabContents['BUNDLES'];
  try{
    const raw=localStorage.getItem('pitchseq-game-history');
    const allGames=raw?JSON.parse(raw):[];
    if(allGames.length<2){
      const msg=document.createElement('div');
      msg.style.cssText='padding:20px;text-align:center;font-size:11px;color:#334155;';
      msg.textContent='Play at least 2 games to see bundle analysis.';
      bundlesTab.appendChild(msg);
    } else {
      // Split into bundles of 10
      const bundles=[];
      for(let i=0;i<allGames.length;i+=10){
        bundles.push(allGames.slice(i,i+10));
      }
      // Bundle section label
      function bLabel(text){
        const s=document.createElement('div');
        s.style.cssText='font-size:11px;color:#0c4a6e;letter-spacing:2px;font-weight:700;'
          +'margin:16px 0 8px 0;text-transform:uppercase;border-top:2px solid #0c4a6e;padding-top:10px;';
        s.textContent=text;
        bundlesTab.appendChild(s);
      }
      // Bundle avg helper
      function bundleAvg(bundle,key){
        const vals=bundle.map(function(g){return g[key]||0;});
        return Math.round(vals.reduce(function(a,b){return a+b;},0)/bundle.length*10)/10;
      }
      // 1. Strikeout rate line chart
      bLabel('STRIKEOUT RATE PER GAME');
      const soCanvas=document.createElement('canvas');
      soCanvas.style.cssText='width:100%;max-height:200px;';
      bundlesTab.appendChild(soCanvas);
      const soLabels=allGames.map(function(g,i){return 'G'+(i+1);});
      const soData=allGames.map(function(g){return g.strikeouts||0;});
      new Chart(soCanvas,{
        type:'line',
        data:{
          labels:soLabels,
          datasets:[{
            label:'Strikeouts',
            data:soData,
            borderColor:'#166534',
            backgroundColor:'rgba(22,101,52,0.1)',
            borderWidth:2,
            pointBackgroundColor:'#166534',
            tension:0.3,
            fill:true
          }]
        },
        options:{
          responsive:true,
          plugins:{legend:{display:false}},
          scales:{
            y:{beginAtZero:true,ticks:{color:'#0c4a6e',font:{weight:'bold'}},grid:{color:'#e0f2fe'}},
            x:{ticks:{color:'#0c4a6e',font:{weight:'bold'}},grid:{display:false}}
          }
        }
      });
      // Bundle divider lines on chart
      // 2. Pitch mix by bundle — grouped bar chart
      bLabel('PITCH MIX BY BUNDLE');
      const pmCanvas=document.createElement('canvas');
      pmCanvas.style.cssText='width:100%;max-height:220px;';
      bundlesTab.appendChild(pmCanvas);
      // Get all pitch types across all games
      const allPitchTypes={};
      allGames.forEach(function(g){Object.keys(g.pitchMix||{}).forEach(function(pk){allPitchTypes[pk]=true;});});
      const pitchTypeList=Object.keys(allPitchTypes);
      const pitchChartColors={'4FB':'#dc2626','2FB':'#ea580c','CB':'#2563eb','SL':'#9333ea',
        'CH':'#16a34a','CT':'#ca8a04','SP':'#0891b2','SK':'#e11d48',
        'FK':'#7c3aed','SCR':'#db2777','EPH':'#475569','SLV':'#6d28d9',
        'SWP':'#059669','KN':'#475569','KC':'#4f46e5'};
      const bundleLabels=bundles.map(function(b,i){
        return 'Bundle '+(i+1)+'\n('+b.length+' games)';
      });
      const pmDatasets=pitchTypeList.map(function(pk){
        return {
          label:pk,
          data:bundles.map(function(bundle){
            const total=bundle.reduce(function(s,g){return s+Object.values(g.pitchMix||{}).reduce(function(a,b){return a+b;},0);},0)||1;
            const count=bundle.reduce(function(s,g){return s+(g.pitchMix||{})[pk]||0;},0);
            return Math.round(count/total*100);
          }),
          backgroundColor:pitchChartColors[pk]||'#475569'
        };
      });
      new Chart(pmCanvas,{
        type:'bar',
        data:{labels:bundleLabels,datasets:pmDatasets},
        options:{
          responsive:true,
          plugins:{legend:{position:'bottom',labels:{color:'#0c4a6e',font:{weight:'bold'},boxWidth:12}}},
          scales:{
            x:{stacked:false,ticks:{color:'#0c4a6e',font:{weight:'bold'}},grid:{display:false}},
            y:{stacked:false,beginAtZero:true,max:100,
              ticks:{color:'#0c4a6e',font:{weight:'bold'},callback:function(v){return v+'%';}},
              grid:{color:'#e0f2fe'}}
          }
        }
      });
      // 3. Zone heat maps side by side per bundle
      bLabel('ZONE DISTRIBUTION BY BUNDLE');
      const hmWrap=document.createElement('div');
      hmWrap.style.cssText='display:flex;gap:12px;flex-wrap:wrap;justify-content:center;';
      bundles.forEach(function(bundle,bi){
        const hmBox=document.createElement('div');
        hmBox.style.cssText='flex:1;min-width:140px;max-width:220px;';
        const hmTitle=document.createElement('div');
        hmTitle.style.cssText='font-size:10px;color:#0c4a6e;font-weight:700;'
          +'text-align:center;margin-bottom:4px;letter-spacing:1px;';
        hmTitle.textContent='BUNDLE '+(bi+1)+' ('+bundle.length+' games)';
        hmBox.appendChild(hmTitle);
        // Aggregate zone map for this bundle
        const zoneAgg={};
        bundle.forEach(function(g){
          Object.entries(g.zoneMap||{}).forEach(function(e){
            zoneAgg[e[0]]=(zoneAgg[e[0]]||0)+e[1];
          });
        });
        const zoneOrder=[['TR','TM','TL'],['MR','MM','ML'],['BR','BM','BL']];
        const maxZ=Math.max.apply(null,['TL','TM','TR','ML','MM','MR','BL','BM','BR'].map(function(z){return zoneAgg[z]||0;}))||1;
        const grid=document.createElement('div');
        grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;';
        zoneOrder.forEach(function(row){
          row.forEach(function(zk){
            const cnt=zoneAgg[zk]||0;
            const intensity=cnt/maxZ;
            const cell=document.createElement('div');
            cell.style.cssText='height:32px;border-radius:3px;display:flex;align-items:center;'
              +'justify-content:center;font-size:9px;font-weight:700;'
              +'background:rgba(220,38,38,'+Math.max(0.06,intensity)+');'
              +'color:'+(intensity>0.4?'#fff':'#334155')+';border:1px solid #e0f2fe;';
            cell.textContent=cnt>0?cnt:'';
            grid.appendChild(cell);
          });
        });
        hmBox.appendChild(grid);
        hmWrap.appendChild(hmBox);
      });
      bundlesTab.appendChild(hmWrap);
      // 4. First pitch strike % by bundle — stat with trend arrows
      bLabel('FIRST PITCH TENDENCIES BY BUNDLE');
      const fpTable=document.createElement('div');
      fpTable.style.cssText='width:100%;';
      // Header
      const fpHdr=document.createElement('div');
      fpHdr.style.cssText='display:grid;grid-template-columns:1fr repeat('+bundles.length+',1fr);'
        +'gap:4px;margin-bottom:4px;';
      const fpHdrLabel=document.createElement('div');
      fpHdrLabel.style.cssText='font-size:9px;color:#0c4a6e;font-weight:700;';
      fpHdrLabel.textContent='PITCH';
      fpHdr.appendChild(fpHdrLabel);
      bundles.forEach(function(b,i){
        const h=document.createElement('div');
        h.style.cssText='font-size:9px;color:#0c4a6e;font-weight:700;text-align:center;';
        h.textContent='B'+(i+1);
        fpHdr.appendChild(h);
      });
      fpTable.appendChild(fpHdr);
      // Get all first pitch types
      const fpTypes={};
      allGames.forEach(function(g){Object.keys(g.firstPitches||{}).forEach(function(pk){fpTypes[pk]=true;});});
      Object.keys(fpTypes).forEach(function(pk){
        const row=document.createElement('div');
        row.style.cssText='display:grid;grid-template-columns:1fr repeat('+bundles.length+',1fr);'
          +'gap:4px;margin-bottom:3px;padding:3px 0;border-bottom:1px solid #e0f2fe;';
        const label=document.createElement('div');
        label.style.cssText='font-size:9px;color:#0c4a6e;font-weight:700;';
        label.textContent=pk;
        row.appendChild(label);
        let prevPct=null;
        bundles.forEach(function(bundle){
          const totalFP=bundle.reduce(function(s,g){return s+Object.values(g.firstPitches||{}).reduce(function(a,b){return a+b;},0);},0)||1;
          const count=bundle.reduce(function(s,g){return s+(g.firstPitches||{})[pk]||0;},0);
          const pct=Math.round(count/totalFP*100);
          const cell=document.createElement('div');
          cell.style.cssText='font-size:9px;font-weight:700;text-align:center;';
          let arrow='';
          let arrowColor='#0c4a6e';
          if(prevPct!==null){
            if(pct>prevPct){arrow=' ↑';arrowColor='#166534';}
            else if(pct<prevPct){arrow=' ↓';arrowColor='#991b1b';}
            else{arrow=' →';arrowColor='#475569';}
          }
          cell.innerHTML='<span style="color:#0c4a6e;">'+pct+'%</span>'
            +'<span style="color:'+arrowColor+';">'+arrow+'</span>';
          row.appendChild(cell);
          prevPct=pct;
        });
        fpTable.appendChild(row);
      });
      bundlesTab.appendChild(fpTable);
      // Strikeout pitch selection across all games
      bLabel('STRIKEOUT PITCH SELECTION');
      const bundleSoPitches={};
      allGames.forEach(function(g){
        Object.entries(g.outcomes||{}).forEach(function(e){
          const pk=e[0];
          if(e[1]['STRIKEOUT']) bundleSoPitches[pk]=(bundleSoPitches[pk]||0)+e[1]['STRIKEOUT'];
        });
      });
      const bundleSoTotal=Object.values(bundleSoPitches).reduce(function(a,b){return a+b;},0)||1;
      const bundlePitchColors={'4FB':'#dc2626','2FB':'#ea580c','CB':'#2563eb','SL':'#9333ea',
        'CH':'#16a34a','CT':'#ca8a04','SP':'#0891b2','SK':'#e11d48',
        'FK':'#7c3aed','SCR':'#db2777','EPH':'#334155','SLV':'#6d28d9',
        'SWP':'#059669','KN':'#334155','KC':'#4f46e5'};
      if(Object.keys(bundleSoPitches).length===0){
        const noSO=document.createElement('div');
        noSO.style.cssText='font-size:9px;color:#475569;margin-bottom:8px;';
        noSO.textContent='No strikeout data yet.';
        bundlesTab.appendChild(noSO);
      } else {
        Object.entries(bundleSoPitches).sort(function(a,b){return b[1]-a[1];}).forEach(function(e){
          const pk=e[0],cnt=e[1];
          const pct=Math.round(cnt/bundleSoTotal*100);
          const row=document.createElement('div');
          row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:5px;';
          const lbl=document.createElement('div');
          lbl.style.cssText='font-size:9px;color:#0c4a6e;width:40px;flex-shrink:0;font-weight:700;';
          lbl.textContent=pk;
          const bar=document.createElement('div');
          bar.style.cssText='flex:1;background:#bae6fd;border-radius:2px;height:14px;';
          const fill=document.createElement('div');
          fill.style.cssText='height:100%;border-radius:2px;background:'+(bundlePitchColors[pk]||'#334155')+';width:'+pct+'%;';
          bar.appendChild(fill);
          const pctLbl=document.createElement('div');
          pctLbl.style.cssText='font-size:9px;color:#0c4a6e;width:60px;text-align:right;flex-shrink:0;font-weight:700;';
          pctLbl.textContent=cnt+' K ('+pct+'%)';
          row.appendChild(lbl);row.appendChild(bar);row.appendChild(pctLbl);
          bundlesTab.appendChild(row);
        });
      }
      // VS LHB and VS RHB heat maps
      bLabel('VS LEFT-HANDED VS RIGHT-HANDED BATTERS');
      const bundleHandWrap=document.createElement('div');
      bundleHandWrap.style.cssText='display:flex;gap:16px;flex-wrap:wrap;justify-content:center;';
      // Aggregate vsLHB and vsRHB across all games
      const bundleVsLHB={zoneMap:{}};
      const bundleVsRHB={zoneMap:{}};
      allGames.forEach(function(g){
        Object.entries((g.vsLHB||{}).zoneMap||{}).forEach(function(e){
          bundleVsLHB.zoneMap[e[0]]=(bundleVsLHB.zoneMap[e[0]]||0)+e[1];
        });
        Object.entries((g.vsRHB||{}).zoneMap||{}).forEach(function(e){
          bundleVsRHB.zoneMap[e[0]]=(bundleVsRHB.zoneMap[e[0]]||0)+e[1];
        });
      });
      function buildBundleHandHeatMap(container,zoneData,title){
        const box=document.createElement('div');
        box.style.cssText='flex:1;min-width:140px;max-width:220px;';
        const ttl=document.createElement('div');
        ttl.style.cssText='font-size:10px;color:#0c4a6e;font-weight:700;'
          +'text-align:center;margin-bottom:4px;letter-spacing:1px;';
        ttl.textContent=title;
        box.appendChild(ttl);
        const maxZ=Math.max.apply(null,['TL','TM','TR','ML','MM','MR','BL','BM','BR']
          .map(function(z){return zoneData[z]||0;}))||1;
        const grid=document.createElement('div');
        grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;';
        [['TR','TM','TL'],['MR','MM','ML'],['BR','BM','BL']].forEach(function(row){
          row.forEach(function(zk){
            const cnt=zoneData[zk]||0;
            const intensity=cnt/maxZ;
            const cell=document.createElement('div');
            cell.style.cssText='height:32px;border-radius:3px;display:flex;align-items:center;'
              +'justify-content:center;font-size:9px;font-weight:700;'
              +'background:rgba(220,38,38,'+Math.max(0.06,intensity)+');'
              +'color:'+(intensity>0.4?'#fff':'#334155')+';border:1px solid #bae6fd;';
            cell.textContent=cnt>0?cnt:'';
            grid.appendChild(cell);
          });
        });
        box.appendChild(grid);
        container.appendChild(box);
      }
      buildBundleHandHeatMap(bundleHandWrap,bundleVsLHB.zoneMap,'VS LHB');
      buildBundleHandHeatMap(bundleHandWrap,bundleVsRHB.zoneMap,'VS RHB');
      bundlesTab.appendChild(bundleHandWrap);
    }
  }catch(e){
    const err=document.createElement('div');
    err.style.cssText='padding:20px;color:#991b1b;font-size:11px;';
    err.textContent='Error loading bundle data: '+e.message;
    bundlesTab.appendChild(err);
  }
  // Build CAREER tab
  const careerTab=tabContents['CAREER'];
  try{
    const raw=localStorage.getItem('pitchseq-game-history');
    const allGames=raw?JSON.parse(raw):[];
    if(allGames.length<1){
      const msg=document.createElement('div');
      msg.style.cssText='padding:20px;text-align:center;font-size:11px;color:#334155;';
      msg.textContent='Play at least 1 game to see career stats.';
      careerTab.appendChild(msg);
    } else {
      // Career section label helper
      function cLabel(text){
        const s=document.createElement('div');
        s.style.cssText='font-size:11px;color:#0c4a6e;letter-spacing:2px;font-weight:700;'
          +'margin:16px 0 8px 0;text-transform:uppercase;border-top:2px solid #0c4a6e;padding-top:10px;';
        s.textContent=text;
        careerTab.appendChild(s);
      }
      // Build bundles for trend comparison
      const cBundles=[];
      for(let i=0;i<allGames.length;i+=10){
        cBundles.push(allGames.slice(i,i+10));
      }
      const recentBundle=cBundles[cBundles.length-1];
      const histBundles=cBundles.slice(0,cBundles.length-1);
      // Helper: average a stat across a set of games
      function gameAvg(games,key){
        if(!games.length) return 0;
        return games.reduce(function(s,g){return s+(g[key]||0);},0)/games.length;
      }
      // Helper: trend flag comparing recent bundle vs historical average
      function trendFlag(recentVal,histVal){
        if(histBundles.length===0) return {arrow:'—',color:'#475569',label:'BASELINE'};
        const diff=recentVal-histVal;
        const pct=histVal>0?Math.abs(diff/histVal)*100:0;
        if(pct<5) return {arrow:'→',color:'#475569',label:'STABLE'};
        if(diff>0) return {arrow:'↑',color:'#166534',label:'IMPROVING'};
        return {arrow:'↓',color:'#991b1b',label:'DECLINING'};
      }
      // Helper: strength label based on rate
      function strengthLabel(metric,value){
        const thresholds={
          kRate:{strength:4,developing:2},
          bbRate:{strength:1,developing:2,invert:true},
          hRate:{strength:2,developing:4,invert:true},
          runsRate:{strength:1,developing:2,invert:true}
        };
        const t=thresholds[metric];
        if(!t) return {label:'—',color:'#475569'};
        if(t.invert){
          if(value<=t.strength) return {label:'STRENGTH',color:'#166534'};
          if(value<=t.developing) return {label:'DEVELOPING',color:'#ca8a04'};
          return {label:'FOCUS AREA',color:'#991b1b'};
        }
        if(value>=t.strength) return {label:'STRENGTH',color:'#166534'};
        if(value>=t.developing) return {label:'DEVELOPING',color:'#ca8a04'};
        return {label:'FOCUS AREA',color:'#991b1b'};
      }
      // Calculate career stats
      const totalGames=allGames.length;
      const totalPitches=allGames.reduce(function(s,g){return s+(g.pitchCount||0);},0);
      const careerK=gameAvg(allGames,'strikeouts');
      const careerBB=gameAvg(allGames,'walks');
      const careerH=gameAvg(allGames,'hits');
      const careerR=gameAvg(allGames,'runsAllowed');
      // Recent bundle averages
      const recentK=gameAvg(recentBundle,'strikeouts');
      const recentBB=gameAvg(recentBundle,'walks');
      const recentH=gameAvg(recentBundle,'hits');
      const recentR=gameAvg(recentBundle,'runsAllowed');
      // Historical averages
      const histGames=histBundles.flat();
      const histK=gameAvg(histGames,'strikeouts');
      const histBB=gameAvg(histGames,'walks');
      const histH=gameAvg(histGames,'hits');
      const histR=gameAvg(histGames,'runsAllowed');
      // Trend flags
      const kTrend=trendFlag(recentK,histK);
      const bbTrend=trendFlag(recentBB,histBB);
      const hTrend=trendFlag(recentH,histH);
      const rTrend=trendFlag(recentR,histR);
      // Summary header
      cLabel('CAREER OVERVIEW');
      const summaryGrid=document.createElement('div');
      summaryGrid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;';
      function careerStatBox(label,value,metric,trend,strength){
        const box=document.createElement('div');
        box.style.cssText='background:#f0f9ff;border:1px solid #7dd3fc;border-radius:6px;padding:10px;';
        const val=document.createElement('div');
        val.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:24px;color:#0c4a6e;';
        val.textContent=typeof value==='number'?value.toFixed(1):value;
        const lbl=document.createElement('div');
        lbl.style.cssText='font-size:8px;color:#0c4a6e;font-weight:700;letter-spacing:1px;margin-top:2px;';
        lbl.textContent=label;
        const trendRow=document.createElement('div');
        trendRow.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-top:6px;';
        const trendEl=document.createElement('div');
        trendEl.style.cssText='font-size:12px;font-weight:700;color:'+trend.color+';';
        trendEl.textContent=trend.arrow+' '+trend.label;
        const strengthEl=document.createElement('div');
        strengthEl.style.cssText='font-size:8px;font-weight:700;color:'+strength.color+
          ';background:'+(strength.color==='#166534'?'#dcfce7':strength.color==='#ca8a04'?'#fef9c3':'#fee2e2')+
          ';padding:2px 6px;border-radius:4px;';
        strengthEl.textContent=strength.label;
        trendRow.appendChild(trendEl);
        trendRow.appendChild(strengthEl);
        box.appendChild(val);
        box.appendChild(lbl);
        box.appendChild(trendRow);
        return box;
      }
      // Two wide boxes at top
      const topGrid=document.createElement('div');
      topGrid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;';
      const gamesBox=document.createElement('div');
      gamesBox.style.cssText='background:#f0f9ff;border:1px solid #7dd3fc;border-radius:6px;padding:10px;text-align:center;';
      gamesBox.innerHTML='<div style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;color:#0c4a6e;">'+totalGames+'</div>'
        +'<div style="font-size:8px;color:#0c4a6e;font-weight:700;letter-spacing:1px;">TOTAL GAMES</div>';
      const pitchesBox=document.createElement('div');
      pitchesBox.style.cssText='background:#f0f9ff;border:1px solid #7dd3fc;border-radius:6px;padding:10px;text-align:center;';
      pitchesBox.innerHTML='<div style="font-family:\'Bebas Neue\',sans-serif;font-size:32px;color:#0c4a6e;">'+totalPitches+'</div>'
        +'<div style="font-size:8px;color:#0c4a6e;font-weight:700;letter-spacing:1px;">TOTAL PITCHES</div>';
      topGrid.appendChild(gamesBox);
      topGrid.appendChild(pitchesBox);
      careerTab.appendChild(topGrid);
      summaryGrid.appendChild(careerStatBox('K PER GAME',careerK,'kRate',kTrend,strengthLabel('kRate',careerK)));
      summaryGrid.appendChild(careerStatBox('BB PER GAME',careerBB,'bbRate',bbTrend,strengthLabel('bbRate',careerBB)));
      summaryGrid.appendChild(careerStatBox('HITS PER GAME',careerH,'hRate',hTrend,strengthLabel('hRate',careerH)));
      summaryGrid.appendChild(careerStatBox('RUNS PER GAME',careerR,'runsRate',rTrend,strengthLabel('runsRate',careerR)));
      careerTab.appendChild(summaryGrid);
      // Stage B — Trend line charts
      cLabel('PERFORMANCE TRENDS');
      const trendCanvas=document.createElement('canvas');
      trendCanvas.style.cssText='width:100%;max-height:250px;';
      careerTab.appendChild(trendCanvas);
      const gameLabels=allGames.map(function(g,i){return 'G'+(i+1);});
      new Chart(trendCanvas,{
        type:'line',
        data:{
          labels:gameLabels,
          datasets:[
            {
              label:'K per game',
              data:allGames.map(function(g){return g.strikeouts||0;}),
              borderColor:'#166534',
              backgroundColor:'rgba(22,101,52,0.05)',
              borderWidth:2,
              pointBackgroundColor:'#166534',
              pointRadius:3,
              tension:0.3,
              fill:false
            },
            {
              label:'BB per game',
              data:allGames.map(function(g){return g.walks||0;}),
              borderColor:'#991b1b',
              backgroundColor:'rgba(153,27,27,0.05)',
              borderWidth:2,
              pointBackgroundColor:'#991b1b',
              pointRadius:3,
              tension:0.3,
              fill:false
            },
            {
              label:'H per game',
              data:allGames.map(function(g){return g.hits||0;}),
              borderColor:'#92400e',
              backgroundColor:'rgba(146,64,14,0.05)',
              borderWidth:2,
              pointBackgroundColor:'#92400e',
              pointRadius:3,
              tension:0.3,
              fill:false
            }
          ]
        },
        options:{
          responsive:true,
          interaction:{mode:'index',intersect:false},
          plugins:{
            legend:{
              position:'bottom',
              labels:{
                color:'#0c4a6e',
                font:{weight:'bold'},
                boxWidth:12
              }
            },
            tooltip:{
              callbacks:{
                title:function(items){return 'Game '+items[0].label.replace('G','');}
              }
            }
          },
          scales:{
            y:{
              beginAtZero:true,
              ticks:{color:'#0c4a6e',font:{weight:'bold'}},
              grid:{color:'#e0f2fe'}
            },
            x:{
              ticks:{color:'#0c4a6e',font:{weight:'bold'}},
              grid:{display:false}
            }
          }
        }
      });
      // Bundle divider annotations
      if(cBundles.length>1){
        const dividerNote=document.createElement('div');
        dividerNote.style.cssText='font-size:8px;color:#475569;text-align:center;margin-top:4px;';
        dividerNote.textContent='Bundle breaks every 10 games — vertical reference for trend comparison';
        careerTab.appendChild(dividerNote);
      }
      // Stage C — Pitch analysis
      // Career pitch mix
      cLabel('CAREER PITCH MIX');
      const careerPitchMix={};
      allGames.forEach(function(g){
        Object.entries(g.pitchMix||{}).forEach(function(e){
          careerPitchMix[e[0]]=(careerPitchMix[e[0]]||0)+e[1];
        });
      });
      const cPitchTotal=Object.values(careerPitchMix).reduce(function(a,b){return a+b;},0)||1;
      const cPitchColors={'4FB':'#dc2626','2FB':'#ea580c','CB':'#2563eb','SL':'#9333ea',
        'CH':'#16a34a','CT':'#ca8a04','SP':'#0891b2','SK':'#e11d48',
        'FK':'#7c3aed','SCR':'#db2777','EPH':'#334155','SLV':'#6d28d9',
        'SWP':'#059669','KN':'#334155','KC':'#4f46e5'};
      Object.entries(careerPitchMix).sort(function(a,b){return b[1]-a[1];}).forEach(function(e){
        const pk=e[0],cnt=e[1];
        const pct=Math.round(cnt/cPitchTotal*100);
        const row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:5px;';
        const lbl=document.createElement('div');
        lbl.style.cssText='font-size:9px;color:#0c4a6e;width:40px;flex-shrink:0;font-weight:700;';
        lbl.textContent=pk;
        const bar=document.createElement('div');
        bar.style.cssText='flex:1;background:#bae6fd;border-radius:2px;height:14px;';
        const fill=document.createElement('div');
        fill.style.cssText='height:100%;border-radius:2px;background:'+(cPitchColors[pk]||'#334155')+';width:'+pct+'%;';
        bar.appendChild(fill);
        const pctLbl=document.createElement('div');
        pctLbl.style.cssText='font-size:9px;color:#0c4a6e;width:48px;text-align:right;flex-shrink:0;font-weight:700;';
        pctLbl.textContent=cnt+' ('+pct+'%)';
        row.appendChild(lbl);row.appendChild(bar);row.appendChild(pctLbl);
        careerTab.appendChild(row);
      });
      // Career zone heat map
      cLabel('CAREER ZONE DISTRIBUTION');
      const careerZoneMap={};
      allGames.forEach(function(g){
        Object.entries(g.zoneMap||{}).forEach(function(e){
          careerZoneMap[e[0]]=(careerZoneMap[e[0]]||0)+e[1];
        });
      });
      const czLegend=document.createElement('div');
      czLegend.style.cssText='display:flex;gap:10px;margin-bottom:6px;font-size:8px;';
      [['#dc2626','IN ZONE'],['#d97706','EDGE'],['#2563eb','CHASE']].forEach(function(e){
        const item=document.createElement('div');
        item.style.cssText='display:flex;align-items:center;gap:3px;color:#0c4a6e;font-weight:700;';
        const dot=document.createElement('div');
        dot.style.cssText='width:8px;height:8px;border-radius:2px;background:'+e[0]+';';
        item.appendChild(dot);
        item.appendChild(document.createTextNode(e[1]));
        czLegend.appendChild(item);
      });
      careerTab.appendChild(czLegend);
      // Chase top
      const czChaseTop=document.createElement('div');
      czChaseTop.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;max-width:200px;margin:0 auto 2px auto;';
      ['CUR','CUM','CUL'].forEach(function(zk){
        const cnt=careerZoneMap[zk]||0;
        const cell=document.createElement('div');
        cell.style.cssText='height:22px;border-radius:3px;display:flex;align-items:center;'
          +'justify-content:center;font-size:8px;font-weight:700;'
          +'background:rgba(37,99,235,'+(cnt>0?0.6:0.08)+');'
          +'color:'+(cnt>0?'#1e3a8a':'#94a3b8')+';border:1px solid #bae6fd;';
        cell.textContent=cnt>0?cnt:'';
        czChaseTop.appendChild(cell);
      });
      careerTab.appendChild(czChaseTop);
      // Main zone grid with edges
      const czMidWrap=document.createElement('div');
      czMidWrap.style.cssText='display:flex;gap:2px;max-width:240px;margin:0 auto 2px auto;align-items:stretch;';
      const czLeft=document.createElement('div');
      const czLeftCnt=careerZoneMap['COUT']||0;
      czLeft.style.cssText='width:28px;border-radius:3px;display:flex;align-items:center;'
        +'justify-content:center;font-size:8px;font-weight:700;'
        +'background:rgba(37,99,235,'+(czLeftCnt>0?0.6:0.08)+');'
        +'color:'+(czLeftCnt>0?'#1e3a8a':'#94a3b8')+';border:1px solid #bae6fd;flex-shrink:0;';
      czLeft.textContent=czLeftCnt>0?czLeftCnt:'';
      czMidWrap.appendChild(czLeft);
      const czStrikeWrap=document.createElement('div');
      czStrikeWrap.style.cssText='flex:1;';
      // Edge top
      const czEdgeTop=document.createElement('div');
      czEdgeTop.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-bottom:2px;';
      ['TR-CRN','TOP-EDG','TL-CRN'].forEach(function(zk){
        const cnt=careerZoneMap[zk]||0;
        const cell=document.createElement('div');
        cell.style.cssText='height:18px;border-radius:2px;display:flex;align-items:center;'
          +'justify-content:center;font-size:7px;font-weight:700;'
          +'background:rgba(217,119,6,'+(cnt>0?0.7:0.08)+');'
          +'color:'+(cnt>0?'#7c2d12':'#94a3b8')+';border:1px solid #bae6fd;';
        cell.textContent=cnt>0?cnt:'';
        czEdgeTop.appendChild(cell);
      });
      czStrikeWrap.appendChild(czEdgeTop);
      const czMaxZone=Math.max.apply(null,['TL','TM','TR','ML','MM','MR','BL','BM','BR'].map(function(z){return careerZoneMap[z]||0;}))||1;
      [['TR','TM','TL'],['MR','MM','ML'],['BR','BM','BL']].forEach(function(row,ri){
        const rowWrap=document.createElement('div');
        rowWrap.style.cssText='display:flex;gap:2px;margin-bottom:2px;';
        const leftEdgeKey=ri===1?'RGT-EDG':null;
        const leftEdgeCell=document.createElement('div');
        const leftCnt=leftEdgeKey?(careerZoneMap[leftEdgeKey]||0):0;
        leftEdgeCell.style.cssText='width:18px;border-radius:2px;display:flex;align-items:center;'
          +'justify-content:center;font-size:7px;font-weight:700;flex-shrink:0;'
          +'background:rgba(217,119,6,'+(leftEdgeKey&&leftCnt>0?0.7:0.08)+');'
          +'color:'+(leftEdgeKey&&leftCnt>0?'#7c2d12':'#94a3b8')+';border:1px solid #bae6fd;';
        leftEdgeCell.textContent=leftEdgeKey&&leftCnt>0?leftCnt:'';
        rowWrap.appendChild(leftEdgeCell);
        const innerWrap=document.createElement('div');
        innerWrap.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;flex:1;';
        row.forEach(function(zk){
          const cnt=careerZoneMap[zk]||0;
          const intensity=cnt/czMaxZone;
          const cell=document.createElement('div');
          cell.style.cssText='height:32px;border-radius:2px;display:flex;align-items:center;'
            +'justify-content:center;font-size:9px;font-weight:700;'
            +'background:rgba(220,38,38,'+Math.max(0.06,intensity)+');'
            +'color:'+(intensity>0.4?'#fff':'#334155')+';border:1px solid #bae6fd;';
          cell.textContent=cnt>0?cnt:'';
          innerWrap.appendChild(cell);
        });
        rowWrap.appendChild(innerWrap);
        const rightEdgeKey=ri===1?'LFT-EDG':null;
        const rightEdgeCell=document.createElement('div');
        const rightCnt=rightEdgeKey?(careerZoneMap[rightEdgeKey]||0):0;
        rightEdgeCell.style.cssText='width:18px;border-radius:2px;display:flex;align-items:center;'
          +'justify-content:center;font-size:7px;font-weight:700;flex-shrink:0;'
          +'background:rgba(217,119,6,'+(rightEdgeKey&&rightCnt>0?0.7:0.08)+');'
          +'color:'+(rightEdgeKey&&rightCnt>0?'#7c2d12':'#94a3b8')+';border:1px solid #bae6fd;';
        rightEdgeCell.textContent=rightEdgeKey&&rightCnt>0?rightCnt:'';
        rowWrap.appendChild(rightEdgeCell);
        czStrikeWrap.appendChild(rowWrap);
      });
      const czEdgeBot=document.createElement('div');
      czEdgeBot.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-bottom:2px;';
      ['BR-CRN','BOT-EDG','BL-CRN'].forEach(function(zk){
        const cnt=careerZoneMap[zk]||0;
        const cell=document.createElement('div');
        cell.style.cssText='height:18px;border-radius:2px;display:flex;align-items:center;'
          +'justify-content:center;font-size:7px;font-weight:700;'
          +'background:rgba(217,119,6,'+(cnt>0?0.7:0.08)+');'
          +'color:'+(cnt>0?'#7c2d12':'#94a3b8')+';border:1px solid #bae6fd;';
        cell.textContent=cnt>0?cnt:'';
        czEdgeBot.appendChild(cell);
      });
      czStrikeWrap.appendChild(czEdgeBot);
      czMidWrap.appendChild(czStrikeWrap);
      const czRight=document.createElement('div');
      const czRightCnt=careerZoneMap['CIN']||0;
      czRight.style.cssText='width:28px;border-radius:3px;display:flex;align-items:center;'
        +'justify-content:center;font-size:8px;font-weight:700;'
        +'background:rgba(37,99,235,'+(czRightCnt>0?0.6:0.08)+');'
        +'color:'+(czRightCnt>0?'#1e3a8a':'#94a3b8')+';border:1px solid #bae6fd;flex-shrink:0;';
      czRight.textContent=czRightCnt>0?czRightCnt:'';
      czMidWrap.appendChild(czRight);
      careerTab.appendChild(czMidWrap);
      const czChaseBot=document.createElement('div');
      czChaseBot.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;max-width:200px;margin:0 auto 2px auto;';
      ['CLO-L','CLO-M','CLO-R'].forEach(function(zk){
        const cnt=careerZoneMap[zk]||0;
        const cell=document.createElement('div');
        cell.style.cssText='height:22px;border-radius:3px;display:flex;align-items:center;'
          +'justify-content:center;font-size:8px;font-weight:700;'
          +'background:rgba(37,99,235,'+(cnt>0?0.6:0.08)+');'
          +'color:'+(cnt>0?'#1e3a8a':'#94a3b8')+';border:1px solid #bae6fd;';
        cell.textContent=cnt>0?cnt:'';
        czChaseBot.appendChild(cell);
      });
      careerTab.appendChild(czChaseBot);
      // Strikeout pitch selection
      cLabel('STRIKEOUT PITCH SELECTION');
      const soByPitch={};
      allGames.forEach(function(g){
        Object.entries(g.outcomes||{}).forEach(function(e){
          const pk=e[0];
          const outcomeMap=e[1];
          if(outcomeMap['STRIKEOUT']){
            soByPitch[pk]=(soByPitch[pk]||0)+outcomeMap['STRIKEOUT'];
          }
        });
      });
      const soTotal=Object.values(soByPitch).reduce(function(a,b){return a+b;},0)||1;
      if(Object.keys(soByPitch).length===0){
        const noSO=document.createElement('div');
        noSO.style.cssText='font-size:9px;color:#475569;margin-bottom:8px;';
        noSO.textContent='No strikeout data yet.';
        careerTab.appendChild(noSO);
      } else {
        Object.entries(soByPitch).sort(function(a,b){return b[1]-a[1];}).forEach(function(e){
          const pk=e[0],cnt=e[1];
          const pct=Math.round(cnt/soTotal*100);
          const row=document.createElement('div');
          row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:5px;';
          const lbl=document.createElement('div');
          lbl.style.cssText='font-size:9px;color:#0c4a6e;width:40px;flex-shrink:0;font-weight:700;';
          lbl.textContent=pk;
          const bar=document.createElement('div');
          bar.style.cssText='flex:1;background:#bae6fd;border-radius:2px;height:14px;';
          const fill=document.createElement('div');
          fill.style.cssText='height:100%;border-radius:2px;background:'+(cPitchColors[pk]||'#334155')+';width:'+pct+'%;';
          bar.appendChild(fill);
          const pctLbl=document.createElement('div');
          pctLbl.style.cssText='font-size:9px;color:#0c4a6e;width:60px;text-align:right;flex-shrink:0;font-weight:700;';
          pctLbl.textContent=cnt+' K ('+pct+'%)';
          row.appendChild(lbl);row.appendChild(bar);row.appendChild(pctLbl);
          careerTab.appendChild(row);
        });
      }
      // Stage D — Splits and breakdowns
      // vs LHB and vs RHB heat maps
      cLabel('VS LEFT-HANDED vs RIGHT-HANDED BATTERS');
      const handednessWrap=document.createElement('div');
      handednessWrap.style.cssText='display:flex;gap:16px;flex-wrap:wrap;justify-content:center;';
      // Aggregate vsLHB and vsRHB across all games
      const careerVsLHB={pitchMix:{},zoneMap:{},outcomes:{}};
      const careerVsRHB={pitchMix:{},zoneMap:{},outcomes:{}};
      allGames.forEach(function(g){
        ['pitchMix','zoneMap','outcomes'].forEach(function(key){
          Object.entries((g.vsLHB||{})[key]||{}).forEach(function(e){
            if(key==='outcomes'){
              if(!careerVsLHB.outcomes[e[0]]) careerVsLHB.outcomes[e[0]]=0;
              careerVsLHB.outcomes[e[0]]+=e[1];
            } else {
              careerVsLHB[key][e[0]]=(careerVsLHB[key][e[0]]||0)+e[1];
            }
          });
          Object.entries((g.vsRHB||{})[key]||{}).forEach(function(e){
            if(key==='outcomes'){
              if(!careerVsRHB.outcomes[e[0]]) careerVsRHB.outcomes[e[0]]=0;
              careerVsRHB.outcomes[e[0]]+=e[1];
            } else {
              careerVsRHB[key][e[0]]=(careerVsRHB[key][e[0]]||0)+e[1];
            }
          });
        });
      });
      function buildHandHeatMap(container,zoneData,title){
        const box=document.createElement('div');
        box.style.cssText='flex:1;min-width:140px;max-width:220px;';
        const ttl=document.createElement('div');
        ttl.style.cssText='font-size:10px;color:#0c4a6e;font-weight:700;'
          +'text-align:center;margin-bottom:4px;letter-spacing:1px;';
        ttl.textContent=title;
        box.appendChild(ttl);
        const maxZ=Math.max.apply(null,['TL','TM','TR','ML','MM','MR','BL','BM','BR']
          .map(function(z){return zoneData[z]||0;}))||1;
        const grid=document.createElement('div');
        grid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;';
        [['TR','TM','TL'],['MR','MM','ML'],['BR','BM','BL']].forEach(function(row){
          row.forEach(function(zk){
            const cnt=zoneData[zk]||0;
            const intensity=cnt/maxZ;
            const cell=document.createElement('div');
            cell.style.cssText='height:32px;border-radius:3px;display:flex;align-items:center;'
              +'justify-content:center;font-size:9px;font-weight:700;'
              +'background:rgba(220,38,38,'+Math.max(0.06,intensity)+');'
              +'color:'+(intensity>0.4?'#fff':'#334155')+';border:1px solid #bae6fd;';
            cell.textContent=cnt>0?cnt:'';
            grid.appendChild(cell);
          });
        });
        box.appendChild(grid);
        container.appendChild(box);
      }
      buildHandHeatMap(handednessWrap,careerVsLHB.zoneMap,'VS LHB');
      buildHandHeatMap(handednessWrap,careerVsRHB.zoneMap,'VS RHB');
      careerTab.appendChild(handednessWrap);
      // By batter type breakdown
      cLabel('BY BATTER TYPE');
      const careerVsBT={};
      allGames.forEach(function(g){
        Object.entries(g.vsBatterType||{}).forEach(function(e){
          const bt=e[0];
          if(!careerVsBT[bt]) careerVsBT[bt]={pitchMix:{},outcomes:{}};
          Object.entries(e[1].pitchMix||{}).forEach(function(pe){
            careerVsBT[bt].pitchMix[pe[0]]=(careerVsBT[bt].pitchMix[pe[0]]||0)+pe[1];
          });
          Object.entries(e[1].outcomes||{}).forEach(function(oe){
            careerVsBT[bt].outcomes[oe[0]]=(careerVsBT[bt].outcomes[oe[0]]||0)+oe[1];
          });
        });
      });
      const btNames={'GENERIC':'Generic','FREE_SWINGER':'Free Swinger','PATIENT':'Patient',
        'LOW_BALL':'Low Ball','HIGH_BALL':'High Ball','PULL':'Pull Hitter'};
      Object.entries(careerVsBT).forEach(function(e){
        const bt=e[0],btData=e[1];
        const btTotal=Object.values(btData.pitchMix).reduce(function(a,b){return a+b;},0)||1;
        const btKs=btData.outcomes['STRIKEOUT']||0;
        const btRow=document.createElement('div');
        btRow.style.cssText='background:#f0f9ff;border:1px solid #7dd3fc;border-radius:6px;'
          +'padding:8px;margin-bottom:8px;';
        const btHeader=document.createElement('div');
        btHeader.style.cssText='display:flex;justify-content:space-between;margin-bottom:6px;';
        const btName=document.createElement('div');
        btName.style.cssText='font-size:10px;color:#0c4a6e;font-weight:700;letter-spacing:1px;';
        btName.textContent=btNames[bt]||bt;
        const btKLabel=document.createElement('div');
        btKLabel.style.cssText='font-size:10px;color:#166534;font-weight:700;';
        btKLabel.textContent=btKs+' K';
        btHeader.appendChild(btName);
        btHeader.appendChild(btKLabel);
        btRow.appendChild(btHeader);
        // Top 3 pitches against this batter type
        Object.entries(btData.pitchMix).sort(function(a,b){return b[1]-a[1];})
          .slice(0,3).forEach(function(pe){
          const pk=pe[0],cnt=pe[1];
          const pct=Math.round(cnt/btTotal*100);
          const pRow=document.createElement('div');
          pRow.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:3px;';
          const pLbl=document.createElement('div');
          pLbl.style.cssText='font-size:9px;color:#0c4a6e;width:36px;flex-shrink:0;font-weight:700;';
          pLbl.textContent=pk;
          const pBar=document.createElement('div');
          pBar.style.cssText='flex:1;background:#bae6fd;border-radius:2px;height:10px;';
          const pFill=document.createElement('div');
          pFill.style.cssText='height:100%;border-radius:2px;background:'+(cPitchColors[pk]||'#334155')+';width:'+pct+'%;';
          pBar.appendChild(pFill);
          const pPct=document.createElement('div');
          pPct.style.cssText='font-size:9px;color:#0c4a6e;width:40px;text-align:right;flex-shrink:0;font-weight:700;';
          pPct.textContent=pct+'%';
          pRow.appendChild(pLbl);pRow.appendChild(pBar);pRow.appendChild(pPct);
          btRow.appendChild(pRow);
        });
        careerTab.appendChild(btRow);
      });
      // Home vs Away splits
      cLabel('HOME VS AWAY SPLITS');
      const homeGames=allGames.filter(function(g){return g.homeAway==='HOME';});
      const awayGames=allGames.filter(function(g){return g.homeAway==='AWAY';});
      const splitsGrid=document.createElement('div');
      splitsGrid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;';
      function splitBox(title,games,color){
        const box=document.createElement('div');
        box.style.cssText='background:#f0f9ff;border:2px solid '+color+';border-radius:6px;padding:10px;';
        const ttl=document.createElement('div');
        ttl.style.cssText='font-size:11px;color:'+color+';font-weight:700;letter-spacing:2px;margin-bottom:8px;';
        ttl.textContent=title+' ('+games.length+' games)';
        box.appendChild(ttl);
        if(!games.length){
          const none=document.createElement('div');
          none.style.cssText='font-size:9px;color:#475569;';
          none.textContent='No data yet';
          box.appendChild(none);
          return box;
        }
        [
          ['K/game',gameAvg(games,'strikeouts').toFixed(1),'#166534'],
          ['BB/game',gameAvg(games,'walks').toFixed(1),'#991b1b'],
          ['H/game',gameAvg(games,'hits').toFixed(1),'#92400e'],
          ['R/game',gameAvg(games,'runsAllowed').toFixed(1),'#991b1b']
        ].forEach(function(stat){
          const row=document.createElement('div');
          row.style.cssText='display:flex;justify-content:space-between;margin-bottom:4px;';
          const l=document.createElement('div');
          l.style.cssText='font-size:9px;color:#0c4a6e;font-weight:700;';
          l.textContent=stat[0];
          const v=document.createElement('div');
          v.style.cssText='font-size:9px;color:'+stat[2]+';font-weight:700;';
          v.textContent=stat[1];
          row.appendChild(l);row.appendChild(v);
          box.appendChild(row);
        });
        return box;
      }
      splitsGrid.appendChild(splitBox('HOME',homeGames,'#166534'));
      splitsGrid.appendChild(splitBox('AWAY',awayGames,'#991b1b'));
      careerTab.appendChild(splitsGrid);
      // Career count tendencies
      cLabel('CAREER COUNT TENDENCIES');
      const careerCountTend={};
      allGames.forEach(function(g){
        Object.entries(g.countTendencies||{}).forEach(function(e){
          const ct=e[0];
          if(!careerCountTend[ct]) careerCountTend[ct]={};
          Object.entries(e[1]).forEach(function(pe){
            careerCountTend[ct][pe[0]]=(careerCountTend[ct][pe[0]]||0)+pe[1];
          });
        });
      });
      const keyCountsOrder=['0-0','0-1','0-2','1-0','1-1','1-2','2-0','2-1','2-2','3-0','3-1','3-2'];
      keyCountsOrder.forEach(function(ct){
        const ctData=careerCountTend[ct];
        if(!ctData) return;
        const topPitch=Object.entries(ctData).sort(function(a,b){return b[1]-a[1];})[0];
        if(!topPitch) return;
        const total=Object.values(ctData).reduce(function(a,b){return a+b;},0)||1;
        const pct=Math.round(topPitch[1]/total*100);
        const row=document.createElement('div');
        row.style.cssText='display:flex;justify-content:space-between;align-items:center;'
          +'font-size:9px;margin-bottom:4px;padding:4px 0;border-bottom:1px solid #e0f2fe;';
        const l=document.createElement('div');
        l.style.cssText='color:#0c4a6e;font-weight:700;';
        l.textContent='COUNT '+ct;
        const r=document.createElement('div');
        r.style.cssText='color:'+(cPitchColors[topPitch[0]]||'#0c4a6e')+';font-weight:700;';
        r.textContent=topPitch[0]+' '+pct+'% ('+topPitch[1]+'x)';
        row.appendChild(l);row.appendChild(r);
        careerTab.appendChild(row);
      });
    }
  }catch(e){
    const err=document.createElement('div');
    err.style.cssText='padding:20px;color:#991b1b;font-size:11px;';
    err.textContent='Error loading career data: '+e.message;
    careerTab.appendChild(err);
  }
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}
function resetPitchCount(){
  totalPitchCount=0;
  totalStrikeouts=0;
  totalWalks=0;
  totalHits=0;
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
  batterType='RANDOM';
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
    // Reset fatigue and game stats when sim mode is turned off
    totalPitchCount=0;
    totalStrikeouts=0;
    totalWalks=0;
    totalHits=0;
    fatigueWarningShown=false;
    pulledPitchers=[];
    updateFatigueUI();
  }
  updateSimPanelVisibility();
  if(simMode){
    if(typeof applyFatigueToVelocity==='function')applyFatigueToVelocity();
    // Away game: show opener before first pitch
    console.log('DEBUG away check: isHomeTeam=',isHomeTeam,'tutorialActive=',window.tutorialActive);
    if(!isHomeTeam&&!window.tutorialActive){
      // Generate away team's first at-bat runs
      setTimeout(function(){
        showAwayGameOpener(function(){
          // After dismissing, show team runs notification
          const awayRuns=Math.floor(Math.random()*3);
          teamScore+=awayRuns;
          const msg=awayRuns===0?
            'Your team did not score.':
            awayRuns===1?'Your team scored 1 run!':
            'Your team scored '+awayRuns+' runs!';
          showTeamRunsNotification(msg,function(){
            updateSimStatBar();
          });
        });
      },300);
    }
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
  if(!simMode){
    const sbb=document.getElementById('simnewbatterbtn');
    if(sbb) sbb.style.display='none';
  }
  const fw=document.getElementById('fatiguewrap');
  if(fw) fw.style.display=simMode?'block':'none';
  if(simMode) updateFatigueUI();
}

function hideSimAdvanceButton(){
  const btn=document.getElementById('simnewbatterbtn');
  if(btn) btn.style.display='none';
}
function showSimAdvanceButton(){
  if(!simMode) return;
  setTimeout(()=>{
    openDiamondModal();
  },2200);
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
  lastSimDiamondBadgeText=null;
  pendingRunnerUpdate=null;
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
  }else{
    secretBatterType='';
  }
  // Handedness diversity — fires for ALL batter types not just RANDOM
  // Weight against repeating same handedness consecutively
  const currentHand=(typeof batter!=='undefined'&&batter==='LHB')?'LHB':'RHB';
  const repeatProb=0.35; // 35% chance same hand, 65% chance switch
  const randomHand=Math.random()<repeatProb?currentHand:
    (currentHand==='RHB'?'LHB':'RHB');
  if(randomHand!==currentHand){
    showBatterHandednessNotification(randomHand);
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
  if(tag==='FOUL'||tag==='FOUL (PULLED)'||
    tag==='FOUL (LATE)'||tag==='FOUL (STRAIGHT BACK)')
    return {bg:'#2a2208',bd:'#facc15',fg:'#fef08a',dark:'#422006'};
  if(tag==='CHECK SWING')
    return {bg:'#1a1a2a',bd:'#a78bfa',fg:'#ede9fe',dark:'#2e1065'};
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

function getFoulTypeLabel(foulType){
  if(foulType==='PULLED') return 'FOUL (PULLED)';
  if(foulType==='LATE') return 'FOUL (LATE)';
  if(foulType==='STRAIGHT_BACK') return 'FOUL (STRAIGHT BACK)';
  return 'FOUL';
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
  const teamScoreEl=document.getElementById('simteamscore');
  if(teamScoreEl) teamScoreEl.textContent=teamScore;
  const teamLabelEl=document.getElementById('teamlabel');
  const oppLabelEl=document.getElementById('opplabel');
  if(teamLabelEl) teamLabelEl.textContent=isHomeTeam?'HOME':'AWAY';
  if(oppLabelEl) oppLabelEl.textContent=isHomeTeam?'AWAY':'HOME';
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
  inningRunsAllowed+=runsScored;
  inningHits++;
  updateSimStatBar();
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
  inningRunsAllowed+=runsScored;
  updateSimStatBar();
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
  // Accumulate pitches into gameSeq before clearing seq
  if(typeof seq!=='undefined'&&seq.length){
    gameSeq=gameSeq.concat(seq.map(function(p){return Object.assign({},p,{pts3d:null,tunnelData:null});}));
  }
  seq=[];pathObjs.forEach(o=>removeObj(o));pathObjs=[];landObjs.forEach(o=>scene.remove(o));landObjs=[];clearTunnels();updateSeqUI();refreshGhost();
  if(simMode){ballCount=0;strikeCount=0;renderCount();}
  if(typeof applyAnchorHighlight==='function') applyAnchorHighlight();
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
  const bnumInline=document.getElementById('bnum-inline');
  const snumInline=document.getElementById('snum-inline');
  if(bnumInline) bnumInline.textContent=ballCount;
  if(snumInline) snumInline.textContent=strikeCount;
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

function getMLVelocityMultiplier(){
  if(!window._mlWeights||!window._mlWeights.velocityProfile) return 1;
  const vp=window._mlWeights.velocityProfile;
  const confidence=window._mlWeights.confidence||0;
  if(confidence<0.15) return 1;
  // Get current pitch speed from UI
  const spdEl=document.getElementById('spd');
  const currentSpeed=spdEl?parseInt(spdEl.value,10)||0:0;
  if(!currentSpeed) return 1;
  const maxVelo=vp.maxVelocity||75;
  const currentPct=currentSpeed/maxVelo;
  const learnedMeanPct=vp.allPitches.meanPct||0.9;
  const diff=currentPct-learnedMeanPct;
  // Faster than learned average → batter fooled → harder to hit
  // Slower than learned average → batter catches up → easier to hit
  let veloMult=1;
  if(diff>0.05){
    // Significantly faster than normal — batter is early
    veloMult=Math.max(0.7,1-diff*confidence*1.5);
  } else if(diff<-0.05){
    // Significantly slower than normal — batter catches up
    veloMult=Math.min(1.7,1+Math.abs(diff)*confidence*1.5);
  }
  // Apply velocity variation reward
  // High variation score = pitcher is deceptive with speed = batter contact penalty
  const varReward=vp.velocityVariation?vp.velocityVariation.rewardMultiplier:1;
  // Apply fatigue curve adaptation
  // Batter learns pitcher gets slower late — adjusts timing proactively
  const fatigue=vp.fatigueCurve;
  let fatigueMult=1;
  if(fatigue&&typeof totalPitchCount!=='undefined'){
    const pitchPct=totalPitchCount/Math.max(1,(vp.allPitches.count/Math.max(1,window._mlWeights.gamesAnalyzed)));
    if(pitchPct>0.66&&fatigue.totalDropPct>0.05){
      // Late game — batter knows velocity will drop, adjusts timing
      fatigueMult=Math.min(1.4,1+fatigue.totalDropPct*confidence*2);
    }
  }
  return Math.max(0.6,Math.min(1.8,veloMult*varReward*fatigueMult));
}
function getMLZoneMultiplier(zk){
  // Returns a multiplier based on ML learned zone tendencies
  // Hot zones get higher multiplier — batter looks there more
  if(!window._mlWeights||!window._mlWeights.zoneWeights) return 1;
  const confidence=window._mlWeights.confidence||0;
  if(confidence<0.15) return 1; // not enough data yet
  const zoneWeight=window._mlWeights.zoneWeights[zk]||1;
  // Blend: at confidence 0.15 → 15% ML influence, at 0.85 → 85% ML influence
  // Zone weight > 1 means pitcher goes here often → batter anticipates → harder to fool
  // Zone weight < 1 means pitcher rarely goes here → batter less ready → easier
  const mlMult=zoneWeight>1?
    1+(zoneWeight-1)*confidence: // hot zone: batter more ready
    1-(1-zoneWeight)*confidence; // cold zone: batter less ready
  return Math.max(0.25,Math.min(2.8,mlMult));
}
function getMLCountMultiplier(zk,strikes){
  // Returns multiplier based on ML learned count tendencies
  if(!window._mlWeights||!window._mlWeights.countWeights) return 1;
  const confidence=window._mlWeights.confidence||0;
  if(confidence<0.15) return 1;
  const count=ballCount+'-'+strikes;
  const countData=window._mlWeights.countWeights[count];
  if(!countData) return 1;
  // Current pitch being thrown
  const currentPitch=typeof pitch!=='undefined'?pitch:'4FB';
  const pitchProb=countData[currentPitch]||0;
  // If pitcher throws this pitch often in this count, batter is more ready
  // pitchProb > 0.5 means very predictable → batter anticipates → higher swing mult
  // pitchProb < 0.2 means unpredictable → batter less ready → lower swing mult
  const mlMult=pitchProb>0.5?
    1+(pitchProb-0.5)*confidence*2: // predictable: batter more ready
    pitchProb<0.2?
    Math.max(0.6,1-(0.2-pitchProb)*confidence*2): // unpredictable: batter less ready
    1;
  return Math.max(0.6,Math.min(2.0,mlMult));
}
function getBatterSwingMultiplier(zk,strikes){
  const effType=getEffectiveBatterType();
  // Base multiplier from batter type
  let baseMult=1;
  if(effType==='GENERIC') baseMult=1;
  else if(effType==='FREE_SWINGER') baseMult=2;
  else if(effType==='PATIENT') baseMult=strikes===0?0.55:strikes===1?0.65:0.88;
  else if(effType==='LOW_BALL'){
    if(['BOT-EDG','BL-CRN','BR-CRN'].includes(zk)) baseMult=1.8;
    else if(['TOP-EDG','TL-CRN','TR-CRN'].includes(zk)) baseMult=0.5;
    else baseMult=1;
  }
  else if(effType==='HIGH_BALL'){
    if(['TOP-EDG','TL-CRN','TR-CRN'].includes(zk)) baseMult=1.8;
    else if(['BOT-EDG','BL-CRN','BR-CRN'].includes(zk)) baseMult=0.5;
    else baseMult=1;
  }
  else if(effType==='PULL'){
    const pullR=['LFT-EDG','BL-CRN','TL-CRN'],oppR=['RGT-EDG','BR-CRN','TR-CRN'];
    const pullL=['RGT-EDG','BR-CRN','TR-CRN'],oppL=['LFT-EDG','BL-CRN','TL-CRN'];
    if(batter==='RHB'){
      if(pullR.includes(zk)) baseMult=1.9;
      else if(oppR.includes(zk)) baseMult=0.4;
      else baseMult=1;
    } else if(batter==='LHB'){
      if(pullL.includes(zk)) baseMult=1.9;
      else if(oppL.includes(zk)) baseMult=0.4;
      else baseMult=1;
    }
  }
  // Apply ML zone, count and velocity multipliers
  const mlZoneMult=getMLZoneMultiplier(zk);
  const mlCountMult=getMLCountMultiplier(zk,strikes);
  const mlVeloMult=getMLVelocityMultiplier();
  // Blend ML multipliers with base — cap total influence to avoid extremes
  const finalMult=baseMult*Math.max(0.5,Math.min(1.8,mlZoneMult*mlCountMult*mlVeloMult));
  return Math.max(0.2,Math.min(3.0,finalMult));
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
  const isEdge=typeof EDGE8_ZONE_KEYS!=='undefined'&&
    EDGE8_ZONE_KEYS.includes(zk)||
    typeof EDGE_LINE_KEYS!=='undefined'&&
    EDGE_LINE_KEYS.includes(zk);
  const lvl=getBatterLevelConfig();
  const weakMult=lvl.weakContactPct/0.65;
  const strongMult=lvl.strongContactPct/0.35;
  const w=inStrike?{
    BALL:0,
    STRIKE:30,
    'FOUL (STRAIGHT BACK)':7,
    'FOUL (PULLED)':6,
    'FOUL (LATE)':5,
    'CHECK SWING':14,
    'WEAK CONTACT':Math.round(18*weakMult),
    'STRONG CONTACT':Math.round(12*strongMult),
    'SWING & MISS':8
  }:isEdge?{
    // Edge zones — check swing most likely outcome
    // Batter starts swing then holds up on boundary pitch
    BALL:20,
    STRIKE:8,
    'FOUL (STRAIGHT BACK)':6,
    'FOUL (PULLED)':5,
    'FOUL (LATE)':5,
    'CHECK SWING':28,
    'WEAK CONTACT':Math.round(6*weakMult),
    'STRONG CONTACT':Math.round(3*strongMult),
    'SWING & MISS':15
  }:{
    BALL:55,
    'FOUL (STRAIGHT BACK)':4,
    'FOUL (PULLED)':3,
    'FOUL (LATE)':3,
    'CHECK SWING':10,
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
    w['FOUL (STRAIGHT BACK)']=(w['FOUL (STRAIGHT BACK)']||0)+1;
    w['FOUL (PULLED)']=(w['FOUL (PULLED)']||0)+1;
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
  else if(outcome==='CHECK SWING'){
    // Zone-based ruling
    // Chase zones → always ball
    // Edge zones → umpire probability
    // Strike zones → always strike
    const umpSetting=getUmpireSetting();
    let checkSwingStrike=false;
    if(CHASE_ZONE_KEYS.includes(zone)){
      checkSwingStrike=false;
    } else if(EDGE8_ZONE_KEYS.includes(zone)||
      EDGE_LINE_KEYS.includes(zone)){
      const prob=EDGE_LINE_KEYS.includes(zone)
        ?umpSetting.cornerStrikeProb
        :umpSetting.edgeStrikeProb;
      checkSwingStrike=Math.random()<prob;
    } else {
      // Strike zone — always strike
      checkSwingStrike=true;
    }
    if(checkSwingStrike){
      strikeCount=Math.min(3,strikeCount+1);
      display='CHECK SWING (STRIKE)';
    } else {
      ballCount=Math.min(4,ballCount+1);
      display='CHECK SWING (BALL)';
    }
    window.__lastCheckSwing={zone,pitch,
      wasStrike:checkSwingStrike};
  }
  else if(outcome==='STRIKE'||outcome==='SWING & MISS'||outcome==='CALLED STRIKE') strikeCount=Math.min(3,strikeCount+1);
  else if((outcome==='FOUL'||
    outcome==='FOUL (PULLED)'||
    outcome==='FOUL (LATE)'||
    outcome==='FOUL (STRAIGHT BACK)')&&
    strikesAtStart<2)
    strikeCount=Math.min(2,strikeCount+1);
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
  if(strikeCount>=3&&(outcome==='STRIKE'||outcome==='SWING & MISS'||outcome==='CALLED STRIKE'||display==='CHECK SWING (STRIKE)')){display='STRIKEOUT';addSimOutCore();if(simMode){lockThrowButton();lastSimDiamondBadgeText='STRIKEOUT';}showSimAdvanceButton();saveSimState();return display;}
  if(outcome==='GROUND OUT'||outcome==='POP FLY'){ballCount=0;strikeCount=0;renderCount();addSimOutCore();if(simMode){lockThrowButton();lastSimDiamondBadgeText=outcome;}showSimAdvanceButton();saveSimState();return outcome;}
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
  const outCountForModal=outCount||0;
  ['modal-out-1','modal-out-2','modal-out-3'].forEach((id,i)=>{
    const dot=document.getElementById(id);
    if(dot) dot.style.background=i<outCountForModal?'#f87171':'transparent';
  });
  const sp=document.getElementById('modal-stat-pitches');
  const sk=document.getElementById('modal-stat-k');
  const sb=document.getElementById('modal-stat-bb');
  const sh=document.getElementById('modal-stat-h');
  if(sp) sp.textContent=totalPitchCount||0;
  if(sk) sk.textContent=totalStrikeouts||0;
  if(sb) sb.textContent=totalWalks||0;
  if(sh) sh.textContent=totalHits||0;
  const newInningBtn=document.getElementById('modal-new-inning-btn');
  if(newInningBtn) newInningBtn.style.display=outCountForModal>=3?'block':'none';
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
  } else if(badge&&lastSimDiamondBadgeText){
    const tc={
      'STRIKEOUT':{bg:'#1a0a0a',border:'#f87171',text:'#f87171'},
      'GROUND OUT':{bg:'#1a1810',border:'#a8a29e',text:'#d6d3d1'},
      'POP FLY':{bg:'#1a1810',border:'#a8a29e',text:'#d6d3d1'},
    };
    const c=tc[lastSimDiamondBadgeText]||{bg:'#0d1520',border:'#7ec8e3',text:'#7ec8e3'};
    badge.textContent=lastSimDiamondBadgeText;
    badge.style.display='block';
    badge.style.background=c.bg;
    badge.style.border='0.5px solid '+c.border;
    badge.style.color=c.text;
    lastSimDiamondBadgeText=null;
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
  // Track cumulative game stats
  if(outcome==='STRIKEOUT') totalStrikeouts++;
  else if(outcome==='WALK') totalWalks++;
  else if(['SINGLE','DOUBLE','TRIPLE','HOME RUN'].includes(outcome)) totalHits++;
  const effSpeed=typeof speed==='number'?speed:parseInt((document.getElementById('spd')||{}).value,10)||0;
  if(effSpeed) lastPitchSpeed=effSpeed;
  const prominent=outcome==='WALK'||outcome==='STRIKEOUT';
  const showLbl=(batterType!=='RANDOM')||batterRevealed;
  const takePrefix=(outcome==='CALLED STRIKE'||outcome==='CALLED BALL')?'TAKE: ':'';
  let logOutcome=outcome;
  let foulType=null;
  if(outcome==='FOUL (PULLED)'){
    foulType='PULLED';
    window.__lastFoulType=foulType;
  } else if(outcome==='FOUL (LATE)'){
    foulType='LATE';
    window.__lastFoulType=foulType;
  } else if(outcome==='FOUL (STRAIGHT BACK)'){
    foulType='STRAIGHT_BACK';
    window.__lastFoulType=foulType;
  } else if(outcome==='CHECK SWING'){
    window.__lastCheckSwing={zone,pitch};
    logOutcome='CHECK SWING — batter showed interest';
  }
  addSimLogEntry(
    (showLbl?'['+getBatterSimLogLabel()+'] ':'')+
    pitchName+' → '+takePrefix+logOutcome,
    outcome,
    prominent
  );
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
    d.totalPitchCount=totalPitchCount||0;
    d.totalStrikeouts=totalStrikeouts||0;
    d.totalWalks=totalWalks||0;
    d.totalHits=totalHits||0;
    d.pulledPitchers=Array.isArray(pulledPitchers)?pulledPitchers:[];
    sessionStorage.setItem(SIM_SESSION_KEY,JSON.stringify(d));
  }catch(e){}
};

const __baseRestoreSimState=(typeof restoreSimState==='function')?restoreSimState:null;
restoreSimState=function(){
  if(__baseRestoreSimState) __baseRestoreSimState();
  try{
    const raw=sessionStorage.getItem(SIM_SESSION_KEY);
    if(raw){
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
    totalPitchCount=Math.max(0,parseInt(d.totalPitchCount,10)||0);
    totalStrikeouts=Math.max(0,parseInt(d.totalStrikeouts,10)||0);
    totalWalks=Math.max(0,parseInt(d.totalWalks,10)||0);
    totalHits=Math.max(0,parseInt(d.totalHits,10)||0);
    pulledPitchers=Array.isArray(d.pulledPitchers)?d.pulledPitchers:[];
    // Restore sim mode UI state
    if(simMode){
      const sb=document.getElementById('simbtn');
      if(sb){sb.textContent='SIM MODE ON';sb.classList.add('on');}
      updateSimPanelVisibility();
      updateFatigueUI();
      applyFatigueToVelocity();
      renderCount();
      updateSimStatBar();
      updateSimLogUI();
    }
    }
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
  if(typeof updateFatigueUI==='function') updateFatigueUI();
  if(typeof applyFatigueToVelocity==='function') applyFatigueToVelocity();
};

function modalNewBatter(){
  closeDiamondModal();
  if(atBatOver) handleNewBatter();
}

function generateTeamRuns(){
  // Read pitcher state
  const profile=getProfile();
  const ageGroup=profile&&profile.ageGroup?profile.ageGroup:'hsvar';
  // Age-aware max runs per inning
  const maxRuns={
    comp13:4,hsjv:3,hsvar:3,college:2,pro:2
  }[ageGroup]||3;
  // Pitcher state this inning
  const pitcherStruggling=inningRunsAllowed>0;
  const scoreDiff=teamScore-totalScore;
  const pitcherWinning=scoreDiff>0;
  const losingBadly=scoreDiff<=-3;
  const fatigue=typeof getFatigueLevelCurrent==='function'?getFatigueLevelCurrent():'fresh';
  const tired=fatigue==='tired'||fatigue==='exhausted';
  // Four psychological scenarios
  let runsGenerated=0;
  const r=Math.random();
  if(pitcherStruggling){
    if(losingBadly){
      // Losing badly — increase adversity to simulate difficult outing
      // 40% encouragement, 60% adversity
      if(r<0.40){
        runsGenerated=Math.floor(Math.random()*maxRuns)+1;
      }
    } else {
      // Scenario 1 (60%): Encouragement — give runs
      // Scenario 2 (40%): Adversity — no runs
      if(r<0.60){
        runsGenerated=Math.floor(Math.random()*maxRuns)+1;
      }
    }
  } else {
    if(pitcherWinning){
      // Scenario 3 (50/50): Pressure vs Reward
      if(r<0.50){
        runsGenerated=0;
      } else {
        runsGenerated=Math.floor(Math.random()*(maxRuns-1))+1;
      }
    } else {
      // Scenario 4 (55%): Pressure — keep game close
      // (45%): Reward — give runs
      if(r<0.55){
        runsGenerated=0;
      } else {
        runsGenerated=Math.floor(Math.random()*(maxRuns-1))+1;
      }
    }
  }
  // Fatigue modifier — tired pitcher gets more support
  if(tired&&runsGenerated===0&&Math.random()<0.40){
    runsGenerated=1;
  }
  // Late inning intensity — inning 6+ increases pressure
  if(inningNumber>=6&&runsGenerated>0&&Math.random()<0.30){
    runsGenerated=Math.max(0,runsGenerated-1);
  }
  teamScore+=runsGenerated;
  inningRunsAllowed=0;
  return runsGenerated;
}
function modalNewInning(){
  const runsScored=generateTeamRuns();
  // Show team runs notification
  const label=isHomeTeam?'YOUR TEAM':'YOUR TEAM';
  const msg=runsScored===0?
    'Your team did not score this inning.':
    runsScored===1?
    'Your team scored 1 run this inning!':
    'Your team scored '+runsScored+' runs this inning!';
  // Store for display
  window.__pendingTeamRunsMsg=msg;
  window.__pendingTeamRuns=runsScored;
  closeDiamondModal();
  // Show notification then proceed
  showTeamRunsNotification(msg,function(){
    if(atBatOver) handleNewBatter();
  });
}
function showAwayGameOpener(onDone){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;'
    +'z-index:10000;display:flex;align-items:center;justify-content:center;'
    +'background:rgba(0,0,0,0.7);';
  const box=document.createElement('div');
  box.style.cssText='background:#0a1520;border:2px solid #7ec8e3;border-radius:12px;'
    +'padding:24px 32px;text-align:center;font-family:\'Bebas Neue\',sans-serif;'
    +'max-width:320px;width:90%;';
  const title=document.createElement('div');
  title.style.cssText='font-size:11px;color:#7ec8e3;letter-spacing:2px;margin-bottom:8px;'
    +'font-family:\'DM Mono\',monospace;';
  title.textContent='AWAY GAME — YOUR TEAM BATS FIRST';
  const scoreDiv=document.createElement('div');
  scoreDiv.style.cssText='font-size:36px;color:#e8f4fd;letter-spacing:3px;margin-bottom:8px;';
  scoreDiv.textContent='AWAY 0 — 0 HOME';
  const msgDiv=document.createElement('div');
  msgDiv.style.cssText='font-size:13px;color:#7ec8e3;letter-spacing:1px;margin-bottom:16px;'
    +'font-family:\'DM Mono\',monospace;line-height:1.5;';
  msgDiv.textContent='Your team bats in the top of inning 1.\nThen you take the mound.';
  const btn=document.createElement('button');
  btn.style.cssText='padding:10px 24px;border-radius:6px;border:none;'
    +'background:#1a3a5c;color:#7ec8e3;font-family:\'Bebas Neue\',sans-serif;'
    +'font-size:16px;letter-spacing:2px;cursor:pointer;width:100%;'
    +'border:1px solid #7ec8e3;';
  btn.textContent='TAKE THE MOUND';
  btn.onclick=function(){
    document.body.removeChild(overlay);
    if(onDone) onDone();
  };
  box.appendChild(title);
  box.appendChild(scoreDiv);
  box.appendChild(msgDiv);
  box.appendChild(btn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}
function showTeamRunsNotification(msg,onDone){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;'
    +'z-index:10000;display:flex;align-items:center;justify-content:center;'
    +'background:rgba(0,0,0,0.7);';
  const box=document.createElement('div');
  box.style.cssText='background:#0a1520;border:2px solid #4a9a4a;border-radius:12px;'
    +'padding:24px 32px;text-align:center;font-family:\'Bebas Neue\',sans-serif;'
    +'max-width:320px;width:90%;';
  const title=document.createElement('div');
  title.style.cssText='font-size:11px;color:#4a9a4a;letter-spacing:2px;margin-bottom:8px;'
    +'font-family:\'DM Mono\',monospace;';
  title.textContent='YOUR TEAM BATS';
  const scoreDiv=document.createElement('div');
  scoreDiv.style.cssText='font-size:36px;color:#e8f4fd;letter-spacing:3px;margin-bottom:8px;';
  scoreDiv.textContent=isHomeTeam?
    'HOME '+teamScore+' — '+totalScore+' AWAY':
    'AWAY '+teamScore+' — '+totalScore+' HOME';
  const msgDiv=document.createElement('div');
  msgDiv.style.cssText='font-size:13px;color:#86efac;letter-spacing:1px;margin-bottom:16px;'
    +'font-family:\'DM Mono\',monospace;';
  msgDiv.textContent=msg;
  const btn=document.createElement('button');
  btn.style.cssText='padding:10px 24px;border-radius:6px;border:none;'
    +'background:#4a9a4a;color:#fff;font-family:\'Bebas Neue\',sans-serif;'
    +'font-size:16px;letter-spacing:2px;cursor:pointer;width:100%;';
  btn.textContent='TAKE THE MOUND';
  btn.onclick=function(){
    document.body.removeChild(overlay);
    if(onDone) onDone();
  };
  box.appendChild(title);
  box.appendChild(scoreDiv);
  box.appendChild(msgDiv);
  box.appendChild(btn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

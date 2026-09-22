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
let inningStrikePitches=0; // consecutive strike-result pitches this inning
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
    const countOutcomes={};
    const countSequences={}; // count→pitch→outcome→nextPitch
    const countPitchZoneOutcomes={}; // count→pitch→outcome→zone
    const vsBatterType={};
    const vsLHB={pitchMix:{},zoneMap:{},outcomes:{}};
    const vsRHB={pitchMix:{},zoneMap:{},outcomes:{}};
    const tunnelPairs={};   // 'prevPk→pk': count
    const tunnelOutcomes={}; // 'prevPk→pk': {outcome: count}
    const tunnelZones={};   // 'prevPk→pk': {zone: count}
    const tunnelQualities=[]; // length scores for average quality
    const contactByInning={};  // inning→{hits,fouls,total}
    const tunnelsByInning={};  // inning→count
    pitches.forEach(function(p,i){
      const pk=p.pk||'';
      const zk=p.zk||'';
      const outcome=p.outcome||'';
      const count=p.count||'0-0';
      // Tunnel analysis
      const td=p.tunnelData;
      if(td&&td.detected&&td.prevPk){
        const tKey=td.prevPk+'→'+pk;
        tunnelPairs[tKey]=(tunnelPairs[tKey]||0)+1;
        if(!tunnelOutcomes[tKey]) tunnelOutcomes[tKey]={};
        tunnelOutcomes[tKey][outcome]=(tunnelOutcomes[tKey][outcome]||0)+1;
        if(zk){
          if(!tunnelZones[tKey]) tunnelZones[tKey]={};
          tunnelZones[tKey][zk]=(tunnelZones[tKey][zk]||0)+1;
        }
        tunnelQualities.push(td.length||0);
      }
      // Contact and tunnel by inning
      const inn=p.inning||1;
      if(!contactByInning[inn]) contactByInning[inn]={hits:0,fouls:0,weakContact:0,total:0};
      contactByInning[inn].total++;
      const isHit=outcome==='SINGLE'||outcome==='DOUBLE'||outcome==='TRIPLE'||outcome==='HOME RUN';
      const isFoul=outcome.startsWith('FOUL')||outcome==='CHECK SWING (BALL)';
      const isWeakContact=outcome==='GROUND OUT'||outcome==='POP FLY';
      if(isHit) contactByInning[inn].hits++;
      if(isFoul) contactByInning[inn].fouls++;
      if(isWeakContact) contactByInning[inn].weakContact++;
      // Tunnel by inning
      if(p.tunnelData&&p.tunnelData.detected){
        tunnelsByInning[inn]=(tunnelsByInning[inn]||0)+1;
      }
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
      // Count outcomes — track outcomes per count for trend analysis
      if(!countOutcomes[count]) countOutcomes[count]={};
      countOutcomes[count][outcome]=(countOutcomes[count][outcome]||0)+1;
      // count+pitch+outcome+zone for decision tree heat maps
      if(zk){
        if(!countPitchZoneOutcomes[count]) countPitchZoneOutcomes[count]={};
        if(!countPitchZoneOutcomes[count][pk]) countPitchZoneOutcomes[count][pk]={};
        if(!countPitchZoneOutcomes[count][pk][outcome]) countPitchZoneOutcomes[count][pk][outcome]={};
        countPitchZoneOutcomes[count][pk][outcome][zk]=
          (countPitchZoneOutcomes[count][pk][outcome][zk]||0)+1;
      }
      // Count sequences — for decision tree: what pitch follows each outcome
      if(i>0){
        const prev=pitches[i-1];
        const prevCount=prev.count||'0-0';
        const prevPk=prev.pk||'';
        const prevOutcome=prev.outcome||'';
        if(prevPk&&prevOutcome){
          if(!countSequences[prevCount]) countSequences[prevCount]={};
          if(!countSequences[prevCount][prevPk]) countSequences[prevCount][prevPk]={};
          if(!countSequences[prevCount][prevPk][prevOutcome]) countSequences[prevCount][prevPk][prevOutcome]={};
          countSequences[prevCount][prevPk][prevOutcome][pk]=
            (countSequences[prevCount][prevPk][prevOutcome][pk]||0)+1;
        }
      }
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
      outcomes,countTendencies,countOutcomes,countSequences,countPitchZoneOutcomes,
      tunnelPairs,tunnelOutcomes,tunnelZones,tunnelsByInning,
      avgTunnelQuality:tunnelQualities.length?
        Math.round(tunnelQualities.reduce(function(a,b){return a+b;},0)/tunnelQualities.length*100):0,
      totalTunnels:tunnelQualities.length,
      contactByInning,
      vsBatterType,vsLHB,vsRHB
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
  // Randomize first batter handedness for next game
  if(typeof setBatter==='function'){
    const firstHand=Math.random()<0.5?'RHB':'LHB';
    setBatter(firstHand);
  }
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
    // ML update runs after game summary loads (see setTimeout below)
  },800);
  // Show game report after reset
  // Run ML update first, then show report with fresh weights
  setTimeout(function(){
    if(typeof runMLUpdate==='function'){
      runMLUpdate().then(function(){
        showGameSummary();
      }).catch(function(){
        showGameSummary();
      });
    } else {
      showGameSummary();
    }
  },500);
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
    const totalGames=history.length;
    // Auto-trigger bundle report after every 10 games once 20+ games exist
    const shouldShowBundle=totalGames>=20&&totalGames%10===0;
    const bundleNumber=Math.floor(totalGames/10);
    showGameReport(game,'GAME REPORT',function(){
      if(shouldShowBundle){
        const congOverlay=document.createElement('div');
        congOverlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;'
          +'z-index:10001;background:rgba(5,8,18,0.97);display:flex;'
          +'align-items:center;justify-content:center;flex-direction:column;gap:16px;';
        const congCard=document.createElement('div');
        congCard.style.cssText='text-align:center;padding:40px 32px;';
        congCard.innerHTML='<div style="font-family:\'Bebas Neue\',sans-serif;font-size:48px;'
          +'color:#06b6d4;letter-spacing:4px;margin-bottom:8px;">BUNDLE '
          +bundleNumber+' COMPLETE</div>'
          +'<div style="font-family:\'Bebas Neue\',sans-serif;font-size:24px;'
          +'color:#e8f4fd;letter-spacing:3px;margin-bottom:16px;">'
          +totalGames+' GAMES PLAYED</div>'
          +'<div style="font-family:\'DM Mono\',monospace;font-size:11px;'
          +'color:#5a8aaa;max-width:320px;line-height:1.6;">'
          +'Loading your bundle comparison report...</div>';
        congOverlay.appendChild(congCard);
        document.body.appendChild(congOverlay);
        setTimeout(function(){
          congOverlay.remove();
          showGameReport(game,'GAME REPORT',function(){});
          setTimeout(function(){
            const bundleTab=document.getElementById('report-tab-BUNDLES');
            if(bundleTab) bundleTab.click();
          },100);
        },2500);
      }
    });
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
  const tabs=['GAME','BUNDLES','CAREER','SEQUENCES','TUNNEL'];
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
  // ── Tunnel summary for this game ──
  if(game.totalTunnels>0){
    const tnSection=document.createElement('div');
    tnSection.style.cssText='margin-top:12px;';
    const tnSectionLbl=document.createElement('div');
    tnSectionLbl.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:13px;'
      +'color:#0c4a6e;letter-spacing:2px;border-bottom:1px solid #bae6fd;'
      +'padding-bottom:4px;margin-bottom:8px;';
    tnSectionLbl.textContent='TUNNEL ANALYSIS';
    tnSection.appendChild(tnSectionLbl);
    // Stats row
    const tnStats=document.createElement('div');
    tnStats.style.cssText='display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:8px;';
    function tnGameStat(label,value,color){
      const box=document.createElement('div');
      box.style.cssText='background:#f0f9ff;border:1px solid #7dd3fc;border-radius:6px;'
        +'padding:8px;text-align:center;';
      box.innerHTML='<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;color:'
        +(color||'#0c4a6e')+';">'+value+'</div>'
        +'<div style="font-size:7px;color:#0c4a6e;letter-spacing:1px;font-weight:600;">'+label+'</div>';
      return box;
    }
    tnStats.appendChild(tnGameStat('TUNNELS CREATED',game.totalTunnels,'#0891b2'));
    tnStats.appendChild(tnGameStat('AVG QUALITY',game.avgTunnelQuality+'%',
      game.avgTunnelQuality>=60?'#166534':game.avgTunnelQuality>=40?'#ca8a04':'#991b1b'));
    tnSection.appendChild(tnStats);
    // Top tunnel pairs this game
    const gamePairs=Object.entries(game.tunnelPairs||{}).sort(function(a,b){return b[1]-a[1];}).slice(0,4);
    if(gamePairs.length>0){
      const pairsLabel=document.createElement('div');
      pairsLabel.style.cssText='font-size:8px;font-weight:700;color:#0c4a6e;'
        +'letter-spacing:1px;margin-bottom:4px;';
      pairsLabel.textContent='TUNNEL PAIRS THIS GAME';
      tnSection.appendChild(pairsLabel);
      gamePairs.forEach(function(e){
        const pair=e[0],count=e[1];
        const pairOutcomes=game.tunnelOutcomes&&game.tunnelOutcomes[pair]||{};
        const pairTotal=Object.values(pairOutcomes).reduce(function(a,b){return a+b;},0)||1;
        const kCount=['STRIKEOUT','SWING & MISS','CALLED STRIKE'].reduce(function(s,o){
          return s+(pairOutcomes[o]||0);},0);
        const row=document.createElement('div');
        row.style.cssText='display:flex;justify-content:space-between;align-items:center;'
          +'padding:4px 6px;border-radius:4px;margin-bottom:3px;'
          +'background:#f0f9ff;border-left:3px solid #0891b2;';
        row.innerHTML='<span style="font-size:9px;font-weight:700;color:#0c4a6e;">'+pair+'</span>'
          +'<span style="font-size:9px;color:#475569;">'+count+'x</span>'
          +'<span style="font-size:9px;font-weight:700;color:#166534;">'
          +Math.round(kCount/pairTotal*100)+'% K/Strike</span>';
        tnSection.appendChild(row);
      });
    }
    // Tunnel zone heat map
    const allTnZones={};
    Object.values(game.tunnelZones||{}).forEach(function(zoneMap){
      Object.entries(zoneMap).forEach(function(e){
        allTnZones[e[0]]=(allTnZones[e[0]]||0)+e[1];
      });
    });
    if(Object.keys(allTnZones).length>0){
      const zmLabel=document.createElement('div');
      zmLabel.style.cssText='font-size:8px;font-weight:700;color:#0c4a6e;'
        +'letter-spacing:1px;margin:8px 0 4px 0;';
      zmLabel.textContent='WHERE TUNNELS WERE CREATED (CATCHER\'S POV)';
      tnSection.appendChild(zmLabel);
      const zmNote=document.createElement('div');
      zmNote.style.cssText='font-size:7px;color:#475569;margin-bottom:6px;';
      zmNote.textContent='Heat map shows landing zones of tunneled pitches this game.';
      tnSection.appendChild(zmNote);
      // Inner zone grid
      const innerZones=[['TR','TM','TL'],['MR','MM','ML'],['BR','BM','BL']];
      const innerMax=Math.max.apply(null,
        ['TL','TM','TR','ML','MM','MR','BL','BM','BR'].map(function(z){return allTnZones[z]||0;}))||1;
      const zmGrid=document.createElement('div');
      zmGrid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);'
        +'gap:3px;max-width:180px;margin:0 auto 6px auto;';
      innerZones.forEach(function(row){
        row.forEach(function(zk){
          const cnt=allTnZones[zk]||0;
          const intensity=cnt/innerMax;
          const cell=document.createElement('div');
          cell.style.cssText='height:36px;border-radius:3px;display:flex;align-items:center;'
            +'justify-content:center;font-size:10px;font-weight:700;border:0.5px solid #bae6fd;'
            +'background:rgba(8,145,178,'+Math.max(0.06,intensity).toFixed(2)+');'
            +'color:'+(intensity>0.4?'#fff':'#334155')+';';
          cell.textContent=cnt>0?cnt:'';
          zmGrid.appendChild(cell);
        });
      });
      tnSection.appendChild(zmGrid);
      // Edge and chase summary
      const edgeZones=['TL-CRN','TR-CRN','BL-CRN','BR-CRN','TOP-EDG','BOT-EDG','LFT-EDG','RGT-EDG'];
      const chaseZones=['CUL','CUM','CUR','CLO-L','CLO-M','CLO-R','CIN','COUT'];
      const edgeTotal=edgeZones.reduce(function(s,z){return s+(allTnZones[z]||0);},0);
      const chaseTotal=chaseZones.reduce(function(s,z){return s+(allTnZones[z]||0);},0);
      const innerTotal=['TL','TM','TR','ML','MM','MR','BL','BM','BR']
        .reduce(function(s,z){return s+(allTnZones[z]||0);},0);
      const grandTotal=edgeTotal+chaseTotal+innerTotal||1;
      const zoneSummary=document.createElement('div');
      zoneSummary.style.cssText='display:flex;gap:8px;justify-content:center;'
        +'font-size:8px;font-weight:700;margin-bottom:4px;';
      zoneSummary.innerHTML='<span style="color:#dc2626;">IN ZONE: '+Math.round(innerTotal/grandTotal*100)+'%</span>'
        +'<span style="color:#d97706;">EDGE: '+Math.round(edgeTotal/grandTotal*100)+'%</span>'
        +'<span style="color:#2563eb;">CHASE: '+Math.round(chaseTotal/grandTotal*100)+'%</span>';
      tnSection.appendChild(zoneSummary);
    }
    gameTab.appendChild(tnSection);
  }
  // Add inning tracking note for future feature
  const exportBtn=document.createElement('button');
  exportBtn.style.cssText='width:100%;margin-top:16px;padding:10px;border-radius:6px;'
    +'border:1px solid #0c4a6e;background:#e0f2fe;color:#0c4a6e;'
    +'font-family:\'Bebas Neue\',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;';
  exportBtn.textContent='EXPORT REPORT TO PDF';
  exportBtn.onclick=function(){
    try{
      const raw=localStorage.getItem('pitchseq-game-history');
      const history=raw?JSON.parse(raw):[];
      const exportData={
        tab:'game',
        game:history[history.length-1]||null,
        profile:typeof getProfile==='function'?getProfile():null,
        generatedAt:Date.now()
      };
      localStorage.setItem('pitchseq-report-export',JSON.stringify(exportData));
      window.open('report.html?tab=game','_blank');
    }catch(e){alert('Could not export report.');}
  };
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
            const count=bundle.reduce(function(s,g){return s+((g.pitchMix||{})[pk]||0);},0);
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
          const count=bundle.reduce(function(s,g){return s+((g.firstPitches||{})[pk]||0);},0);
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
      // ── Trends & Evolution Section ──
      bLabel('TRENDS & EVOLUTION');
      // Dynamic comparison window based on ML confidence
      const mlConf=window._mlWeights?window._mlWeights.confidence:0;
      let windowSize;
      let windowLabel;
      if(mlConf>=0.60){
        windowSize=3;
        windowLabel='Last 3 games vs career average (HIGH adaptation speed)';
      } else if(mlConf>=0.30){
        windowSize=5;
        windowLabel='Last 5 games vs career average (MEDIUM adaptation speed)';
      } else {
        windowSize=Math.max(1,Math.floor(allGames.length/2));
        windowLabel='First half vs second half (LOW adaptation speed)';
      }
      const recentGames=allGames.slice(-windowSize);
      const baselineGames=allGames.slice(0,-windowSize);
      if(baselineGames.length===0){
        const notEnough=document.createElement('div');
        notEnough.style.cssText='font-size:9px;color:#475569;padding:8px;';
        notEnough.textContent='Play more games to see trend analysis. Need at least '+(windowSize+1)+' games total.';
        bundlesTab.appendChild(notEnough);
      } else {
        // Helper: aggregate count tendencies across games
        function aggCountTend(games){
          const agg={};
          games.forEach(function(g){
            Object.entries(g.countTendencies||{}).forEach(function(e){
              const ct=e[0];
              if(!agg[ct]) agg[ct]={};
              Object.entries(e[1]).forEach(function(pe){
                agg[ct][pe[0]]=(agg[ct][pe[0]]||0)+pe[1];
              });
            });
          });
          return agg;
        }
        // Helper: get top pitch pct for a count
        function topPitchPct(ctData){
          if(!ctData) return {pk:'',pct:0};
          const total=Object.values(ctData).reduce(function(a,b){return a+b;},0)||1;
          const top=Object.entries(ctData).sort(function(a,b){return b[1]-a[1];})[0];
          return top?{pk:top[0],pct:Math.round(top[1]/total*100)}:{pk:'',pct:0};
        }
        // Helper: zone coverage score (how many zones used >5%)
        function zoneCoverageScore(games){
          const zm={};
          games.forEach(function(g){
            Object.entries(g.zoneMap||{}).forEach(function(e){
              zm[e[0]]=(zm[e[0]]||0)+e[1];
            });
          });
          const total=Object.values(zm).reduce(function(a,b){return a+b;},0)||1;
          const zones=['TL','TM','TR','ML','MM','MR','BL','BM','BR'];
          return zones.filter(function(z){return (zm[z]||0)/total>0.05;}).length;
        }
        // Helper: sequence variety score
        function seqVarietyScore(games){
          const seqs={};
          games.forEach(function(g){
            Object.entries(g.sequences||{}).forEach(function(e){
              seqs[e[0]]=(seqs[e[0]]||0)+e[1];
            });
          });
          const total=Object.values(seqs).reduce(function(a,b){return a+b;},0)||1;
          const topSeq=Object.values(seqs).sort(function(a,b){return b-a;})[0]||0;
          return Math.round((1-topSeq/total)*100);
        }
        // Helper: velocity variation score
        function veloVarScore(games){
          const velos=[];
          games.forEach(function(g){(g.velocities||[]).forEach(function(v){if(v>0)velos.push(v);});});
          if(velos.length<2) return 0;
          const mean=velos.reduce(function(a,b){return a+b;},0)/velos.length;
          const std=Math.sqrt(velos.reduce(function(s,v){return s+(v-mean)*(v-mean);},0)/velos.length);
          return Math.min(100,Math.round(std/mean*500));
        }
        // Calculate Pattern Intelligence Scores
        function calcPatternScore(games){
          if(!games.length) return 0;
          const ctAgg=aggCountTend(games);
          // Count variety (25pts): avg predictability across key counts
          const keyCounts=['0-0','0-2','1-0','3-2'];
          let countScore=25;
          keyCounts.forEach(function(ct){
            const top=topPitchPct(ctAgg[ct]);
            if(top.pct>=70) countScore-=6;
            else if(top.pct>=55) countScore-=3;
          });
          countScore=Math.max(0,countScore);
          // Zone coverage (25pts)
          const zones=zoneCoverageScore(games);
          const zoneScore=Math.min(25,Math.round(zones/9*25));
          // Sequence variety (25pts)
          const seqScore=Math.min(25,Math.round(seqVarietyScore(games)/100*25));
          // Velocity variation (25pts)
          const veloScore=Math.min(25,Math.round(veloVarScore(games)/100*25));
          return countScore+zoneScore+seqScore+veloScore;
        }
        const recentScore=calcPatternScore(recentGames);
        const baselineScore=calcPatternScore(baselineGames);
        const scoreDiff=recentScore-baselineScore;
        // ── Pattern Intelligence Score — shown immediately ──
        const scoreBox=document.createElement('div');
        scoreBox.style.cssText='border-radius:8px;padding:14px;margin-bottom:12px;'
          +'border:2px solid '+(scoreDiff>=0?'#166534':'#991b1b')+';'
          +'background:'+(scoreDiff>=0?'#f0fff4':'#fff1f0')+';';
        const scoreTitle=document.createElement('div');
        scoreTitle.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:18px;'
          +'letter-spacing:2px;color:#0c4a6e;margin-bottom:6px;';
        scoreTitle.textContent='PATTERN INTELLIGENCE SCORE';
        const scoreRow=document.createElement('div');
        scoreRow.style.cssText='display:flex;align-items:baseline;gap:12px;margin-bottom:6px;';
        const scoreNum=document.createElement('div');
        scoreNum.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:42px;'
          +'color:'+(scoreDiff>=0?'#166534':'#991b1b')+';';
        scoreNum.textContent=recentScore;
        const scoreDiffEl=document.createElement('div');
        scoreDiffEl.style.cssText='font-size:14px;font-weight:700;'
          +'color:'+(scoreDiff>=0?'#166534':'#991b1b')+';';
        scoreDiffEl.textContent=(scoreDiff>=0?'↑ +':'↓ ')+scoreDiff+' from baseline';
        scoreRow.appendChild(scoreNum);
        scoreRow.appendChild(scoreDiffEl);
        const scoreNote=document.createElement('div');
        scoreNote.style.cssText='font-size:9px;color:#475569;margin-bottom:4px;';
        scoreNote.textContent=windowLabel;
        const mlSpeedEl=document.createElement('div');
        mlSpeedEl.style.cssText='font-size:9px;font-weight:700;color:#0c4a6e;';
        mlSpeedEl.textContent='ML ADAPTATION: '+(mlConf>=0.60?'HIGH':mlConf>=0.30?'MEDIUM':'LOW')
          +' ('+Math.round(mlConf*100)+'% confidence)';
        scoreBox.appendChild(scoreTitle);
        scoreBox.appendChild(scoreRow);
        scoreBox.appendChild(scoreNote);
        scoreBox.appendChild(mlSpeedEl);
        bundlesTab.appendChild(scoreBox);
        // ── Regression Alert ──
        if(scoreDiff<=-10){
          const regAlert=document.createElement('div');
          regAlert.style.cssText='background:#991b1b;border-radius:8px;padding:12px;'
            +'margin-bottom:12px;';
          regAlert.innerHTML='<div style="font-family:\'Bebas Neue\',sans-serif;font-size:16px;'
            +'color:#fff;letter-spacing:2px;margin-bottom:4px;">🚨 REGRESSION DETECTED</div>'
            +'<div style="font-size:9px;color:#fecaca;line-height:1.6;">'
            +'Your pitching patterns have become MORE predictable in recent games. '
            +'The batter is learning faster than you are adjusting. '
            +'Review the count predictability and sequence patterns below and make changes immediately.</div>';
          bundlesTab.appendChild(regAlert);
        } else if(scoreDiff>=-5&&scoreDiff<0){
          const warnAlert=document.createElement('div');
          warnAlert.style.cssText='background:#92400e;border-radius:8px;padding:12px;'
            +'margin-bottom:12px;';
          warnAlert.innerHTML='<div style="font-family:\'Bebas Neue\',sans-serif;font-size:16px;'
            +'color:#fff;letter-spacing:2px;margin-bottom:4px;">⚠ SLIGHT REGRESSION</div>'
            +'<div style="font-size:9px;color:#fde68a;line-height:1.6;">'
            +'Your patterns are slightly more predictable recently. '
            +'Monitor your count tendencies and sequence variety closely.</div>';
          bundlesTab.appendChild(warnAlert);
        }
        // ── Count Predictability Trend ──
        const trendSubLabel=function(text){
          const s=document.createElement('div');
          s.style.cssText='font-size:9px;color:#0c4a6e;font-weight:700;letter-spacing:1px;'
            +'margin:10px 0 4px 0;text-transform:uppercase;';
          s.textContent=text;
          bundlesTab.appendChild(s);
        };
        trendSubLabel('COUNT PREDICTABILITY & OUTCOME TREND');
        // Count type definitions
        const countTypes={
          '0-0':'early','1-0':'hitter','2-0':'hitter','3-0':'hitter',
          '0-1':'early','1-1':'even','2-1':'even',
          '0-2':'finish','1-2':'finish','2-2':'finish','3-2':'finish',
          '3-1':'hitter'
        };
        const countGoals={
          'early':'GET AHEAD — goal: any strike',
          'hitter':'SURVIVE — goal: throw strike without damage',
          'even':'STAY COMPETITIVE — goal: gain count advantage',
          'finish':'FINISH BATTER — goal: strikeout or weak contact'
        };
        // Helper: get outcome rates from countOutcomes across games
        function aggCountOutcomes(games){
          const agg={};
          games.forEach(function(g){
            Object.entries(g.countOutcomes||{}).forEach(function(e){
              const ct=e[0];
              if(!agg[ct]) agg[ct]={};
              Object.entries(e[1]).forEach(function(oe){
                agg[ct][oe[0]]=(agg[ct][oe[0]]||0)+oe[1];
              });
            });
          });
          return agg;
        }
        function getStrikeRate(ctOutcomes){
          if(!ctOutcomes) return 0;
          const strikes=['STRIKE','CALLED STRIKE','SWING & MISS','FOUL',
            'FOUL (STRAIGHT BACK)','FOUL (PULLED)','FOUL (LATE)',
            'CHECK SWING (STRIKE)','STRIKEOUT'];
          const total=Object.values(ctOutcomes).reduce(function(a,b){return a+b;},0)||1;
          const strTotal=strikes.reduce(function(s,k){return s+(ctOutcomes[k]||0);},0);
          return Math.round(strTotal/total*100);
        }
        function getFinishRate(ctOutcomes){
          if(!ctOutcomes) return 0;
          const finish=['STRIKEOUT','SWING & MISS'];
          const total=Object.values(ctOutcomes).reduce(function(a,b){return a+b;},0)||1;
          const finTotal=finish.reduce(function(s,k){return s+(ctOutcomes[k]||0);},0);
          return Math.round(finTotal/total*100);
        }
        function getFoulRate(ctOutcomes){
          if(!ctOutcomes) return 0;
          const fouls=['FOUL','FOUL (STRAIGHT BACK)','FOUL (PULLED)','FOUL (LATE)'];
          const total=Object.values(ctOutcomes).reduce(function(a,b){return a+b;},0)||1;
          const foulTotal=fouls.reduce(function(s,k){return s+(ctOutcomes[k]||0);},0);
          return Math.round(foulTotal/total*100);
        }
        function getDamageRate(ctOutcomes){
          if(!ctOutcomes) return 0;
          const damage=['SINGLE','DOUBLE','TRIPLE','HOME RUN','WALK','CALLED BALL'];
          const total=Object.values(ctOutcomes).reduce(function(a,b){return a+b;},0)||1;
          const dmgTotal=damage.reduce(function(s,k){return s+(ctOutcomes[k]||0);},0);
          return Math.round(dmgTotal/total*100);
        }
        const baseCtAgg=aggCountTend(baselineGames);
        const recentCtAgg=aggCountTend(recentGames);
        const baseCtOut=aggCountOutcomes(baselineGames);
        const recentCtOut=aggCountOutcomes(recentGames);
        const keyCounts=['0-0','0-1','0-2','1-0','1-2','2-2','3-2'];
        keyCounts.forEach(function(ct){
          const baseTop=topPitchPct(baseCtAgg[ct]);
          const recentTop=topPitchPct(recentCtAgg[ct]);
          if(!baseTop.pk&&!recentTop.pk) return;
          const countType=countTypes[ct]||'early';
          const isFinish=countType==='finish';
          const isHitter=countType==='hitter';
          // Predictability change
          const predImproving=recentTop.pct<baseTop.pct;
          const predChange=recentTop.pct-baseTop.pct;
          // Outcome evaluation
          let verdict='';
          let verdictColor='#475569';
          let bgColor='#f0f9ff';
          if(isFinish){
            const baseFinish=getFinishRate(baseCtOut[ct]);
            const recentFinish=getFinishRate(recentCtOut[ct]);
            const baseFoul=getFoulRate(baseCtOut[ct]);
            const recentFoul=getFoulRate(recentCtOut[ct]);
            const finishImproving=recentFinish>baseFinish;
            const foulRegressing=recentFoul>baseFoul+10;
            if(!predImproving&&!finishImproving&&foulRegressing){
              verdict='🚨 CRITICAL — predictable AND not finishing, foul rate rising';
              verdictColor='#fff';bgColor='#991b1b';
            } else if(!predImproving&&!finishImproving){
              verdict='⚠ REGRESSING — more predictable, fewer strikeouts';
              verdictColor='#991b1b';bgColor='#fff1f0';
            } else if(foulRegressing&&!finishImproving){
              verdict='⚠ MONITOR — foul rate rising, prolonging at-bats';
              verdictColor='#92400e';bgColor='#fffbeb';
            } else if(finishImproving){
              verdict='✓ IMPROVING — finishing batters more effectively';
              verdictColor='#166534';bgColor='#f0fff4';
            } else if(predImproving){
              verdict='→ MONITOR — less predictable but finish rate unchanged';
              verdictColor='#475569';bgColor='#f0f9ff';
            }
            const isCritical=bgColor==='#991b1b';
            const textColor=isCritical?'#fef3c7':'#0c4a6e';
            const subTextColor=isCritical?'#fde68a':'#475569';
            const hasOutcomeData=recentCtOut[ct]&&Object.keys(recentCtOut[ct]).length>0;
            const finishPct=getFinishRate(recentCtOut[ct]);
            const foulPct=getFoulRate(recentCtOut[ct]);
            function miniBar(pct,color){
              return '<div style="display:inline-flex;align-items:center;gap:4px;vertical-align:middle;">'
                +'<div style="width:60px;height:8px;background:rgba(0,0,0,0.15);border-radius:4px;display:inline-block;">'
                +'<div style="width:'+pct+'%;height:100%;background:'+color+';border-radius:4px;"></div></div>'
                +'<span style="font-size:9px;font-weight:700;">'+pct+'%</span></div>';
            }
            const row=document.createElement('div');
            row.style.cssText='margin-bottom:6px;padding:8px;border-radius:6px;background:'+bgColor+';'
              +(isCritical?'border:2px solid #7f1d1d;':'');
            let outcomeHtml='';
            if(hasOutcomeData){
              outcomeHtml='<div style="margin:6px 0;display:flex;flex-direction:column;gap:4px;">'
                +'<div style="display:flex;align-items:center;gap:8px;">'
                +'<span style="font-size:8px;color:'+subTextColor+';width:72px;flex-shrink:0;">FINISH RATE</span>'
                +miniBar(finishPct,finishPct>=50?'#166534':finishPct>=30?'#ca8a04':'#991b1b')
                +'</div>'
                +'<div style="display:flex;align-items:center;gap:8px;">'
                +'<span style="font-size:8px;color:'+subTextColor+';width:72px;flex-shrink:0;">FOUL RATE</span>'
                +miniBar(foulPct,foulPct<=15?'#166534':foulPct<=25?'#ca8a04':'#991b1b')
                +'</div></div>';
            } else {
              outcomeHtml='<div style="font-size:8px;color:'+subTextColor+';margin:4px 0;font-style:italic;">'
                +'Outcome data building — play more games for full analysis</div>';
            }
            row.innerHTML='<div style="font-size:9px;font-weight:700;color:'+textColor+';margin-bottom:3px;">'
              +ct+' COUNT ('+countGoals[countType]+')</div>'
              +'<div style="font-size:8px;font-weight:700;color:'+subTextColor+';margin-bottom:2px;">'
              +'Top pitch: '+(baseTop.pk||'?')+' '
              +'<span style="color:'+(predImproving?(isCritical?'#86efac':'#166534'):(isCritical?'#fca5a5':'#991b1b'))+'">'
              +baseTop.pct+'% → '+recentTop.pct+'% '+(predImproving?'↓ less predictable':'↑ more predictable')
              +'</span></div>'
              +outcomeHtml
              +'<div style="font-size:9px;font-weight:700;color:'+(isCritical?'#fef3c7':verdictColor)+';">'+verdict+'</div>';
            bundlesTab.appendChild(row);
          } else {
            const baseStrike=getStrikeRate(baseCtOut[ct]);
            const recentStrike=getStrikeRate(recentCtOut[ct]);
            const baseDamage=getDamageRate(baseCtOut[ct]);
            const recentDamage=getDamageRate(recentCtOut[ct]);
            const strikeImproving=recentStrike>=baseStrike;
            const damageWorse=recentDamage>baseDamage+10;
            if(!predImproving&&damageWorse){
              verdict='🚨 CRITICAL — predictable AND giving up more damage';
              verdictColor='#fff';bgColor='#991b1b';
            } else if(!predImproving&&!strikeImproving){
              verdict='⚠ REGRESSING — more predictable, fewer strikes';
              verdictColor='#991b1b';bgColor='#fff1f0';
            } else if(!predImproving&&strikeImproving){
              verdict='→ MONITOR — predictable but still generating strikes';
              verdictColor='#92400e';bgColor='#fffbeb';
            } else if(predImproving&&strikeImproving){
              verdict='✓ IMPROVING — less predictable AND more strikes';
              verdictColor='#166534';bgColor='#f0fff4';
            } else if(predImproving){
              verdict='→ MONITOR — less predictable but strike rate unchanged';
              verdictColor='#475569';bgColor='#f0f9ff';
            }
            const isCritical2=bgColor==='#991b1b';
            const textColor2=isCritical2?'#fef3c7':'#0c4a6e';
            const subTextColor2=isCritical2?'#fde68a':'#475569';
            const hasOutcomeData2=recentCtOut[ct]&&Object.keys(recentCtOut[ct]).length>0;
            const strikePct=getStrikeRate(recentCtOut[ct]);
            const damagePct=getDamageRate(recentCtOut[ct]);
            function miniBar2(pct,color){
              return '<div style="display:inline-flex;align-items:center;gap:4px;vertical-align:middle;">'
                +'<div style="width:60px;height:8px;background:rgba(0,0,0,0.15);border-radius:4px;display:inline-block;">'
                +'<div style="width:'+pct+'%;height:100%;background:'+color+';border-radius:4px;"></div></div>'
                +'<span style="font-size:9px;font-weight:700;">'+pct+'%</span></div>';
            }
            const row=document.createElement('div');
            row.style.cssText='margin-bottom:6px;padding:8px;border-radius:6px;background:'+bgColor+';'
              +(isCritical2?'border:2px solid #7f1d1d;':'');
            let outcomeHtml2='';
            if(hasOutcomeData2){
              outcomeHtml2='<div style="margin:6px 0;display:flex;flex-direction:column;gap:4px;">'
                +'<div style="display:flex;align-items:center;gap:8px;">'
                +'<span style="font-size:8px;color:'+subTextColor2+';width:72px;flex-shrink:0;">STRIKE RATE</span>'
                +miniBar2(strikePct,strikePct>=60?'#166534':strikePct>=40?'#ca8a04':'#991b1b')
                +'</div>'
                +'<div style="display:flex;align-items:center;gap:8px;">'
                +'<span style="font-size:8px;color:'+subTextColor2+';width:72px;flex-shrink:0;">DAMAGE RATE</span>'
                +miniBar2(damagePct,damagePct<=10?'#166534':damagePct<=25?'#ca8a04':'#991b1b')
                +'</div></div>';
            } else {
              outcomeHtml2='<div style="font-size:8px;color:'+subTextColor2+';margin:4px 0;font-style:italic;">'
                +'Outcome data building — play more games for full analysis</div>';
            }
            row.innerHTML='<div style="font-size:9px;font-weight:700;color:'+textColor2+';margin-bottom:3px;">'
              +ct+' COUNT ('+countGoals[countType]+')</div>'
              +'<div style="font-size:8px;font-weight:700;color:'+subTextColor2+';margin-bottom:2px;">'
              +'Top pitch: '+(baseTop.pk||'?')+' '
              +'<span style="color:'+(predImproving?(isCritical2?'#86efac':'#166534'):(isCritical2?'#fca5a5':'#991b1b'))+'">'
              +baseTop.pct+'% → '+recentTop.pct+'% '+(predImproving?'↓ less predictable':'↑ more predictable')
              +'</span></div>'
              +outcomeHtml2
              +'<div style="font-size:9px;font-weight:700;color:'+(isCritical2?'#fef3c7':verdictColor)+';">'+verdict+'</div>';
            bundlesTab.appendChild(row);
          }
        });
        // ── Zone Coverage Trend ──
        trendSubLabel('ZONE COVERAGE TREND');
        const baseZones=zoneCoverageScore(baselineGames);
        const recentZones=zoneCoverageScore(recentGames);
        const zoneImproving=recentZones>=baseZones;
        const zoneTrendEl=document.createElement('div');
        zoneTrendEl.style.cssText='padding:5px 6px;border-radius:4px;margin-bottom:5px;'
          +'background:'+(zoneImproving?'#f0fff4':'#fff1f0')+';'
          +'font-size:9px;font-weight:700;';
        zoneTrendEl.innerHTML='<span style="color:#475569;">Zones used (baseline): '+baseZones+'/9</span> '
          +'<span style="color:'+(zoneImproving?'#166534':'#991b1b')+';">'
          +(zoneImproving?'↑ ':'↓ ')+'Recent: '+recentZones+'/9 '
          +(zoneImproving?'✓ EXPANDING':'⚠ SHRINKING')+'</span>';
        bundlesTab.appendChild(zoneTrendEl);
        // ── Sequence Variety Trend ──
        trendSubLabel('SEQUENCE VARIETY TREND');
        const baseSeq=seqVarietyScore(baselineGames);
        const recentSeq=seqVarietyScore(recentGames);
        const seqImproving=recentSeq>=baseSeq;
        const seqTrendEl=document.createElement('div');
        seqTrendEl.style.cssText='padding:5px 6px;border-radius:4px;margin-bottom:5px;'
          +'background:'+(seqImproving?'#f0fff4':'#fff1f0')+';'
          +'font-size:9px;font-weight:700;';
        seqTrendEl.innerHTML='<span style="color:#475569;">Sequence variety (baseline): '+baseSeq+'%</span> '
          +'<span style="color:'+(seqImproving?'#166534':'#991b1b')+';">'
          +(seqImproving?'↑ ':'↓ ')+'Recent: '+recentSeq+'% '
          +(seqImproving?'✓ MORE VARIETY':'⚠ LESS VARIETY')+'</span>';
        bundlesTab.appendChild(seqTrendEl);
        // ── Velocity Variation Trend ──
        trendSubLabel('VELOCITY VARIATION TREND');
        const baseVelo=veloVarScore(baselineGames);
        const recentVelo=veloVarScore(recentGames);
        const veloImproving=recentVelo>=baseVelo;
        const veloTrendEl=document.createElement('div');
        veloTrendEl.style.cssText='padding:5px 6px;border-radius:4px;margin-bottom:5px;'
          +'background:'+(veloImproving?'#f0fff4':'#fff1f0')+';'
          +'font-size:9px;font-weight:700;';
        veloTrendEl.innerHTML='<span style="color:#475569;">Speed variation (baseline): '+baseVelo+'%</span> '
          +'<span style="color:'+(veloImproving?'#166534':'#991b1b')+';">'
          +(veloImproving?'↑ ':'↓ ')+'Recent: '+recentVelo+'% '
          +(veloImproving?'✓ MORE DECEPTIVE':'⚠ MORE PREDICTABLE')+'</span>';
        bundlesTab.appendChild(veloTrendEl);
      }
    }
  }catch(e){
    const err=document.createElement('div');
    err.style.cssText='padding:20px;color:#991b1b;font-size:11px;';
    err.textContent='Error loading bundle data: '+e.message;
    bundlesTab.appendChild(err);
  }
  // Bundles export button
  const bundlesExportBtn=document.createElement('button');
  bundlesExportBtn.style.cssText='width:100%;margin-top:16px;padding:10px;border-radius:6px;'
    +'border:1px solid #0c4a6e;background:#e0f2fe;color:#0c4a6e;'
    +'font-family:\'Bebas Neue\',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;';
  bundlesExportBtn.textContent='EXPORT BUNDLES REPORT TO PDF';
  bundlesExportBtn.onclick=function(){
    try{
      const raw=localStorage.getItem('pitchseq-game-history');
      const history=raw?JSON.parse(raw):[];
      const exportData={
        tab:'bundles',
        games:history,
        mlWeights:window._mlWeights||null,
        profile:typeof getProfile==='function'?getProfile():null,
        generatedAt:Date.now()
      };
      localStorage.setItem('pitchseq-report-export',JSON.stringify(exportData));
      window.open('report.html?tab=bundles','_blank');
    }catch(e){alert('Could not export report.');}
  };
  tabContents['BUNDLES'].appendChild(bundlesExportBtn);
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
      // ML Transparency Section
      if(window._mlWeights&&window._mlWeights.confidence>=0.10){
        const ml=window._mlWeights;
        const conf=ml.confidence||0;
        const confPct=Math.round(conf*100);
        cLabel('WHAT THE BATTER HAS LEARNED');
        // Adaptation score header
        const adaptBox=document.createElement('div');
        adaptBox.style.cssText='background:#fff8f0;border:2px solid #92400e;border-radius:8px;'
          +'padding:12px;margin-bottom:12px;';
        const adaptTitle=document.createElement('div');
        adaptTitle.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:16px;'
          +'color:#92400e;letter-spacing:2px;margin-bottom:4px;';
        adaptTitle.textContent='BATTER ADAPTATION: '+confPct+'%'
          +' ('+ml.gamesAnalyzed+' games)';
        const adaptBar=document.createElement('div');
        adaptBar.style.cssText='width:100%;background:#fde8d0;border-radius:4px;height:8px;margin-bottom:6px;';
        const adaptFill=document.createElement('div');
        adaptFill.style.cssText='width:'+confPct+'%;height:100%;border-radius:4px;'
          +'background:#92400e;';
        adaptBar.appendChild(adaptFill);
        const adaptNote=document.createElement('div');
        adaptNote.style.cssText='font-size:9px;color:#92400e;line-height:1.5;';
        adaptNote.textContent=confPct<40?
          'The batter is just starting to learn your patterns. Keep playing to increase adaptation.':
          confPct<70?
          'The batter has learned several of your tendencies. Mix your sequences to stay unpredictable.':
          'The batter is highly adapted to your patterns. Significant variety is needed to fool it.';
        adaptBox.appendChild(adaptTitle);
        adaptBox.appendChild(adaptBar);
        adaptBox.appendChild(adaptNote);
        careerTab.appendChild(adaptBox);
        // Count predictability
        const mlSubLabel=function(text){
          const s=document.createElement('div');
          s.style.cssText='font-size:9px;color:#92400e;font-weight:700;letter-spacing:1px;'
            +'margin:10px 0 4px 0;text-transform:uppercase;';
          s.textContent=text;
          careerTab.appendChild(s);
        };
        mlSubLabel('COUNT PREDICTABILITY');
        const counts=['0-0','0-1','0-2','1-0','1-1','1-2','2-0','2-1','2-2','3-2'];
        counts.forEach(function(ct){
          const ctData=ml.countWeights&&ml.countWeights[ct];
          if(!ctData) return;
          const topEntry=Object.entries(ctData).sort(function(a,b){return b[1]-a[1];})[0];
          if(!topEntry||topEntry[1]<0.3) return;
          const pct=Math.round(topEntry[1]*100);
          const isHigh=pct>=60;
          const row=document.createElement('div');
          row.style.cssText='display:flex;justify-content:space-between;align-items:center;'
            +'margin-bottom:4px;padding:4px 6px;border-radius:4px;'
            +'background:'+(isHigh?'#fff1f0':'#f0f9ff')+';';
          const l=document.createElement('div');
          l.style.cssText='font-size:9px;color:#0c4a6e;font-weight:700;';
          l.textContent=ct+' COUNT — '+topEntry[0]+' '+pct+'% of the time';
          const r=document.createElement('div');
          r.style.cssText='font-size:9px;font-weight:700;color:'+(isHigh?'#991b1b':'#166534')+';';
          r.textContent=isHigh?'⚠ HIGH':'✓ OK';
          row.appendChild(l);row.appendChild(r);
          careerTab.appendChild(row);
        });
        // Zone tendencies
        mlSubLabel('ZONE TENDENCIES');
        if(ml.hotZones&&ml.hotZones.length){
          const zoneRow=document.createElement('div');
          zoneRow.style.cssText='margin-bottom:4px;';
          const hotEl=document.createElement('div');
          hotEl.style.cssText='font-size:9px;color:#991b1b;font-weight:700;margin-bottom:3px;';
          hotEl.textContent='⚠ BATTER LOOKS HERE: '+ml.hotZones.join(', ');
          const coldEl=document.createElement('div');
          coldEl.style.cssText='font-size:9px;color:#166534;font-weight:700;';
          coldEl.textContent='✓ BATTER IGNORES: '+(ml.coldZones||[]).join(', ');
          zoneRow.appendChild(hotEl);
          zoneRow.appendChild(coldEl);
          careerTab.appendChild(zoneRow);
        }
        // Sequence patterns
        mlSubLabel('SEQUENCE PATTERNS');
        const seqWeights=ml.sequenceWeights||{};
        Object.entries(seqWeights).forEach(function(e){
          const prev=e[0],nextMap=e[1];
          const topNext=Object.entries(nextMap).sort(function(a,b){return b[1]-a[1];})[0];
          if(!topNext||topNext[1]<0.5) return;
          const pct=Math.round(topNext[1]*100);
          const row=document.createElement('div');
          row.style.cssText='display:flex;justify-content:space-between;align-items:center;'
            +'margin-bottom:4px;padding:4px 6px;border-radius:4px;background:#fff1f0;';
          const l=document.createElement('div');
          l.style.cssText='font-size:9px;color:#0c4a6e;font-weight:700;';
          l.textContent='After '+prev+' → '+topNext[0]+' '+pct+'% of the time';
          const r=document.createElement('div');
          r.style.cssText='font-size:9px;font-weight:700;color:#991b1b;';
          r.textContent='⚠ PREDICTABLE';
          row.appendChild(l);row.appendChild(r);
          careerTab.appendChild(row);
        });
        // Velocity patterns
        if(ml.velocityProfile){
          mlSubLabel('VELOCITY PATTERNS');
          const vp=ml.velocityProfile;
          const varScore=vp.velocityVariation?Math.round(vp.velocityVariation.variationScore*100):0;
          const avgPct=Math.round((vp.allPitches.meanPct||0)*100);
          const dropPct=Math.round((vp.fatigueCurve.totalDropPct||0)*100);
          const veloBox=document.createElement('div');
          veloBox.style.cssText='background:#f0f9ff;border:1px solid #7dd3fc;border-radius:6px;'
            +'padding:8px;margin-bottom:6px;';
          veloBox.innerHTML='<div style="font-size:9px;color:#0c4a6e;font-weight:700;margin-bottom:4px;">'
            +'Average velocity: '+avgPct+'% of max'
            +(dropPct>5?'<br>Late game drop: -'+dropPct+'% after pitch 40':'')
            +'<br>Speed variation score: '+varScore+'%'
            +(varScore<40?' — <span style="color:#991b1b;font-weight:700;">LOW — batter has timed your velocity</span>':
              varScore<65?' — <span style="color:#ca8a04;font-weight:700;">MODERATE</span>':
              ' — <span style="color:#166534;font-weight:700;">HIGH — velocity deception working</span>')
            +'</div>';
          if(dropPct>5){
            const dropNote=document.createElement('div');
            dropNote.style.cssText='font-size:9px;color:#991b1b;font-weight:700;';
            dropNote.textContent='⚠ Batter adjusts timing after pitch 40 as your velocity drops.';
            veloBox.appendChild(dropNote);
          }
          careerTab.appendChild(veloBox);
        }
        // First pitch tendency
        mlSubLabel('FIRST PITCH TENDENCY');
        const fpWeights=ml.firstPitchWeights||{};
        const topFP=Object.entries(fpWeights).sort(function(a,b){return b[1]-a[1];})[0];
        if(topFP&&topFP[1]>0.5){
          const fpEl=document.createElement('div');
          fpEl.style.cssText='padding:4px 6px;border-radius:4px;background:#fff1f0;'
            +'font-size:9px;color:#991b1b;font-weight:700;margin-bottom:4px;';
          fpEl.textContent='⚠ '+Math.round(topFP[1]*100)+'% first pitch '
            +topFP[0]+' — the batter is sitting on your opener.';
          careerTab.appendChild(fpEl);
        } else {
          const fpEl=document.createElement('div');
          fpEl.style.cssText='padding:4px 6px;border-radius:4px;background:#f0fff4;'
            +'font-size:9px;color:#166534;font-weight:700;margin-bottom:4px;';
          fpEl.textContent='✓ Good first pitch variety — batter cannot predict your opener.';
          careerTab.appendChild(fpEl);
        }
        // Coaching recommendations
        mlSubLabel('COACHING RECOMMENDATIONS');
        const recs=[];
        if(topFP&&topFP[1]>0.6)
          recs.push('Vary your first pitch — throw '+topFP[0]+' less than 50% of the time to open at-bats.');
        const highCountEntries=counts.filter(function(ct){
          const ctData=ml.countWeights&&ml.countWeights[ct];
          if(!ctData) return false;
          const top=Object.entries(ctData).sort(function(a,b){return b[1]-a[1];})[0];
          return top&&top[1]>=0.65;
        });
        if(highCountEntries.length>2)
          recs.push('You are predictable in '+highCountEntries.length+' counts. Change pitch selection in at least 2 of them.');
        if(ml.hotZones&&ml.hotZones.length)
          recs.push('Expand your zone coverage — the batter ignores '+((ml.coldZones||[]).slice(0,2).join(' and '))+'. Use these zones more.');
        const vp=ml.velocityProfile;
        if(vp&&vp.velocityVariation&&vp.velocityVariation.variationScore<0.4)
          recs.push('Increase speed variation — try throwing 5+ mph below your average occasionally to disrupt batter timing.');
        if(vp&&vp.fatigueCurve&&vp.fatigueCurve.totalDropPct>0.07)
          recs.push('Your velocity drops significantly late in games. Use more breaking balls and changeups after pitch 40.');
        if(!recs.length)
          recs.push('Good variety overall — keep mixing your sequences and locations to stay unpredictable.');
        recs.forEach(function(rec){
          const recEl=document.createElement('div');
          recEl.style.cssText='font-size:9px;color:#0c4a6e;font-weight:600;'
            +'margin-bottom:5px;padding:4px 6px;border-left:3px solid #0c4a6e;'
            +'background:#f0f9ff;line-height:1.5;';
          recEl.textContent='→ '+rec;
          careerTab.appendChild(recEl);
        });
      }
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
  // Career export button
  const careerExportBtn=document.createElement('button');
  careerExportBtn.style.cssText='width:100%;margin-top:16px;padding:10px;border-radius:6px;'
    +'border:1px solid #0c4a6e;background:#e0f2fe;color:#0c4a6e;'
    +'font-family:\'Bebas Neue\',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;';
  careerExportBtn.textContent='EXPORT CAREER REPORT TO PDF';
  careerExportBtn.onclick=function(){
    try{
      const raw=localStorage.getItem('pitchseq-game-history');
      const history=raw?JSON.parse(raw):[];
      const exportData={
        tab:'career',
        games:history,
        mlWeights:window._mlWeights||null,
        profile:typeof getProfile==='function'?getProfile():null,
        generatedAt:Date.now()
      };
      localStorage.setItem('pitchseq-report-export',JSON.stringify(exportData));
      window.open('report.html?tab=career','_blank');
    }catch(e){alert('Could not export report.');}
  };
  tabContents['CAREER'].appendChild(careerExportBtn);

  // ── SEQUENCES TAB ──
  const seqTab=tabContents['SEQUENCES'];
  try{
    const seqRaw=localStorage.getItem('pitchseq-game-history');
    const seqGames=seqRaw?JSON.parse(seqRaw):[];
    if(seqGames.length<2){
      const seqMsg=document.createElement('div');
      seqMsg.style.cssText='padding:20px;text-align:center;font-size:11px;color:#334155;';
      seqMsg.textContent='Play at least 2 games to see sequence decision trees.';
      seqTab.appendChild(seqMsg);
    } else {
      // Color blind safe pitch colors
      const CBCOLORS={
        '4FB':'#0077BB','2FB':'#EE7733','SL':'#AA3377','CH':'#009988',
        'SP':'#CCBB44','CB':'#CC3311','CT':'#33BBEE','SK':'#EE3377',
        'SWP':'#88AA00','KN':'#BBBBBB','KC':'#6644AA','FK':'#994400',
        'SCR':'#004488','EPH':'#999933','SLV':'#DDAA33'
      };
      // Outcome colors
      const OUTCOLORS={
        'STRIKEOUT':'#166534','FOUL':'#ca8a04','FOUL (PULLED)':'#ca8a04',
        'FOUL (LATE)':'#ca8a04','FOUL (STRAIGHT BACK)':'#ca8a04',
        'BALL':'#64748b','CALLED BALL':'#64748b','CHECK SWING (BALL)':'#64748b',
        'SINGLE':'#991b1b','DOUBLE':'#991b1b','TRIPLE':'#991b1b','HOME RUN':'#991b1b',
        'CALLED STRIKE':'#166534','SWING & MISS':'#166534','CHECK SWING (STRIKE)':'#166534',
        'GROUND OUT':'#1d4ed8','POP FLY':'#1d4ed8'
      };
      // Aggregate countTendencies, countOutcomes, countSequences, countPitchZoneOutcomes across all games
      const aggCT={},aggCO={},aggCS={},aggCPZO={};
      seqGames.forEach(function(g){
        // Count tendencies
        Object.entries(g.countTendencies||{}).forEach(function(e){
          const ct=e[0];
          if(!aggCT[ct]) aggCT[ct]={};
          Object.entries(e[1]).forEach(function(pe){
            aggCT[ct][pe[0]]=(aggCT[ct][pe[0]]||0)+pe[1];
          });
        });
        // Count outcomes
        Object.entries(g.countOutcomes||{}).forEach(function(e){
          const ct=e[0];
          if(!aggCO[ct]) aggCO[ct]={};
          Object.entries(e[1]).forEach(function(oe){
            aggCO[ct][oe[0]]=(aggCO[ct][oe[0]]||0)+oe[1];
          });
        });
        // Count pitch zone outcomes
        Object.entries(g.countPitchZoneOutcomes||{}).forEach(function(e){
          const ct=e[0];
          if(!aggCPZO[ct]) aggCPZO[ct]={};
          Object.entries(e[1]).forEach(function(pe){
            const pk=pe[0];
            if(!aggCPZO[ct][pk]) aggCPZO[ct][pk]={};
            Object.entries(pe[1]).forEach(function(oe){
              const outcome=oe[0];
              if(!aggCPZO[ct][pk][outcome]) aggCPZO[ct][pk][outcome]={};
              Object.entries(oe[1]).forEach(function(ze){
                aggCPZO[ct][pk][outcome][ze[0]]=(aggCPZO[ct][pk][outcome][ze[0]]||0)+ze[1];
              });
            });
          });
        });
        // Count sequences
        Object.entries(g.countSequences||{}).forEach(function(e){
          const ct=e[0];
          if(!aggCS[ct]) aggCS[ct]={};
          Object.entries(e[1]).forEach(function(pe){
            const pk=pe[0];
            if(!aggCS[ct][pk]) aggCS[ct][pk]={};
            Object.entries(pe[1]).forEach(function(oe){
              const outcome=oe[0];
              if(!aggCS[ct][pk][outcome]) aggCS[ct][pk][outcome]={};
              Object.entries(oe[1]).forEach(function(ne){
                aggCS[ct][pk][outcome][ne[0]]=(aggCS[ct][pk][outcome][ne[0]]||0)+ne[1];
              });
            });
          });
        });
      });
      // Section header
      const seqHdr=document.createElement('div');
      seqHdr.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:16px;'
        +'color:#0c4a6e;letter-spacing:2px;margin-bottom:4px;';
      seqHdr.textContent='PITCH SEQUENCE DECISION TREES';
      seqTab.appendChild(seqHdr);
      const seqSubHdr=document.createElement('div');
      seqSubHdr.style.cssText='font-size:9px;color:#475569;margin-bottom:12px;line-height:1.5;';
      seqSubHdr.textContent='Select a count to see your pitch selection patterns, outcomes and continuations. Career data across '+seqGames.length+' games.';
      seqTab.appendChild(seqSubHdr);
      // Count selector
      const allCounts=['0-0','0-1','0-2','1-0','1-1','1-2','2-0','2-1','2-2','3-0','3-1','3-2'];
      const countGoalMap={
        '0-0':'GET AHEAD','1-0':'HITTER COUNT','2-0':'HITTER COUNT','3-0':'HITTER COUNT',
        '0-1':'STAY AHEAD','1-1':'EVEN','2-1':'EVEN',
        '0-2':'FINISH','1-2':'FINISH','2-2':'FINISH','3-2':'FINISH',
        '3-1':'HITTER COUNT'
      };
      const countGoalColors={
        'GET AHEAD':'#0891b2','HITTER COUNT':'#991b1b',
        'EVEN':'#ca8a04','STAY AHEAD':'#166534','FINISH':'#7c3aed'
      };
      const selectorWrap=document.createElement('div');
      selectorWrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;';
      // Tree container
      const treeContainer=document.createElement('div');
      treeContainer.style.cssText='width:100%;min-height:300px;';
      // Build SVG tree for a given count
      function buildDecisionTree(ct){
        treeContainer.innerHTML='';
        const ctData=aggCT[ct]||{};
        const ctOutcomes=aggCO[ct]||{};
        const ctSeq=aggCS[ct]||{};
        const totalFromCount=Object.values(ctData).reduce(function(a,b){return a+b;},0);
        if(totalFromCount===0){
          treeContainer.innerHTML='<div style="padding:20px;text-align:center;font-size:9px;color:#475569;">No pitches thrown from '+ct+' count yet.</div>';
          return;
        }
        // Get top 4 pitch types
        const topPitches=Object.entries(ctData)
          .sort(function(a,b){return b[1]-a[1];})
          .slice(0,4);
        // Count goal
        const goal=countGoalMap[ct]||'';
        const goalColor=countGoalColors[goal]||'#0c4a6e';
        // SVG dimensions
        const svgW=Math.max(800,topPitches.length*220);
        const svgH=520;
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('viewBox','0 0 '+svgW+' '+svgH);
        svg.setAttribute('width','100%');
        svg.style.cssText='max-width:100%;font-family:DM Mono,monospace;';
        // Root node
        const rootX=svgW/2,rootY=60,rootR=40;
        // Root circle
        const rootCircle=document.createElementNS('http://www.w3.org/2000/svg','circle');
        rootCircle.setAttribute('cx',rootX);
        rootCircle.setAttribute('cy',rootY);
        rootCircle.setAttribute('r',rootR);
        rootCircle.setAttribute('fill','#0c4a6e');
        rootCircle.setAttribute('stroke','#bae6fd');
        rootCircle.setAttribute('stroke-width','2');
        svg.appendChild(rootCircle);
        // Root text
        function svgText(x,y,text,size,color,weight){
          const t=document.createElementNS('http://www.w3.org/2000/svg','text');
          t.setAttribute('x',x);t.setAttribute('y',y);
          t.setAttribute('text-anchor','middle');
          t.setAttribute('font-size',size||10);
          t.setAttribute('fill',color||'#fff');
          t.setAttribute('font-weight',weight||'700');
          t.setAttribute('font-family','DM Mono,monospace');
          t.textContent=text;
          return t;
        }
        svg.appendChild(svgText(rootX,rootY-8,ct,14,'#fff','700'));
        svg.appendChild(svgText(rootX,rootY+6,'COUNT',8,'#bae6fd','400'));
        svg.appendChild(svgText(rootX,rootY+18,totalFromCount+' pitches',7,'#93c5fd','400'));
        // Goal badge
        const goalRect=document.createElementNS('http://www.w3.org/2000/svg','rect');
        goalRect.setAttribute('x',rootX-45);goalRect.setAttribute('y',rootY+rootR+4);
        goalRect.setAttribute('width',90);goalRect.setAttribute('height',16);
        goalRect.setAttribute('rx',4);goalRect.setAttribute('fill',goalColor);
        svg.appendChild(goalRect);
        svg.appendChild(svgText(rootX,rootY+rootR+15,goal,7,'#fff','700'));
        // Pitch nodes (level 2)
        const pitchY=200;
        const spacing=svgW/(topPitches.length+1);
        topPitches.forEach(function(pe,pi){
          const pk=pe[0],cnt=pe[1];
          const pct=Math.round(cnt/totalFromCount*100);
          const px=spacing*(pi+1);
          const pr=Math.max(22,Math.min(38,pct/2+18));
          const pColor=CBCOLORS[pk]||'#334155';
          // Line from root to pitch
          const line=document.createElementNS('http://www.w3.org/2000/svg','line');
          line.setAttribute('x1',rootX);line.setAttribute('y1',rootY+rootR);
          line.setAttribute('x2',px);line.setAttribute('y2',pitchY-pr);
          line.setAttribute('stroke','#bae6fd');line.setAttribute('stroke-width','1.5');
          line.setAttribute('stroke-dasharray','4,2');
          svg.appendChild(line);
          // Pitch circle
          const pCircle=document.createElementNS('http://www.w3.org/2000/svg','circle');
          pCircle.setAttribute('cx',px);pCircle.setAttribute('cy',pitchY);
          pCircle.setAttribute('r',pr);
          pCircle.setAttribute('fill',pColor);
          pCircle.setAttribute('stroke','#fff');
          pCircle.setAttribute('stroke-width','1.5');
          svg.appendChild(pCircle);
          svg.appendChild(svgText(px,pitchY-6,pk,11,'#fff','700'));
          svg.appendChild(svgText(px,pitchY+8,pct+'%',9,'rgba(255,255,255,0.85)','400'));
          // Outcome nodes (level 3)
          const pitchOutcomes=ctSeq[pk]||{};
          // Build outcome data from countOutcomes (works even without countSequences)
          const ctOutcomeData=aggCO[ct]||{};
          const pitchTotal=ctData[pk]||0;
          const ctTotal=Object.values(ctData).reduce(function(a,b){return a+b;},0)||1;
          const pitchFraction=pitchTotal/ctTotal;
          // Estimate per-pitch outcomes proportionally from count outcomes
          const pitchOutcomeData={};
          Object.entries(ctOutcomeData).forEach(function(e){
            pitchOutcomeData[e[0]]=Math.round(e[1]*pitchFraction);
          });
          // Override with countSequences data if available
          const pitchSeqOutcomes=ctSeq[pk]||{};
          if(Object.keys(pitchSeqOutcomes).length>0){
            Object.entries(pitchSeqOutcomes).forEach(function(oe){
              const outcome=oe[0];
              const total=Object.values(oe[1]).reduce(function(a,b){return a+b;},0);
              pitchOutcomeData[outcome]=(pitchOutcomeData[outcome]||0)+total;
            });
          }
          // Group outcomes into K, FOUL, BALL, HIT, PLAY
          const grouped={K:0,FOUL:0,BALL:0,HIT:0,PLAY:0};
          Object.entries(pitchOutcomeData).forEach(function(e){
            const o=e[0],v=e[1];
            if(o==='STRIKEOUT'||o==='CALLED STRIKE'||o==='SWING & MISS'||o==='CHECK SWING (STRIKE)') grouped.K+=v;
            else if(o.startsWith('FOUL')||o==='CHECK SWING (BALL)') grouped.FOUL+=v;
            else if(o==='BALL'||o==='CALLED BALL') grouped.BALL+=v;
            else if(o==='SINGLE'||o==='DOUBLE'||o==='TRIPLE'||o==='HOME RUN') grouped.HIT+=v;
            else if(o==='GROUND OUT'||o==='POP FLY') grouped.PLAY+=v;
          });
          const groupTotal=Object.values(grouped).reduce(function(a,b){return a+b;},0)||1;
          const outcomeY=360;
          // Two-strike counts can produce strikeouts; others produce strikes only
          const twoStrikeCounts=['0-2','1-2','2-2','3-2'];
          const isFinishCount=twoStrikeCounts.includes(ct);
          const kLabel=isFinishCount?'K':'S';
          const kFullLabel=isFinishCount?'Strikeout':'Strike';
          const outcomeLabels={K:kLabel,FOUL:'F',BALL:'B',HIT:'H',PLAY:'P'};
          const outcomeColors={K:'#166534',FOUL:'#ca8a04',BALL:'#64748b',HIT:'#991b1b',PLAY:'#1d4ed8'};
          const activeOutcomes=Object.entries(grouped).filter(function(e){return e[1]>0;});
          const oSpacing=38;
          const oStartX=px-(activeOutcomes.length-1)*oSpacing/2;
          activeOutcomes.forEach(function(oe,oi){
            const oType=oe[0],oCount=oe[1];
            const oPct=Math.round(oCount/groupTotal*100);
            const ox=oStartX+oi*oSpacing;
            const oColor=outcomeColors[oType]||'#334155';
            // Line from pitch to outcome
            const oLine=document.createElementNS('http://www.w3.org/2000/svg','line');
            oLine.setAttribute('x1',px);oLine.setAttribute('y1',pitchY+pr);
            oLine.setAttribute('x2',ox);oLine.setAttribute('y2',outcomeY-16);
            oLine.setAttribute('stroke',oColor);oLine.setAttribute('stroke-width','1');
            oLine.setAttribute('opacity','0.5');
            svg.appendChild(oLine);
            // Draw outcome shape based on type
            const shapeSize=12;
            if(oType==='K'){
              // 5-pointed star
              const starPoints=[];
              for(let si=0;si<10;si++){
                const angle=(si*Math.PI/5)-Math.PI/2;
                const r=si%2===0?shapeSize:shapeSize*0.45;
                starPoints.push((ox+r*Math.cos(angle)).toFixed(1)+','+(outcomeY+r*Math.sin(angle)).toFixed(1));
              }
              const star=document.createElementNS('http://www.w3.org/2000/svg','polygon');
              star.setAttribute('points',starPoints.join(' '));
              star.setAttribute('fill',oColor);star.setAttribute('stroke','#fff');
              star.setAttribute('stroke-width','1');
              svg.appendChild(star);
            } else if(oType==='FOUL'){
              // Diamond (rotated square)
              const diamond=document.createElementNS('http://www.w3.org/2000/svg','polygon');
              diamond.setAttribute('points',
                ox+','+(outcomeY-shapeSize)+' '+
                (ox+shapeSize)+','+outcomeY+' '+
                ox+','+(outcomeY+shapeSize)+' '+
                (ox-shapeSize)+','+outcomeY);
              diamond.setAttribute('fill',oColor);diamond.setAttribute('stroke','#fff');
              diamond.setAttribute('stroke-width','1');
              svg.appendChild(diamond);
            } else if(oType==='BALL'){
              // Circle
              const ballC=document.createElementNS('http://www.w3.org/2000/svg','circle');
              ballC.setAttribute('cx',ox);ballC.setAttribute('cy',outcomeY);
              ballC.setAttribute('r',shapeSize);
              ballC.setAttribute('fill',oColor);ballC.setAttribute('stroke','#fff');
              ballC.setAttribute('stroke-width','1');
              svg.appendChild(ballC);
            } else if(oType==='HIT'){
              // Triangle
              const tri=document.createElementNS('http://www.w3.org/2000/svg','polygon');
              tri.setAttribute('points',
                ox+','+(outcomeY-shapeSize)+' '+
                (ox+shapeSize)+','+(outcomeY+shapeSize)+' '+
                (ox-shapeSize)+','+(outcomeY+shapeSize));
              tri.setAttribute('fill',oColor);tri.setAttribute('stroke','#fff');
              tri.setAttribute('stroke-width','1');
              svg.appendChild(tri);
            } else if(oType==='PLAY'){
              // Rounded square
              const sq=document.createElementNS('http://www.w3.org/2000/svg','rect');
              sq.setAttribute('x',ox-shapeSize);sq.setAttribute('y',outcomeY-shapeSize);
              sq.setAttribute('width',shapeSize*2);sq.setAttribute('height',shapeSize*2);
              sq.setAttribute('rx',4);
              sq.setAttribute('fill',oColor);sq.setAttribute('stroke','#fff');
              sq.setAttribute('stroke-width','1');
              svg.appendChild(sq);
            }
            // Percentage label above shape
            svg.appendChild(svgText(ox,outcomeY-shapeSize-4,oPct+'%',8,'#334155','600'));
            // Invisible click target over shape
            const clickTarget=document.createElementNS('http://www.w3.org/2000/svg','circle');
            clickTarget.setAttribute('cx',ox);clickTarget.setAttribute('cy',outcomeY);
            clickTarget.setAttribute('r',shapeSize+6);
            clickTarget.setAttribute('fill','transparent');
            clickTarget.setAttribute('cursor','pointer');
            clickTarget.setAttribute('title',oType);
            // Capture variables for closure
            (function(capturedPk,capturedOType,capturedCt,capturedOColor){
              clickTarget.addEventListener('click',function(){
                showOutcomeHeatMap(capturedPk,capturedOType,capturedCt,
                  capturedOColor,aggCPZO,isFinishCount,totalFromCount);
              });
            })(pk,oType,ct,oColor);
            svg.appendChild(clickTarget);
            // Level 3 — continuation after foul if predictable
            if(oType==='FOUL'&&oCount>3){
              const foulSeqs=pitchOutcomes['FOUL (STRAIGHT BACK)']||
                pitchOutcomes['FOUL (PULLED)']||pitchOutcomes['FOUL (LATE)']||{};
              const foulTotal=Object.values(foulSeqs).reduce(function(a,b){return a+b;},0)||1;
              const topNext=Object.entries(foulSeqs).sort(function(a,b){return b[1]-a[1];})[0];
              if(topNext&&topNext[1]/foulTotal>=0.60){
                // Show level 3 — predictable continuation
                const l3x=ox,l3y=outcomeY+50;
                const l3Line=document.createElementNS('http://www.w3.org/2000/svg','line');
                l3Line.setAttribute('x1',ox);l3Line.setAttribute('y1',outcomeY+14);
                l3Line.setAttribute('x2',l3x);l3Line.setAttribute('y2',l3y-8);
                l3Line.setAttribute('stroke','#f59e0b');l3Line.setAttribute('stroke-width','1.5');
                l3Line.setAttribute('stroke-dasharray','3,2');
                svg.appendChild(l3Line);
                const l3Rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
                l3Rect.setAttribute('x',l3x-28);l3Rect.setAttribute('y',l3y-8);
                l3Rect.setAttribute('width',56);l3Rect.setAttribute('height',20);
                l3Rect.setAttribute('rx',4);l3Rect.setAttribute('fill','#fef3c7');
                l3Rect.setAttribute('stroke','#f59e0b');l3Rect.setAttribute('stroke-width','1');
                svg.appendChild(l3Rect);
                svg.appendChild(svgText(l3x,l3y+6,
                  topNext[0]+' '+Math.round(topNext[1]/foulTotal*100)+'%',
                  6,'#92400e','700'));
              }
            }
          });
        });
        // Legend
        // Legend — top right vertical stack
        const twoStrikeCountsLegend=['0-2','1-2','2-2','3-2'];
        const isFinishLegend=twoStrikeCountsLegend.includes(ct);
        const legendItems=[
          {label:isFinishLegend?'Strikeout':'Strike',color:'#166534',type:'K'},
          {label:'Foul',color:'#ca8a04',type:'FOUL'},
          {label:'Ball',color:'#64748b',type:'BALL'},
          {label:'Hit',color:'#991b1b',type:'HIT'},
          {label:'In Play',color:'#1d4ed8',type:'PLAY'}
        ];
        const legendX=svgW-120;
        const legendStartY=20;
        const legendRowH=22;
        // Legend background box
        const legendBg=document.createElementNS('http://www.w3.org/2000/svg','rect');
        legendBg.setAttribute('x',legendX-8);
        legendBg.setAttribute('y',legendStartY-12);
        legendBg.setAttribute('width',118);
        legendBg.setAttribute('height',legendItems.length*legendRowH+10);
        legendBg.setAttribute('rx',6);
        legendBg.setAttribute('fill','#f0f9ff');
        legendBg.setAttribute('stroke','#bae6fd');
        legendBg.setAttribute('stroke-width','1');
        svg.appendChild(legendBg);
        // LEGEND title
        const lgTitle=document.createElementNS('http://www.w3.org/2000/svg','text');
        lgTitle.setAttribute('x',legendX-2);
        lgTitle.setAttribute('y',legendStartY-2);
        lgTitle.setAttribute('text-anchor','start');
        lgTitle.setAttribute('font-size',7);
        lgTitle.setAttribute('fill','#5a8aaa');
        lgTitle.setAttribute('font-weight','700');
        lgTitle.setAttribute('font-family','DM Mono,monospace');
        lgTitle.textContent='LEGEND';
        svg.appendChild(lgTitle);
        legendItems.forEach(function(item,i){
          const ly=legendStartY+10+i*legendRowH;
          // Draw shape matching outcome type
          const sx=legendX+8,sy=ly,ss=6;
          if(item.type==='K'){
            const sp=[];
            for(let si=0;si<10;si++){
              const a=(si*Math.PI/5)-Math.PI/2;
              const r=si%2===0?ss:ss*0.45;
              sp.push((sx+r*Math.cos(a)).toFixed(1)+','+(sy+r*Math.sin(a)).toFixed(1));
            }
            const star=document.createElementNS('http://www.w3.org/2000/svg','polygon');
            star.setAttribute('points',sp.join(' '));
            star.setAttribute('fill',item.color);
            svg.appendChild(star);
          } else if(item.type==='FOUL'){
            const d=document.createElementNS('http://www.w3.org/2000/svg','polygon');
            d.setAttribute('points',sx+','+(sy-ss)+' '+(sx+ss)+','+sy+' '+sx+','+(sy+ss)+' '+(sx-ss)+','+sy);
            d.setAttribute('fill',item.color);svg.appendChild(d);
          } else if(item.type==='BALL'){
            const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
            c.setAttribute('cx',sx);c.setAttribute('cy',sy);c.setAttribute('r',ss);
            c.setAttribute('fill',item.color);svg.appendChild(c);
          } else if(item.type==='HIT'){
            const t=document.createElementNS('http://www.w3.org/2000/svg','polygon');
            t.setAttribute('points',sx+','+(sy-ss)+' '+(sx+ss)+','+(sy+ss)+' '+(sx-ss)+','+(sy+ss));
            t.setAttribute('fill',item.color);svg.appendChild(t);
          } else {
            const sq=document.createElementNS('http://www.w3.org/2000/svg','rect');
            sq.setAttribute('x',sx-ss);sq.setAttribute('y',sy-ss);
            sq.setAttribute('width',ss*2);sq.setAttribute('height',ss*2);
            sq.setAttribute('rx',2);sq.setAttribute('fill',item.color);svg.appendChild(sq);
          }
          // Label — left aligned, starts after dot
          const lText=document.createElementNS('http://www.w3.org/2000/svg','text');
          lText.setAttribute('x',legendX+20);
          lText.setAttribute('y',ly+4);
          lText.setAttribute('text-anchor','start');
          lText.setAttribute('font-size',10);
          lText.setAttribute('fill',item.color);
          lText.setAttribute('font-weight','700');
          lText.setAttribute('font-family','DM Mono,monospace');
          lText.textContent=item.label;
          svg.appendChild(lText);
        });
        treeContainer.appendChild(svg);
      }
      // ── Outcome heat map popup ──
      function showOutcomeHeatMap(pk,oType,ct,oColor,cpzo,isFinish,totalFromCount){
        const existing=document.getElementById('seq-heatmap-popup');
        if(existing) existing.remove();
        const overlay=document.createElement('div');
        overlay.id='seq-heatmap-popup';
        overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;'
          +'z-index:11000;background:rgba(0,0,0,0.7);display:flex;'
          +'align-items:center;justify-content:center;';
        const card=document.createElement('div');
        card.style.cssText='background:#fff;border-radius:12px;padding:20px;'
          +'max-width:360px;width:90%;border:2px solid '+oColor+';';
        // Header
        const hdr=document.createElement('div');
        hdr.style.cssText='display:flex;justify-content:space-between;align-items:center;'
          +'margin-bottom:12px;';
        const typeNames={K:isFinish?'STRIKEOUT':'STRIKE',FOUL:'FOUL',BALL:'BALL',HIT:'HIT',PLAY:'IN PLAY'};
        const title=document.createElement('div');
        title.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:16px;'
          +'color:'+oColor+';letter-spacing:2px;';
        title.textContent=pk+' → '+typeNames[oType]+' in '+ct+' COUNT';
        const closeBtn=document.createElement('button');
        closeBtn.style.cssText='background:transparent;border:1px solid #bae6fd;'
          +'color:#0c4a6e;padding:3px 8px;border-radius:4px;cursor:pointer;'
          +'font-family:\'DM Mono\',monospace;font-size:9px;';
        closeBtn.textContent='CLOSE';
        closeBtn.onclick=function(){overlay.remove();};
        hdr.appendChild(title);hdr.appendChild(closeBtn);
        card.appendChild(hdr);
        // Check data availability
        const zoneData=cpzo[ct]&&cpzo[ct][pk]?
          cpzo[ct][pk][Object.keys(cpzo[ct][pk]).find(function(o){
            if(oType==='K') return o==='STRIKEOUT'||o==='CALLED STRIKE'||o==='SWING & MISS'||o==='CHECK SWING (STRIKE)';
            if(oType==='FOUL') return o.startsWith('FOUL')||o==='CHECK SWING (BALL)';
            if(oType==='BALL') return o==='BALL'||o==='CALLED BALL';
            if(oType==='HIT') return o==='SINGLE'||o==='DOUBLE'||o==='TRIPLE'||o==='HOME RUN';
            if(oType==='PLAY') return o==='GROUND OUT'||o==='POP FLY';
            return false;
          })||'']||null:null;
        // Aggregate all matching outcomes
        const aggZones={};
        let hasData=false;
        if(cpzo[ct]&&cpzo[ct][pk]){
          Object.entries(cpzo[ct][pk]).forEach(function(e){
            const outcome=e[0];
            let matches=false;
            if(oType==='K'&&(outcome==='STRIKEOUT'||outcome==='CALLED STRIKE'||outcome==='SWING & MISS'||outcome==='CHECK SWING (STRIKE)')) matches=true;
            if(oType==='FOUL'&&(outcome.startsWith('FOUL')||outcome==='CHECK SWING (BALL)')) matches=true;
            if(oType==='BALL'&&(outcome==='BALL'||outcome==='CALLED BALL')) matches=true;
            if(oType==='HIT'&&(outcome==='SINGLE'||outcome==='DOUBLE'||outcome==='TRIPLE'||outcome==='HOME RUN')) matches=true;
            if(oType==='PLAY'&&(outcome==='GROUND OUT'||outcome==='POP FLY')) matches=true;
            if(matches){
              hasData=true;
              Object.entries(e[1]).forEach(function(ze){
                aggZones[ze[0]]=(aggZones[ze[0]]||0)+ze[1];
              });
            }
          });
        }
        if(!hasData){
          const noData=document.createElement('div');
          noData.style.cssText='font-size:10px;color:#475569;text-align:center;padding:20px;';
          noData.textContent='No zone data yet for this outcome. Play more games to populate.';
          card.appendChild(noData);
          overlay.appendChild(card);
          document.body.appendChild(overlay);
          overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
          return;
        }
        const total=Object.values(aggZones).reduce(function(a,b){return a+b;},0)||1;
        // Summary stats
        const statsEl=document.createElement('div');
        statsEl.style.cssText='font-size:9px;color:#0c4a6e;font-weight:700;margin-bottom:10px;';
        statsEl.textContent=total+' pitches — zone distribution (catcher\'s POV)';
        card.appendChild(statsEl);
        // Zone heat map label
        const zmLabel=document.createElement('div');
        zmLabel.style.cssText='font-size:8px;color:#5a8aaa;margin-bottom:6px;letter-spacing:1px;';
        zmLabel.textContent='ZONE HEAT MAP';
        card.appendChild(zmLabel);
        // Build full heat map (inner + edge + chase)
        function heatCell(cnt,maxV,bg){
          const intensity=maxV>0?cnt/maxV:0;
          const cell=document.createElement('div');
          cell.style.cssText='height:28px;border-radius:3px;display:flex;align-items:center;'
            +'justify-content:center;font-size:9px;font-weight:700;border:0.5px solid #e0f2fe;'
            +'background:'+bg.replace('X',Math.max(0.06,intensity).toFixed(2))+';'
            +'color:'+(intensity>0.4?'#fff':'#334155')+';';
          cell.textContent=cnt>0?cnt:'';
          return cell;
        }
        // Chase top
        const chaseTopWrap=document.createElement('div');
        chaseTopWrap.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;max-width:200px;margin:0 auto 2px auto;';
        const czMax=Math.max.apply(null,Object.values(aggZones))||1;
        ['CUR','CUM','CUL'].forEach(function(zk){
          chaseTopWrap.appendChild(heatCell(aggZones[zk]||0,czMax,'rgba(59,130,246,X)'));
        });
        card.appendChild(chaseTopWrap);
        // Middle section
        const midWrap=document.createElement('div');
        midWrap.style.cssText='display:flex;gap:2px;max-width:240px;margin:0 auto 2px auto;';
        // Left chase
        const lChase=document.createElement('div');
        lChase.style.cssText='width:24px;border-radius:3px;display:flex;align-items:center;'
          +'justify-content:center;font-size:8px;font-weight:700;border:0.5px solid #e0f2fe;'
          +'background:rgba(59,130,246,'+Math.max(0.06,(aggZones['COUT']||0)/czMax).toFixed(2)+');'
          +'color:'+((aggZones['COUT']||0)/czMax>0.4?'#fff':'#334155')+';flex-shrink:0;';
        lChase.textContent=aggZones['COUT']||'';
        midWrap.appendChild(lChase);
        // Strike zone with edges
        const szWrap=document.createElement('div');
        szWrap.style.cssText='flex:1;';
        // Edge top
        const edgeTop=document.createElement('div');
        edgeTop.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-bottom:2px;';
        ['TR-CRN','TOP-EDG','TL-CRN'].forEach(function(zk){
          const cell=document.createElement('div');
          const cnt=aggZones[zk]||0;
          const intensity=cnt/czMax;
          cell.style.cssText='height:18px;border-radius:2px;display:flex;align-items:center;'
            +'justify-content:center;font-size:7px;font-weight:700;border:0.5px solid #e0f2fe;'
            +'background:rgba(217,119,6,'+Math.max(0.06,intensity).toFixed(2)+');'
            +'color:'+(intensity>0.4?'#fff':'#334155')+';';
          cell.textContent=cnt>0?cnt:'';
          edgeTop.appendChild(cell);
        });
        szWrap.appendChild(edgeTop);
        // Inner zones with side edges
        const innerMax=Math.max.apply(null,['TL','TM','TR','ML','MM','MR','BL','BM','BR'].map(function(z){return aggZones[z]||0;}))||1;
        [['TR','TM','TL'],['MR','MM','ML'],['BR','BM','BL']].forEach(function(row,ri){
          const rowWrap=document.createElement('div');
          rowWrap.style.cssText='display:flex;gap:2px;margin-bottom:2px;';
          const leftEdge=document.createElement('div');
          const leCnt=ri===1?(aggZones['RGT-EDG']||0):0;
          leftEdge.style.cssText='width:16px;border-radius:2px;display:flex;align-items:center;'
            +'justify-content:center;font-size:7px;font-weight:700;flex-shrink:0;'
            +'background:rgba(217,119,6,'+(ri===1?Math.max(0.06,leCnt/czMax).toFixed(2):'0.06')+');'
            +'color:'+(leCnt/czMax>0.4?'#fff':'#334155')+';border:0.5px solid #e0f2fe;';
          leftEdge.textContent=ri===1&&leCnt>0?leCnt:'';
          rowWrap.appendChild(leftEdge);
          const innerWrap=document.createElement('div');
          innerWrap.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;flex:1;';
          row.forEach(function(zk){
            const cnt=aggZones[zk]||0;
            const intensity=cnt/innerMax;
            const cell=document.createElement('div');
            cell.style.cssText='height:28px;border-radius:2px;display:flex;align-items:center;'
              +'justify-content:center;font-size:9px;font-weight:700;border:0.5px solid #e0f2fe;'
              +'background:rgba(220,38,38,'+Math.max(0.06,intensity).toFixed(2)+');'
              +'color:'+(intensity>0.4?'#fff':'#334155')+';';
            cell.textContent=cnt>0?cnt:'';
            innerWrap.appendChild(cell);
          });
          rowWrap.appendChild(innerWrap);
          const rightEdge=document.createElement('div');
          const reCnt=ri===1?(aggZones['LFT-EDG']||0):0;
          rightEdge.style.cssText='width:16px;border-radius:2px;display:flex;align-items:center;'
            +'justify-content:center;font-size:7px;font-weight:700;flex-shrink:0;'
            +'background:rgba(217,119,6,'+(ri===1?Math.max(0.06,reCnt/czMax).toFixed(2):'0.06')+');'
            +'color:'+(reCnt/czMax>0.4?'#fff':'#334155')+';border:0.5px solid #e0f2fe;';
          rightEdge.textContent=ri===1&&reCnt>0?reCnt:'';
          rowWrap.appendChild(rightEdge);
          szWrap.appendChild(rowWrap);
        });
        // Edge bottom
        const edgeBot=document.createElement('div');
        edgeBot.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin-bottom:2px;';
        ['BR-CRN','BOT-EDG','BL-CRN'].forEach(function(zk){
          const cell=document.createElement('div');
          const cnt=aggZones[zk]||0;
          const intensity=cnt/czMax;
          cell.style.cssText='height:18px;border-radius:2px;display:flex;align-items:center;'
            +'justify-content:center;font-size:7px;font-weight:700;border:0.5px solid #e0f2fe;'
            +'background:rgba(217,119,6,'+Math.max(0.06,intensity).toFixed(2)+');'
            +'color:'+(intensity>0.4?'#fff':'#334155')+';';
          cell.textContent=cnt>0?cnt:'';
          edgeBot.appendChild(cell);
        });
        szWrap.appendChild(edgeBot);
        midWrap.appendChild(szWrap);
        // Right chase
        const rChase=document.createElement('div');
        rChase.style.cssText='width:24px;border-radius:3px;display:flex;align-items:center;'
          +'justify-content:center;font-size:8px;font-weight:700;border:0.5px solid #e0f2fe;'
          +'background:rgba(59,130,246,'+Math.max(0.06,(aggZones['CIN']||0)/czMax).toFixed(2)+');'
          +'color:'+((aggZones['CIN']||0)/czMax>0.4?'#fff':'#334155')+';flex-shrink:0;';
        rChase.textContent=aggZones['CIN']||'';
        midWrap.appendChild(rChase);
        card.appendChild(midWrap);
        // Chase bottom
        const chaseBotWrap=document.createElement('div');
        chaseBotWrap.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:2px;max-width:200px;margin:0 auto 8px auto;';
        ['CLO-L','CLO-M','CLO-R'].forEach(function(zk){
          chaseBotWrap.appendChild(heatCell(aggZones[zk]||0,czMax,'rgba(59,130,246,X)'));
        });
        card.appendChild(chaseBotWrap);
        // Hot/cold zone summary
        const innerZones=['TL','TM','TR','ML','MM','MR','BL','BM','BR'];
        const hotZone=innerZones.reduce(function(a,b){return (aggZones[a]||0)>(aggZones[b]||0)?a:b;});
        const coldZone=innerZones.reduce(function(a,b){return (aggZones[a]||0)<(aggZones[b]||0)?a:b;});
        const summaryEl=document.createElement('div');
        summaryEl.style.cssText='font-size:9px;color:#0c4a6e;font-weight:700;margin-top:4px;';
        summaryEl.innerHTML='<span style="color:#166534;">HOT: '+hotZone+' ('+Math.round((aggZones[hotZone]||0)/total*100)+'%)</span>'
          +' &nbsp; <span style="color:#991b1b;">COLD: '+coldZone+' ('+Math.round((aggZones[coldZone]||0)/total*100)+'%)</span>';
        card.appendChild(summaryEl);
        // Coaching note
        const noteEl=document.createElement('div');
        noteEl.style.cssText='font-size:9px;color:#475569;margin-top:8px;padding:6px;'
          +'background:#f0f9ff;border-radius:4px;line-height:1.5;border-left:3px solid '+oColor+';';
        const typeNames2={K:isFinish?'strikeouts':'strikes',FOUL:'fouls',BALL:'balls',HIT:'hits',PLAY:'balls in play'};
        const hotPct=Math.round((aggZones[hotZone]||0)/total*100);
        if(hotPct>40){
          noteEl.textContent='→ '+hotPct+'% of your '+typeNames2[oType]+' cluster in '+hotZone+'. Expand to other zones to stay unpredictable.';
        } else {
          noteEl.textContent='→ Good zone variety on your '+typeNames2[oType]+' outcomes. Keep distributing across the zone.';
        }
        card.appendChild(noteEl);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
      }
      // Build count selector buttons
      allCounts.forEach(function(ct,ci){
        const totalFromCount=Object.values(aggCT[ct]||{}).reduce(function(a,b){return a+b;},0);
        const btn=document.createElement('button');
        const goal=countGoalMap[ct]||'';
        const goalColor=countGoalColors[goal]||'#0c4a6e';
        btn.style.cssText='padding:6px 10px;border-radius:6px;cursor:pointer;'
          +'font-family:\'DM Mono\',monospace;font-size:9px;font-weight:700;'
          +'border:1.5px solid '+goalColor+';background:transparent;color:'+goalColor+';'
          +'display:flex;flex-direction:column;align-items:center;gap:1px;min-width:52px;';
        btn.innerHTML='<span style="font-family:\'Bebas Neue\',sans-serif;font-size:14px;letter-spacing:1px;">'+ct+'</span>'
          +'<span style="font-size:7px;opacity:0.8;">'+totalFromCount+' pitches</span>';
        btn.onclick=function(){
          // Update active state
          selectorWrap.querySelectorAll('button').forEach(function(b){
            b.style.background='transparent';
            b.style.color=b._goalColor;
          });
          btn.style.background=goalColor;
          btn.style.color='#fff';
          buildDecisionTree(ct);
        };
        btn._goalColor=goalColor;
        selectorWrap.appendChild(btn);
        // Show first count by default
        if(ci===0){
          btn.style.background=goalColor;
          btn.style.color='#fff';
        }
      });
      seqTab.appendChild(selectorWrap);
      seqTab.appendChild(treeContainer);
      // Build default tree for 0-0
      buildDecisionTree('0-0');
      // Export button
      const seqExportBtn=document.createElement('button');
      seqExportBtn.style.cssText='width:100%;margin-top:16px;padding:10px;border-radius:6px;'
        +'border:1px solid #0c4a6e;background:#e0f2fe;color:#0c4a6e;'
        +'font-family:\'Bebas Neue\',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;';
      seqExportBtn.textContent='EXPORT SEQUENCES REPORT TO PDF';
      seqExportBtn.onclick=function(){
        try{
          const raw=localStorage.getItem('pitchseq-game-history');
          const history=raw?JSON.parse(raw):[];
          const exportData={
            tab:'sequences',
            games:history,
            profile:typeof getProfile==='function'?getProfile():null,
            generatedAt:Date.now()
          };
          localStorage.setItem('pitchseq-report-export',JSON.stringify(exportData));
          window.open('report.html?tab=sequences','_blank');
        }catch(e){alert('Could not export report.');}
      };
      seqTab.appendChild(seqExportBtn);
    }
  }catch(e){
    const seqErr=document.createElement('div');
    seqErr.style.cssText='padding:20px;color:#991b1b;font-size:11px;';
    seqErr.textContent='Error loading sequence data: '+e.message;
    seqTab.appendChild(seqErr);
  }

  // ── TUNNEL TAB ──
  const tunnelTab=tabContents['TUNNEL'];
  try{
    const tnRaw=localStorage.getItem('pitchseq-game-history');
    const tnGames=tnRaw?JSON.parse(tnRaw):[];
    // Filter games that have tunnel data
    const tnGamesWith=tnGames.filter(function(g){return g.totalTunnels>0;});
    const tnLabel=function(text){
      const s=document.createElement('div');
      s.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:13px;'
        +'color:#0c4a6e;letter-spacing:2px;border-bottom:1px solid #bae6fd;'
        +'padding-bottom:4px;margin:14px 0 8px 0;';
      s.textContent=text;
      tunnelTab.appendChild(s);
    };
    if(tnGamesWith.length===0){
      const tnMsg=document.createElement('div');
      tnMsg.style.cssText='padding:20px;text-align:center;font-size:11px;color:#475569;';
      tnMsg.innerHTML='No tunnel data yet.<br>Toggle TUNNEL ON in sim mode and play games to generate tunnel analysis.';
      tunnelTab.appendChild(tnMsg);
    } else {
      // Header
      const tnHdr=document.createElement('div');
      tnHdr.style.cssText='font-family:\'Bebas Neue\',sans-serif;font-size:16px;'
        +'color:#0c4a6e;letter-spacing:2px;margin-bottom:4px;';
      tnHdr.textContent='TUNNEL ANALYSIS';
      tunnelTab.appendChild(tnHdr);
      const tnSubHdr=document.createElement('div');
      tnSubHdr.style.cssText='font-size:9px;color:#475569;margin-bottom:12px;line-height:1.5;';
      tnSubHdr.textContent='Career tunnel data across '+tnGamesWith.length+' games with tunnel vision enabled.';
      tunnelTab.appendChild(tnSubHdr);
      // Aggregate tunnel data across all games
      const aggPairs={},aggOutcomes={},aggZones={};
      let totalTunnels=0,totalQuality=0,qualityCount=0;
      tnGamesWith.forEach(function(g){
        totalTunnels+=(g.totalTunnels||0);
        if(g.avgTunnelQuality){totalQuality+=g.avgTunnelQuality;qualityCount++;}
        Object.entries(g.tunnelPairs||{}).forEach(function(e){
          aggPairs[e[0]]=(aggPairs[e[0]]||0)+e[1];
        });
        Object.entries(g.tunnelOutcomes||{}).forEach(function(e){
          if(!aggOutcomes[e[0]]) aggOutcomes[e[0]]={};
          Object.entries(e[1]).forEach(function(oe){
            aggOutcomes[e[0]][oe[0]]=(aggOutcomes[e[0]][oe[0]]||0)+oe[1];
          });
        });
        Object.entries(g.tunnelZones||{}).forEach(function(e){
          if(!aggZones[e[0]]) aggZones[e[0]]={};
          Object.entries(e[1]).forEach(function(ze){
            aggZones[e[0]][ze[0]]=(aggZones[e[0]][ze[0]]||0)+ze[1];
          });
        });
      });
      const avgQuality=qualityCount?Math.round(totalQuality/qualityCount):0;
      // ── Overview stats ──
      const tnOverview=document.createElement('div');
      tnOverview.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;';
      function tnStatBox(label,value,color){
        const box=document.createElement('div');
        box.style.cssText='background:#f0f9ff;border:1px solid #7dd3fc;border-radius:6px;'
          +'padding:8px;text-align:center;';
        box.innerHTML='<div style="font-family:\'Bebas Neue\',sans-serif;font-size:24px;color:'
          +(color||'#0c4a6e')+';">'+value+'</div>'
          +'<div style="font-size:7px;color:#0c4a6e;letter-spacing:1px;font-weight:600;">'+label+'</div>';
        return box;
      }
      tnOverview.appendChild(tnStatBox('TOTAL TUNNELS',totalTunnels,'#0891b2'));
      tnOverview.appendChild(tnStatBox('AVG QUALITY',avgQuality+'%',avgQuality>=60?'#166534':avgQuality>=40?'#ca8a04':'#991b1b'));
      tnOverview.appendChild(tnStatBox('GAMES TRACKED',tnGamesWith.length,'#0c4a6e'));
      tunnelTab.appendChild(tnOverview);
      // Quality explanation
      const tnQualNote=document.createElement('div');
      tnQualNote.style.cssText='font-size:9px;color:#475569;margin-bottom:12px;'
        +'padding:6px;background:#f0f9ff;border-radius:4px;border-left:3px solid #0891b2;';
      tnQualNote.textContent='Tunnel quality measures how closely two pitches share the same early flight path (0-100%). '
        +'Higher quality means the batter has less time to distinguish between pitches.';
      tunnelTab.appendChild(tnQualNote);
      // ── Top tunnel pairs ──
      tnLabel('TOP TUNNEL PAIRS');
      const sortedPairs=Object.entries(aggPairs).sort(function(a,b){return b[1]-a[1];});
      const maxPairCount=sortedPairs[0]?sortedPairs[0][1]:1;
      sortedPairs.slice(0,8).forEach(function(e){
        const pair=e[0],count=e[1];
        const pairOutcomes=aggOutcomes[pair]||{};
        const pairTotal=Object.values(pairOutcomes).reduce(function(a,b){return a+b;},0)||1;
        // Calculate strike/positive outcomes
        const positiveOutcomes=['STRIKEOUT','CALLED STRIKE','SWING & MISS','CHECK SWING (STRIKE)','GROUND OUT','POP FLY'];
        const positiveCount=positiveOutcomes.reduce(function(s,o){return s+(pairOutcomes[o]||0);},0);
        const positivePct=Math.round(positiveCount/pairTotal*100);
        const foulCount=Object.entries(pairOutcomes).reduce(function(s,e){
          return s+(e[0].startsWith('FOUL')?e[1]:0);
        },0);
        const hitCount=['SINGLE','DOUBLE','TRIPLE','HOME RUN'].reduce(function(s,o){
          return s+(pairOutcomes[o]||0);
        },0);
        const pct=Math.round(count/maxPairCount*100);
        const row=document.createElement('div');
        row.style.cssText='margin-bottom:8px;padding:8px;border-radius:6px;'
          +'background:'+(positivePct>=60?'#f0fff4':positivePct>=40?'#f0f9ff':'#fff1f0')+';'
          +'border:1px solid '+(positivePct>=60?'#86efac':positivePct>=40?'#7dd3fc':'#fca5a5')+';';
        // Pair name and count
        const pairHdr=document.createElement('div');
        pairHdr.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;';
        pairHdr.innerHTML='<span style="font-family:\'Bebas Neue\',sans-serif;font-size:14px;'
          +'color:#0c4a6e;letter-spacing:1px;">'+pair+'</span>'
          +'<span style="font-size:9px;font-weight:700;color:#0c4a6e;">'+count+' tunnels</span>';
        row.appendChild(pairHdr);
        // Bar
        const barWrap=document.createElement('div');
        barWrap.style.cssText='background:#bae6fd;border-radius:2px;height:8px;margin-bottom:6px;';
        const barFill=document.createElement('div');
        barFill.style.cssText='height:100%;border-radius:2px;width:'+pct+'%;'
          +'background:'+(positivePct>=60?'#166534':positivePct>=40?'#0891b2':'#991b1b')+';';
        barWrap.appendChild(barFill);
        row.appendChild(barWrap);
        // Outcome breakdown
        const outcomeRow=document.createElement('div');
        outcomeRow.style.cssText='display:flex;gap:8px;flex-wrap:wrap;font-size:8px;font-weight:700;';
        const kCount=['STRIKEOUT','SWING & MISS','CALLED STRIKE'].reduce(function(s,o){return s+(pairOutcomes[o]||0);},0);
        const ballCount2=(['BALL','CALLED BALL']).reduce(function(s,o){return s+(pairOutcomes[o]||0);},0);
        if(kCount>0) outcomeRow.innerHTML+='<span style="color:#166534;">★ '+Math.round(kCount/pairTotal*100)+'% K/Strike</span>';
        if(foulCount>0) outcomeRow.innerHTML+='<span style="color:#ca8a04;">◆ '+Math.round(foulCount/pairTotal*100)+'% Foul</span>';
        if(ballCount2>0) outcomeRow.innerHTML+='<span style="color:#64748b;">○ '+Math.round(ballCount2/pairTotal*100)+'% Ball</span>';
        if(hitCount>0) outcomeRow.innerHTML+='<span style="color:#991b1b;">▲ '+Math.round(hitCount/pairTotal*100)+'% Hit</span>';
        row.appendChild(outcomeRow);
        // Coaching note
        if(hitCount>0&&hitCount/pairTotal>0.15){
          const warn=document.createElement('div');
          warn.style.cssText='font-size:8px;color:#991b1b;margin-top:4px;font-weight:700;';
          warn.textContent='⚠ Batter making contact on this tunnel — vary the sequence';
          row.appendChild(warn);
        } else if(positivePct>=60){
          const good=document.createElement('div');
          good.style.cssText='font-size:8px;color:#166534;margin-top:4px;font-weight:700;';
          good.textContent='✓ Effective tunnel — keep using this combination';
          row.appendChild(good);
        }
        tunnelTab.appendChild(row);
      });
      // ── Zone heat map ──
      tnLabel('WHERE TUNNELS ARE CREATED');
      const allTunnelZones={};
      Object.values(aggZones).forEach(function(zoneMap){
        Object.entries(zoneMap).forEach(function(e){
          allTunnelZones[e[0]]=(allTunnelZones[e[0]]||0)+e[1];
        });
      });
      const zoneOrder=[['TR','TM','TL'],['MR','MM','ML'],['BR','BM','BL']];
      const maxZone=Math.max.apply(null,Object.values(allTunnelZones))||1;
      const zmWrap=document.createElement('div');
      zmWrap.style.cssText='max-width:200px;margin:0 auto 12px auto;';
      const zmNote=document.createElement('div');
      zmNote.style.cssText='font-size:8px;color:#475569;text-align:center;margin-bottom:6px;';
      zmNote.textContent='Zones where tunneled pitches land (catcher\'s POV)';
      zmWrap.appendChild(zmNote);
      const zmGrid=document.createElement('div');
      zmGrid.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:3px;';
      zoneOrder.forEach(function(row){
        row.forEach(function(zk){
          const cnt=allTunnelZones[zk]||0;
          const intensity=cnt/maxZone;
          const cell=document.createElement('div');
          cell.style.cssText='height:40px;border-radius:3px;display:flex;align-items:center;'
            +'justify-content:center;font-size:10px;font-weight:700;border:0.5px solid #bae6fd;'
            +'background:rgba(8,145,178,'+Math.max(0.06,intensity).toFixed(2)+');'
            +'color:'+(intensity>0.4?'#fff':'#334155')+';';
          cell.textContent=cnt>0?cnt:'';
          zmGrid.appendChild(cell);
        });
      });
      zmWrap.appendChild(zmGrid);
      tunnelTab.appendChild(zmWrap);
      // ── Tunnel coaching insights ──
      tnLabel('TUNNEL COACHING INSIGHTS');
      const insights=[];
      // Most effective tunnel pair
      const bestPair=sortedPairs[0];
      if(bestPair){
        const bp=bestPair[0];
        const bpOut=aggOutcomes[bp]||{};
        const bpTotal=Object.values(bpOut).reduce(function(a,b){return a+b;},0)||1;
        const bpK=['STRIKEOUT','SWING & MISS','CALLED STRIKE'].reduce(function(s,o){return s+(bpOut[o]||0);},0);
        insights.push('→ Your best tunnel: '+bp+' ('+bestPair[1]+' times, '+Math.round(bpK/bpTotal*100)+'% positive outcome)');
      }
      // Quality assessment
      if(avgQuality>=65){
        insights.push('✓ Excellent tunnel quality ('+avgQuality+'%) — your release point is very consistent');
      } else if(avgQuality>=45){
        insights.push('→ Good tunnel quality ('+avgQuality+'%) — focus on consistent release point to improve');
      } else {
        insights.push('⚠ Low tunnel quality ('+avgQuality+'%) — work on release point consistency');
      }
      // Same pitch tunneling
      const samePitchTunnels=sortedPairs.filter(function(e){
        const parts=e[0].split('→');
        return parts[0]===parts[1];
      });
      if(samePitchTunnels.length>0){
        insights.push('→ '+samePitchTunnels[0][0]+' tunnels with itself ('+samePitchTunnels[0][1]+'x) — consistent arm slot on repeated pitches');
      }
      insights.forEach(function(insight){
        const el=document.createElement('div');
        el.style.cssText='font-size:9px;color:#0c4a6e;font-weight:600;'
          +'padding:4px 6px;border-left:3px solid #0891b2;'
          +'background:#f0f9ff;margin-bottom:4px;line-height:1.5;';
        el.textContent=insight;
        tunnelTab.appendChild(el);
      });
      // Export button
      const tnExportBtn=document.createElement('button');
      tnExportBtn.style.cssText='width:100%;margin-top:16px;padding:10px;border-radius:6px;'
        +'border:1px solid #0c4a6e;background:#e0f2fe;color:#0c4a6e;'
        +'font-family:\'Bebas Neue\',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;';
      tnExportBtn.textContent='EXPORT TUNNEL REPORT TO PDF';
      tnExportBtn.onclick=function(){
        try{
          const raw=localStorage.getItem('pitchseq-game-history');
          const history=raw?JSON.parse(raw):[];
          const exportData={
            tab:'tunnel',
            games:history,
            profile:typeof getProfile==='function'?getProfile():null,
            generatedAt:Date.now()
          };
          localStorage.setItem('pitchseq-report-export',JSON.stringify(exportData));
          window.open('report.html?tab=tunnel','_blank');
        }catch(e){alert('Could not export report.');}
      };
      tunnelTab.appendChild(tnExportBtn);
    }
  }catch(e){
    const tnErr=document.createElement('div');
    tnErr.style.cssText='padding:20px;color:#991b1b;font-size:11px;';
    tnErr.textContent='Error loading tunnel data: '+e.message;
    tunnelTab.appendChild(tnErr);
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
  // Show tunnel reminder every time sim mode turns ON and tunnel is OFF
  if(simMode&&typeof tunnelOn!=='undefined'&&!tunnelOn){
    const existing=document.getElementById('tunnel-reminder-toast');
    if(existing) existing.remove();
    const toast=document.createElement('div');
    toast.id='tunnel-reminder-toast';
    toast.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);'
      +'background:#0a1628;border:1.5px solid #CCBB44;color:#CCBB44;'
      +'padding:10px 16px;border-radius:8px;font-size:10px;font-weight:700;'
      +'letter-spacing:0.5px;z-index:9999;display:flex;align-items:center;'
      +'gap:10px;box-shadow:0 2px 16px rgba(0,0,0,0.5);max-width:320px;';
    toast.innerHTML='<span>💡 TUNNEL VISION IS OFF — toggle TUNNEL ON to see pitch tunnels as you pitch</span>'
      +'<button onclick="document.getElementById(\'tunnel-reminder-toast\').remove();" '
      +'style="background:transparent;border:0.5px solid #CCBB44;color:#CCBB44;'
      +'padding:2px 8px;border-radius:4px;cursor:pointer;font-size:9px;'
      +'font-family:\'DM Mono\',monospace;flex-shrink:0;">OK</button>';
    document.body.appendChild(toast);
    // Auto dismiss after 6 seconds
    setTimeout(function(){
      const t=document.getElementById('tunnel-reminder-toast');
      if(t) t.remove();
    },6000);
  }
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
    // debug removed
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
    // Auto-advance to next batter if not an inning break
    if(!simInningBreak){
      setTimeout(function(){
        // Only auto-advance if modal is still showing and no inning break
        if(atBatOver&&!simInningBreak){
          handleNewBatter();
        }
      },3000);
    }
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
  // Auto-flip Mr. OG to correct handedness
  if(typeof setBatter==='function'){
    setBatter(randomHand);
  } else {
    // Fallback: show notification if setBatter not available
    if(randomHand!==currentHand){
      showBatterHandednessNotification(randomHand);
    }
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

function getInningCap(){
  const profile=typeof getProfile==='function'?getProfile():null;
  const ag=profile?profile.ageGroup:'hsvar';
  const caps={rec10:6,rec12:6,hsrec:7,hsvar:7,college:9,pro:9};
  return caps[ag]||9;
}
function showInningCapModal(situation){
  const existing=document.getElementById('inning-cap-modal');
  if(existing) existing.remove();
  const overlay=document.createElement('div');
  overlay.id='inning-cap-modal';
  overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;'
    +'z-index:10500;background:rgba(5,8,18,0.97);display:flex;'
    +'align-items:center;justify-content:center;';
  const card=document.createElement('div');
  card.style.cssText='background:#0a1628;border-radius:12px;padding:28px 24px;'
    +'max-width:340px;width:90%;text-align:center;border:2px solid #06b6d4;';
  let html='';
  if(situation==='tie'){
    html='<div style="font-family:\'Bebas Neue\',sans-serif;font-size:28px;'
      +'color:#06b6d4;letter-spacing:3px;margin-bottom:8px;">EXTRA INNINGS</div>'
      +'<div style="font-size:10px;color:#e8f4fd;margin-bottom:16px;line-height:1.6;">'
      +'The game is tied after regulation. Do you want to continue with this pitcher or end their outing?</div>'
      +'<div style="display:flex;gap:10px;justify-content:center;">'
      +'<button id="inning-cap-continue" style="padding:10px 18px;border-radius:6px;'
      +'border:none;background:#06b6d4;color:#fff;font-family:\'Bebas Neue\',sans-serif;'
      +'font-size:14px;letter-spacing:2px;cursor:pointer;">CONTINUE PITCHING</button>'
      +'<button id="inning-cap-end" style="padding:10px 18px;border-radius:6px;'
      +'border:1px solid #991b1b;background:transparent;color:#f87171;'
      +'font-family:\'Bebas Neue\',sans-serif;font-size:14px;letter-spacing:2px;'
      +'cursor:pointer;">END GAME</button>'
      +'</div>';
  } else if(situation==='win'){
    html='<div style="font-family:\'Bebas Neue\',sans-serif;font-size:28px;'
      +'color:#166534;letter-spacing:3px;margin-bottom:8px;">WALK-OFF WIN!</div>'
      +'<div style="font-size:10px;color:#e8f4fd;margin-bottom:6px;line-height:1.6;">'
      +'Your team wins! Game over after '+inningNumber+' innings.</div>'
      +'<div style="font-size:24px;font-family:\'Bebas Neue\',sans-serif;color:#4ade80;margin-bottom:16px;">'
      +teamScore+' — '+totalScore+'</div>'
      +'<button id="inning-cap-end" style="padding:10px 24px;border-radius:6px;'
      +'border:none;background:#166534;color:#fff;font-family:\'Bebas Neue\',sans-serif;'
      +'font-size:14px;letter-spacing:2px;cursor:pointer;">END GAME</button>';
  } else if(situation==='loss'){
    html='<div style="font-family:\'Bebas Neue\',sans-serif;font-size:28px;'
      +'color:#991b1b;letter-spacing:3px;margin-bottom:8px;">GAME OVER</div>'
      +'<div style="font-size:10px;color:#e8f4fd;margin-bottom:6px;line-height:1.6;">'
      +'Regulation complete after '+inningNumber+' innings.</div>'
      +'<div style="font-size:24px;font-family:\'Bebas Neue\',sans-serif;color:#f87171;margin-bottom:16px;">'
      +teamScore+' — '+totalScore+'</div>'
      +'<button id="inning-cap-end" style="padding:10px 24px;border-radius:6px;'
      +'border:none;background:#991b1b;color:#fff;font-family:\'Bebas Neue\',sans-serif;'
      +'font-size:14px;letter-spacing:2px;cursor:pointer;">END GAME</button>';
  }
  card.innerHTML=html;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  const contBtn=document.getElementById('inning-cap-continue');
  if(contBtn) contBtn.onclick=function(){
    overlay.remove();
    handleNewInning();
  };
  const endBtn=document.getElementById('inning-cap-end');
  if(endBtn) endBtn.onclick=function(){
    overlay.remove();
    // Flush current at-bat pitches to gameSeq before saving
    if(typeof simClearSequenceOnly==='function') simClearSequenceOnly();
    if(typeof endGame==='function') endGame();
  };
}
function handleNewInning(){
  simInningBreak=false;
  inningStrikePitches=0; // reset on new inning
  resetRunners();
  outCount=0;
  // Check inning cap before incrementing
  const cap=getInningCap();
  // Determine if this is the end of a full inning
  // simHalfTop is still the CURRENT half before flip
  // If simHalfTop===false we just finished the bottom half
  // If simHalfTop===true we just finished the top half
  const justFinishedBottom=!simHalfTop;
  const justFinishedTop=simHalfTop;
  if(justFinishedBottom&&inningNumber>=cap){
    // End of regulation
    if(teamScore>totalScore){
      showInningCapModal('win');
      return;
    } else if(teamScore===totalScore){
      showInningCapModal('tie');
      return;
    } else {
      showInningCapModal('loss');
      return;
    }
  }
  // Also check top of final inning — if away team is way ahead
  // and home team has no realistic chance (optional future enhancement)
  inningNumber++;
  simHalfTop=!simHalfTop;
}

function addSimOutCore(){
  outCount++;
  // Reset inning strike counter between batters (not between innings)
  // Keep accumulating within the inning for immaculate inning detection
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
    gameSeq=gameSeq.concat(seq.map(function(p){
      // Preserve lightweight tunnel metadata, strip heavy 3D points
      const td=p.tunnelData;
      const tunnelMeta=td&&td.detected?{
        detected:true,
        length:td.length,
        prevPk:td.prevPk,
        prevSpd:td.prevSpd,
        prevIndex:td.prevIndex
      }:{detected:false};
      return Object.assign({},p,{pts3d:null,tunnelData:tunnelMeta});
    }));
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

  // debug removed

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

  // debug removed

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
  // ── Immaculate inning prevention ──
  // When pitcher has thrown 6+ strike pitches with 2 outs, batter becomes more alert
  if(outCount>=2&&inningStrikePitches>=6){
    const mlConf=window._mlWeights?window._mlWeights.confidence:0;
    const mlBoost=1+mlConf*0.5; // up to 50% stronger at 85% confidence
    if(inningStrikePitches>=8){
      // STRONG prevention — immaculate inning moment
      // Batter is fully locked in — expect fouls and battles
      const strongFoulMult=3.0*mlBoost;
      const strongMissMult=0.4;
      const strongHitMult=2.0*mlBoost;
      w['FOUL (STRAIGHT BACK)']=Math.round((w['FOUL (STRAIGHT BACK)']||0)*strongFoulMult);
      w['FOUL (PULLED)']=Math.round((w['FOUL (PULLED)']||0)*strongFoulMult);
      w['FOUL (LATE)']=Math.round((w['FOUL (LATE)']||0)*strongFoulMult);
      w['SWING & MISS']=Math.max(1,Math.round((w['SWING & MISS']||0)*strongMissMult));
      w['STRONG CONTACT']=Math.round((w['STRONG CONTACT']||0)*strongHitMult);
      w['WEAK CONTACT']=Math.round((w['WEAK CONTACT']||0)*strongHitMult);
      if(w.STRIKE!==undefined) w.STRIKE=Math.max(1,Math.round(w.STRIKE*0.5));
    } else {
      // LIGHT prevention — pitcher on a roll, batter waking up
      const lightFoulMult=2.0*mlBoost;
      const lightHitMult=1.5*mlBoost;
      w['FOUL (STRAIGHT BACK)']=Math.round((w['FOUL (STRAIGHT BACK)']||0)*lightFoulMult);
      w['FOUL (PULLED)']=Math.round((w['FOUL (PULLED)']||0)*lightFoulMult);
      w['FOUL (LATE)']=Math.round((w['FOUL (LATE)']||0)*lightFoulMult);
      w['STRONG CONTACT']=Math.round((w['STRONG CONTACT']||0)*lightHitMult);
      w['WEAK CONTACT']=Math.round((w['WEAK CONTACT']||0)*lightHitMult);
    }
  }

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
    totalWalks++;
    updateDiamondStats();
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
  if(strikeCount>=3&&(outcome==='STRIKE'||outcome==='SWING & MISS'||outcome==='CALLED STRIKE'||display==='CHECK SWING (STRIKE)')){
    display='STRIKEOUT';
    totalStrikeouts++;
    updateDiamondStats();
    addSimOutCore();
    if(simMode){
      lockThrowButton();
      // Descriptive strikeout badge based on how it happened
      const edgeZones=['TL-CRN','TR-CRN','BL-CRN','BR-CRN','TOP-EDG','BOT-EDG','LFT-EDG','RGT-EDG'];
      const chaseZones=['CUL','CUM','CUR','CLO-L','CLO-M','CLO-R','CIN','COUT'];
      const isEdge=edgeZones.includes(zone);
      const isChase=chaseZones.includes(zone);
      if(outcome==='SWING & MISS'){
        lastSimDiamondBadgeText='STRIKEOUT — SWING & MISS';
      } else if(outcome==='CALLED STRIKE'&&isChase){
        lastSimDiamondBadgeText='STRIKEOUT — BATTER FROZEN ON BORDERLINE PITCH';
      } else if(outcome==='CALLED STRIKE'&&isEdge){
        lastSimDiamondBadgeText='STRIKEOUT — CALLED STRIKE ON THE CORNER';
      } else if(outcome==='CALLED STRIKE'){
        lastSimDiamondBadgeText='STRIKEOUT — BATTER CAUGHT LOOKING';
      } else if(display==='CHECK SWING (STRIKE)'){
        lastSimDiamondBadgeText='STRIKEOUT — CHECK SWING';
      } else {
        lastSimDiamondBadgeText='STRIKEOUT';
      }
    }
    showSimAdvanceButton();saveSimState();return display;
  }
  if(outcome==='GROUND OUT'||outcome==='POP FLY'){ballCount=0;strikeCount=0;renderCount();addSimOutCore();if(simMode){lockThrowButton();lastSimDiamondBadgeText=outcome;}showSimAdvanceButton();saveSimState();return outcome;}
  if(outcome==='SINGLE'||outcome==='DOUBLE'||outcome==='TRIPLE'||outcome==='HOME RUN'){
    totalHits++;
    updateDiamondStats();
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

function updateDiamondStats(){
  const kEl=document.getElementById('modal-stat-k');
  const bbEl=document.getElementById('modal-stat-bb');
  const hEl=document.getElementById('modal-stat-h');
  const kEl2=document.getElementById('pc-strikeouts');
  const bbEl2=document.getElementById('pc-walks');
  const hEl2=document.getElementById('pc-hits');
  if(kEl) kEl.textContent=totalStrikeouts;
  if(bbEl) bbEl.textContent=totalWalks;
  if(hEl) hEl.textContent=totalHits;
  if(kEl2) kEl2.textContent=totalStrikeouts;
  if(bbEl2) bbEl2.textContent=totalWalks;
  if(hEl2) hEl2.textContent=totalHits;
}
function handleSimOutcome(pitchName,outcome,speed,pitchKey){
  incrementPitchCount();
  // Track cumulative game stats
  if(outcome==='STRIKEOUT') totalStrikeouts++;
  else if(outcome==='WALK') totalWalks++;
  else if(['SINGLE','DOUBLE','TRIPLE','HOME RUN'].includes(outcome)) totalHits++;
  const effSpeed=typeof speed==='number'?speed:parseInt((document.getElementById('spd')||{}).value,10)||0;
  if(effSpeed) lastPitchSpeed=effSpeed;
  // Track strike pitches this inning for immaculate inning prevention
  const strikeOutcomes=['STRIKE','CALLED STRIKE','SWING & MISS','FOUL',
    'FOUL (STRAIGHT BACK)','FOUL (PULLED)','FOUL (LATE)',
    'CHECK SWING (STRIKE)','STRIKEOUT'];
  if(strikeOutcomes.includes(outcome)){
    inningStrikePitches++;
  }
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

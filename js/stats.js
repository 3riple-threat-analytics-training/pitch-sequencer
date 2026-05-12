'use strict';

// ── STATS ENGINE ──
// Manages live pitch tracking, baseline blending, and stats UI rendering
// Data persists in localStorage across refreshes

const STATS_STORAGE_KEY='pitchseq-live-stats-v1';
const CONFIDENCE_THRESHOLD=50;

// Live stats structure:
// liveStats[batterType][matchupKey][zoneKey][pitchKey] = {thrown,whiffs,contacts,hardContacts,balls,chases}
let liveStats={};
let pendingStatsPitches=[];
let statsPerspective='pitcher';
let statsSubtab='table';
let statsColMode='zones';
let statsInitialized=false;

// ── INIT ──
function initStats(){
  if(statsInitialized) return;
  statsInitialized=true;
  loadLiveStats();
  updateStatsUI();
}

// ── STORAGE ──
function loadLiveStats(){
  try{
    const raw=localStorage.getItem(STATS_STORAGE_KEY);
    liveStats=raw?JSON.parse(raw):{};
  }catch(e){liveStats={};}
}

function saveLiveStats(){
  try{
    localStorage.setItem(STATS_STORAGE_KEY,JSON.stringify(liveStats));
  }catch(e){console.error('Stats save failed',e);}
}

function clearAllStats(){
  const summary=getStatsSummary();
  const msg='CLEAR SESSION DATA\n\n'
    +'You have accumulated:\n'
    +'• '+summary.totalPitches+' pitches tracked\n'
    +'• '+summary.batterTypes+' batter types\n'
    +'• '+summary.totalSessions+' sim sessions\n\n'
    +'Clearing this data will:\n'
    +'• Remove all pitch tracking data collected during sim sessions\n'
    +'• Reset all live percentages back to MLB baseline averages\n'
    +'• Cannot be undone\n\n'
    +'The MLB baseline data in the app will not be affected.';
  if(!confirm(msg)) return;
  liveStats={};
  pendingStatsPitches=[];
  saveLiveStats();
  updateStatsUI();
  alert('Session data cleared. App is now using MLB baseline averages.');
}

function getStatsSummary(){
  let totalPitches=0;
  let batterTypes=0;
  let totalSessions=0;
  Object.keys(liveStats).forEach(bt=>{
    batterTypes++;
    Object.keys(liveStats[bt]||{}).forEach(mk=>{
      Object.keys(liveStats[bt][mk]||{}).forEach(zk=>{
        Object.keys(liveStats[bt][mk][zk]||{}).forEach(pk=>{
          const d=liveStats[bt][mk][zk][pk];
          totalPitches+=(d.thrown||0);
          totalSessions+=(d.sessions||0);
        });
      });
    });
  });
  return{totalPitches,batterTypes,totalSessions};
}

// ── PITCH RECORDING ──
function recordStatsPitch(batterType,matchupKey,zoneKey,pitchKey,outcome){
  if(!batterType||batterType==='RANDOM') return;
  if(!liveStats[batterType]) liveStats[batterType]={};
  if(!liveStats[batterType][matchupKey]) liveStats[batterType][matchupKey]={};
  if(!liveStats[batterType][matchupKey][zoneKey]) liveStats[batterType][matchupKey][zoneKey]={};
  if(!liveStats[batterType][matchupKey][zoneKey][pitchKey]){
    liveStats[batterType][matchupKey][zoneKey][pitchKey]={
      thrown:0,whiffs:0,contacts:0,hardContacts:0,balls:0,chases:0,sessions:0
    };
  }
  const d=liveStats[batterType][matchupKey][zoneKey][pitchKey];
  d.thrown++;
  const o=String(outcome).toUpperCase();
  if(o==='SWING & MISS'||o==='STRIKEOUT') d.whiffs++;
  else if(['SINGLE','DOUBLE','TRIPLE','HOME RUN','GROUND OUT','POP FLY','FOUL'].includes(o)) d.contacts++;
  if(['SINGLE','DOUBLE','TRIPLE','HOME RUN'].includes(o)) d.hardContacts++;
  if(o==='BALL'||o==='WALK'||o==='CALLED BALL') d.balls++;
  saveLiveStats();
  updateStatsUI();
}

function recordPendingPitch(zoneKey,pitchKey,outcome){
  pendingStatsPitches.push({zoneKey,pitchKey,outcome});
}

function flushPendingStats(revealedBatterType){
  if(!revealedBatterType||!pendingStatsPitches.length) return;
  const profile=getProfile();
  const ph=profile?profile.hand:'R';
  const bh=typeof batter!=='undefined'?batter:'RHB';
  const mk=getMatchupKey(ph,bh);
  pendingStatsPitches.forEach(p=>{
    recordStatsPitch(revealedBatterType,mk,p.zoneKey,p.pitchKey,p.outcome);
  });
  pendingStatsPitches=[];
}

function clearPendingStats(){
  pendingStatsPitches=[];
}

// ── BLENDING ──
function getTotalPitchesForMatchup(batterType,matchupKey){
  let total=0;
  const bt=liveStats[batterType];
  if(!bt||!bt[matchupKey]) return 0;
  Object.keys(bt[matchupKey]).forEach(zk=>{
    Object.keys(bt[matchupKey][zk]||{}).forEach(pk=>{
      total+=(bt[matchupKey][zk][pk].thrown||0);
    });
  });
  return total;
}

function blendedWhiff(baseline,live,totalPitches){
  const bw=Math.max(0,1-(totalPitches/CONFIDENCE_THRESHOLD));
  const lw=1-bw;
  if(live===null) return baseline;
  return(baseline*bw)+(live*lw);
}

function getLiveWhiff(batterType,matchupKey,zoneKey,pitchKey){
  try{
    const d=liveStats[batterType][matchupKey][zoneKey][pitchKey];
    if(!d||!d.thrown) return null;
    return d.whiffs/d.thrown;
  }catch(e){return null;}
}

function getLiveHardContact(batterType,matchupKey,zoneKey,pitchKey){
  try{
    const d=liveStats[batterType][matchupKey][zoneKey][pitchKey];
    if(!d||!d.contacts) return null;
    return d.hardContacts/d.contacts;
  }catch(e){return null;}
}

function getBlendedZoneStat(batterType,matchupKey,zoneKey,pitchKey,stat){
  const baselineZone=getZoneData(
    matchupKey.includes('RHP')?'R':'L',
    matchupKey.includes('RHB')?'RHB':'LHB',
    batterType,zoneKey
  );
  if(!baselineZone) return null;
  const total=getTotalPitchesForMatchup(batterType,matchupKey);
  if(stat==='whiff'){
    const live=getLiveWhiff(batterType,matchupKey,zoneKey,pitchKey);
    return blendedWhiff(baselineZone.whiff,live,total);
  }
  if(stat==='hardContact'){
    const live=getLiveHardContact(batterType,matchupKey,zoneKey,pitchKey);
    return blendedWhiff(baselineZone.hardContact,live,total);
  }
  return baselineZone[stat]||0;
}

// ── CURRENT MATCHUP HELPERS ──
function getCurrentMatchupKey(){
  const profile=getProfile();
  const ph=profile?profile.hand:'R';
  const bh=typeof batter!=='undefined'?batter:'RHB';
  return getMatchupKey(ph,bh);
}

function getCurrentBatterType(){
  if(typeof batterType==='undefined') return 'GENERIC';
  if(batterType==='RANDOM'){
    const revealed=typeof batterRevealed!=='undefined'&&batterRevealed;
    if(!revealed) return null; // unknown
    return typeof secretBatterType!=='undefined'?secretBatterType:'GENERIC';
  }
  return batterType;
}

function getCurrentArsenal(){
  const profile=getProfile();
  return profile&&profile.arsenal?profile.arsenal:['4FB','CH'];
}

function getCurrentPitcherHand(){
  const profile=getProfile();
  return profile?profile.hand:'R';
}

// ── UPDATE MATCHUP PILL ──
function updateMatchupPill(){
  const pill=document.getElementById('statsMatchupPill');
  if(!pill) return;
  const profile=getProfile();
  const ph=profile?(profile.hand==='R'?'RHP':'LHP'):'RHP';
  const bh=typeof batter!=='undefined'?(batter==='LHB'?'LHB':'RHB'):'RHB';
  const bt=getCurrentBatterType();
  const btLabel=bt?bt.replace('_',' '):null;
  if(!bt){
    pill.innerHTML=ph+' <span>vs</span> '+bh+' — <span>BATTER UNKNOWN</span>';
    return;
  }
  pill.innerHTML=ph+' <span>vs</span> '+bh+' · <span>'+btLabel+'</span>';
}

// ── MAIN UI UPDATE ──
function updateStatsUI(){
  if(!document.getElementById('statstab')) return;
  updateMatchupPill();
  const bt=getCurrentBatterType();
  if(!bt){
    // Random batter unrevealed
    document.getElementById('statsTableContainer').innerHTML=
      '<div class="stats-no-data">⚾ BATTER UNKNOWN<br>Stats will appear after the batter is revealed.</div>';
    document.getElementById('statsBestPitches').innerHTML='';
    document.getElementById('statsHeatmapGrid').innerHTML='';
    return;
  }
  renderBestPitches();
  if(statsSubtab==='table') renderStatsTable();
  else renderStatsHeatmap();
  updateZoneGlows();
}

// ── TABLE RENDERING ──
function renderStatsTable(){
  const container=document.getElementById('statsTableContainer');
  if(!container) return;
  const bt=getCurrentBatterType();
  const mk=getCurrentMatchupKey();
  const arsenal=getCurrentArsenal();
  if(!bt||!mk||!arsenal.length){
    container.innerHTML='<div class="stats-no-data">Select a batter type in SIM MODE to see stats.</div>';
    return;
  }

  if(statsColMode==='zones') renderTableByZone(container,bt,mk,arsenal);
  else renderTableByOutcome(container,bt,mk,arsenal);
}

function renderTableByZone(container,bt,mk,arsenal){
  const zones=['TL','TM','TR','ML','MM','MR','BL','BM','BR'];
  let html='<div style="overflow-x:auto;"><table class="stats-table">';
  html+='<thead><tr><th>PITCH</th>';
  zones.forEach(z=>{html+='<th>'+z+'</th>';});
  html+='</tr></thead><tbody>';

  arsenal.forEach(pk=>{
    const pitchName=typeof PITCHES!=='undefined'&&PITCHES[pk]?PITCHES[pk].name:pk;
    const col=typeof PITCHES!=='undefined'&&PITCHES[pk]?
      '#'+PITCHES[pk].color.toString(16).padStart(6,'0'):'#888';
    html+='<tr><td><span style="color:'+col+';margin-right:4px;">●</span>'+pitchName+'</td>';
    zones.forEach(zk=>{
      const whiff=getBlendedZoneStat(bt,mk,zk,pk,'whiff');
      const hardContact=getBlendedZoneStat(bt,mk,zk,pk,'hardContact');
      const danger=isDangerZone(getCurrentPitcherHand(),
        mk.includes('RHB')?'RHB':'LHB',bt,zk);
      const advantage=isAdvantageZone(getCurrentPitcherHand(),
        mk.includes('RHB')?'RHB':'LHB',bt,zk);
      let cls='stat-neutral';
      if(danger) cls='stat-bad';
      else if(advantage) cls='stat-good';
      else if(whiff>=0.35) cls='stat-good';
      else if(hardContact>=0.40) cls='stat-bad';
      const pct=whiff!=null?Math.round(whiff*100)+'%':'—';
      html+='<td class="'+cls+'">'+pct+'</td>';
    });
    html+='</tr>';
  });

  html+='</tbody></table></div>';
  html+='<div style="font-family:DM Mono,monospace;font-size:7px;color:var(--text-muted);margin-top:4px;text-align:right;">WHIFF% BY ZONE · '+getDataSourceLabel(bt,mk)+'</div>';
  container.innerHTML=html;
}

function renderTableByOutcome(container,bt,mk,arsenal){
  let html='<div style="overflow-x:auto;"><table class="stats-table">';
  html+='<thead><tr><th>PITCH</th><th>WHIFF%</th><th>CONTACT%</th><th>HARD%</th><th>EFFECT</th></tr></thead><tbody>';

  arsenal.forEach(pk=>{
    const pitchName=typeof PITCHES!=='undefined'&&PITCHES[pk]?PITCHES[pk].name:pk;
    const col=typeof PITCHES!=='undefined'&&PITCHES[pk]?
      '#'+PITCHES[pk].color.toString(16).padStart(6,'0'):'#888';
    const pd=getPitchData(getCurrentPitcherHand(),
      mk.includes('RHB')?'RHB':'LHB',pk);
    if(!pd){html+='<tr><td colspan="5">'+pitchName+'</td></tr>';return;}

    const whiffPct=Math.round(pd.whiff*100);
    const contactPct=Math.round((1-pd.whiff)*100);
    const hardPct=Math.round(pd.hardContact*100);
    const effectPct=Math.round(pd.effectiveness*100);
    const barW=effectPct;

    const whiffCls=pd.whiff>=0.35?'stat-good':pd.whiff<=0.20?'stat-bad':'stat-neutral';
    const hardCls=pd.hardContact>=0.35?'stat-bad':pd.hardContact<=0.20?'stat-good':'stat-neutral';

    html+='<tr>';
    html+='<td><span style="color:'+col+';margin-right:4px;">●</span>'+pitchName+'</td>';
    html+='<td class="'+whiffCls+'">'+whiffPct+'%</td>';
    html+='<td>'+contactPct+'%</td>';
    html+='<td class="'+hardCls+'">'+hardPct+'%</td>';
    html+='<td><div style="display:flex;align-items:center;gap:4px;">'
      +'<div style="width:40px;height:4px;background:var(--border-panel);border-radius:2px;">'
      +'<div style="width:'+barW+'%;height:100%;background:#cc1a1a;border-radius:2px;"></div></div>'
      +'<span style="font-size:7px;color:var(--text-muted);">'+effectPct+'%</span></div></td>';
    html+='</tr>';
  });

  html+='</tbody></table></div>';
  html+='<div style="font-family:DM Mono,monospace;font-size:7px;color:var(--text-muted);margin-top:4px;text-align:right;">'+getDataSourceLabel(bt,mk)+'</div>';
  container.innerHTML=html;
}

function getDataSourceLabel(bt,mk){
  const total=getTotalPitchesForMatchup(bt,mk);
  if(total===0) return 'MLB BASELINE 2022-2024';
  const bw=Math.max(0,1-(total/CONFIDENCE_THRESHOLD));
  const basePct=Math.round(bw*100);
  const livePct=100-basePct;
  return livePct+'% LIVE · '+basePct+'% BASELINE · '+total+' PITCHES';
}

// ── HEATMAP RENDERING ──
function renderStatsHeatmap(){
  const grid=document.getElementById('statsHeatmapGrid');
  if(!grid) return;
  const bt=getCurrentBatterType();
  const mk=getCurrentMatchupKey();
  const ph=getCurrentPitcherHand();
  const bh=mk.includes('RHB')?'RHB':'LHB';

  if(!bt){
    grid.innerHTML='<div class="stats-no-data" style="grid-column:1/-1;">Batter unknown.</div>';
    return;
  }

  // Clear grid and set up 5-column layout:
  // LEFT | TL TM TR | RIGHT
  // LEFT | ML MM MR | RIGHT
  // LEFT | BL BM BR | RIGHT
  grid.style.display='grid';
  grid.style.gridTemplateColumns='1fr 1fr 1fr 1fr 1fr';
  grid.style.gridTemplateRows='auto auto auto auto auto';
  grid.style.gap='3px';
  grid.innerHTML='';

  // ── UP cell (spans all 5 columns) ──
  const upZd=getZoneData(ph,bh,bt,'UP');
  grid.appendChild(makeChaseCell('UP',upZd,bt,mk,statsPerspective,5,1));

  // ── Three middle rows ──
  const strikeRows=[
    ['ML_LEFT','TL','TM','TR','MR_RIGHT'],
    ['ML_LEFT','ML','MM','MR','MR_RIGHT'],
    ['ML_LEFT','BL','BM','BR','MR_RIGHT']
  ];

  const leftZd=getZoneData(ph,bh,bt,'IN');
  const rightZd=getZoneData(ph,bh,bt,'OUT');

  // Row 1
  grid.appendChild(makeChaseCell('LEFT',leftZd,bt,mk,statsPerspective,1,3));
  grid.appendChild(makeStrikeCell('TL',getZoneData(ph,bh,bt,'TL'),bt,mk,statsPerspective));
  grid.appendChild(makeStrikeCell('TM',getZoneData(ph,bh,bt,'TM'),bt,mk,statsPerspective));
  grid.appendChild(makeStrikeCell('TR',getZoneData(ph,bh,bt,'TR'),bt,mk,statsPerspective));
  grid.appendChild(makeChaseCell('RIGHT',rightZd,bt,mk,statsPerspective,1,3));

  // Row 2
  grid.appendChild(makeStrikeCell('ML',getZoneData(ph,bh,bt,'ML'),bt,mk,statsPerspective));
  grid.appendChild(makeStrikeCell('MM',getZoneData(ph,bh,bt,'MM'),bt,mk,statsPerspective));
  grid.appendChild(makeStrikeCell('MR',getZoneData(ph,bh,bt,'MR'),bt,mk,statsPerspective));

  // Row 3
  grid.appendChild(makeStrikeCell('BL',getZoneData(ph,bh,bt,'BL'),bt,mk,statsPerspective));
  grid.appendChild(makeStrikeCell('BM',getZoneData(ph,bh,bt,'BM'),bt,mk,statsPerspective));
  grid.appendChild(makeStrikeCell('BR',getZoneData(ph,bh,bt,'BR'),bt,mk,statsPerspective));

  // ── LOW cell (spans all 5 columns) ──
  const lowZd=getZoneData(ph,bh,bt,'LOW');
  grid.appendChild(makeChaseCell('LOW',lowZd,bt,mk,statsPerspective,5,1));

  // Handedness note
  const note=document.createElement('div');
  note.style.cssText='grid-column:1/-1;font-family:DM Mono,monospace;font-size:7px;'
    +'color:var(--text-muted);text-align:center;padding:2px 0;letter-spacing:0.5px;';
  const isRHB=bh==='RHB';
  note.textContent=ph+'HP vs '+bh+' · LEFT = '+(isRHB?'inside':'outside')+' · RIGHT = '+(isRHB?'outside':'inside');
  grid.appendChild(note);
}

function makeStrikeCell(zk,zd,bt,mk,perspective){
  const cell=document.createElement('div');
  cell.className='stats-heatmap-cell';
  if(!zd){cell.style.background='var(--bg-input)';return cell;}

  let bg,textCol,val,label;
  if(perspective==='pitcher'){
    val=zd.whiff;
    label=Math.round(val*100)+'%';
    if(zd.advantage){bg='rgba(255,255,255,0.85)';textCol='#1a1a1a';}
    else if(zd.danger){bg='rgba(204,26,26,0.80)';textCol='#ffffff';}
    else{
      const intensity=Math.min(1,val/0.50);
      bg='rgba('+(Math.round(204*(1-intensity)))+','+(Math.round(180*intensity))+',40,0.7)';
      textCol='#ffffff';
    }
  } else {
    val=zd.hardContact;
    label=Math.round(val*100)+'%';
    if(zd.danger){bg='rgba(204,26,26,0.85)';textCol='#ffffff';}
    else if(zd.advantage){bg='rgba(255,255,255,0.85)';textCol='#1a1a1a';}
    else{
      const intensity=Math.min(1,val/0.65);
      bg='rgba('+(Math.round(204*intensity))+','+(Math.round(26*intensity))+',26,0.4)';
      textCol='#ffffff';
    }
  }

  cell.style.background=bg;
  cell.style.color=textCol;
  cell.innerHTML='<div class="cell-label">'+zk+'</div><div class="cell-stat">'+label+'</div>';
  cell.onclick=()=>showZoneDetail(zk,zd,bt,mk);
  return cell;
}

function makeChaseCell(label,zd,bt,mk,perspective,colSpan,rowSpan){
  const cell=document.createElement('div');
  cell.className='stats-heatmap-cell';
  // Horizontal pills for UP and LOW
  if(colSpan>1) {
    cell.classList.add('chase-cell-horizontal');
    cell.style.gridColumn='span '+colSpan;
  }
  // Vertical pills for LEFT and RIGHT
  if(rowSpan>1){
    cell.classList.add('chase-cell-vertical');
    cell.style.gridRow='span '+rowSpan;
  }

  if(!zd){
    cell.style.background='var(--bg-input)';
    cell.innerHTML='<div class="cell-label">'+label+'</div>';
    return cell;
  }

  const chaseRate=zd.chase||0;
  let bg,textCol;
  if(chaseRate>=0.40){
    bg='rgba(255,255,255,0.85)';textCol='#1a1a1a';
  } else if(chaseRate>=0.28){
    const intensity=(chaseRate-0.28)/0.12;
    bg='rgba('+(Math.round(255*intensity))+','
      +(Math.round(255*intensity))+','
      +(Math.round(255*intensity))+',0.6)';
    textCol='#1a1a1a';
  } else {
    bg='rgba(204,26,26,0.70)';textCol='#ffffff';
  }

  const pct=Math.round(chaseRate*100)+'%';
  cell.style.background=bg;
  cell.style.color=textCol;

  if(rowSpan>1){
    // Vertical — stack label and stat vertically
    cell.innerHTML=
      '<div class="cell-label">'+label+'</div>'
      +'<div class="cell-stat">'+pct+'</div>';
  } else {
    // Horizontal — label and stat side by side
    cell.innerHTML=
      '<div style="display:flex;gap:4px;align-items:center;">'
      +'<div class="cell-label">'+label+'</div>'
      +'<div class="cell-stat">CHASE '+pct+'</div>'
      +'</div>';
  }

  cell.onclick=()=>showZoneDetail(label,zd,bt,mk);
  return cell;
}

function showZoneDetail(zk,zd,bt,mk){
  const detail=document.getElementById('statsHeatmapDetail');
  if(!detail) return;
  const dangerLabel=zd.danger?'⚠ DANGER ZONE':'';
  const advLabel=zd.advantage?'✓ PITCHER ADVANTAGE':'';
  detail.style.display='block';
  detail.innerHTML=
    '<strong style="color:var(--text-primary);font-size:9px;">'+zk+' ZONE</strong>'
    +(dangerLabel?'<span style="color:#cc1a1a;margin-left:6px;">'+dangerLabel+'</span>':'')
    +(advLabel?'<span style="color:var(--text-primary);margin-left:6px;">'+advLabel+'</span>':'')
    +'<div style="margin-top:4px;display:grid;grid-template-columns:1fr 1fr;gap:2px;">'
    +'<div>WHIFF: <strong>'+Math.round(zd.whiff*100)+'%</strong></div>'
    +'<div>CONTACT: <strong>'+Math.round(zd.contact*100)+'%</strong></div>'
    +'<div>HARD CNT: <strong>'+Math.round(zd.hardContact*100)+'%</strong></div>'
    +'<div>CHASE: <strong>'+Math.round(zd.chase*100)+'%</strong></div>'
    +'</div>'
    +'<div style="margin-top:4px;color:var(--text-muted);font-size:7px;">'+getDataSourceLabel(bt,mk)+'</div>';
}

// ── BEST PITCHES ──
function renderBestPitches(){
  const container=document.getElementById('statsBestPitches');
  if(!container) return;
  const ph=getCurrentPitcherHand();
  const mk=getCurrentMatchupKey();
  const bh=mk.includes('RHB')?'RHB':'LHB';
  const arsenal=getCurrentArsenal();
  const best=getBestPitches(ph,bh,arsenal,5);

  if(!best.length){container.innerHTML='';return;}

  container.innerHTML=best.map(pk=>{
    const pd=getPitchData(ph,bh,pk);
    if(!pd) return '';
    const pitchName=typeof PITCHES!=='undefined'&&PITCHES[pk]?PITCHES[pk].name:pk;
    const col=typeof PITCHES!=='undefined'&&PITCHES[pk]?
      '#'+PITCHES[pk].color.toString(16).padStart(6,'0'):'#888';
    const effectPct=Math.round(pd.effectiveness*100);
    return '<div class="stats-pitch-row">'
      +'<div class="stats-pitch-name"><span style="color:'+col+';">●</span>'+pitchName+'</div>'
      +'<div class="stats-pitch-bar-wrap"><div class="stats-pitch-bar" style="width:'+effectPct+'%;"></div></div>'
      +'<div class="stats-pitch-pct">'+effectPct+'%</div>'
      +'</div>';
  }).join('');
}

// ── ZONE GLOWS ──
function updateZoneGlows(){
  const bt=getCurrentBatterType();
  const ph=getCurrentPitcherHand();
  if(!bt||!ph) return;
  const mk=getCurrentMatchupKey();
  const bh=mk.includes('RHB')?'RHB':'LHB';

  // Clear existing glows
  document.querySelectorAll('.zc,.cc').forEach(el=>{
    el.classList.remove('danger-zone','advantage-zone');
  });

  // Apply new glows based on current zone
  const allZones=['TL','TM','TR','ML','MM','MR','BL','BM','BR',
    'TOP-EDG','BOT-EDG','LFT-EDG','RGT-EDG',
    'TL-CRN','TR-CRN','BL-CRN','BR-CRN'];

  allZones.forEach(zk=>{
    const el=document.querySelector('[data-zk="'+zk+'"]');
    if(!el) return;
    const danger=isDangerZone(ph,bh,bt,zk);
    const advantage=isAdvantageZone(ph,bh,bt,zk);
    if(danger) el.classList.add('danger-zone');
    else if(advantage) el.classList.add('advantage-zone');
  });
}

// ── PUBLIC API (called from other files) ──
function onSimPitchRecorded(zoneKey,pitchKey,outcome){
  const bt=typeof batterType!=='undefined'?batterType:'GENERIC';
  const mk=getCurrentMatchupKey();
  if(bt==='RANDOM'){
    recordPendingPitch(zoneKey,pitchKey,outcome);
  } else {
    recordStatsPitch(bt,mk,zoneKey,pitchKey,outcome);
  }
  updateStatsUI();
}

function onBatterRevealed(revealedType){
  flushPendingStats(revealedType);
  updateStatsUI();
}

function onNewBatter(){
  clearPendingStats();
  updateStatsUI();
}

// Override stats tab toggle functions to also update UI
function setStatsSubtab(mode){
  statsSubtab=mode;
  document.getElementById('subtabTable').classList.toggle('active',mode==='table');
  document.getElementById('subtabHeatmap').classList.toggle('active',mode==='heatmap');
  document.getElementById('statsTableView').classList.toggle('visible',mode==='table');
  document.getElementById('statsHeatmapView').classList.toggle('visible',mode==='heatmap');
  updateStatsUI();
}

function setStatsPerspective(p){
  statsPerspective=p;
  document.getElementById('statsPitcherBtn').classList.toggle('active',p==='pitcher');
  document.getElementById('statsBatterBtn').classList.toggle('active',p==='batter');
  updateStatsUI();
}

function setStatsColMode(mode){
  statsColMode=mode;
  document.getElementById('colBtnZones').classList.toggle('active',mode==='zones');
  document.getElementById('colBtnOutcomes').classList.toggle('active',mode==='outcomes');
  updateStatsUI();
}

// ── Pitch Sequencer ML Engine ──
// K-means clustering for pitcher tendency analysis
// Runs client-side after each game using accumulated Firestore data

// ── Core K-means implementation ──
function kMeans(vectors,k,maxIter){
  if(!vectors||!vectors.length||k<=0) return {centroids:[],assignments:[]};
  k=Math.min(k,vectors.length);
  const dim=vectors[0].length;
  // Initialize centroids randomly from data points
  const shuffled=vectors.slice().sort(function(){return Math.random()-0.5;});
  let centroids=shuffled.slice(0,k).map(function(v){return v.slice();});
  let assignments=new Array(vectors.length).fill(0);
  for(let iter=0;iter<(maxIter||20);iter++){
    // Assign each vector to nearest centroid
    let changed=false;
    vectors.forEach(function(v,i){
      let minDist=Infinity,minIdx=0;
      centroids.forEach(function(c,ci){
        let dist=0;
        for(let d=0;d<dim;d++) dist+=(v[d]-c[d])*(v[d]-c[d]);
        if(dist<minDist){minDist=dist;minIdx=ci;}
      });
      if(assignments[i]!==minIdx){assignments[i]=minIdx;changed=true;}
    });
    if(!changed) break;
    // Recalculate centroids
    const newCentroids=Array.from({length:k},function(){return new Array(dim).fill(0);});
    const counts=new Array(k).fill(0);
    vectors.forEach(function(v,i){
      const ci=assignments[i];
      counts[ci]++;
      for(let d=0;d<dim;d++) newCentroids[ci][d]+=v[d];
    });
    newCentroids.forEach(function(c,ci){
      if(counts[ci]>0) for(let d=0;d<dim;d++) c[d]/=counts[ci];
    });
    centroids=newCentroids;
  }
  return {centroids,assignments};
}

// ── Feature extraction ──
function buildCountVectors(games){
  // Each vector represents pitch usage in each count
  const counts=['0-0','0-1','0-2','1-0','1-1','1-2','2-0','2-1','2-2','3-0','3-1','3-2'];
  const pitchKeys=['4FB','2FB','SL','CH','CB','SP','CT','SK','FK','SWP','SCR','KN'];
  return games.map(function(g){
    const vec=[];
    counts.forEach(function(ct){
      const ctData=g.countTendencies&&g.countTendencies[ct]||{};
      const total=Object.values(ctData).reduce(function(a,b){return a+b;},0)||1;
      pitchKeys.forEach(function(pk){
        vec.push((ctData[pk]||0)/total);
      });
    });
    return vec;
  });
}

function buildZoneVectors(games){
  const zones=['TL','TM','TR','ML','MM','MR','BL','BM','BR',
    'TL-CRN','TOP-EDG','TR-CRN','LFT-EDG','RGT-EDG',
    'BL-CRN','BOT-EDG','BR-CRN','CUL','CUM','CUR',
    'CLO-L','CLO-M','CLO-R','CIN','COUT'];
  return games.map(function(g){
    const zm=g.zoneMap||{};
    const total=Object.values(zm).reduce(function(a,b){return a+b;},0)||1;
    return zones.map(function(z){return (zm[z]||0)/total;});
  });
}

function buildSequenceVectors(games){
  const pitchKeys=['4FB','2FB','SL','CH','CB','SP','CT','SK','FK','SWP','SCR','KN'];
  return games.map(function(g){
    const seqs=g.sequences||{};
    const vec=[];
    pitchKeys.forEach(function(prev){
      const total=pitchKeys.reduce(function(s,next){
        return s+(seqs[prev+'->'+next]||0);
      },0)||1;
      pitchKeys.forEach(function(next){
        vec.push((seqs[prev+'->'+next]||0)/total);
      });
    });
    return vec;
  });
}

// ── Weight computation ──
function computeMLWeights(games){
  if(!games||games.length<2) return null;
  const pitchKeys=['4FB','2FB','SL','CH','CB','SP','CT','SK','FK','SWP','SCR','KN'];
  const counts=['0-0','0-1','0-2','1-0','1-1','1-2','2-0','2-1','2-2','3-0','3-1','3-2'];
  const zones=['TL','TM','TR','ML','MM','MR','BL','BM','BR'];

  // ── Smoothing settings (tested Oct 14 2026 on 64 games) ──
  // ML_SMOOTHING: how many pitches of evidence a count needs before its own
  // numbers outweigh the pitcher's overall mix. Prevents "100% from 1 pitch".
  // ML_RECENCY: weight per game back in time (0.95 = last game 1.0, 10 games ago 0.60).
  const ML_SMOOTHING=16;
  const ML_RECENCY=0.95;
  const nGames=games.length;
  function gameWeight(i){return Math.pow(ML_RECENCY,nGames-1-i);}

  // ── Overall pitch mix (recency weighted) — the prior for everything else ──
  const mixAgg={};
  games.forEach(function(g,i){
    const w=gameWeight(i);
    Object.entries(g.pitchMix||{}).forEach(function(e){
      mixAgg[e[0]]=(mixAgg[e[0]]||0)+e[1]*w;
    });
  });
  const mixTotal=pitchKeys.reduce(function(s,pk){return s+(mixAgg[pk]||0);},0);
  const overallMix={};
  pitchKeys.forEach(function(pk){
    overallMix[pk]=mixTotal>0?(mixAgg[pk]||0)/mixTotal:1/pitchKeys.length;
  });
  function smooth(agg){
    const total=pitchKeys.reduce(function(s,pk){return s+(agg[pk]||0);},0);
    const out={};
    pitchKeys.forEach(function(pk){
      out[pk]=((agg[pk]||0)+ML_SMOOTHING*overallMix[pk])/(total+ML_SMOOTHING);
    });
    return out;
  }

  // ── Count weights ──
  // Recency-weighted count tendencies, smoothed toward the overall mix
  const countWeights={};
  counts.forEach(function(ct){
    const agg={};
    games.forEach(function(g,i){
      const w=gameWeight(i);
      const ctData=g.countTendencies&&g.countTendencies[ct]||{};
      Object.entries(ctData).forEach(function(e){
        agg[e[0]]=(agg[e[0]]||0)+e[1]*w;
      });
    });
    countWeights[ct]=smooth(agg);
  });

  // ── Zone weights ──
  // How often pitcher attacks each zone — higher = batter looks there more
  const zoneAgg={};
  games.forEach(function(g){
    Object.entries(g.zoneMap||{}).forEach(function(e){
      zoneAgg[e[0]]=(zoneAgg[e[0]]||0)+e[1];
    });
  });
  // Total over the 9 inner zones only, so weights average 1.0 (was all 25 zones)
  const zoneTotal=zones.reduce(function(s,z){return s+(zoneAgg[z]||0);},0)||1;
  const zoneWeights={};
  zones.forEach(function(z){
    // Scale: zones used more than average get weight > 1, less get weight < 1
    const freq=(zoneAgg[z]||0)/zoneTotal;
    const expected=1/zones.length;
    zoneWeights[z]=Math.max(0.3,Math.min(2.5,freq/expected));
  });

  // ── Sequence weights ──
  // After each pitch type, what does this pitcher throw next?
  const sequenceWeights={};
  pitchKeys.forEach(function(prev){
    const agg={};
    games.forEach(function(g,i){
      const w=gameWeight(i);
      const seqs=g.sequences||{};
      pitchKeys.forEach(function(next){
        const key=prev+'->'+next;
        if(seqs[key]) agg[next]=(agg[next]||0)+seqs[key]*w;
      });
    });
    const total=Object.values(agg).reduce(function(a,b){return a+b;},0);
    if(total>0) sequenceWeights[prev]=smooth(agg);
  });

  // ── First pitch weights ──
  const fpAgg={};
  games.forEach(function(g){
    Object.entries(g.firstPitches||{}).forEach(function(e){
      fpAgg[e[0]]=(fpAgg[e[0]]||0)+e[1];
    });
  });
  const fpTotal=Object.values(fpAgg).reduce(function(a,b){return a+b;},0)||1;
  const firstPitchWeights={};
  pitchKeys.forEach(function(pk){
    firstPitchWeights[pk]=(fpAgg[pk]||0)/fpTotal;
  });

  // ── Confidence score ──
  // Increases with more games: 0 at 1 game, ~0.85 at 10+ games
  const confidence=Math.min(0.85,Math.max(0,(games.length-1)/10));

  // ── K-means on count vectors for pattern clusters ──
  let countClusters=null;
  try{
    if(games.length>=3){
      const countVecs=buildCountVectors(games);
      const k=Math.min(3,Math.floor(games.length/2));
      countClusters=kMeans(countVecs,k,20);
    }
  }catch(e){console.warn('K-means count clustering failed:',e);}

  // ── Zone cluster analysis ──
  // Find the pitcher's most predictable zone patterns
  const hotZones=Object.entries(zoneAgg)
    .filter(function(e){return zones.includes(e[0]);})
    .sort(function(a,b){return b[1]-a[1];})
    .slice(0,3)
    .map(function(e){return e[0];});

  const coldZones=Object.entries(zoneAgg)
    .filter(function(e){return zones.includes(e[0]);})
    .sort(function(a,b){return a[1]-b[1];})
    .slice(0,3)
    .map(function(e){return e[0];});

  // ── Velocity profiling ──
  const profile=typeof getProfile==='function'?getProfile():null;
  const maxVelocity=profile?profile.maxVelocity||75:75;

  // Collect all velocities across all games
  const allVelos=[];
  games.forEach(function(g){
    (g.velocities||[]).forEach(function(v){if(v>0) allVelos.push(v);});
  });

  // Velocity by pitch type
  const veloByType={};
  games.forEach(function(g){
    Object.entries(g.veloByPitchType||{}).forEach(function(e){
      const pk=e[0];
      if(!veloByType[pk]) veloByType[pk]=[];
      e[1].forEach(function(v){if(v>0) veloByType[pk].push(v);});
    });
  });

  // Calculate mean and stdDev
  function mean(arr){
    if(!arr.length) return 0;
    return arr.reduce(function(a,b){return a+b;},0)/arr.length;
  }
  function stdDev(arr){
    if(arr.length<2) return 0;
    const m=mean(arr);
    return Math.sqrt(arr.reduce(function(s,v){return s+(v-m)*(v-m);},0)/arr.length);
  }

  // Overall velocity stats normalized to max velocity
  const allVeloMean=mean(allVelos);
  const allVeloStdDev=stdDev(allVelos);

  // Per pitch type stats
  const pitchTypeVeloStats={};
  Object.entries(veloByType).forEach(function(e){
    const pk=e[0],vArr=e[1];
    pitchTypeVeloStats[pk]={
      mean:mean(vArr),
      meanPct:mean(vArr)/maxVelocity,
      stdDev:stdDev(vArr),
      count:vArr.length
    };
  });

  // Speed differential between pitch types
  const speedDifferential={};
  const pitchTypeKeys=Object.keys(pitchTypeVeloStats);
  pitchTypeKeys.forEach(function(prev){
    pitchTypeKeys.forEach(function(next){
      if(prev===next) return;
      const prevMean=pitchTypeVeloStats[prev].mean;
      const nextMean=pitchTypeVeloStats[next].mean;
      const gap=prevMean-nextMean;
      if(gap>0){
        speedDifferential[prev+'->'+next]={
          avgGap:gap,
          avgGapPct:gap/maxVelocity,
          // Consistency: lower stdDev on gap = more consistent differential
          consistency:Math.max(0,1-(pitchTypeVeloStats[next].stdDev/Math.max(1,gap)))
        };
      }
    });
  });

  // Fatigue curve — split velocities into thirds by pitch order
  const fatigueCurve=(function(){
    const allPitchVelos=[];
    games.forEach(function(g){
      (g.velocities||[]).forEach(function(v,i){
        if(v>0) allPitchVelos.push({v,i});
      });
    });
    // Normalize pitch index to 0-1 across game length
    const avgGameLength=allPitchVelos.length/Math.max(1,games.length);
    const early=[],mid=[],late=[];
    games.forEach(function(g){
      const vArr=g.velocities||[];
      const len=vArr.length||1;
      vArr.forEach(function(v,i){
        if(v<=0) return;
        const pct=i/len;
        if(pct<0.33) early.push(v);
        else if(pct<0.66) mid.push(v);
        else late.push(v);
      });
    });
    const earlyMean=mean(early)||allVeloMean;
    const midMean=mean(mid)||allVeloMean;
    const lateMean=mean(late)||allVeloMean;
    return {
      earlyGameMean:earlyMean,
      earlyGamePct:earlyMean/maxVelocity,
      midGameMean:midMean,
      midGamePct:midMean/maxVelocity,
      lateGameMean:lateMean,
      lateGamePct:lateMean/maxVelocity,
      totalDrop:earlyMean-lateMean,
      totalDropPct:(earlyMean-lateMean)/maxVelocity
    };
  })();

  // Velocity variation score — how intentionally does pitcher vary speed?
  // High stdDev relative to mean = more variation = harder to time
  const variationScore=Math.min(1,allVeloStdDev/Math.max(1,allVeloMean)*5);
  // Count intentional drops — pitches >8% below pitcher's own average
  const intentionalDropThreshold=allVeloMean*0.92;
  const intentionalDrops=allVelos.filter(function(v){
    return v<intentionalDropThreshold;
  }).length;
  const intentionalDropRate=allVelos.length>0?intentionalDrops/allVelos.length:0;

  const velocityProfile={
    maxVelocity,
    allPitches:{
      mean:allVeloMean,
      meanPct:allVeloMean/maxVelocity,
      stdDev:allVeloStdDev,
      count:allVelos.length
    },
    pitchTypeStats:pitchTypeVeloStats,
    speedDifferential,
    fatigueCurve,
    velocityVariation:{
      variationScore,
      intentionalDrops,
      intentionalDropRate,
      // Reward multiplier: high variation = batter contact penalty
      rewardMultiplier:Math.max(0.75,1-variationScore*0.25*confidence)
    }
  };

  return {
    countWeights,
    zoneWeights,
    sequenceWeights,
    firstPitchWeights,
    hotZones,
    coldZones,
    velocityProfile,
    confidence,
    gamesAnalyzed:games.length,
    ageGroup:games[games.length-1].ageGroup||'unknown',
    computedAt:Date.now()
  };
}

// ── Main entry point ──
async function runMLUpdate(){
  try{
    const profile=typeof getProfile==='function'?getProfile():null;
    // debug removed
    if(!profile) return;
    // Normalize legacy age group keys
    const ageGroupMap={'youth':'rec12','hs':'hsvar','hsrec':'hsvar'};
    const rawAgeGroup=profile.ageGroup||'rec12';
    const currentAgeGroup=ageGroupMap[rawAgeGroup]||rawAgeGroup;
    // debug removed
    // Load games from Firestore if signed in, else use localStorage
    let games=[];
    if(typeof fbCurrentUser==='function'&&fbCurrentUser()&&
       typeof fbLoadGamesByAgeGroup==='function'){
      const result=await fbLoadGamesByAgeGroup(currentAgeGroup);
      if(result.success) games=result.data;
    }
    // Fallback to localStorage
    if(!games.length){
      const raw=localStorage.getItem('pitchseq-game-history');
      const allGames=raw?JSON.parse(raw):[];
      games=allGames.filter(function(g){
      const gAgeGroup=ageGroupMap[g.ageGroup]||g.ageGroup;
      return gAgeGroup===currentAgeGroup;
    });
    }
    if(games.length<2){
      window._mlWeights=null;
      return;
    }
    const weights=computeMLWeights(games);
    window._mlWeights=weights;
    // Cache in localStorage for offline use
    localStorage.setItem('pitchseq-ml-weights',JSON.stringify(weights));
    console.log('ML model updated:',games.length,'games analyzed, confidence:',
      Math.round(weights.confidence*100)+'%');
  }catch(e){
    console.warn('ML update failed:',e);
    // Try loading cached weights
    try{
      const cached=localStorage.getItem('pitchseq-ml-weights');
      if(cached) window._mlWeights=JSON.parse(cached);
    }catch(e2){}
  }
}

// ── Load cached weights on startup ──
(function(){
  try{
    const cached=localStorage.getItem('pitchseq-ml-weights');
    if(cached){
      window._mlWeights=JSON.parse(cached);
      // debug removed
    }
  }catch(e){}
})();
// ── ML part 3: the scouting report (ml-scouting-design.md §4-§5a, §8 part 3) ──
// Learns ONE player's habits from his own games: pitch type and location (zone, height,
// side) by count, the first pitch (count 0-0), and the next pitch after the last one or
// two pitches of the at-bat. Layered smoothing: each situation is pulled toward the
// broader one (count -> all counts -> his whole mix). Report only: no outcome uses it yet.
// Starting values, unverified (to be tuned in parts 3-4):
const SCOUT_K=8;                 // smoothing strength, in pitches
const SCOUT_RECENCY=0.97;        // weight of a game per newer game after it
const SCOUT_TRUST_PITCHES=600;   // full data trust at this many (weighted) pitches
const SCOUT_MIN_REPEATS=5;       // a habit is listed only after this many pitches
const SCOUT_CHECK_GAMES=10;      // the self-check scores his last 10 games
const SCOUT_MAX_GAMES=150;       // only the newest 150 games are used
const SCOUT_EPS=0.001;           // smallest probability used when scoring
const SCOUT_BLIND_H={up:1/3,middle:1/3,down:1/3},SCOUT_BLIND_S={L:1/3,M:1/3,R:1/3};
const SCOUT_STRIKES=['CALLED STRIKE','SWING & MISS','STRIKE','CHECK SWING (STRIKE)'];
const SCOUT_AB_END=['STRIKEOUT','WALK','SINGLE','DOUBLE','TRIPLE','HOME RUN',
  'GROUND OUT','POP FLY'];
function scoutHeight(zk){
  const p=ZPOS[zk];if(!p) return null;
  return p.y>Y_MID+SQ/2?'up':(p.y<Y_MID-SQ/2?'down':'middle');
}
// Side by position (x), named like the zone keys' columns: L (x<0), M, R (x>0).
function scoutSide(zk){
  const p=ZPOS[zk];if(!p) return null;
  return p.x<-ZW/6?'L':(p.x>ZW/6?'R':'M');
}
function scoutAdd(tab,key,val,w){
  if(!val||!(w>0)) return;
  const t=tab[key]||(tab[key]={});t[val]=(t[val]||0)+w;
}
// The pitches of one saved at-bat, in order, with the count before each pitch.
// Games from v80-v83 have no count per pitch: it is rebuilt from the outcomes.
function scoutAtBatEvents(ab){
  let b=0,s=0;const ev=[];
  (ab&&ab.p||[]).forEach(function(q,i){
    const o=Array.isArray(q)?{pk:q[0],zk:q[2],out:q[3]}:(q||{});
    ev.push({c:o.c||(b+'-'+s),pk:o.pk,zk:o.zk,
      p1:i>0?ev[i-1].pk:null,p2:i>1?ev[i-2].pk:null,
      z1:i>0?ev[i-1].zk:null,z2:i>1?ev[i-2].zk:null});
    const out=o.out||'';
    if(out==='BALL'||out==='CHECK SWING (BALL)') b=Math.min(3,b+1);
    else if(SCOUT_STRIKES.includes(out)) s=Math.min(2,s+1);
    else if(out.indexOf('FOUL')===0&&s<2) s++;
  });
  return ev;
}
function scoutHasData(g){
  return !!(g&&((Array.isArray(g.batterAtBats)&&g.batterAtBats.length)||g.countTendencies));
}
// Adds one game to the tables with weight w. Each game counts once, from its best source:
// the at-bats in order (v80+) when present, else the old per-game totals.
function scoutAddGame(T,g,w){
  T.games++;
  if(Array.isArray(g.batterAtBats)&&g.batterAtBats.length){
    T.ordered++;
    g.batterAtBats.forEach(function(ab){
      scoutAtBatEvents(ab).forEach(function(e){
        scoutAdd(T.type,e.c,e.pk,w);scoutAdd(T.type,'*',e.pk,w);
        scoutAdd(T.zone,e.c,e.zk,w);scoutAdd(T.zone,'*',e.zk,w);
        if(e.p1) scoutAdd(T.next1,e.p1,e.pk,w);
        if(e.p2) scoutAdd(T.next2,e.p2+'|'+e.p1,e.pk,w);
        scoutAddLocSeq(T,e,w);
        if(e.pk) T.pitches+=w;
      });
    });
    return;
  }
  const ct=g.countTendencies||{};
  Object.keys(ct).forEach(function(c){Object.keys(ct[c]).forEach(function(pk){
    const n=ct[c][pk]*w;scoutAdd(T.type,c,pk,n);scoutAdd(T.type,'*',pk,n);T.pitches+=n;
  });});
  const cz=g.countPitchZoneOutcomes||{};
  Object.keys(cz).forEach(function(c){Object.keys(cz[c]).forEach(function(pk){
    Object.keys(cz[c][pk]).forEach(function(o){Object.keys(cz[c][pk][o]).forEach(function(zk){
      const n=cz[c][pk][o][zk]*w;scoutAdd(T.zone,c,zk,n);scoutAdd(T.zone,'*',zk,n);
    });});
  });});
  // Old next-pitch totals also linked one at-bat's last pitch to the next one's first:
  // those (previous outcome ends the at-bat) are skipped.
  const cs=g.countSequences||{};
  Object.keys(cs).forEach(function(c){Object.keys(cs[c]).forEach(function(p1){
    Object.keys(cs[c][p1]).forEach(function(o){
      if(SCOUT_AB_END.includes(o)) return;
      Object.keys(cs[c][p1][o]).forEach(function(pk){scoutAdd(T.next1,p1,pk,cs[c][p1][o][pk]*w);});
    });
  });});
}
// Location sequences (v80+ games only): height and side after the last one or two pitches.
function scoutAddLocSeq(T,e,w){
  [['H',scoutHeight],['S',scoutSide]].forEach(function(x){
    const v=e.zk&&x[1](e.zk),a=e.z1&&x[1](e.z1),b=e.z2&&x[1](e.z2);
    if(!v||!a) return;
    scoutAdd(T['next'+x[0]+'1'],a,v,w);
    if(b) scoutAdd(T['next'+x[0]+'2'],b+'|'+a,v,w);
  });
}
// Tables from a list of games (oldest first); the newest game has weight 1.
// arsenal: his pitch types; the blind guess ("knows nothing") is every table's starting point.
function scoutTables(games,arsenal){
  const T={type:{},zone:{},next1:{},next2:{},nextH1:{},nextH2:{},nextS1:{},nextS2:{},
    pitches:0,games:0,ordered:0,arsenal:arsenal||[]};
  const n=games.length;
  games.forEach(function(g,j){scoutAddGame(T,g,Math.pow(SCOUT_RECENCY,n-1-j));});
  return T;
}
// Smoothed distribution: counts pulled toward the parent distribution with strength k.
function scoutDist(counts,parent,k){
  counts=counts||{};parent=parent||{};
  let n=0;Object.keys(counts).forEach(function(v){n+=counts[v];});
  const keys={};Object.keys(parent).concat(Object.keys(counts)).forEach(function(v){keys[v]=1;});
  const out={};const tot=n+k;if(!(tot>0)) return out;
  Object.keys(keys).forEach(function(v){out[v]=((counts[v]||0)+k*(parent[v]||0))/tot;});
  return out;
}
function scoutUniform(tab){
  const ks=Object.keys(tab||{});const out={};ks.forEach(function(v){out[v]=1/ks.length;});
  return out;
}
function scoutGroup(tab,fn){
  const out={};Object.keys(tab||{}).forEach(function(zk){
    const g=fn(zk);if(g) out[g]=(out[g]||0)+tab[zk];
  });
  return out;
}
// The batter's view of the next pitch's type: the count first; then the last pitch and the
// last two pitches raise or lower each type by how much more (or less) often it follows them
// than usual, so the count's information is kept.
function scoutTypeDist(T,c,p1,p2){
  const all=scoutDist(T.type['*'],scoutBlindType(T,T.arsenal),1);
  const d=scoutDist(T.type[c],all,SCOUT_K);
  if(!p1) return d;
  const n1=scoutDist(T.next1[p1],all,SCOUT_K);
  const n2=p2?scoutDist(T.next2[p2+'|'+p1],n1,SCOUT_K):n1;
  const out={};let tot=0;
  Object.keys(d).forEach(function(v){
    out[v]=d[v]*((n2[v]||0)/Math.max(SCOUT_EPS,all[v]||0));tot+=out[v];
  });
  if(!(tot>0)) return d;
  Object.keys(out).forEach(function(v){out[v]/=tot;});
  return out;
}
// Location by count: fn = null (exact zone), scoutHeight or scoutSide.
function scoutLocDist(T,c,fn){
  const g=function(t){return fn?scoutGroup(t,fn):(t||{});};
  const base=fn===scoutHeight?SCOUT_BLIND_H
    :(fn===scoutSide?SCOUT_BLIND_S:scoutUniform(g(T.zone['*'])));
  const all=scoutDist(g(T.zone['*']),base,1);
  return scoutDist(g(T.zone[c]),all,SCOUT_K);
}
// Height or side by count, then raised or lowered by what usually follows the last one or
// two pitches' height or side (same idea as for the pitch type).
function scoutLocSeqDist(T,c,fn,z1,z2){
  const d=scoutLocDist(T,c,fn);
  const a=z1&&fn(z1),b=z2&&fn(z2);if(!a) return d;
  const x=fn===scoutHeight?'H':'S';
  const all=scoutLocDist(T,'*',fn);
  const n1=scoutDist(T['next'+x+'1'][a],all,SCOUT_K);
  const n2=b?scoutDist(T['next'+x+'2'][b+'|'+a],n1,SCOUT_K):n1;
  const out={};let tot=0;
  Object.keys(d).forEach(function(v){
    out[v]=d[v]*((n2[v]||0)/Math.max(SCOUT_EPS,all[v]||0));tot+=out[v];
  });
  if(!(tot>0)) return d;
  Object.keys(out).forEach(function(v){out[v]/=tot;});
  return out;
}
// The blind guess is a batter who knows nothing about this pitcher: every pitch type of his
// arsenal equally likely, and every height and side equally likely.
function scoutBlindType(T,arsenal){
  const ks={};(arsenal||[]).concat(Object.keys(T.type['*']||{})).forEach(function(v){ks[v]=1;});
  return scoutUniform(ks);
}
function scoutLoss(d,v,n){return -n*Math.log(Math.max(SCOUT_EPS,(d&&d[v])||0));}
// How well tables T (from earlier games) predict game g, against the blind guess.
// mix/locMix: a batter who knows only his overall mix (no count, no sequence).
function scoutScoreGame(T,g,arsenal){
  const L={type:0,typeBlind:0,typeMix:0,loc:0,locBlind:0,locMix:0,n:0};
  const bt=scoutBlindType(T,arsenal),bh=SCOUT_BLIND_H,bs=SCOUT_BLIND_S;
  const mt=scoutDist(T.type['*'],bt,1);
  const mh=scoutLocDist(T,'*',scoutHeight),ms=scoutLocDist(T,'*',scoutSide);
  const addLoc=function(c,zk,n,z1,z2){
    const h=scoutHeight(zk),s=scoutSide(zk);if(!h||!s) return;
    L.loc+=scoutLoss(scoutLocSeqDist(T,c,scoutHeight,z1,z2),h,n)
      +scoutLoss(scoutLocSeqDist(T,c,scoutSide,z1,z2),s,n);
    L.locBlind+=scoutLoss(bh,h,n)+scoutLoss(bs,s,n);
    L.locMix+=scoutLoss(mh,h,n)+scoutLoss(ms,s,n);
  };
  if(Array.isArray(g.batterAtBats)&&g.batterAtBats.length){
    g.batterAtBats.forEach(function(ab){scoutAtBatEvents(ab).forEach(function(e){
      if(!e.pk) return;
      L.type+=scoutLoss(scoutTypeDist(T,e.c,e.p1,e.p2),e.pk,1);
      L.typeBlind+=scoutLoss(bt,e.pk,1);L.typeMix+=scoutLoss(mt,e.pk,1);L.n++;
      if(e.zk) addLoc(e.c,e.zk,1,e.z1,e.z2);
    });});
    return L;
  }
  const ct=g.countTendencies||{};
  Object.keys(ct).forEach(function(c){Object.keys(ct[c]).forEach(function(pk){
    const n=ct[c][pk];
    L.type+=scoutLoss(scoutTypeDist(T,c,null,null),pk,n);L.typeBlind+=scoutLoss(bt,pk,n);
    L.typeMix+=scoutLoss(mt,pk,n);L.n+=n;
  });});
  const cz=g.countPitchZoneOutcomes||{};
  Object.keys(cz).forEach(function(c){Object.keys(cz[c]).forEach(function(pk){
    Object.keys(cz[c][pk]).forEach(function(o){Object.keys(cz[c][pk][o]).forEach(function(zk){
      addLoc(c,zk,cz[c][pk][o][zk]);
    });});
  });});
  return L;
}
// The self-check (walk-forward): each of the last SCOUT_CHECK_GAMES games is scored with
// tables built only from the games before it. Skill = 1 - model loss / blind loss
// (0 = no better than the blind guess, 1 = perfect). typeMix/locMix: the part a batter
// gets from his overall mix alone; the rest comes from the count and the sequence.
function scoutWalkForward(games,howMany,arsenal){
  const rows=[];let tm=0,tb=0,lm=0,lb=0,tx=0,lx=0;
  const from=Math.max(1,games.length-(howMany||SCOUT_CHECK_GAMES));
  for(let i=from;i<games.length;i++){
    const T=scoutTables(games.slice(Math.max(0,i-SCOUT_MAX_GAMES),i),arsenal);
    const L=scoutScoreGame(T,games[i],arsenal);
    tm+=L.type;tb+=L.typeBlind;lm+=L.loc;lb+=L.locBlind;tx+=L.typeMix;lx+=L.locMix;
    rows.push({date:games[i].date,before:T.games,pitches:Math.round(L.n),
      type:L.typeBlind>0?1-L.type/L.typeBlind:null,loc:L.locBlind>0?1-L.loc/L.locBlind:null});
  }
  return {rows:rows,type:tb>0?1-tm/tb:null,loc:lb>0?1-lm/lb:null,
    typeMix:tb>0?1-tx/tb:null,locMix:lb>0?1-lx/lb:null};
}
// Plain-language habits, for the console and later the reports (descriptive only).
function scoutHabits(T){
  const out=[];
  const tot=function(t){let n=0;Object.keys(t||{}).forEach(function(v){n+=t[v];});return n;};
  const top=function(d){
    let b=null;Object.keys(d).forEach(function(v){if(!b||d[v]>d[b]) b=v;});return b;
  };
  Object.keys(T.type).filter(function(c){return c!=='*';}).forEach(function(c){
    const n=tot(T.type[c]);if(n<SCOUT_MIN_REPEATS) return;
    const d=scoutTypeDist(T,c,null,null),v=top(d);
    if(v&&d[v]>=0.6) out.push({what:(c==='0-0'?'first pitch':c)+': '+v,p:d[v],n:Math.round(n)});
    [scoutHeight,scoutSide].forEach(function(fn){
      const nz=tot(scoutGroup(T.zone[c],fn));if(nz<SCOUT_MIN_REPEATS) return;
      const dl=scoutLocDist(T,c,fn),w=top(dl);
      if(w&&dl[w]>=0.6) out.push({what:(c==='0-0'?'first pitch':c)+': '
        +(fn===scoutSide?'side '+w:w),p:dl[w],n:Math.round(nz)});
    });
  });
  Object.keys(T.next2).forEach(function(k){
    const n=tot(T.next2[k]);if(n<SCOUT_MIN_REPEATS) return;
    const pr=k.split('|'),d=scoutDist(T.next2[k],scoutDist(T.next1[pr[1]],{},0),SCOUT_K),v=top(d);
    if(v&&d[v]>=0.6) out.push({what:'after '+pr[0]+', '+pr[1]+': '+v,p:d[v],n:Math.round(n)});
  });
  ['H','S'].forEach(function(x){
    Object.keys(T['next'+x+'2']).forEach(function(k){
      const n=tot(T['next'+x+'2'][k]);if(n<SCOUT_MIN_REPEATS) return;
      const pr=k.split('|'),d=scoutDist(T['next'+x+'2'][k],T['next'+x+'1'][pr[1]]?
        scoutDist(T['next'+x+'1'][pr[1]],{},0):{},SCOUT_K),v=top(d);
      const nm=function(s){return x==='S'?'side '+s:s;};
      if(v&&d[v]>=0.6) out.push({what:'after '+nm(pr[0])+', '+nm(pr[1])+': '+nm(v),
        p:d[v],n:Math.round(n)});
    });
  });
  return out.sort(function(a,b){return b.p-a.p;}).slice(0,12);
}
// The scouting report for one player's games (any order; games without data are skipped).
// arsenal: the pitch types in his profile (for the blind guess).
function buildScoutingReport(games,arsenal){
  const gs=(games||[]).filter(scoutHasData).slice()
    .sort(function(a,b){return (a.date||0)-(b.date||0);}).slice(-SCOUT_MAX_GAMES);
  const T=scoutTables(gs,arsenal);
  const wf=scoutWalkForward(gs,SCOUT_CHECK_GAMES,arsenal);
  const trust=Math.min(1,T.pitches/SCOUT_TRUST_PITCHES);
  const pt=Math.max(0,wf.type||0),pl=Math.max(0,wf.loc||0);
  return {v:1,built:Date.now(),games:gs.length,ordered:T.ordered,pitches:Math.round(T.pitches),
    trust:trust,predictability:{type:pt,loc:pl,checked:wf.rows.length,rawType:wf.type,rawLoc:wf.loc,
      fromMixType:wf.typeMix,fromMixLoc:wf.locMix},
    strength:{type:trust*pt,loc:trust*pl},habits:scoutHabits(T),
    tables:{type:T.type,zone:T.zone,next1:T.next1,next2:T.next2,
      nextH1:T.nextH1,nextH2:T.nextH2,nextS1:T.nextS1,nextS2:T.nextS2},
    settings:{k:SCOUT_K,recency:SCOUT_RECENCY,trustPitches:SCOUT_TRUST_PITCHES,
      minRepeats:SCOUT_MIN_REPEATS,checkGames:SCOUT_CHECK_GAMES,maxGames:SCOUT_MAX_GAMES}};
}
// Rebuilds this player's report from his games and keeps it on this device (option A).
function updateScoutingReport(){
  try{
    if(typeof currentPlayerId!=='function'||typeof playerGamesFrom!=='function') return null;
    const id=currentPlayerId();if(!id) return null;
    const prof=typeof getProfile==='function'?getProfile():null;
    const r=buildScoutingReport(playerGamesFrom(localStorage.getItem('pitchseq-game-history')),
      prof&&Array.isArray(prof.arsenal)?prof.arsenal:[]);
    r.playerId=id;
    localStorage.setItem('pitchseq-scout-'+id,JSON.stringify(r));
    const pc=function(x){return Math.round(100*x)+'%';};
    console.log('Scouting report: '+r.games+' games · predictability: type '
      +pc(r.predictability.type)+', location '+pc(r.predictability.loc)+' · trust '+pc(r.trust));
    return r;
  }catch(e){console.warn('Scouting report not built:',e);return null;}
}

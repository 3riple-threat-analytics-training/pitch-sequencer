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

  // ── Count weights ──
  // Aggregate count tendencies across all games
  const countWeights={};
  counts.forEach(function(ct){
    const agg={};
    games.forEach(function(g){
      const ctData=g.countTendencies&&g.countTendencies[ct]||{};
      Object.entries(ctData).forEach(function(e){
        agg[e[0]]=(agg[e[0]]||0)+e[1];
      });
    });
    const total=Object.values(agg).reduce(function(a,b){return a+b;},0)||1;
    countWeights[ct]={};
    pitchKeys.forEach(function(pk){
      countWeights[ct][pk]=(agg[pk]||0)/total;
    });
  });

  // ── Zone weights ──
  // How often pitcher attacks each zone — higher = batter looks there more
  const zoneAgg={};
  games.forEach(function(g){
    Object.entries(g.zoneMap||{}).forEach(function(e){
      zoneAgg[e[0]]=(zoneAgg[e[0]]||0)+e[1];
    });
  });
  const zoneTotal=Object.values(zoneAgg).reduce(function(a,b){return a+b;},0)||1;
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
    games.forEach(function(g){
      const seqs=g.sequences||{};
      pitchKeys.forEach(function(next){
        const key=prev+'->'+next;
        if(seqs[key]) agg[next]=(agg[next]||0)+seqs[key];
      });
    });
    const total=Object.values(agg).reduce(function(a,b){return a+b;},0);
    if(total>0){
      sequenceWeights[prev]={};
      pitchKeys.forEach(function(next){
        sequenceWeights[prev][next]=(agg[next]||0)/total;
      });
    }
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

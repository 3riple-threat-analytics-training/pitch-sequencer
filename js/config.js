const MIN_Y=0.50;
const ZW=0.48,ZLO=0.75,ZHI=1.37,ZH=ZHI-ZLO,SQ=ZH/3;
const Y_TOP=ZHI-SQ/2,Y_MID=ZLO+SQ*1.5,Y_BOT=ZLO+SQ/2;
const X_L=-ZW/3,X_M=0,X_R=ZW/3;
const CLO_Y=ZLO-0.08,CUP_Y=ZHI+0.08;
const ORB_R=0.025,FRAME_EDGE=0.70,BD_BORDER=ZW/2,TUBE_R=0.035;
const TUNNEL_THRESH=0.22,TUNNEL_START=0.15,TUNNEL_END=0.72;
const PITCHER_COUNTS=['0-2','1-2','2-2'];
const HITTER_COUNTS=['2-0','3-0','3-1'];

// Count-location danger zones by batter type and count
// These are the zones batters are sitting on in hitter's counts
const DANGER_ZONES={
  GENERIC:{
    '3-0':['MM'],
    '2-0':['MM','TM','BM','ML','MR'],
    '3-1':['MM','TM','BM','ML','MR','TOP-EDG','BOT-EDG','LFT-EDG','RGT-EDG']
  },
  FREE_SWINGER:{
    '3-0':['MM'],
    '2-0':['TM','MM','BM','ML','MR','TOP-EDG','BOT-EDG'],
    '3-1':['TL','TM','TR','ML','MM','MR','BL','BM','BR','TOP-EDG','BOT-EDG','LFT-EDG','RGT-EDG','TL-CRN','TR-CRN','BL-CRN','BR-CRN']
  },
  PATIENT:{
    '3-0':['MM'],
    '2-0':['MM','TM','BM'],
    '3-1':['MM']
  },
  HIGH_BALL:{
    '3-0':['TM'],
    '2-0':['TL','TM','TR','TOP-EDG'],
    '3-1':['TL','TM','TR','TOP-EDG','TL-CRN','TR-CRN']
  },
  LOW_BALL:{
    '3-0':['BM'],
    '2-0':['BL','BM','BR','BOT-EDG'],
    '3-1':['BL','BM','BR','BOT-EDG','BL-CRN','BR-CRN']
  },
  PULL_RHB:{
    '3-0':['ML'],
    '2-0':['TL','ML','BL','LFT-EDG'],
    '3-1':['TL','ML','BL','LFT-EDG','TL-CRN','BL-CRN']
  },
  PULL_LHB:{
    '3-0':['MR'],
    '2-0':['TR','MR','BR','RGT-EDG'],
    '3-1':['TR','MR','BR','RGT-EDG','TR-CRN','BR-CRN']
  },
  PULL:{
    '3-0':['ML'],
    '2-0':['TL','ML','BL','LFT-EDG'],
    '3-1':['TL','ML','BL','LFT-EDG','TL-CRN','BL-CRN']
  }
};

// Pitcher's count sweet spot zones — reward throwing here when ahead in count
const PITCHER_COUNT_SWEET_SPOTS=[
  'TOP-EDG','BOT-EDG','LFT-EDG','RGT-EDG',
  'TL-CRN','TR-CRN','BL-CRN','BR-CRN'
];

// Chase zones that get extra reward in pitcher's counts
const PITCHER_COUNT_CHASE_BONUS=[
  'CUR','CUM','CUL','CLO-L','CLO-M','CLO-R','CIN','COUT'
];

// 3-0 take probability by batter type
// Reflects coaching reality — some batters are told to take on 3-0
const TAKE_30_PROBABILITY={
  GENERIC:0.55,
  FREE_SWINGER:0.25,
  PATIENT:0.90,
  HIGH_BALL:0.60,
  LOW_BALL:0.60,
  PULL:0.50
};
const TIPS={left:'1B side: wider angle to RHB.',center:'Center: neutral angle.',right:'3B side: wider angle to LHB.'};

const PLAN_STORAGE_KEY='pitchSequencerSavedPlansV1';
const SIM_SESSION_KEY='pitchseq-sim-state';
const STRIKE9_ZONE_KEYS=['TL','TM','TR','ML','MM','MR','BL','BM','BR'];
const EDGE8_ZONE_KEYS=['TL-CRN','TR-CRN','BL-CRN','BR-CRN','TOP-EDG','BOT-EDG','LFT-EDG','RGT-EDG'];
const EDGE_LINE_KEYS=['LFT-EDG','RGT-EDG','TOP-EDG','BOT-EDG'];
const STRIKE_ZONE_KEYS=STRIKE9_ZONE_KEYS.concat(EDGE8_ZONE_KEYS);
const CHASE_ZONE_KEYS=['CUR','CUM','CUL','CIN','COUT','CLO-L','CLO-M','CLO-R'];

// Batter level definitions
const BATTER_LEVELS={
  rec10:{
    label:'8U-10U Rec',
    chaseSwing:{0:0.70,1:0.80,2:0.90},
    velocityRange:{min:35,max:52},
    aboveRangeSwingMiss:0.25,
    belowRangeContact:0.20,
    breakingBallRecognition:0.05,
    weakContactPct:0.75,
    strongContactPct:0.25
  },
  club10:{
    label:'8U-10U Club',
    chaseSwing:{0:0.50,1:0.65,2:0.85},
    velocityRange:{min:40,max:58},
    aboveRangeSwingMiss:0.22,
    belowRangeContact:0.18,
    breakingBallRecognition:0.15,
    weakContactPct:0.65,
    strongContactPct:0.35
  },
  rec12:{
    label:'11U-12U Rec',
    chaseSwing:{0:0.50,1:0.65,2:0.85},
    velocityRange:{min:40,max:58},
    aboveRangeSwingMiss:0.22,
    belowRangeContact:0.18,
    breakingBallRecognition:0.15,
    weakContactPct:0.65,
    strongContactPct:0.35
  },
  club12:{
    label:'11U-12U Club',
    chaseSwing:{0:0.35,1:0.50,2:0.75},
    velocityRange:{min:48,max:65},
    aboveRangeSwingMiss:0.20,
    belowRangeContact:0.15,
    breakingBallRecognition:0.28,
    weakContactPct:0.55,
    strongContactPct:0.45
  },
  comp13:{
    label:'12U-13U Competitive',
    chaseSwing:{0:0.35,1:0.50,2:0.75},
    velocityRange:{min:48,max:65},
    aboveRangeSwingMiss:0.20,
    belowRangeContact:0.15,
    breakingBallRecognition:0.28,
    weakContactPct:0.55,
    strongContactPct:0.45
  },
  hsjv:{
    label:'HS JV (14U-15U)',
    chaseSwing:{0:0.22,1:0.35,2:0.65},
    velocityRange:{min:60,max:80},
    aboveRangeSwingMiss:0.18,
    belowRangeContact:0.12,
    breakingBallRecognition:0.42,
    weakContactPct:0.45,
    strongContactPct:0.55
  },
  hsvar:{
    label:'HS Varsity (16U-18U)',
    chaseSwing:{0:0.15,1:0.28,2:0.60},
    velocityRange:{min:68,max:92},
    aboveRangeSwingMiss:0.15,
    belowRangeContact:0.10,
    breakingBallRecognition:0.55,
    weakContactPct:0.38,
    strongContactPct:0.62
  },
  college:{
    label:'College / Minor League',
    chaseSwing:{0:0.10,1:0.18,2:0.52},
    velocityRange:{min:80,max:98},
    aboveRangeSwingMiss:0.10,
    belowRangeContact:0.08,
    breakingBallRecognition:0.70,
    weakContactPct:0.30,
    strongContactPct:0.70
  },
  pro:{
    label:'Professional (MLB / Mexican League / NPB)',
    chaseSwing:{0:0.06,1:0.12,2:0.45},
    velocityRange:{min:85,max:103},
    aboveRangeSwingMiss:0.08,
    belowRangeContact:0.15,
    breakingBallRecognition:0.85,
    weakContactPct:0.22,
    strongContactPct:0.78
  }
};

// Speed differential swing and miss modifiers
// Base speed differential thresholds — scaled by batter level in getSpeedDiffModifier
const SPEED_DIFF_MODIFIERS=[
  {minDiff:0,  swingMissBonus:0},
  {minDiff:5,  swingMissBonus:0.05},
  {minDiff:10, swingMissBonus:0.12},
  {minDiff:15, swingMissBonus:0.20},
  {minDiff:20, swingMissBonus:0.30},
  {minDiff:25, swingMissBonus:0.42},
  {minDiff:30, swingMissBonus:0.55}
];

// Level scaling for speed differential effect
// Higher levels are more affected by speed changes because their timing is more precise
const SPEED_DIFF_LEVEL_SCALE={
  rec10:0.20,  // young batters barely notice speed changes
  rec12:0.25,
  club10:0.30,
  club12:0.38,
  comp13:0.48,
  hsjv:0.60,
  hsvar:0.75,
  college:0.90,
  pro:1.00     // pro batters are maximally affected by speed differential
};

// Direction multipliers — fastball to breaking ball is more effective than vice versa
const SPEED_DIFF_DIRECTION={
  fastToBraking:1.30,  // pitcher throws hard then slow — batter out in front
  breakingToFast:1.00  // pitcher throws slow then hard — batter late but less fooled
};

// Breaking ball pitch keys — these are affected by recognition rate
const BREAKING_BALL_KEYS=['CB','SL','CT','SCR','SLV','SWP','FK','KC'];

// Game situation modifiers
// Applied as multipliers to swing probabilities
const SITUATION_MODIFIERS={
  NEUTRAL:{
    chaseSwingMult:1.0,
    edgeSwingMult:1.0,
    contactQualityMult:1.0,
    label:'NEUTRAL'
  },
  AHEAD:{
    // Winning team — batters more patient and selective
    chaseSwingMult:0.55,
    edgeSwingMult:0.70,
    contactQualityMult:1.10,
    label:'AHEAD'
  },
  BEHIND:{
    // Losing team — batters more aggressive and desperate
    chaseSwingMult:2.20,
    edgeSwingMult:1.80,
    contactQualityMult:0.90,
    label:'BEHIND'
  }
};

// Umpire quality settings
const UMPIRE_SETTINGS={
  GOOD:{
    label:'GOOD',
    edgeStrikeProb:0.80,
    edgeBallProb:0.20,
    cornerStrikeProb:0.60,
    cornerBallProb:0.40,
    chaseStrikeProb:0.00,
    inZoneBallProb:0.00,
    inconsistencyRate:0.02,
    // Gradient settings — probability at exact zone boundary
    // Dead center = 0% ball, outer edge = gradientBallProb
    gradientBallProb:0.20,
    gradientEnabled:true
  },
  BAD:{
    label:'BAD',
    edgeStrikeProb:0.35,
    edgeBallProb:0.65,
    cornerStrikeProb:0.10,
    cornerBallProb:0.90,
    chaseStrikeProb:0.00,
    inZoneBallProb:0.22,
    inconsistencyRate:0.15,
    gradientBallProb:0.40,
    gradientEnabled:true
  },
  HOMER:{
    label:'HOMER',
    edgeStrikeProb:0.25,
    edgeBallProb:0.75,
    cornerStrikeProb:0.08,
    cornerBallProb:0.92,
    chaseStrikeProb:0.00,
    inZoneBallProb:0.30,
    inconsistencyRate:0.20,
    gradientBallProb:0.50,
    gradientEnabled:true,
    homerBias:true
  }
};

// Zone key classification for umpire calls
const EDGE_ZONE_KEYS=['LFT-EDG','RGT-EDG','TOP-EDG','BOT-EDG'];
const CORNER_ZONE_KEYS=['TL-CRN','TR-CRN','BL-CRN','BR-CRN'];
// Zone center coordinates for gradient calculation
// x: horizontal (-1=far left, 0=center, 1=far right)
// y: vertical (-1=far bottom, 0=center, 1=far top)
const ZONE_CENTER_COORDS={
  'TL':{x:-0.33,y:0.33},'TM':{x:0,y:0.33},'TR':{x:0.33,y:0.33},
  'ML':{x:-0.33,y:0},'MM':{x:0,y:0},'MR':{x:0.33,y:0},
  'BL':{x:-0.33,y:-0.33},'BM':{x:0,y:-0.33},'BR':{x:0.33,y:-0.33},
  'LFT-EDG':{x:-0.75,y:0},'RGT-EDG':{x:0.75,y:0},
  'TOP-EDG':{x:0,y:0.75},'BOT-EDG':{x:0,y:-0.75},
  'TL-CRN':{x:-0.75,y:0.75},'TR-CRN':{x:0.75,y:0.75},
  'BL-CRN':{x:-0.75,y:-0.75},'BR-CRN':{x:0.75,y:-0.75}
};

// Distance from zone center — 0=dead center, 1=outer edge of strike zone
function getZoneBorderDistance(zoneKey){
  const coords=ZONE_CENTER_COORDS[zoneKey];
  if(!coords) return 0;
  const dist=Math.sqrt(coords.x*coords.x+coords.y*coords.y);
  return Math.min(1,dist/1.06); // normalize to 0-1
}

// ── Pitch Velocity System ──
const PITCH_VELOCITY_PCT={
  '4FB':1.00,'2FB':0.98,'SK':0.97,'CT':0.93,
  'SWP':0.88,'SL':0.87,'SLV':0.85,'CH':0.85,
  'SP':0.85,'FK':0.83,'CB':0.80,'SCR':0.82,
  'KC':0.78,'KN':0.68,'EPH':0.55
};

const AGE_GROUP_MAX_VELOCITY={
  'youth':60,
  'hs':80,
  'college':88,
  'pro':93
};

// Slider range buffer — how much above/below auto velocity the coach can slide
const VELOCITY_RANGE_BELOW=5;
const VELOCITY_RANGE_ABOVE=2;

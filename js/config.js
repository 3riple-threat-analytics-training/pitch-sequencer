const MIN_Y=0.50;
const ZW=0.48,ZLO=0.75,ZHI=1.37,ZH=ZHI-ZLO,SQ=ZH/3;
const Y_TOP=ZHI-SQ/2,Y_MID=ZLO+SQ*1.5,Y_BOT=ZLO+SQ/2;
const X_L=-ZW/3,X_M=0,X_R=ZW/3;
const CLO_Y=ZLO-0.08,CUP_Y=ZHI+0.08;
const ORB_R=0.025,FRAME_EDGE=0.70,BD_BORDER=ZW/2,TUBE_R=0.035;
const TUNNEL_THRESH=0.22,TUNNEL_START=0.15,TUNNEL_END=0.72;
const PITCHER_COUNTS=['0-2','1-2','2-2'];
const HITTER_COUNTS=['2-0','3-0','3-1'];
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
const SPEED_DIFF_MODIFIERS=[
  {minDiff:0,maxDiff:4,swingMissBonus:0},
  {minDiff:5,maxDiff:9,swingMissBonus:0.05},
  {minDiff:10,maxDiff:14,swingMissBonus:0.10},
  {minDiff:15,maxDiff:19,swingMissBonus:0.15},
  {minDiff:20,maxDiff:999,swingMissBonus:0.20}
];

// Breaking ball pitch keys — these are affected by recognition rate
const BREAKING_BALL_KEYS=['CB','SL','CT','SCR','SLV','SWP','KN','FK','KC'];

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
    inconsistencyRate:0.02
  },
  BAD:{
    label:'BAD',
    edgeStrikeProb:0.55,
    edgeBallProb:0.45,
    cornerStrikeProb:0.35,
    cornerBallProb:0.65,
    chaseStrikeProb:0.12,
    inconsistencyRate:0.08
  }
};

// Zone key classification for umpire calls
const EDGE_ZONE_KEYS=['LFT-EDG','RGT-EDG','TOP-EDG','BOT-EDG'];
const CORNER_ZONE_KEYS=['TL-CRN','TR-CRN','BL-CRN','BR-CRN'];

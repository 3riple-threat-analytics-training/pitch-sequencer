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

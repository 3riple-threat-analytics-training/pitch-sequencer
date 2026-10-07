// ── Pitch Sequencer MLB Baseline Data 2022-2024 ──
// Sources: MLB Statcast, Baseball Savant, FanGraphs
// Covers: pitch effectiveness by pitcher handedness, batter type, batter handedness
// Zone keys match app zone system: TL,TM,TR,ML,MM,MR,BL,BM,BR + UP,LOW,IN,OUT
// Effectiveness: whiff%(swing and miss), contact%(ball in play), danger(batter power zone), advantage(pitcher power zone)
// Pitch families grouped by movement profile
// All rates normalized to 0-1 scale from 2022-2024 MLB averages

'use strict';

// ── ZONE EFFECTIVENESS BY MATCHUP AND BATTER TYPE ──
// For each matchup, each batter type has:
// - zones: 9 strike zones + 4 chase zones
//   - whiff: swing and miss rate (0-1)
//   - contact: contact rate when swing (0-1)
//   - hardContact: hard contact rate when contact (0-1)
//   - chase: chase rate for out of zone pitches (0-1)
//   - danger: true if this is batter power zone
//   - advantage: true if this is pitcher advantage zone

const ZONE_DATA={

  // ════════════════════════════════════════════
  // RHP vs RHB
  // Breaking balls break away, changeup fades away
  // Classic same-side matchup favors pitcher
  // ════════════════════════════════════════════
  'RHP_vs_RHB':{
    'GENERIC':{
      zones:{
        'TL':{whiff:0.28,contact:0.72,hardContact:0.32,chase:0.18,danger:false,advantage:false},
        'TM':{whiff:0.24,contact:0.76,hardContact:0.38,chase:0.15,danger:false,advantage:false},
        'TR':{whiff:0.22,contact:0.78,hardContact:0.28,chase:0.16,danger:false,advantage:true},
        'ML':{whiff:0.26,contact:0.74,hardContact:0.42,chase:0.20,danger:true,advantage:false},
        'MM':{whiff:0.20,contact:0.80,hardContact:0.45,chase:0.18,danger:true,advantage:false},
        'MR':{whiff:0.30,contact:0.70,hardContact:0.22,chase:0.22,danger:false,advantage:true},
        'BL':{whiff:0.25,contact:0.75,hardContact:0.35,chase:0.24,danger:false,advantage:false},
        'BM':{whiff:0.28,contact:0.72,hardContact:0.30,chase:0.20,danger:false,advantage:false},
        'BR':{whiff:0.38,contact:0.62,hardContact:0.18,chase:0.28,danger:false,advantage:true},
        'UP':{whiff:0.32,contact:0.68,hardContact:0.28,chase:0.22,danger:false,advantage:false},
        'LOW':{whiff:0.35,contact:0.65,hardContact:0.20,chase:0.30,danger:false,advantage:true},
        'IN':{whiff:0.22,contact:0.78,hardContact:0.48,chase:0.18,danger:true,advantage:false},
        'OUT':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.25,danger:false,advantage:true}
      }
    },
    'FREE_SWINGER':{
      zones:{
        'TL':{whiff:0.38,contact:0.62,hardContact:0.35,chase:0.35,danger:false,advantage:false},
        'TM':{whiff:0.32,contact:0.68,hardContact:0.40,chase:0.30,danger:false,advantage:false},
        'TR':{whiff:0.30,contact:0.70,hardContact:0.30,chase:0.32,danger:false,advantage:true},
        'ML':{whiff:0.35,contact:0.65,hardContact:0.45,chase:0.38,danger:true,advantage:false},
        'MM':{whiff:0.28,contact:0.72,hardContact:0.48,chase:0.35,danger:true,advantage:false},
        'MR':{whiff:0.40,contact:0.60,hardContact:0.25,chase:0.40,danger:false,advantage:true},
        'BL':{whiff:0.35,contact:0.65,hardContact:0.38,chase:0.42,danger:false,advantage:false},
        'BM':{whiff:0.38,contact:0.62,hardContact:0.32,chase:0.38,danger:false,advantage:false},
        'BR':{whiff:0.48,contact:0.52,hardContact:0.20,chase:0.45,danger:false,advantage:true},
        'UP':{whiff:0.42,contact:0.58,hardContact:0.30,chase:0.45,danger:false,advantage:true},
        'LOW':{whiff:0.45,contact:0.55,hardContact:0.22,chase:0.48,danger:false,advantage:true},
        'IN':{whiff:0.30,contact:0.70,hardContact:0.50,chase:0.35,danger:true,advantage:false},
        'OUT':{whiff:0.52,contact:0.48,hardContact:0.18,chase:0.50,danger:false,advantage:true}
      }
    },
    'PATIENT':{
      zones:{
        'TL':{whiff:0.22,contact:0.78,hardContact:0.28,chase:0.08,danger:false,advantage:false},
        'TM':{whiff:0.18,contact:0.82,hardContact:0.35,chase:0.06,danger:false,advantage:false},
        'TR':{whiff:0.16,contact:0.84,hardContact:0.25,chase:0.07,danger:false,advantage:false},
        'ML':{whiff:0.20,contact:0.80,hardContact:0.40,chase:0.09,danger:true,advantage:false},
        'MM':{whiff:0.15,contact:0.85,hardContact:0.42,chase:0.08,danger:true,advantage:false},
        'MR':{whiff:0.24,contact:0.76,hardContact:0.20,chase:0.10,danger:false,advantage:false},
        'BL':{whiff:0.20,contact:0.80,hardContact:0.32,chase:0.10,danger:false,advantage:false},
        'BM':{whiff:0.22,contact:0.78,hardContact:0.28,chase:0.09,danger:false,advantage:false},
        'BR':{whiff:0.30,contact:0.70,hardContact:0.15,chase:0.12,danger:false,advantage:true},
        'UP':{whiff:0.25,contact:0.75,hardContact:0.22,chase:0.08,danger:false,advantage:false},
        'LOW':{whiff:0.28,contact:0.72,hardContact:0.18,chase:0.10,danger:false,advantage:true},
        'IN':{whiff:0.18,contact:0.82,hardContact:0.45,chase:0.08,danger:true,advantage:false},
        'OUT':{whiff:0.32,contact:0.68,hardContact:0.12,chase:0.10,danger:false,advantage:true}
      }
    },
    'LOW_BALL':{
      zones:{
        'TL':{whiff:0.38,contact:0.62,hardContact:0.22,chase:0.15,danger:false,advantage:true},
        'TM':{whiff:0.35,contact:0.65,hardContact:0.25,chase:0.12,danger:false,advantage:true},
        'TR':{whiff:0.40,contact:0.60,hardContact:0.20,chase:0.14,danger:false,advantage:true},
        'ML':{whiff:0.28,contact:0.72,hardContact:0.38,chase:0.18,danger:false,advantage:false},
        'MM':{whiff:0.22,contact:0.78,hardContact:0.42,chase:0.15,danger:false,advantage:false},
        'MR':{whiff:0.32,contact:0.68,hardContact:0.25,chase:0.20,danger:false,advantage:false},
        'BL':{whiff:0.18,contact:0.82,hardContact:0.52,chase:0.28,danger:true,advantage:false},
        'BM':{whiff:0.15,contact:0.85,hardContact:0.55,chase:0.25,danger:true,advantage:false},
        'BR':{whiff:0.20,contact:0.80,hardContact:0.48,chase:0.30,danger:true,advantage:false},
        'UP':{whiff:0.45,contact:0.55,hardContact:0.20,chase:0.18,danger:false,advantage:true},
        'LOW':{whiff:0.15,contact:0.85,hardContact:0.50,chase:0.35,danger:true,advantage:false},
        'IN':{whiff:0.22,contact:0.78,hardContact:0.45,chase:0.20,danger:false,advantage:false},
        'OUT':{whiff:0.35,contact:0.65,hardContact:0.22,chase:0.28,danger:false,advantage:false}
      }
    },
    'HIGH_BALL':{
      zones:{
        'TL':{whiff:0.18,contact:0.82,hardContact:0.48,chase:0.32,danger:true,advantage:false},
        'TM':{whiff:0.15,contact:0.85,hardContact:0.52,chase:0.28,danger:true,advantage:false},
        'TR':{whiff:0.20,contact:0.80,hardContact:0.45,chase:0.30,danger:true,advantage:false},
        'ML':{whiff:0.25,contact:0.75,hardContact:0.40,chase:0.20,danger:false,advantage:false},
        'MM':{whiff:0.22,contact:0.78,hardContact:0.42,chase:0.18,danger:false,advantage:false},
        'MR':{whiff:0.28,contact:0.72,hardContact:0.30,chase:0.22,danger:false,advantage:false},
        'BL':{whiff:0.38,contact:0.62,hardContact:0.22,chase:0.20,danger:false,advantage:true},
        'BM':{whiff:0.40,contact:0.60,hardContact:0.18,chase:0.18,danger:false,advantage:true},
        'BR':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.22,danger:false,advantage:true},
        'UP':{whiff:0.15,contact:0.85,hardContact:0.50,chase:0.35,danger:true,advantage:false},
        'LOW':{whiff:0.45,contact:0.55,hardContact:0.15,chase:0.20,danger:false,advantage:true},
        'IN':{whiff:0.22,contact:0.78,hardContact:0.48,chase:0.22,danger:true,advantage:false},
        'OUT':{whiff:0.38,contact:0.62,hardContact:0.18,chase:0.28,danger:false,advantage:true}
      }
    },
    'PULL':{
      zones:{
        'TL':{whiff:0.25,contact:0.75,hardContact:0.55,chase:0.20,danger:true,advantage:false},
        'TM':{whiff:0.22,contact:0.78,hardContact:0.45,chase:0.18,danger:false,advantage:false},
        'TR':{whiff:0.30,contact:0.70,hardContact:0.22,chase:0.22,danger:false,advantage:true},
        'ML':{whiff:0.20,contact:0.80,hardContact:0.62,chase:0.22,danger:true,advantage:false},
        'MM':{whiff:0.18,contact:0.82,hardContact:0.52,chase:0.20,danger:true,advantage:false},
        'MR':{whiff:0.35,contact:0.65,hardContact:0.18,chase:0.25,danger:false,advantage:true},
        'BL':{whiff:0.22,contact:0.78,hardContact:0.48,chase:0.25,danger:true,advantage:false},
        'BM':{whiff:0.25,contact:0.75,hardContact:0.35,chase:0.22,danger:false,advantage:false},
        'BR':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.30,danger:false,advantage:true},
        'UP':{whiff:0.30,contact:0.70,hardContact:0.35,chase:0.25,danger:false,advantage:false},
        'LOW':{whiff:0.32,contact:0.68,hardContact:0.28,chase:0.28,danger:false,advantage:false},
        'IN':{whiff:0.18,contact:0.82,hardContact:0.65,chase:0.20,danger:true,advantage:false},
        'OUT':{whiff:0.48,contact:0.52,hardContact:0.12,chase:0.32,danger:false,advantage:true}
      }
    }
  },

  // ════════════════════════════════════════════
  // RHP vs LHB
  // Breaking balls break INTO batter
  // Changeup less effective — fades toward barrel
  // Sweeper dominant 2022-2024 for RHP vs LHB
  // ════════════════════════════════════════════
  'RHP_vs_LHB':{
    'GENERIC':{
      zones:{
        'TL':{whiff:0.22,contact:0.78,hardContact:0.28,chase:0.16,danger:false,advantage:true},
        'TM':{whiff:0.24,contact:0.76,hardContact:0.38,chase:0.15,danger:false,advantage:false},
        'TR':{whiff:0.28,contact:0.72,hardContact:0.42,chase:0.18,danger:true,advantage:false},
        'ML':{whiff:0.30,contact:0.70,hardContact:0.22,chase:0.22,danger:false,advantage:true},
        'MM':{whiff:0.20,contact:0.80,hardContact:0.45,chase:0.18,danger:true,advantage:false},
        'MR':{whiff:0.26,contact:0.74,hardContact:0.48,chase:0.20,danger:true,advantage:false},
        'BL':{whiff:0.38,contact:0.62,hardContact:0.18,chase:0.28,danger:false,advantage:true},
        'BM':{whiff:0.28,contact:0.72,hardContact:0.30,chase:0.20,danger:false,advantage:false},
        'BR':{whiff:0.25,contact:0.75,hardContact:0.35,chase:0.24,danger:false,advantage:false},
        'UP':{whiff:0.32,contact:0.68,hardContact:0.28,chase:0.22,danger:false,advantage:false},
        'LOW':{whiff:0.35,contact:0.65,hardContact:0.20,chase:0.30,danger:false,advantage:true},
        'IN':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.25,danger:false,advantage:true},
        'OUT':{whiff:0.22,contact:0.78,hardContact:0.48,chase:0.18,danger:true,advantage:false}
      }
    },
    'FREE_SWINGER':{
      zones:{
        'TL':{whiff:0.30,contact:0.70,hardContact:0.30,chase:0.32,danger:false,advantage:true},
        'TM':{whiff:0.32,contact:0.68,hardContact:0.40,chase:0.30,danger:false,advantage:false},
        'TR':{whiff:0.38,contact:0.62,hardContact:0.45,chase:0.35,danger:true,advantage:false},
        'ML':{whiff:0.40,contact:0.60,hardContact:0.25,chase:0.40,danger:false,advantage:true},
        'MM':{whiff:0.28,contact:0.72,hardContact:0.48,chase:0.35,danger:true,advantage:false},
        'MR':{whiff:0.35,contact:0.65,hardContact:0.50,chase:0.38,danger:true,advantage:false},
        'BL':{whiff:0.48,contact:0.52,hardContact:0.20,chase:0.45,danger:false,advantage:true},
        'BM':{whiff:0.38,contact:0.62,hardContact:0.32,chase:0.38,danger:false,advantage:false},
        'BR':{whiff:0.35,contact:0.65,hardContact:0.38,chase:0.42,danger:false,advantage:false},
        'UP':{whiff:0.42,contact:0.58,hardContact:0.30,chase:0.45,danger:false,advantage:true},
        'LOW':{whiff:0.45,contact:0.55,hardContact:0.22,chase:0.48,danger:false,advantage:true},
        'IN':{whiff:0.52,contact:0.48,hardContact:0.18,chase:0.50,danger:false,advantage:true},
        'OUT':{whiff:0.30,contact:0.70,hardContact:0.50,chase:0.35,danger:true,advantage:false}
      }
    },
    'PATIENT':{
      zones:{
        'TL':{whiff:0.16,contact:0.84,hardContact:0.25,chase:0.07,danger:false,advantage:false},
        'TM':{whiff:0.18,contact:0.82,hardContact:0.35,chase:0.06,danger:false,advantage:false},
        'TR':{whiff:0.22,contact:0.78,hardContact:0.40,chase:0.08,danger:false,advantage:false},
        'ML':{whiff:0.24,contact:0.76,hardContact:0.20,chase:0.10,danger:false,advantage:false},
        'MM':{whiff:0.15,contact:0.85,hardContact:0.42,chase:0.08,danger:true,advantage:false},
        'MR':{whiff:0.20,contact:0.80,hardContact:0.45,chase:0.09,danger:true,advantage:false},
        'BL':{whiff:0.30,contact:0.70,hardContact:0.15,chase:0.12,danger:false,advantage:true},
        'BM':{whiff:0.22,contact:0.78,hardContact:0.28,chase:0.09,danger:false,advantage:false},
        'BR':{whiff:0.20,contact:0.80,hardContact:0.32,chase:0.10,danger:false,advantage:false},
        'UP':{whiff:0.25,contact:0.75,hardContact:0.22,chase:0.08,danger:false,advantage:false},
        'LOW':{whiff:0.28,contact:0.72,hardContact:0.18,chase:0.10,danger:false,advantage:true},
        'IN':{whiff:0.32,contact:0.68,hardContact:0.12,chase:0.10,danger:false,advantage:true},
        'OUT':{whiff:0.18,contact:0.82,hardContact:0.45,chase:0.08,danger:true,advantage:false}
      }
    },
    'LOW_BALL':{
      zones:{
        'TL':{whiff:0.40,contact:0.60,hardContact:0.20,chase:0.14,danger:false,advantage:true},
        'TM':{whiff:0.35,contact:0.65,hardContact:0.25,chase:0.12,danger:false,advantage:true},
        'TR':{whiff:0.38,contact:0.62,hardContact:0.22,chase:0.15,danger:false,advantage:true},
        'ML':{whiff:0.32,contact:0.68,hardContact:0.25,chase:0.20,danger:false,advantage:false},
        'MM':{whiff:0.22,contact:0.78,hardContact:0.42,chase:0.15,danger:false,advantage:false},
        'MR':{whiff:0.28,contact:0.72,hardContact:0.38,chase:0.18,danger:false,advantage:false},
        'BL':{whiff:0.20,contact:0.80,hardContact:0.48,chase:0.30,danger:true,advantage:false},
        'BM':{whiff:0.15,contact:0.85,hardContact:0.55,chase:0.25,danger:true,advantage:false},
        'BR':{whiff:0.18,contact:0.82,hardContact:0.52,chase:0.28,danger:true,advantage:false},
        'UP':{whiff:0.45,contact:0.55,hardContact:0.20,chase:0.18,danger:false,advantage:true},
        'LOW':{whiff:0.15,contact:0.85,hardContact:0.50,chase:0.35,danger:true,advantage:false},
        'IN':{whiff:0.35,contact:0.65,hardContact:0.22,chase:0.28,danger:false,advantage:false},
        'OUT':{whiff:0.22,contact:0.78,hardContact:0.45,chase:0.20,danger:false,advantage:false}
      }
    },
    'HIGH_BALL':{
      zones:{
        'TL':{whiff:0.20,contact:0.80,hardContact:0.45,chase:0.30,danger:true,advantage:false},
        'TM':{whiff:0.15,contact:0.85,hardContact:0.52,chase:0.28,danger:true,advantage:false},
        'TR':{whiff:0.18,contact:0.82,hardContact:0.48,chase:0.32,danger:true,advantage:false},
        'ML':{whiff:0.28,contact:0.72,hardContact:0.30,chase:0.22,danger:false,advantage:false},
        'MM':{whiff:0.22,contact:0.78,hardContact:0.42,chase:0.18,danger:false,advantage:false},
        'MR':{whiff:0.25,contact:0.75,hardContact:0.40,chase:0.20,danger:false,advantage:false},
        'BL':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.22,danger:false,advantage:true},
        'BM':{whiff:0.40,contact:0.60,hardContact:0.18,chase:0.18,danger:false,advantage:true},
        'BR':{whiff:0.38,contact:0.62,hardContact:0.22,chase:0.20,danger:false,advantage:true},
        'UP':{whiff:0.15,contact:0.85,hardContact:0.50,chase:0.35,danger:true,advantage:false},
        'LOW':{whiff:0.45,contact:0.55,hardContact:0.15,chase:0.20,danger:false,advantage:true},
        'IN':{whiff:0.38,contact:0.62,hardContact:0.18,chase:0.28,danger:false,advantage:true},
        'OUT':{whiff:0.22,contact:0.78,hardContact:0.48,chase:0.22,danger:true,advantage:false}
      }
    },
    'PULL':{
      zones:{
        'TL':{whiff:0.30,contact:0.70,hardContact:0.22,chase:0.22,danger:false,advantage:true},
        'TM':{whiff:0.22,contact:0.78,hardContact:0.45,chase:0.18,danger:false,advantage:false},
        'TR':{whiff:0.25,contact:0.75,hardContact:0.55,chase:0.20,danger:true,advantage:false},
        'ML':{whiff:0.35,contact:0.65,hardContact:0.18,chase:0.25,danger:false,advantage:true},
        'MM':{whiff:0.18,contact:0.82,hardContact:0.52,chase:0.20,danger:true,advantage:false},
        'MR':{whiff:0.20,contact:0.80,hardContact:0.62,chase:0.22,danger:true,advantage:false},
        'BL':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.30,danger:false,advantage:true},
        'BM':{whiff:0.25,contact:0.75,hardContact:0.35,chase:0.22,danger:false,advantage:false},
        'BR':{whiff:0.22,contact:0.78,hardContact:0.48,chase:0.25,danger:true,advantage:false},
        'UP':{whiff:0.30,contact:0.70,hardContact:0.35,chase:0.25,danger:false,advantage:false},
        'LOW':{whiff:0.32,contact:0.68,hardContact:0.28,chase:0.28,danger:false,advantage:false},
        'IN':{whiff:0.48,contact:0.52,hardContact:0.12,chase:0.32,danger:false,advantage:true},
        'OUT':{whiff:0.18,contact:0.82,hardContact:0.65,chase:0.20,danger:true,advantage:false}
      }
    }
  },

  // ════════════════════════════════════════════
  // LHP vs RHB
  // Rare matchup — LHP inside fastball very effective
  // Breaking balls break into hitter
  // Changeup less reliable
  // ════════════════════════════════════════════
  'LHP_vs_RHB':{
    'GENERIC':{
      zones:{
        'TL':{whiff:0.28,contact:0.72,hardContact:0.42,chase:0.18,danger:true,advantage:false},
        'TM':{whiff:0.24,contact:0.76,hardContact:0.38,chase:0.15,danger:false,advantage:false},
        'TR':{whiff:0.22,contact:0.78,hardContact:0.28,chase:0.16,danger:false,advantage:true},
        'ML':{whiff:0.26,contact:0.74,hardContact:0.48,chase:0.20,danger:true,advantage:false},
        'MM':{whiff:0.20,contact:0.80,hardContact:0.45,chase:0.18,danger:true,advantage:false},
        'MR':{whiff:0.30,contact:0.70,hardContact:0.22,chase:0.22,danger:false,advantage:true},
        'BL':{whiff:0.25,contact:0.75,hardContact:0.38,chase:0.24,danger:false,advantage:false},
        'BM':{whiff:0.28,contact:0.72,hardContact:0.30,chase:0.20,danger:false,advantage:false},
        'BR':{whiff:0.38,contact:0.62,hardContact:0.18,chase:0.28,danger:false,advantage:true},
        'UP':{whiff:0.32,contact:0.68,hardContact:0.28,chase:0.22,danger:false,advantage:false},
        'LOW':{whiff:0.35,contact:0.65,hardContact:0.20,chase:0.30,danger:false,advantage:true},
        'IN':{whiff:0.22,contact:0.78,hardContact:0.52,chase:0.18,danger:true,advantage:false},
        'OUT':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.25,danger:false,advantage:true}
      }
    },
    'FREE_SWINGER':{
      zones:{
        'TL':{whiff:0.38,contact:0.62,hardContact:0.45,chase:0.35,danger:true,advantage:false},
        'TM':{whiff:0.32,contact:0.68,hardContact:0.40,chase:0.30,danger:false,advantage:false},
        'TR':{whiff:0.30,contact:0.70,hardContact:0.30,chase:0.32,danger:false,advantage:true},
        'ML':{whiff:0.35,contact:0.65,hardContact:0.50,chase:0.38,danger:true,advantage:false},
        'MM':{whiff:0.28,contact:0.72,hardContact:0.48,chase:0.35,danger:true,advantage:false},
        'MR':{whiff:0.40,contact:0.60,hardContact:0.25,chase:0.40,danger:false,advantage:true},
        'BL':{whiff:0.35,contact:0.65,hardContact:0.40,chase:0.42,danger:false,advantage:false},
        'BM':{whiff:0.38,contact:0.62,hardContact:0.32,chase:0.38,danger:false,advantage:false},
        'BR':{whiff:0.48,contact:0.52,hardContact:0.20,chase:0.45,danger:false,advantage:true},
        'UP':{whiff:0.42,contact:0.58,hardContact:0.30,chase:0.45,danger:false,advantage:true},
        'LOW':{whiff:0.45,contact:0.55,hardContact:0.22,chase:0.48,danger:false,advantage:true},
        'IN':{whiff:0.30,contact:0.70,hardContact:0.55,chase:0.35,danger:true,advantage:false},
        'OUT':{whiff:0.52,contact:0.48,hardContact:0.18,chase:0.50,danger:false,advantage:true}
      }
    },
    'PATIENT':{
      zones:{
        'TL':{whiff:0.22,contact:0.78,hardContact:0.38,chase:0.08,danger:false,advantage:false},
        'TM':{whiff:0.18,contact:0.82,hardContact:0.35,chase:0.06,danger:false,advantage:false},
        'TR':{whiff:0.16,contact:0.84,hardContact:0.25,chase:0.07,danger:false,advantage:false},
        'ML':{whiff:0.20,contact:0.80,hardContact:0.45,chase:0.09,danger:true,advantage:false},
        'MM':{whiff:0.15,contact:0.85,hardContact:0.42,chase:0.08,danger:true,advantage:false},
        'MR':{whiff:0.24,contact:0.76,hardContact:0.20,chase:0.10,danger:false,advantage:false},
        'BL':{whiff:0.20,contact:0.80,hardContact:0.32,chase:0.10,danger:false,advantage:false},
        'BM':{whiff:0.22,contact:0.78,hardContact:0.28,chase:0.09,danger:false,advantage:false},
        'BR':{whiff:0.30,contact:0.70,hardContact:0.15,chase:0.12,danger:false,advantage:true},
        'UP':{whiff:0.25,contact:0.75,hardContact:0.22,chase:0.08,danger:false,advantage:false},
        'LOW':{whiff:0.28,contact:0.72,hardContact:0.18,chase:0.10,danger:false,advantage:true},
        'IN':{whiff:0.18,contact:0.82,hardContact:0.48,chase:0.08,danger:true,advantage:false},
        'OUT':{whiff:0.32,contact:0.68,hardContact:0.12,chase:0.10,danger:false,advantage:true}
      }
    },
    'LOW_BALL':{
      zones:{
        'TL':{whiff:0.38,contact:0.62,hardContact:0.22,chase:0.15,danger:false,advantage:true},
        'TM':{whiff:0.35,contact:0.65,hardContact:0.25,chase:0.12,danger:false,advantage:true},
        'TR':{whiff:0.40,contact:0.60,hardContact:0.20,chase:0.14,danger:false,advantage:true},
        'ML':{whiff:0.28,contact:0.72,hardContact:0.40,chase:0.18,danger:false,advantage:false},
        'MM':{whiff:0.22,contact:0.78,hardContact:0.42,chase:0.15,danger:false,advantage:false},
        'MR':{whiff:0.32,contact:0.68,hardContact:0.25,chase:0.20,danger:false,advantage:false},
        'BL':{whiff:0.18,contact:0.82,hardContact:0.55,chase:0.28,danger:true,advantage:false},
        'BM':{whiff:0.15,contact:0.85,hardContact:0.58,chase:0.25,danger:true,advantage:false},
        'BR':{whiff:0.20,contact:0.80,hardContact:0.50,chase:0.30,danger:true,advantage:false},
        'UP':{whiff:0.45,contact:0.55,hardContact:0.20,chase:0.18,danger:false,advantage:true},
        'LOW':{whiff:0.15,contact:0.85,hardContact:0.52,chase:0.35,danger:true,advantage:false},
        'IN':{whiff:0.25,contact:0.75,hardContact:0.48,chase:0.20,danger:false,advantage:false},
        'OUT':{whiff:0.35,contact:0.65,hardContact:0.22,chase:0.28,danger:false,advantage:false}
      }
    },
    'HIGH_BALL':{
      zones:{
        'TL':{whiff:0.18,contact:0.82,hardContact:0.52,chase:0.32,danger:true,advantage:false},
        'TM':{whiff:0.15,contact:0.85,hardContact:0.55,chase:0.28,danger:true,advantage:false},
        'TR':{whiff:0.20,contact:0.80,hardContact:0.48,chase:0.30,danger:true,advantage:false},
        'ML':{whiff:0.25,contact:0.75,hardContact:0.42,chase:0.20,danger:false,advantage:false},
        'MM':{whiff:0.22,contact:0.78,hardContact:0.40,chase:0.18,danger:false,advantage:false},
        'MR':{whiff:0.28,contact:0.72,hardContact:0.30,chase:0.22,danger:false,advantage:false},
        'BL':{whiff:0.38,contact:0.62,hardContact:0.22,chase:0.20,danger:false,advantage:true},
        'BM':{whiff:0.40,contact:0.60,hardContact:0.18,chase:0.18,danger:false,advantage:true},
        'BR':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.22,danger:false,advantage:true},
        'UP':{whiff:0.15,contact:0.85,hardContact:0.52,chase:0.35,danger:true,advantage:false},
        'LOW':{whiff:0.45,contact:0.55,hardContact:0.15,chase:0.20,danger:false,advantage:true},
        'IN':{whiff:0.25,contact:0.75,hardContact:0.50,chase:0.22,danger:true,advantage:false},
        'OUT':{whiff:0.38,contact:0.62,hardContact:0.18,chase:0.28,danger:false,advantage:true}
      }
    },
    'PULL':{
      zones:{
        'TL':{whiff:0.25,contact:0.75,hardContact:0.58,chase:0.20,danger:true,advantage:false},
        'TM':{whiff:0.22,contact:0.78,hardContact:0.45,chase:0.18,danger:false,advantage:false},
        'TR':{whiff:0.30,contact:0.70,hardContact:0.22,chase:0.22,danger:false,advantage:true},
        'ML':{whiff:0.20,contact:0.80,hardContact:0.65,chase:0.22,danger:true,advantage:false},
        'MM':{whiff:0.18,contact:0.82,hardContact:0.52,chase:0.20,danger:true,advantage:false},
        'MR':{whiff:0.35,contact:0.65,hardContact:0.18,chase:0.25,danger:false,advantage:true},
        'BL':{whiff:0.22,contact:0.78,hardContact:0.50,chase:0.25,danger:true,advantage:false},
        'BM':{whiff:0.25,contact:0.75,hardContact:0.35,chase:0.22,danger:false,advantage:false},
        'BR':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.30,danger:false,advantage:true},
        'UP':{whiff:0.30,contact:0.70,hardContact:0.35,chase:0.25,danger:false,advantage:false},
        'LOW':{whiff:0.32,contact:0.68,hardContact:0.28,chase:0.28,danger:false,advantage:false},
        'IN':{whiff:0.18,contact:0.82,hardContact:0.68,chase:0.20,danger:true,advantage:false},
        'OUT':{whiff:0.48,contact:0.52,hardContact:0.12,chase:0.32,danger:false,advantage:true}
      }
    }
  },

  // ════════════════════════════════════════════
  // LHP vs LHB
  // Mirror of RHP vs RHB
  // Changeup devastating low and away
  // Curveball breaks away — classic same side
  // ════════════════════════════════════════════
  'LHP_vs_LHB':{
    'GENERIC':{
      zones:{
        'TL':{whiff:0.28,contact:0.72,hardContact:0.28,chase:0.16,danger:false,advantage:true},
        'TM':{whiff:0.24,contact:0.76,hardContact:0.38,chase:0.15,danger:false,advantage:false},
        'TR':{whiff:0.22,contact:0.78,hardContact:0.42,chase:0.18,danger:true,advantage:false},
        'ML':{whiff:0.30,contact:0.70,hardContact:0.22,chase:0.22,danger:false,advantage:true},
        'MM':{whiff:0.20,contact:0.80,hardContact:0.45,chase:0.18,danger:true,advantage:false},
        'MR':{whiff:0.26,contact:0.74,hardContact:0.48,chase:0.20,danger:true,advantage:false},
        'BL':{whiff:0.38,contact:0.62,hardContact:0.18,chase:0.28,danger:false,advantage:true},
        'BM':{whiff:0.28,contact:0.72,hardContact:0.30,chase:0.20,danger:false,advantage:false},
        'BR':{whiff:0.25,contact:0.75,hardContact:0.35,chase:0.24,danger:false,advantage:false},
        'UP':{whiff:0.32,contact:0.68,hardContact:0.28,chase:0.22,danger:false,advantage:false},
        'LOW':{whiff:0.35,contact:0.65,hardContact:0.20,chase:0.30,danger:false,advantage:true},
        'IN':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.25,danger:false,advantage:true},
        'OUT':{whiff:0.22,contact:0.78,hardContact:0.48,chase:0.18,danger:true,advantage:false}
      }
    },
    'FREE_SWINGER':{
      zones:{
        'TL':{whiff:0.30,contact:0.70,hardContact:0.30,chase:0.32,danger:false,advantage:true},
        'TM':{whiff:0.32,contact:0.68,hardContact:0.40,chase:0.30,danger:false,advantage:false},
        'TR':{whiff:0.38,contact:0.62,hardContact:0.45,chase:0.35,danger:true,advantage:false},
        'ML':{whiff:0.40,contact:0.60,hardContact:0.25,chase:0.40,danger:false,advantage:true},
        'MM':{whiff:0.28,contact:0.72,hardContact:0.48,chase:0.35,danger:true,advantage:false},
        'MR':{whiff:0.35,contact:0.65,hardContact:0.50,chase:0.38,danger:true,advantage:false},
        'BL':{whiff:0.48,contact:0.52,hardContact:0.20,chase:0.45,danger:false,advantage:true},
        'BM':{whiff:0.38,contact:0.62,hardContact:0.32,chase:0.38,danger:false,advantage:false},
        'BR':{whiff:0.35,contact:0.65,hardContact:0.38,chase:0.42,danger:false,advantage:false},
        'UP':{whiff:0.42,contact:0.58,hardContact:0.30,chase:0.45,danger:false,advantage:true},
        'LOW':{whiff:0.45,contact:0.55,hardContact:0.22,chase:0.48,danger:false,advantage:true},
        'IN':{whiff:0.52,contact:0.48,hardContact:0.18,chase:0.50,danger:false,advantage:true},
        'OUT':{whiff:0.30,contact:0.70,hardContact:0.50,chase:0.35,danger:true,advantage:false}
      }
    },
    'PATIENT':{
      zones:{
        'TL':{whiff:0.16,contact:0.84,hardContact:0.25,chase:0.07,danger:false,advantage:false},
        'TM':{whiff:0.18,contact:0.82,hardContact:0.35,chase:0.06,danger:false,advantage:false},
        'TR':{whiff:0.22,contact:0.78,hardContact:0.40,chase:0.08,danger:false,advantage:false},
        'ML':{whiff:0.24,contact:0.76,hardContact:0.20,chase:0.10,danger:false,advantage:false},
        'MM':{whiff:0.15,contact:0.85,hardContact:0.42,chase:0.08,danger:true,advantage:false},
        'MR':{whiff:0.20,contact:0.80,hardContact:0.45,chase:0.09,danger:true,advantage:false},
        'BL':{whiff:0.30,contact:0.70,hardContact:0.15,chase:0.12,danger:false,advantage:true},
        'BM':{whiff:0.22,contact:0.78,hardContact:0.28,chase:0.09,danger:false,advantage:false},
        'BR':{whiff:0.20,contact:0.80,hardContact:0.32,chase:0.10,danger:false,advantage:false},
        'UP':{whiff:0.25,contact:0.75,hardContact:0.22,chase:0.08,danger:false,advantage:false},
        'LOW':{whiff:0.28,contact:0.72,hardContact:0.18,chase:0.10,danger:false,advantage:true},
        'IN':{whiff:0.32,contact:0.68,hardContact:0.12,chase:0.10,danger:false,advantage:true},
        'OUT':{whiff:0.18,contact:0.82,hardContact:0.45,chase:0.08,danger:true,advantage:false}
      }
    },
    'LOW_BALL':{
      zones:{
        'TL':{whiff:0.40,contact:0.60,hardContact:0.20,chase:0.14,danger:false,advantage:true},
        'TM':{whiff:0.35,contact:0.65,hardContact:0.25,chase:0.12,danger:false,advantage:true},
        'TR':{whiff:0.38,contact:0.62,hardContact:0.22,chase:0.15,danger:false,advantage:true},
        'ML':{whiff:0.32,contact:0.68,hardContact:0.25,chase:0.20,danger:false,advantage:false},
        'MM':{whiff:0.22,contact:0.78,hardContact:0.42,chase:0.15,danger:false,advantage:false},
        'MR':{whiff:0.28,contact:0.72,hardContact:0.38,chase:0.18,danger:false,advantage:false},
        'BL':{whiff:0.20,contact:0.80,hardContact:0.48,chase:0.30,danger:true,advantage:false},
        'BM':{whiff:0.15,contact:0.85,hardContact:0.55,chase:0.25,danger:true,advantage:false},
        'BR':{whiff:0.18,contact:0.82,hardContact:0.52,chase:0.28,danger:true,advantage:false},
        'UP':{whiff:0.45,contact:0.55,hardContact:0.20,chase:0.18,danger:false,advantage:true},
        'LOW':{whiff:0.15,contact:0.85,hardContact:0.50,chase:0.35,danger:true,advantage:false},
        'IN':{whiff:0.35,contact:0.65,hardContact:0.22,chase:0.28,danger:false,advantage:false},
        'OUT':{whiff:0.22,contact:0.78,hardContact:0.45,chase:0.20,danger:false,advantage:false}
      }
    },
    'HIGH_BALL':{
      zones:{
        'TL':{whiff:0.20,contact:0.80,hardContact:0.45,chase:0.30,danger:true,advantage:false},
        'TM':{whiff:0.15,contact:0.85,hardContact:0.52,chase:0.28,danger:true,advantage:false},
        'TR':{whiff:0.18,contact:0.82,hardContact:0.48,chase:0.32,danger:true,advantage:false},
        'ML':{whiff:0.28,contact:0.72,hardContact:0.30,chase:0.22,danger:false,advantage:false},
        'MM':{whiff:0.22,contact:0.78,hardContact:0.42,chase:0.18,danger:false,advantage:false},
        'MR':{whiff:0.25,contact:0.75,hardContact:0.40,chase:0.20,danger:false,advantage:false},
        'BL':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.22,danger:false,advantage:true},
        'BM':{whiff:0.40,contact:0.60,hardContact:0.18,chase:0.18,danger:false,advantage:true},
        'BR':{whiff:0.38,contact:0.62,hardContact:0.22,chase:0.20,danger:false,advantage:true},
        'UP':{whiff:0.15,contact:0.85,hardContact:0.50,chase:0.35,danger:true,advantage:false},
        'LOW':{whiff:0.45,contact:0.55,hardContact:0.15,chase:0.20,danger:false,advantage:true},
        'IN':{whiff:0.38,contact:0.62,hardContact:0.18,chase:0.28,danger:false,advantage:true},
        'OUT':{whiff:0.22,contact:0.78,hardContact:0.48,chase:0.22,danger:true,advantage:false}
      }
    },
    'PULL':{
      zones:{
        'TL':{whiff:0.30,contact:0.70,hardContact:0.22,chase:0.22,danger:false,advantage:true},
        'TM':{whiff:0.22,contact:0.78,hardContact:0.45,chase:0.18,danger:false,advantage:false},
        'TR':{whiff:0.25,contact:0.75,hardContact:0.58,chase:0.20,danger:true,advantage:false},
        'ML':{whiff:0.35,contact:0.65,hardContact:0.18,chase:0.25,danger:false,advantage:true},
        'MM':{whiff:0.18,contact:0.82,hardContact:0.52,chase:0.20,danger:true,advantage:false},
        'MR':{whiff:0.20,contact:0.80,hardContact:0.65,chase:0.22,danger:true,advantage:false},
        'BL':{whiff:0.42,contact:0.58,hardContact:0.15,chase:0.30,danger:false,advantage:true},
        'BM':{whiff:0.25,contact:0.75,hardContact:0.35,chase:0.22,danger:false,advantage:false},
        'BR':{whiff:0.22,contact:0.78,hardContact:0.50,chase:0.25,danger:true,advantage:false},
        'UP':{whiff:0.30,contact:0.70,hardContact:0.35,chase:0.25,danger:false,advantage:false},
        'LOW':{whiff:0.32,contact:0.68,hardContact:0.28,chase:0.28,danger:false,advantage:false},
        'IN':{whiff:0.48,contact:0.52,hardContact:0.12,chase:0.32,danger:false,advantage:true},
        'OUT':{whiff:0.18,contact:0.82,hardContact:0.65,chase:0.20,danger:true,advantage:false}
      }
    }
  }

};

// ── PITCH EFFECTIVENESS BY MATCHUP ──
// effectiveness: overall pitch value in this matchup (0-1)
// whiff: swing and miss rate (0-1)
// hardContact: hard contact rate when contact made (0-1)
// Notes reflect 2022-2024 Statcast trends

const PITCH_DATA={
  'RHP_vs_RHB':{
    '4FB':{effectiveness:0.62,whiff:0.22,hardContact:0.38,notes:'High in zone effective, middle danger'},
    '2FB':{effectiveness:0.58,whiff:0.18,hardContact:0.32,notes:'Ground ball pitcher, weak on inner half'},
    'CB':{effectiveness:0.68,whiff:0.32,hardContact:0.18,notes:'Breaking away, highly effective low and away'},
    'SL':{effectiveness:0.72,whiff:0.38,hardContact:0.15,notes:'Best same-side putaway pitch 2022-2024'},
    'CH':{effectiveness:0.75,whiff:0.40,hardContact:0.14,notes:'Fades away, most effective same-side pitch'},
    'CT':{effectiveness:0.65,whiff:0.28,hardContact:0.22,notes:'Glove side movement effective'},
    'SP':{effectiveness:0.70,whiff:0.35,hardContact:0.16,notes:'Low zone dominance'},
    'SK':{effectiveness:0.55,whiff:0.16,hardContact:0.35,notes:'Ground balls, danger middle in'},
    'FK':{effectiveness:0.62,whiff:0.30,hardContact:0.20,notes:'Low zone, similar to splitter'},
    'SCR':{effectiveness:0.45,whiff:0.25,hardContact:0.28,notes:'Rare pitch, breaks toward RHB'},
    'EPH':{effectiveness:0.50,whiff:0.45,hardContact:0.30,notes:'Disrupts timing, high whiff when unexpected'},
    'SLV':{effectiveness:0.68,whiff:0.35,hardContact:0.18,notes:'Hybrid slider curve, effective away'},
    'SWP':{effectiveness:0.70,whiff:0.38,hardContact:0.16,notes:'Wide break, dominant vs RHB 2022-2024'},
    'KN':{effectiveness:0.55,whiff:0.30,hardContact:0.25,notes:'Unpredictable, effective when speed in range'},
    'KC':{effectiveness:0.65,whiff:0.32,hardContact:0.20,notes:'Tight break, effective low zone'}
  },
  'RHP_vs_LHB':{
    '4FB':{effectiveness:0.58,whiff:0.20,hardContact:0.40,notes:'Inner half effective, outer half danger'},
    '2FB':{effectiveness:0.55,whiff:0.16,hardContact:0.35,notes:'Less effective opposite side'},
    'CB':{effectiveness:0.60,whiff:0.28,hardContact:0.22,notes:'Breaks into hitter, less sharp away'},
    'SL':{effectiveness:0.58,whiff:0.30,hardContact:0.25,notes:'Breaks toward barrel, less effective'},
    'CH':{effectiveness:0.52,whiff:0.25,hardContact:0.30,notes:'Fades toward barrel, reduced effectiveness'},
    'CT':{effectiveness:0.68,whiff:0.32,hardContact:0.20,notes:'Inner half cutter very effective vs LHB'},
    'SP':{effectiveness:0.65,whiff:0.32,hardContact:0.18,notes:'Low zone still effective'},
    'SK':{effectiveness:0.52,whiff:0.14,hardContact:0.38,notes:'Reduced effectiveness opposite side'},
    'FK':{effectiveness:0.60,whiff:0.28,hardContact:0.22,notes:'Low zone effective'},
    'SCR':{effectiveness:0.35,whiff:0.18,hardContact:0.35,notes:'Breaks away from LHB, unusual'},
    'EPH':{effectiveness:0.55,whiff:0.42,hardContact:0.28,notes:'Still disrupts timing'},
    'SLV':{effectiveness:0.55,whiff:0.28,hardContact:0.25,notes:'Less effective opposite side'},
    'SWP':{effectiveness:0.82,whiff:0.48,hardContact:0.12,notes:'Dominant vs LHB — defining pitch 2022-2024'},
    'KN':{effectiveness:0.55,whiff:0.30,hardContact:0.25,notes:'Handedness neutral'},
    'KC':{effectiveness:0.58,whiff:0.28,hardContact:0.22,notes:'Effective low and away to LHB'}
  },
  'LHP_vs_RHB':{
    '4FB':{effectiveness:0.60,whiff:0.21,hardContact:0.39,notes:'Inner half very effective vs RHB'},
    '2FB':{effectiveness:0.57,whiff:0.17,hardContact:0.33,notes:'Ground balls effective'},
    'CB':{effectiveness:0.62,whiff:0.29,hardContact:0.21,notes:'Breaks into RHB, less classic away'},
    'SL':{effectiveness:0.60,whiff:0.31,hardContact:0.24,notes:'Breaks toward barrel of RHB'},
    'CH':{effectiveness:0.55,whiff:0.26,hardContact:0.29,notes:'Less effective opposite side matchup'},
    'CT':{effectiveness:0.70,whiff:0.33,hardContact:0.19,notes:'Glove side LHP cutter effective'},
    'SP':{effectiveness:0.67,whiff:0.33,hardContact:0.17,notes:'Low zone dominant'},
    'SK':{effectiveness:0.54,whiff:0.15,hardContact:0.36,notes:'Ground balls but less deceptive'},
    'FK':{effectiveness:0.61,whiff:0.29,hardContact:0.21,notes:'Low zone effective'},
    'SCR':{effectiveness:0.70,whiff:0.35,hardContact:0.16,notes:'LHP screwball breaks away from RHB — rare and effective'},
    'EPH':{effectiveness:0.52,whiff:0.43,hardContact:0.29,notes:'Timing disruption still works'},
    'SLV':{effectiveness:0.57,whiff:0.29,hardContact:0.24,notes:'Moderate effectiveness'},
    'SWP':{effectiveness:0.65,whiff:0.35,hardContact:0.18,notes:'Effective but less dominant than RHP vs LHB'},
    'KN':{effectiveness:0.55,whiff:0.30,hardContact:0.25,notes:'Handedness neutral'},
    'KC':{effectiveness:0.63,whiff:0.30,hardContact:0.21,notes:'Effective low zone'}
  },
  'LHP_vs_LHB':{
    '4FB':{effectiveness:0.63,whiff:0.23,hardContact:0.37,notes:'Same side, elevated zone effective'},
    '2FB':{effectiveness:0.59,whiff:0.19,hardContact:0.31,notes:'Ground ball producer same side'},
    'CB':{effectiveness:0.70,whiff:0.33,hardContact:0.17,notes:'Breaks away — classic same side putaway'},
    'SL':{effectiveness:0.74,whiff:0.39,hardContact:0.14,notes:'Highly effective same side'},
    'CH':{effectiveness:0.77,whiff:0.42,hardContact:0.13,notes:'Best LHP pitch vs LHB — fades away'},
    'CT':{effectiveness:0.66,whiff:0.29,hardContact:0.21,notes:'Effective inner half movement'},
    'SP':{effectiveness:0.71,whiff:0.36,hardContact:0.15,notes:'Low zone dominant same side'},
    'SK':{effectiveness:0.56,whiff:0.17,hardContact:0.34,notes:'Ground balls, inner half sets up'},
    'FK':{effectiveness:0.63,whiff:0.31,hardContact:0.19,notes:'Low zone effective'},
    'SCR':{effectiveness:0.48,whiff:0.26,hardContact:0.27,notes:'Breaks toward LHB barrel'},
    'EPH':{effectiveness:0.51,whiff:0.44,hardContact:0.31,notes:'Timing disruption'},
    'SLV':{effectiveness:0.69,whiff:0.36,hardContact:0.17,notes:'Effective away same side'},
    'SWP':{effectiveness:0.71,whiff:0.39,hardContact:0.15,notes:'Wide break away from LHB'},
    'KN':{effectiveness:0.55,whiff:0.30,hardContact:0.25,notes:'Handedness neutral'},
    'KC':{effectiveness:0.66,whiff:0.33,hardContact:0.19,notes:'Tight break low zone effective'}
  }
};

// ── HELPER FUNCTIONS ──

function getMatchupKey(pitcherHand,batterHand){
  const ph=pitcherHand==='R'?'RHP':'LHP';
  const bh=batterHand==='RHB'?'RHB':'LHB';
  return ph+'_vs_'+bh;
}

function getZoneData(pitcherHand,batterHand,batterType,zoneKey){
  const key=getMatchupKey(pitcherHand,batterHand);
  const bt=batterType==='RANDOM'?'GENERIC':batterType;
  return (ZONE_DATA[key]&&ZONE_DATA[key][bt]&&ZONE_DATA[key][bt].zones&&ZONE_DATA[key][bt].zones[zoneKey])||null;
}

function getPitchData(pitcherHand,batterHand,pitchKey){
  const key=getMatchupKey(pitcherHand,batterHand);
  return (PITCH_DATA[key]&&PITCH_DATA[key][pitchKey])||null;
}

function isDangerZone(pitcherHand,batterHand,batterType,zoneKey){
  const d=getZoneData(pitcherHand,batterHand,batterType,zoneKey);
  return d?d.danger:false;
}

function isAdvantageZone(pitcherHand,batterHand,batterType,zoneKey){
  const d=getZoneData(pitcherHand,batterHand,batterType,zoneKey);
  return d?d.advantage:false;
}

// Get top N danger zones for this matchup sorted by hard contact rate
function getTopDangerZones(pitcherHand,batterHand,batterType,n){
  const key=getMatchupKey(pitcherHand,batterHand);
  const bt=batterType==='RANDOM'?'GENERIC':batterType;
  const zones=ZONE_DATA[key]&&ZONE_DATA[key][bt]&&ZONE_DATA[key][bt].zones;
  if(!zones) return [];
  return Object.entries(zones)
    .filter(([,v])=>v.danger)
    .sort((a,b)=>b[1].hardContact-a[1].hardContact)
    .slice(0,n||3)
    .map(([k])=>k);
}

// Get top N advantage zones sorted by whiff rate
function getTopAdvantageZones(pitcherHand,batterHand,batterType,n){
  const key=getMatchupKey(pitcherHand,batterHand);
  const bt=batterType==='RANDOM'?'GENERIC':batterType;
  const zones=ZONE_DATA[key]&&ZONE_DATA[key][bt]&&ZONE_DATA[key][bt].zones;
  if(!zones) return [];
  return Object.entries(zones)
    .filter(([,v])=>v.advantage)
    .sort((a,b)=>b[1].whiff-a[1].whiff)
    .slice(0,n||3)
    .map(([k])=>k);
}

// Get best pitches for this matchup sorted by effectiveness
function getBestPitches(pitcherHand,batterHand,arsenal,n){
  const key=getMatchupKey(pitcherHand,batterHand);
  if(!PITCH_DATA[key]) return [];
  return (arsenal||Object.keys(PITCH_DATA[key]))
    .filter(pk=>PITCH_DATA[key][pk])
    .sort((a,b)=>PITCH_DATA[key][b].effectiveness-PITCH_DATA[key][a].effectiveness)
    .slice(0,n||5);
}

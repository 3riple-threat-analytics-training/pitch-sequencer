function cl(v){return new THREE.Vector3(v.x,Math.max(MIN_Y,v.y),v.z);}

const PITCHES={
  '4FB':{color:0xef4444,name:'4-seam FB',ms:540,
    ctrl:(s,t,h)=>{const f=Math.max(0,Math.min(1,(t.y-ZLO)/ZH));const r=f>0.5?0.12*(f-0.5)*2:-0.04*(0.5-f)*2;return[cl(new THREE.Vector3(s.x,s.y+0.08+r,s.z*.65+t.z*.35)),cl(new THREE.Vector3(t.x,t.y+0.06+r*0.5,s.z*.18+t.z*.82))];},
    bd:(s,t,h)=>{const o=h*0.42;return[cl(new THREE.Vector3(s.x+o*0.6,s.y+0.10,s.z*.62+t.z*.38)),cl(new THREE.Vector3(t.x+o*0.15,t.y+0.06,s.z*.10+t.z*.90))];}},
  '2FB':{color:0xf97316,name:'2-seam FB',ms:570,
    ctrl:(s,t,h)=>[cl(new THREE.Vector3(s.x+h*0.04,s.y+0.04,s.z*.65+t.z*.35)),cl(new THREE.Vector3(t.x+h*0.14,t.y-0.08,s.z*.16+t.z*.84))],
    bd:(s,t,h)=>{const o=h*0.50;return[cl(new THREE.Vector3(s.x+o,s.y+0.04,s.z*.62+t.z*.38)),cl(new THREE.Vector3(t.x+o*0.12,t.y-0.05,s.z*.10+t.z*.90))];}},
  'CB':{color:0x3b82f6,name:'Curveball',ms:980,
    ctrl:(s,t,h)=>{
      const peak=t.y+SQ*2.8;
      const midZ=s.z*0.45+t.z*0.55;
      return[
        cl(new THREE.Vector3(
          s.x+h*0.01,
          peak+0.32,
          midZ
        )),
        cl(new THREE.Vector3(
          t.x+h*0.01,
          peak+0.14,
          s.z*0.12+t.z*0.88
        ))
      ];
    },
    bd:(s,t,h)=>{
      const peak=t.y+SQ*2.8;
      const off=h*0.44;
      return[
        cl(new THREE.Vector3(s.x+off,peak+0.32,s.z*0.45+t.z*0.55)),
        cl(new THREE.Vector3(t.x+off*0.08,peak+0.14,s.z*0.12+t.z*0.88))
      ];
    }
  },
  'SL':{color:0xa855f7,name:'Slider',ms:780,
    ctrl:(s,t,h)=>[cl(new THREE.Vector3(s.x+h*0.02,s.y+0.06,s.z*.66+t.z*.34)),cl(new THREE.Vector3(t.x+h*0.38,t.y+0.03,s.z*.10+t.z*.90))],
    bd:(s,t,h)=>[cl(new THREE.Vector3(s.x+h*FRAME_EDGE,s.y+0.05,s.z*.58+t.z*.42)),cl(new THREE.Vector3(t.x+h*0.05,t.y+0.02,s.z*.06+t.z*.94))]},
  'CH':{color:0x22c55e,name:'Changeup',ms:820,
    ctrl:(s,t,h)=>[cl(new THREE.Vector3(s.x+h*0.02,s.y+0.07,s.z*.68+t.z*.32)),cl(new THREE.Vector3(t.x+h*0.05,Math.max(MIN_Y,t.y+0.28),s.z*.04+t.z*.96))],
    bd:(s,t,h)=>{const o=h*0.40;return[cl(new THREE.Vector3(s.x+o,s.y+0.06,s.z*.68+t.z*.32)),cl(new THREE.Vector3(t.x+o*0.08,Math.max(MIN_Y,t.y+0.20),s.z*.04+t.z*.96))];}},
  'CT':{color:0xeab308,name:'Cutter',ms:590,
    ctrl:(s,t,h)=>[cl(new THREE.Vector3(s.x,s.y+0.07,s.z*.65+t.z*.35)),cl(new THREE.Vector3(t.x-h*0.16,t.y+0.03,s.z*.13+t.z*.87))],
    bd:(s,t,h)=>[cl(new THREE.Vector3(s.x-h*FRAME_EDGE*0.8,s.y+0.06,s.z*.58+t.z*.42)),cl(new THREE.Vector3(t.x-h*0.05,t.y+0.03,s.z*.06+t.z*.94))]},
  'SP':{color:0x06b6d4,name:'Splitter',ms:730,
    ctrl:(s,t,h)=>[cl(new THREE.Vector3(s.x,s.y+0.06,s.z*.70+t.z*.30)),cl(new THREE.Vector3(t.x+h*0.03,Math.max(MIN_Y,t.y+0.32),s.z*.05+t.z*.95))],
    bd:(s,t,h)=>{const o=h*0.38;return[cl(new THREE.Vector3(s.x+o,s.y+0.08,s.z*.68+t.z*.32)),cl(new THREE.Vector3(t.x+o*0.06,Math.max(MIN_Y,t.y+0.28),s.z*.05+t.z*.95))];}},
  'SK':{color:0xf43f5e,name:'Sinker',ms:550,
    ctrl:(s,t,h)=>[
      cl(new THREE.Vector3(s.x+h*0.05,s.y+0.05,s.z*.66+t.z*.34)),
      cl(new THREE.Vector3(t.x+h*0.12,Math.max(MIN_Y,t.y-0.22),s.z*.08+t.z*.92))
    ],
    bd:(s,t,h)=>{const o=h*0.48;return[
      cl(new THREE.Vector3(s.x+o,s.y+0.05,s.z*.64+t.z*.36)),
      cl(new THREE.Vector3(t.x+o*0.10,Math.max(MIN_Y,t.y-0.18),s.z*.08+t.z*.92))
    ];}
  },
  'FK':{color:0x0891b2,name:'Forkball',ms:760,
    ctrl:(s,t,h)=>[
      cl(new THREE.Vector3(s.x+h*0.01,s.y+0.05,s.z*.72+t.z*.28)),
      cl(new THREE.Vector3(t.x+h*0.02,Math.max(MIN_Y,t.y+0.42),s.z*.03+t.z*.97))
    ],
    bd:(s,t,h)=>{const o=h*0.36;return[
      cl(new THREE.Vector3(s.x+o,s.y+0.06,s.z*.70+t.z*.30)),
      cl(new THREE.Vector3(t.x+o*0.05,Math.max(MIN_Y,t.y+0.38),s.z*.03+t.z*.97))
    ];}
  },
  'SCR':{color:0xec4899,name:'Screwball',ms:850,
    ctrl:(s,t,h)=>{const p=t.y+SQ;return[
      cl(new THREE.Vector3(s.x-h*0.02,p+0.20,s.z*.52+t.z*.48)),
      cl(new THREE.Vector3(t.x-h*0.14,p+0.08,s.z*.18+t.z*.82))
    ];},
    bd:(s,t,h)=>{const p=t.y+SQ,o=h*0.44;return[
      cl(new THREE.Vector3(s.x-o,p+0.20,s.z*.52+t.z*.48)),
      cl(new THREE.Vector3(t.x-o*0.10,p+0.08,s.z*.16+t.z*.84))
    ];}
  },
  'EPH':{color:0xd97706,name:'Eephus',ms:1400,
    ctrl:(s,t,h)=>{const peak=t.y+SQ*4.5;return[
      cl(new THREE.Vector3(s.x+h*0.01,peak+0.55,s.z*.40+t.z*.60)),
      cl(new THREE.Vector3(t.x+h*0.01,peak+0.22,s.z*.15+t.z*.85))
    ];},
    bd:(s,t,h)=>{const peak=t.y+SQ*4.5,o=h*0.40;return[
      cl(new THREE.Vector3(s.x+o,peak+0.55,s.z*.40+t.z*.60)),
      cl(new THREE.Vector3(t.x+o*0.08,peak+0.22,s.z*.15+t.z*.85))
    ];}
  },
  'SLV':{color:0x7c3aed,name:'Slurve',ms:840,
    ctrl:(s,t,h)=>[
      cl(new THREE.Vector3(s.x+h*0.03,s.y+0.10,s.z*.58+t.z*.42)),
      cl(new THREE.Vector3(t.x+h*0.26,Math.max(MIN_Y,t.y+0.18),s.z*.12+t.z*.88))
    ],
    bd:(s,t,h)=>{const o=h*0.46;return[
      cl(new THREE.Vector3(s.x+o,s.y+0.08,s.z*.56+t.z*.44)),
      cl(new THREE.Vector3(t.x+o*0.10,Math.max(MIN_Y,t.y+0.14),s.z*.10+t.z*.90))
    ];}
  },
  'SWP':{color:0x10b981,name:'Sweeper',ms:720,
    ctrl:(s,t,h)=>[
      cl(new THREE.Vector3(s.x+h*0.04,s.y+0.06,s.z*.64+t.z*.36)),
      cl(new THREE.Vector3(t.x+h*0.58,t.y+0.04,s.z*.08+t.z*.92))
    ],
    bd:(s,t,h)=>[
      cl(new THREE.Vector3(s.x+h*FRAME_EDGE,s.y+0.05,s.z*.56+t.z*.44)),
      cl(new THREE.Vector3(t.x+h*0.08,t.y+0.02,s.z*.05+t.z*.95))
    ]
  },
};

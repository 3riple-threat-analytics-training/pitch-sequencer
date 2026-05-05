const ZPOS={
  TL:{x:X_L,y:Y_TOP},TM:{x:X_M,y:Y_TOP},TR:{x:X_R,y:Y_TOP},
  ML:{x:X_L,y:Y_MID},MM:{x:X_M,y:Y_MID},MR:{x:X_R,y:Y_MID},
  BL:{x:X_L,y:Y_BOT},BM:{x:X_M,y:Y_BOT},BR:{x:X_R,y:Y_BOT},
  CUL:{x:X_L,y:CUP_Y},CUM:{x:X_M,y:CUP_Y},CUR:{x:X_R,y:CUP_Y},
  CIN:{x:-(ZW/2+ZW/3),y:Y_MID},COUT:{x:ZW/2+ZW/3,y:Y_MID},
  'CLO-L':{x:X_L,y:CLO_Y},'CLO-M':{x:X_M,y:CLO_Y},'CLO-R':{x:X_R,y:CLO_Y},
  'TL-CRN':{x:ZW/2-0.0375,y:ZHI+0.0375},
  'TR-CRN':{x:-ZW/2+0.0375,y:ZHI+0.0375},
  'BL-CRN':{x:ZW/2-0.0375,y:ZLO-0.0375},
  'BR-CRN':{x:-ZW/2+0.0375,y:ZLO-0.0375},
  'TOP-EDG':{x:0,y:ZHI+0.0375},
  'BOT-EDG':{x:0,y:ZLO-0.0375},
  'LFT-EDG':{x:ZW/2+0.0375,y:Y_MID},
  'RGT-EDG':{x:-ZW/2-0.0375,y:Y_MID}
};

const ZKC=[['TR','TM','TL'],['MR','MM','ML'],['BR','BM','BL']];

function mk(t,c){const e=document.createElement(t);e.className=c;return e;}
function buildZoneDiagram(){
  const el=document.getElementById('zonediagram');el.innerHTML='';
  const upRow=mk('div','zd-chase-row');
  [['CUR','Up R'],['CUM','Up M'],['CUL','Up L']].forEach(([k,l])=>{const isDisabled=typeof knuckleballZoneDisabled!=='undefined'&&knuckleballZoneDisabled;const d=mk('div','cc'+(zone===k?' sel':'')+(isDisabled?' cc-disabled':''));d.textContent=l;if(!isDisabled) d.onclick=()=>selZone(k);upRow.appendChild(d);});
  el.appendChild(upRow);
  const mid=mk('div','zd-mid');
  const inDisabled=typeof knuckleballZoneDisabled!=='undefined'&&knuckleballZoneDisabled;const inD=mk('div','cc-side'+(zone==='COUT'?' sel':'')+(inDisabled?' cc-disabled':''));inD.textContent='In';if(!inDisabled) inD.onclick=()=>selZone('COUT');
  const grid=mk('div','zd-grid');
  const ZONE_LABELS={'TL':'TL','TM':'TM','TR':'TR','ML':'ML','MM':'MM','MR':'MR','BL':'BL','BM':'BM','BR':'BR'};
  const ZONE_DISPLAY={'TR':'TL','TL':'TR','MR':'ML','ML':'MR','BR':'BL','BL':'BR','TM':'TM','MM':'MM','BM':'BM'};
  ZKC.forEach(row=>{const rw=mk('div','zd-grid-row');row.forEach(k=>{const isDisabled=typeof knuckleballZoneDisabled!=='undefined'&&knuckleballZoneDisabled&&k!=='MM';const d=mk('div','zc'+(zone===k?' sel':'')+(isDisabled?' zc-disabled':''));d.textContent=ZONE_DISPLAY[k]||k;if(!isDisabled) d.onclick=()=>selZone(k);rw.appendChild(d);});grid.appendChild(rw);});
  const outD=mk('div','cc-side'+(zone==='CIN'?' sel':'')+(inDisabled?' cc-disabled':''));outD.textContent='Out';if(!inDisabled) outD.onclick=()=>selZone('CIN');
  mid.appendChild(inD);mid.appendChild(grid);mid.appendChild(outD);el.appendChild(mid);
  const loRow=mk('div','zd-chase-row');
  [['CLO-R','Lo R'],['CLO-M','Lo M'],['CLO-L','Lo L']].forEach(([k,l])=>{const isDisabled=typeof knuckleballZoneDisabled!=='undefined'&&knuckleballZoneDisabled;const d=mk('div','cc'+(zone===k?' sel':'')+(isDisabled?' cc-disabled':''));d.textContent=l;if(!isDisabled) d.onclick=()=>selZone(k);loRow.appendChild(d);});
  el.appendChild(loRow);
}

function buildEdgeDiagram(){
  const el=document.getElementById('zonediagram');
  if(!el) return;
  el.innerHTML='';
  const top=mk('div','ed-top');
  function edgeBtn(k){
    const b=mk('div','zc'+(zone===k?' sel':''));
    b.textContent=k;
    b.onclick=()=>selZone(k);
    return b;
  }
  top.appendChild(edgeBtn('TL-CRN'));
  top.appendChild(edgeBtn('TOP-EDG'));
  top.appendChild(edgeBtn('TR-CRN'));
  el.appendChild(top);
  const mid=mk('div','ed-mid');
  mid.appendChild(edgeBtn('LFT-EDG'));
  mid.appendChild(mk('div','ed-sp'));
  mid.appendChild(edgeBtn('RGT-EDG'));
  el.appendChild(mid);
  const bot=mk('div','ed-bot');
  bot.appendChild(edgeBtn('BL-CRN'));
  bot.appendChild(edgeBtn('BOT-EDG'));
  bot.appendChild(edgeBtn('BR-CRN'));
  el.appendChild(bot);
}

function rebuildTargetDiagram(){
  if(targetMode==='ZONE') buildZoneDiagram();
  else buildEdgeDiagram();
}

function setTargetMode(m){
  targetMode=m;
  const bz=document.getElementById('zezone'),be=document.getElementById('zeedge');
  if(bz&&be){
    bz.classList.toggle('active',m==='ZONE');
    be.classList.toggle('active',m==='EDGE');
  }
  if(m==='ZONE'){
    if(EDGE8_ZONE_KEYS.indexOf(zone)>=0) zone='MM';
  }else{
    if(EDGE8_ZONE_KEYS.indexOf(zone)<0) zone='TOP-EDG';
  }
  rebuildTargetDiagram();
  refreshGhost();
}

function selZone(k){zone=k;rebuildTargetDiagram();refreshGhost();}

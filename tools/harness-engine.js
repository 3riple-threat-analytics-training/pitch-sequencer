// Pitch Sequencer harness — build step 5: full baseline (animation frozen, repeatability check). Built for app commit 89aed9b (C6 tunnel groups).
// Six pitchers x 1,000 innings each, played as 10 blocks of 100 innings with different seeds
// (the spread between blocks gives the error ranges). Runs ONLY on localhost.
// Runs INSIDE the app page (injected by tools/harness.html), so it can see the app's own variables.
// Uses the app's real functions: throwPitch(), the end-of-at-bat timers, modalNewInning(), TAKE THE MOUND.
// A fast-forward clock runs the app's timers immediately, in order. Randomness is seeded (repeatable).
// No app file is changed. Firestore writes and endGame() are blocked first. Home games only.
(async function () {
  const BUILT_FOR = '89aed9b';
  const BLOCKS = 10;                 // blocks per pitcher
  const INNINGS_PER_BLOCK = 100;     // innings per block  (10 x 100 = 1,000 innings per pitcher)
  const BASE_SEED = 20261021;
  const MAX_PITCHES_PER_INNING = 80;
  const lines = [];
  const log = (...a) => { const t = a.join(' '); lines.push(t); console.log('[HARNESS]', t); };
  const post = m => parent.postMessage(m, '*');
  const progress = t => post({ type: 'harness-progress', text: t });
  const report = () => post({ type: 'harness-report', lines: lines });

  // ---- 0. localhost only ------------------------------------------------------
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
    log('REFUSED: the harness only runs on localhost (this page is ' + location.hostname + '). Nothing was changed.');
    report(); return;
  }

  const ENDINGS = ['STRIKEOUT', 'WALK', 'SINGLE', 'DOUBLE', 'TRIPLE', 'HOME RUN', 'GROUND OUT', 'POP FLY'];
  const HITS = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HOME RUN'];
  const STRIKE_RESULTS = ['STRIKE', 'CALLED STRIKE', 'SWING & MISS', 'FOUL', 'FOUL (STRAIGHT BACK)', 'FOUL (PULLED)',
    'FOUL (LATE)', 'CHECK SWING (STRIKE)', 'STRIKEOUT']; // same list as handleSimOutcome (sim.js 6361-6363)
  const INNER = ['TL', 'TM', 'TR', 'ML', 'MM', 'MR', 'BL', 'BM', 'BR'];
  const EDGE = ['TL-CRN', 'TR-CRN', 'BL-CRN', 'BR-CRN', 'TOP-EDG', 'BOT-EDG', 'LFT-EDG', 'RGT-EDG'];
  const CHASE = ['CUL', 'CUM', 'CUR', 'CLO-L', 'CLO-M', 'CLO-R', 'CIN', 'COUT'];
  const ARSENAL = ['4FB', '2FB', 'CH', 'CB'];
  const LINES = [ // [flank, flank, anchor]
    ['TL', 'BL', 'ML'], ['TM', 'BM', 'MM'], ['TR', 'BR', 'MR'],   // vertical
    ['TL', 'TR', 'TM'], ['ML', 'MR', 'MM'], ['BL', 'BR', 'BM'],   // horizontal
    ['TL', 'BR', 'MM'], ['TR', 'BL', 'MM']                        // diagonal
  ];

  const failures = [];
  const check = (ok, msg) => { if (!ok) { failures.push(msg); if (failures.length <= 30) log('  ✗ CHECK FAILED:', msg); } };

  // ---- real functions kept for the harness itself ---------------------------
  const realST = window.setTimeout.bind(window);
  const realCT = window.clearTimeout.bind(window);
  const realRandom = Math.random;
  const yieldToBrowser = () => new Promise(r => realST(r, 0));

  // ---- fast-forward clock -----------------------------------------------------
  let vNow = 0, vSeq = 0, vId = 1000000000, timersRun = 0;
  const queue = new Map();
  function ffSetTimeout(fn, ms) {
    const id = ++vId;
    queue.set(id, { due: vNow + (Number(ms) || 0), seq: ++vSeq, fn: fn, args: Array.prototype.slice.call(arguments, 2) });
    return id;
  }
  function ffClearTimeout(id) { if (queue.has(id)) queue.delete(id); else realCT(id); }
  let loopReports = 0;
  function drain() {
    let guard = 0;
    const start = vNow;
    const bySrc = new Map(); // diagnostic: which timers ran during this drain, and how often
    while (queue.size && guard < 20000 && vNow - start <= 600000) {
      guard++;
      let nextId = null, next = null;
      queue.forEach((t, id) => { if (!next || t.due < next.due || (t.due === next.due && t.seq < next.seq)) { next = t; nextId = id; } });
      queue.delete(nextId);
      const src = String(next.fn).replace(/\s+/g, ' ').slice(0, 160);
      const e = bySrc.get(src) || { n: 0, firstDue: next.due, lastDue: next.due };
      e.n++; e.lastDue = next.due; bySrc.set(src, e);
      vNow = next.due; timersRun++;
      if (typeof next.fn === 'function') next.fn.apply(window, next.args);
    }
    const looped = queue.size > 0;
    if (looped) {
      loopReports++;
      if (loopReports <= 5) {
        log('  ⚠ LOOP DIAGNOSTIC #' + loopReports + ': ' + guard + ' timers over ' + (vNow - start) + ' virtual ms in one fast-forward. State: count ' + ballCount + '-' + strikeCount +
            ', outs ' + outCount + ', atBatOver ' + atBatOver + ', simInningBreak ' + simInningBreak + ', pitch count ' + totalPitchCount +
            ', timers still waiting ' + queue.size);
        [...bySrc.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3).forEach(([s, e]) =>
          log('      ran x' + e.n + ' (virtual ' + e.firstDue + '-' + e.lastDue + ' ms): ' + s));
        const waiting = [...queue.values()].slice(0, 3);
        waiting.forEach(t => log('      still waiting (due ' + t.due + ' ms): ' + String(t.fn).replace(/\s+/g, ' ').slice(0, 160)));
      }
    }
    check(!looped, 'fast-forward stopped with timers still waiting (over 20,000 timers or 10 virtual minutes: a real loop)');
  }

  // ---- seeded randomness ------------------------------------------------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // The pitchers' own choices use a SEPARATE random stream, so they never change the app's dice.
  let choiceRandom = mulberry32(1);
  const pick = arr => arr[Math.floor(choiceRandom() * arr.length)];

  const restorers = [];
  const restoreAll = () => { while (restorers.length) { try { restorers.pop()(); } catch (e) {} } };
  const rows = [];

  try {
    // ---- 1. safety locks ------------------------------------------------------
    const blocked = name => async function () { log('BLOCKED Firestore write:', name); return { success: false, error: 'blocked by harness' }; };
    ['fbSaveProfile', 'fbSavePlans', 'fbSaveGameHistory', 'fbSaveRoster'].forEach(n => { if (typeof window[n] === 'function') window[n] = blocked(n); });
    if (window._fbFns) ['setDoc', 'addDoc', 'updateDoc', 'deleteDoc'].forEach(n => { if (typeof window._fbFns[n] === 'function') window._fbFns[n] = blocked('_fbFns.' + n); });
    window.endGame = function () { log('BLOCKED endGame()'); };
    log('Running on: ' + location.hostname + ' (localhost only)');
    log('Locks on: fbSaveProfile, fbSavePlans, fbSaveGameHistory, fbSaveRoster, _fbFns, endGame');
    if (window._fbUser) { log('Signed-in account: YES — run stopped (sign out on localhost first)'); report(); return; }
    log('Signed-in account: none');

    // Orbit history is display-only; saving thousands of test at-bats would only fill storage.
    const origOrbitSave = window.orbitSaveAtBat;
    if (typeof origOrbitSave === 'function') { window.orbitSaveAtBat = function () {}; restorers.push(() => { window.orbitSaveAtBat = origOrbitSave; }); }
    log('Orbit at-bat history: not saved during the run (display only)');

    // ---- 2. zone lists must match the app ------------------------------------
    const edgeOK = EDGE.every(z => isEdgeOrCornerZone(z)) && INNER.every(z => !isEdgeOrCornerZone(z)) && CHASE.every(z => !isEdgeOrCornerZone(z));
    const chaseOK = CHASE.every(z => CHASE_ZONE_KEYS.includes(z)) && CHASE_ZONE_KEYS.length === CHASE.length;
    log('Zone lists match the app:', edgeOK && chaseOK ? 'yes' : 'NO — run stopped');
    if (!(edgeOK && chaseOK)) { report(); return; }
    const group = z => INNER.includes(z) ? 'inner' : EDGE.includes(z) ? 'edge' : CHASE.includes(z) ? 'chase' : '?';

    // ---- 3. watchers (read-only) ---------------------------------------------
    let lastWeights = null, lastRep = null, lastContact = '';
    const origBSW = window.buildSimWeights;
    window.buildSimWeights = function () { const w = origBSW.apply(this, arguments); lastWeights = Object.assign({}, w); return w; };
    restorers.push(() => { window.buildSimWeights = origBSW; });
    const origRep = window.getLocationRepetitionPenalty;
    window.getLocationRepetitionPenalty = function () { const r = origRep.apply(this, arguments); lastRep = r; return r; };
    restorers.push(() => { window.getLocationRepetitionPenalty = origRep; });
    const origCSO = window.getContactSubOutcome;
    window.getContactSubOutcome = function (raw) { if (raw === 'WEAK CONTACT' || raw === 'STRONG CONTACT') lastContact = raw; return origCSO.apply(this, arguments); };
    restorers.push(() => { window.getContactSubOutcome = origCSO; });

    // ---- 4. fast-forward clock on --------------------------------------------
    window.setTimeout = ffSetTimeout; window.clearTimeout = ffClearTimeout;
    restorers.push(() => { window.setTimeout = realST; window.clearTimeout = realCT; });
    restorers.push(() => { Math.random = realRandom; });
    // Freeze the browser's animation frames during the run. The ball/3D animation is display-only:
    // every outcome is decided and recorded inside throwPitch() before any animation (probes 1 and 2b).
    // Animation callbacks run on real time, outside the fast-forward clock and the seeds, so they made
    // runs non-repeatable and piled up hundreds of pop-up hiding timers. Reload the page after a run.
    const realRAF = window.requestAnimationFrame, realCAF = window.cancelAnimationFrame;
    let rafBlocked = 0;
    window.requestAnimationFrame = function () { rafBlocked++; return 0; };
    window.cancelAnimationFrame = function () {};
    restorers.push(() => { window.requestAnimationFrame = realRAF; window.cancelAnimationFrame = realCAF; });
    log('Animation frames frozen during the run (display only). Reload the page afterwards to restore the 3D view.');

    // ---- helpers ----------------------------------------------------------------
    function freshGame() {
      if (!simMode) { toggleSimMode(); drain(); }
      if (batterLevel !== 'rec12') setBatterLevel('rec12');
      setBatterType('RANDOM');
      clearAll();
      resetPitchCount();
      resetRunners();
      totalScore = 0; teamScore = 0; scoreboardData = []; inningStrikePitches = 0;
      inningHits = 0; inningRunsAllowed = 0; gameSeq = [];
      handleNewBatter();
      drain();
      check(isHomeTeam === true, 'game is not a home game');
      check(outCount === 0 && ballCount === 0 && strikeCount === 0 && !atBatOver, 'fresh game did not start at 0 outs, 0-0');
    }
    function setSpeed(mode) {
      applyFatigueToVelocity();
      const sl = document.getElementById('spd');
      const lo = parseInt(sl.min, 10), hi = parseInt(sl.max, 10);
      const v = mode === 'max' ? hi : mode === 'mid' ? Math.round((lo + hi) / 2) : lo + Math.floor(choiceRandom() * (hi - lo + 1));
      sl.value = v;
      if (typeof handleSpeedInput === 'function') handleSpeedInput(v);
      return v;
    }
    function countSituation() {
      const ct = ballCount + '-' + strikeCount;
      if (typeof PITCHER_COUNTS !== 'undefined' && PITCHER_COUNTS.includes(ct)) return 'ahead';
      if (typeof HITTER_COUNTS !== 'undefined' && HITTER_COUNTS.includes(ct)) return 'behind';
      return 'even';
    }

    // ---- 5. the six pitchers ------------------------------------------------
    // Each returns {pk, zk, speed} for the next pitch. ab = per-at-bat memory (reset at each new batter).
    let p3zone = 0, p3pitch = 0;
    const PITCHERS = [
      { id: 'P1', name: 'Predictable', next: () => ({ pk: '4FB', zk: 'MM', speed: 'max' }) },
      { id: 'P2', name: 'Throws gas', next: () => ({ pk: '4FB', zk: pick(INNER), speed: 'max' }) },
      { id: 'P3', name: 'Mechanical rotation', next: () => {
          const r = { pk: ARSENAL[p3pitch % 4], zk: INNER[p3zone % 9], speed: 'mid' }; p3zone++; p3pitch++; return r; } },
      { id: 'P4', name: 'Well-mixed (count-aware)', next: () => {
          const sit = countSituation();
          const split = sit === 'ahead' ? [0.40, 0.30, 0.30] : sit === 'behind' ? [0.75, 0.25, 0.00] : [0.60, 0.25, 0.15];
          const u = choiceRandom();
          const zk = u < split[0] ? pick(INNER) : u < split[0] + split[1] ? pick(EDGE) : pick(CHASE);
          return { pk: pick(ARSENAL), zk: zk, speed: 'rand' }; } },
      { id: 'P5', name: 'Anchoring', next: ab => {
          if (!ab.plan || ab.step >= ab.plan.length) {
            if (ab.plan && choiceRandom() < 0.5) {             // change eye line with an edge/chase pitch
              ab.step = 0; ab.plan = [pick(choiceRandom() < 0.5 ? EDGE : CHASE)]; ab.types = [pick(ARSENAL)];
            } else {                                          // start a (different) line
              let line; do { line = pick(LINES); } while (ab.line && line === ab.line && LINES.length > 1);
              ab.line = line;
              const u = choiceRandom();
              ab.plan = u < 0.5 ? [line[0], line[1], line[2]]   // both flanks, then anchor
                     : u < 0.75 ? [line[2], line[0], line[1]]   // anchor first, then the flanks
                     : [line[0], line[2], line[1]];             // flank, anchor, other flank
              const t = ARSENAL.slice(); for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(choiceRandom() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
              ab.types = t.slice(0, 3); ab.step = 0;
            }
          }
          const r = { pk: ab.types[ab.step], zk: ab.plan[ab.step], speed: 'rand' }; ab.step++; return r; } },
      { id: 'P6', name: 'Edge painter', next: () => ({ pk: pick(ARSENAL), zk: pick(EDGE), speed: 'rand' }) }
    ];

    // ---- 6. one block = 100 innings for one pitcher with one seed -------------
    let tunnelShapeLogged = false;
    async function runBlock(P, blockNo, seed, innings) {
      innings = innings || INNINGS_PER_BLOCK;
      Math.random = mulberry32(seed);            // the app's dice
      choiceRandom = mulberry32(seed + 1000);    // the pitcher's choices
      p3zone = 0; p3pitch = 0;
      const S = { pitches: 0, batters: 0, innings: 0, games: 0, K: 0, BB: 0, H: 0, runs: 0, swingMiss: 0, weak: 0, strong: 0,
                  fLate: 0, fPulled: 0, fStraight: 0, immaculate: 0, tunnels: 0, totK: 0, totBB: 0, totH: 0, logK: 0, logBB: 0, logH: 0 };
      let game = 0;
      S.tunneled = 0; S.inTunnel = 0; let abRecs = []; // C6 counts
      while (S.innings < innings) {
        game++; S.games++;
        freshGame();
        let gameDone = false;
        const tot0 = { K: totalStrikeouts, BB: totalWalks, H: totalHits };
        const log0 = { K: S.K, BB: S.BB, H: S.H };
        while (!gameDone && S.innings < innings) {
          S.innings++;
          const inning = S.innings;
          const score0 = totalScore;
          let inningPitches = 0, inningK = 0, inningAllStrikes = true, inningDone = false;
          let ab = {}, pitchInAB = 0, batterNo = S.batters + 1;
          S.batters++;
          while (!inningDone) {
            if (inningPitches >= MAX_PITCHES_PER_INNING) { check(false, P.id + ' inning ' + inning + ' did not finish in ' + MAX_PITCHES_PER_INNING + ' pitches'); inningDone = true; gameDone = true; break; }
            const choice = P.next(ab);
            selPitch(choice.pk); selZone(choice.zk);
            const spd = setSpeed(choice.speed);
            const b0 = ballCount, s0 = strikeCount, o0 = outCount, ctr0 = inningStrikePitches, seqBefore = seq.length;
            check(b0 <= 3 && s0 <= 2 && o0 <= 2 && !atBatOver, P.id + ' bad state before pitch: ' + b0 + '-' + s0 + ', outs ' + o0 + ', atBatOver ' + atBatOver);
            lastWeights = null; lastRep = null; lastContact = '';
            throwPitch();
            inningPitches++; pitchInAB++; S.pitches++;
            const rec = seq.length > seqBefore ? seq[seq.length - 1] : null;
            const outcome = rec ? rec.outcome : '(nothing)';
            check(!!rec, P.id + ' pitch not recorded');
            if (rec) check(rec.zk === choice.zk && rec.pk === choice.pk, P.id + ' recorded ' + rec.zk + '/' + rec.pk + ' but intended ' + choice.zk + '/' + choice.pk);
            const g = group(choice.zk);
            const isStrikeResult = STRIKE_RESULTS.includes(outcome);
            check(inningStrikePitches === ctr0 + (g === 'edge' && isStrikeResult ? 1 : 0),
              P.id + ' strike counter ' + ctr0 + ' -> ' + inningStrikePitches + ' after ' + g + ' ' + outcome);
            const fouls = lastWeights ? [lastWeights['FOUL (STRAIGHT BACK)'], lastWeights['FOUL (PULLED)'], lastWeights['FOUL (LATE)']].join('/') : '';
            if (lastWeights && g === 'inner' && !(o0 >= 2 && ctr0 >= 6)) check(['7/6/5', '8/7/5'].includes(fouls), P.id + ' inner foul mix ' + fouls);
            if (P.id === 'P1' && lastRep) {
              const e = pitchInAB === 1 ? 1 : pitchInAB === 2 ? 1.125 : pitchInAB === 3 ? 1.25 : 1.5;
              check(Math.abs(lastRep.strongMult - e) < 0.0005, 'P1 repetition ×' + lastRep.strongMult + ' expected ×' + e);
            }
            if (rec && rec.tunnelData && !tunnelShapeLogged) { log('Tunnel data fields (first pitch that has them):', Object.keys(rec.tunnelData).join(', ')); tunnelShapeLogged = true; }
            const tunnel = rec && rec.tunnelData && rec.tunnelData.detected ? 1 : 0;
            // C2/C3 check: the stored partner must be a different type, at least 3 in apart at the plate (measured here
            // from the pitch paths), and the valid earlier pitch with the highest overlap; no tunnel only if none is valid.
            let tPartner = '', tOverlap = '', tGapIn = '';
            if (rec && rec.pts3d && rec.pts3d.length) {
              let best = -1, bestOv = 0, bestSame = false; // C6: same entrance first, then the highest overlap
              for (let i = 0; i < seq.length - 1; i++) {
                const t = checkTunnel(rec, seq[i]); if (!t.tunnel) continue;
                const s = sameEntrance(rec, seq[i]);
                if ((s && !bestSame) || (s === bestSame && t.overlap > bestOv)) { best = i; bestOv = t.overlap; bestSame = s; }
              }
              if (tunnel) {
                const td = rec.tunnelData, prev = seq[td.prevIndex];
                check(!!prev, P.id + ' tunnel partner ' + td.prevIndex + ' missing');
                if (prev) {
                  const a = rec.pts3d[rec.pts3d.length - 1], b = prev.pts3d[prev.pts3d.length - 1];
                  const gap = a.distanceTo(b);
                  tPartner = prev.pk + ' ' + prev.zk; tOverlap = td.length.toFixed(3); tGapIn = (gap / 0.0254).toFixed(1);
                  check(prev.pk !== rec.pk, P.id + ' tunnel between same types ' + rec.pk + '/' + prev.pk);
                  check(gap >= 0.08, P.id + ' tunnel plate gap ' + tGapIn + ' in (< 3 in)');
                  check(Math.abs(td.length - bestOv) < 1e-9, P.id + ' stored partner overlap ' + td.length + ' is not the best valid ' + bestOv);
                }
              } else check(best === -1, P.id + ' no tunnel stored, but earlier pitch ' + best + ' is a valid tunnel');
            }
            // C6 check: the pitch's tunnel matches groupTunnels for the at-bat; tunnels have 2+ pitch types
            if (rec && rec.pts3d && rec.pts3d.length) {
              const G = groupTunnels(seq), j = seq.length - 1, k = G.findIndex(gr => gr.includes(j));
              const td6 = rec.tunnelData || {};
              check((td6.tunnelNo || 0) === k + 1, P.id + ' tunnel number ' + (td6.tunnelNo || 0) + ', groupTunnels says ' + (k + 1));
              check(!!td6.tunnelStart === (k >= 0 && G[k].length === 2), P.id + ' tunnelStart does not match groupTunnels');
              G.forEach(gr => check(new Set(gr.map(i => seq[i].pk)).size >= 2, P.id + ' a tunnel with only one pitch type'));
            }
            if (outcome === 'STRIKEOUT') { S.K++; inningK++; }
            if (outcome === 'WALK') S.BB++;
            if (HITS.includes(outcome)) S.H++;
            // whiffs: swings and misses, including strikeouts the app labels "STRIKEOUT — SWING & MISS" (sim.js applySimCountOutcome)
            if (outcome === 'SWING & MISS' || (outcome === 'STRIKEOUT' && lastSimDiamondBadgeText === 'STRIKEOUT — SWING & MISS')) S.swingMiss++;
            if (lastContact === 'WEAK CONTACT') S.weak++;
            if (lastContact === 'STRONG CONTACT') S.strong++;
            if (outcome === 'FOUL (LATE)') S.fLate++;
            if (outcome === 'FOUL (PULLED)') S.fPulled++;
            if (outcome === 'FOUL (STRAIGHT BACK)') S.fStraight++;
            if (!isStrikeResult) inningAllStrikes = false;
            S.tunneled += tunnel; // C2 count: pitches with a tunnel partner
            S.tunnels += (rec && rec.tunnelData && rec.tunnelData.tunnelStart) ? 1 : 0; // C6: one per tunnel
            if (rec) abRecs.push(rec);
            rows.push([P.id, blockNo, seed, game, inning, batterNo, (secretBatterType || batterType), batter, pitchInAB, b0 + '-' + s0, o0,
              choice.zk, g, choice.pk, spd, outcome, lastContact, lastRep ? lastRep.strongMult.toFixed(3) : '',
              fouls, ctr0 + '>' + inningStrikePitches, totalScore, tunnel, tPartner, tOverlap, tGapIn,
              (rec && rec.tunnelData && rec.tunnelData.tunnelNo) || 0, (rec && rec.tunnelData && rec.tunnelData.tunnelStart) ? 1 : 0].join(','));

            drain(); // app's own end-of-at-bat timers

            if (ENDINGS.includes(outcome)) {
              S.inTunnel += abRecs.filter(r => r.tunnelData && r.tunnelData.inTunnel).length; abRecs = []; // C6
              if (outCount >= 3 || simInningBreak) {
                S.runs += totalScore - score0;
                if (inningK === 3 && inningPitches === 9 && inningAllStrikes) S.immaculate++;
                modalNewInning(); drain();
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'TAKE THE MOUND');
                if (btn) { btn.click(); drain(); } else check(false, P.id + ' TAKE THE MOUND button not found');
                const cap = document.getElementById('inning-cap-modal');
                if (cap) { cap.remove(); gameDone = true; }
                inningDone = true;
              } else {
                check(!atBatOver && seq.length === 0 && ballCount === 0 && strikeCount === 0, P.id + ' app did not start the next batter at 0-0');
                ab = {}; pitchInAB = 0; S.batters++; batterNo = S.batters;
              }
            }
          }
          if (inning % 20 === 0) { progress(P.id + ' ' + P.name + ': block ' + blockNo + ' of ' + BLOCKS + ', inning ' + inning + ' of ' + INNINGS_PER_BLOCK); await yieldToBrowser(); }
        }
        S.totK += totalStrikeouts - tot0.K; S.totBB += totalWalks - tot0.BB; S.totH += totalHits - tot0.H;
        S.logK += S.K - log0.K; S.logBB += S.BB - log0.BB; S.logH += S.H - log0.H;
      }
      return S;
    }

    // ---- 7. run all pitchers, all blocks --------------------------------------
    // ---- 6a. settings snapshot (C6 update): what can change outcomes, recorded before the run ----
    const prof = typeof getProfile === 'function' ? getProfile() : null;
    const savedKeys = Object.keys(localStorage).filter(k => k.startsWith('pitchseq-') && !/history|export|weights|plans|roster|profile/.test(k)).sort();
    const snap = ['hand ' + hand, 'rubber ' + rubber, 'umpire ' + umpireQuality, 'level ' + batterLevel, 'batter type ' + batterType,
      'sim ' + simMode, 'tunnel view ' + tunnelOn, 'SRE ' + sreEnabled, 'backdoor ' + getBdMode(),
      'profile ' + (prof ? (prof.ageGroup || '?') + ' ' + (prof.arsenal || []).join('+') : 'none'),
      'saved: ' + savedKeys.map(k => k.slice(9) + '=' + String(localStorage.getItem(k)).slice(0, 20)).join(', ')].join(' | ');
    let fp = 0; for (const ch of snap) fp = (fp * 31 + ch.charCodeAt(0)) >>> 0;
    log('Settings snapshot: ' + snap);
    log('Settings fingerprint: ' + fp.toString(16) + ' (same fingerprint = same settings; compare it between runs)');
    // ---- 6b. repeatability check: the same seed must give the same innings ------
    progress('Repeatability check (P1, 20 innings, twice)…');
    const rowsBefore = rows.length;
    const r1 = await runBlock(PITCHERS[0], 0, 777, 20);
    const r2 = await runBlock(PITCHERS[0], 0, 777, 20);
    rows.length = rowsBefore; // these test innings are not part of the results
    const sig = S => [S.pitches, S.K, S.BB, S.H, S.runs, S.weak, S.strong, S.swingMiss, S.fLate, S.fPulled, S.fStraight].join('/');
    log('Repeatability check (same seed twice): ' + sig(r1) + ' vs ' + sig(r2) + ' -> ' + (sig(r1) === sig(r2) ? 'IDENTICAL' : 'DIFFERENT'));
    check(sig(r1) === sig(r2), 'same seed gave different results (run is not repeatable)');

    const t0 = Date.now();
    const results = []; // {P, blocks:[S,...]}
    for (let pi = 0; pi < PITCHERS.length; pi++) {
      const P = PITCHERS[pi];
      const blocks = [];
      for (let b = 1; b <= BLOCKS; b++) {
        const seed = BASE_SEED + pi * 100 + b;
        blocks.push(await runBlock(P, b, seed));
        await yieldToBrowser();
      }
      results.push({ P: P, blocks: blocks });
      progress(P.id + ' done (' + Math.round((Date.now() - t0) / 1000) + ' s so far).');
    }
    const minutes = ((Date.now() - t0) / 60000).toFixed(1);
    // ---- 7b. repeatability check for a mixing pitcher (after the results, so it cannot change them) ----
    progress('Repeatability check (P4, 20 innings, twice)…');
    const rowsAfter = rows.length;
    const r3 = await runBlock(PITCHERS[3], 0, 778, 20);
    const r4 = await runBlock(PITCHERS[3], 0, 778, 20);
    rows.length = rowsAfter; // these test innings are not part of the results
    const same4 = sig(r3) === sig(r4) && r3.tunnels === r4.tunnels;
    log('Repeatability check, mixing pitcher (P4, same seed twice): ' + sig(r3) + '/' + r3.tunnels + ' vs ' + sig(r4) + '/' + r4.tunnels + ' -> ' + (same4 ? 'IDENTICAL' : 'DIFFERENT'));
    check(same4, 'P4: same seed gave different results (run is not repeatable)');

    // ---- 8. statistics: mean of the 10 blocks and 95% range ---------------------
    // 95% range = mean ± t(0.975, 9 df) × sd / sqrt(10), with t = 2.262.
    const METRICS = [
      { key: 'K', label: 'Strikeouts per inning', f: S => S.K / S.innings },
      { key: 'BB', label: 'Walks per inning', f: S => S.BB / S.innings },
      { key: 'H', label: 'Hits per inning', f: S => S.H / S.innings },
      { key: 'R', label: 'Runs allowed per inning', f: S => S.runs / S.innings },
      { key: 'PI', label: 'Pitches per inning', f: S => S.pitches / S.innings },
      { key: 'PAB', label: 'Pitches per at-bat', f: S => S.pitches / S.batters },
      { key: 'WH', label: 'Whiff % of pitches', f: S => 100 * S.swingMiss / S.pitches },
      { key: 'WK', label: 'Weak contact % of pitches', f: S => 100 * S.weak / S.pitches },
      { key: 'ST', label: 'Strong contact % of pitches', f: S => 100 * S.strong / S.pitches },
      { key: 'IM', label: 'Immaculate innings per 100 innings', f: S => 100 * S.immaculate / S.innings },
      { key: 'TU', label: 'Tunnels per inning (C6: one per shared tunnel)', f: S => S.tunnels / S.innings },
      { key: 'TP', label: 'Pitches in tunnels per inning', f: S => S.inTunnel / S.innings },
      { key: 'TD', label: 'Pitches with a tunnel partner per inning (C2 count)', f: S => S.tunneled / S.innings },
      { key: 'FL', label: 'FOUL (LATE) % of fouls', f: S => { const t = S.fLate + S.fPulled + S.fStraight; return t ? 100 * S.fLate / t : 0; } },
      { key: 'FP', label: 'FOUL (PULLED) % of fouls', f: S => { const t = S.fLate + S.fPulled + S.fStraight; return t ? 100 * S.fPulled / t : 0; } },
      { key: 'FS', label: 'FOUL (STRAIGHT BACK) % of fouls', f: S => { const t = S.fLate + S.fPulled + S.fStraight; return t ? 100 * S.fStraight / t : 0; } }
    ];
    const stats = results.map(({ P, blocks }) => {
      const out = { id: P.id, name: P.name, totals: {} };
      ['innings', 'pitches', 'batters', 'games', 'K', 'BB', 'H', 'runs', 'immaculate', 'totK', 'totBB', 'totH', 'logK', 'logBB', 'logH']
        .forEach(k => { out.totals[k] = blocks.reduce((a, S) => a + S[k], 0); });
      METRICS.forEach(m => {
        const v = blocks.map(m.f);
        const mean = v.reduce((a, x) => a + x, 0) / v.length;
        const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) * (x - mean), 0) / (v.length - 1));
        out[m.key] = { mean: mean, half: 2.262 * sd / Math.sqrt(v.length) };
      });
      return out;
    });

    // ---- 9. report text -------------------------------------------------------
    const fmt = (x, d) => x.toFixed(d);
    log('');
    log('Settings: rec12, batter type RANDOM, ML off (none saved on localhost), home games, ' + BLOCKS + ' blocks x ' + INNINGS_PER_BLOCK +
        ' innings per pitcher, seeds ' + (BASE_SEED + 1) + '... (base ' + BASE_SEED + ' + pitcher*100 + block). Run time ' + minutes + ' min.');
    log('Values are the mean of the ' + BLOCKS + ' blocks ± the 95% range.');
    log('');
    log('Pitcher                     K/inn        H/inn        R/inn        BB/inn       P/inn        Whiff%       Strong%      Immac/100    Tunnels/inn  InTunnel/inn Partner/inn');
    stats.forEach(s => {
      const c = (k, d) => (fmt(s[k].mean, d) + '±' + fmt(s[k].half, d)).padEnd(13);
      log((s.id + ' ' + s.name + '                          ').slice(0, 27) + ' ' + c('K', 2) + c('H', 2) + c('R', 2) + c('BB', 2) + c('PI', 1) + c('WH', 1) + c('ST', 1) + c('IM', 1) + c('TU', 2) + c('TP', 2) + c('TD', 2));
    });
    log('');
    log('Foul mix (% of fouls)        LATE         PULLED       STRAIGHT BACK');
    stats.forEach(s => log((s.id + '                              ').slice(0, 29) + (fmt(s.FL.mean, 1) + '±' + fmt(s.FL.half, 1)).padEnd(13) +
      (fmt(s.FP.mean, 1) + '±' + fmt(s.FP.half, 1)).padEnd(13) + (fmt(s.FS.mean, 1) + '±' + fmt(s.FS.half, 1))));
    log('');
    log('On-screen totals vs pitch log (double count D2):  K screen/log   BB screen/log   H screen/log');
    stats.forEach(s => log('  ' + (s.id + '    ').slice(0, 4) + '                                          ' +
      (s.totals.totK + '/' + s.totals.logK).padEnd(14) + (s.totals.totBB + '/' + s.totals.logBB).padEnd(16) + (s.totals.totH + '/' + s.totals.logH)));
    log('');
    log('Pitches run: ' + rows.length + ' | app timers run by fast-forward: ' + timersRun + ' | animation frames blocked: ' + rafBlocked);
    log('Automatic checks: ' + (failures.length === 0 ? 'ALL PASSED' : failures.length + ' FAILED (first 30 shown above)'));

    // ---- 10. files: CSV of every pitch, and a results page with charts --------
    const header = 'pitcher,block,seed,game,inning,batter,batterType,hand,pitchInAB,countBefore,outsBefore,zone,zoneGroup,pitch,speed,outcome,contact,repStrong,foulsSB/PULL/LATE,strikeCounter,scoreAfter,tunnel,tunnelPartner,tunnelOverlap,plateGapIn,tunnelNo,tunnelStart';
    post({ type: 'harness-file', name: 'harness-baseline-' + BUILT_FOR + '.csv', mime: 'text/csv', text: header + '\n' + rows.join('\n') + '\n' });
    post({ type: 'harness-file', name: 'harness-baseline-' + BUILT_FOR + '.html', mime: 'text/html',
           text: resultsPage(stats, METRICS, { built: BUILT_FOR, blocks: BLOCKS, inningsPerBlock: INNINGS_PER_BLOCK, baseSeed: BASE_SEED,
                                               pitches: rows.length, checks: failures.length, minutes: minutes }) });
  } catch (e) {
    log('ERROR:', e && e.message ? e.message : String(e));
    log(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : '');
  } finally {
    restoreAll();
    log('Harness restored the app\'s timers, randomness and functions. No app files were changed.');
    report();
  }

  // ---- results page (self-contained HTML, no internet needed) ----------------
  function resultsPage(stats, METRICS, meta) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const colors = ['#4b6cb7', '#c0392b', '#8e44ad', '#16a085', '#d35400', '#2c3e50'];
    const chart = m => {
      const W = 640, rowH = 34, left = 210, right = 70, H = stats.length * rowH + 30;
      const max = Math.max(...stats.map(s => s[m.key].mean + s[m.key].half), 0.0001) * 1.1;
      const x = v => left + (W - left - right) * (v / max);
      let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(m.label) + '">';
      stats.forEach((s, i) => {
        const y = 10 + i * rowH, v = s[m.key].mean, h = s[m.key].half;
        svg += '<text x="' + (left - 8) + '" y="' + (y + 17) + '" text-anchor="end" class="lbl">' + esc(s.id + ' ' + s.name) + '</text>';
        svg += '<rect x="' + left + '" y="' + (y + 4) + '" width="' + Math.max(0, x(v) - left) + '" height="20" rx="3" fill="' + colors[i % colors.length] + '"/>';
        svg += '<line x1="' + x(Math.max(0, v - h)) + '" x2="' + x(v + h) + '" y1="' + (y + 14) + '" y2="' + (y + 14) + '" class="err"/>';
        svg += '<line x1="' + x(Math.max(0, v - h)) + '" x2="' + x(Math.max(0, v - h)) + '" y1="' + (y + 8) + '" y2="' + (y + 20) + '" class="err"/>';
        svg += '<line x1="' + x(v + h) + '" x2="' + x(v + h) + '" y1="' + (y + 8) + '" y2="' + (y + 20) + '" class="err"/>';
        svg += '<text x="' + (x(v + h) + 6) + '" y="' + (y + 18) + '" class="val">' + v.toFixed(2) + '</text>';
      });
      return svg + '</svg>';
    };
    let tbl = '<table><tr><th>Pitcher</th>' + METRICS.map(m => '<th>' + esc(m.label) + '</th>').join('') + '</tr>';
    stats.forEach(s => { tbl += '<tr><td>' + esc(s.id + ' ' + s.name) + '</td>' + METRICS.map(m => '<td>' + s[m.key].mean.toFixed(2) + ' ± ' + s[m.key].half.toFixed(2) + '</td>').join('') + '</tr>'; });
    tbl += '</table>';
    let d2 = '<table><tr><th>Pitcher</th><th>K screen / log</th><th>BB screen / log</th><th>H screen / log</th></tr>';
    stats.forEach(s => { d2 += '<tr><td>' + esc(s.id + ' ' + s.name) + '</td><td>' + s.totals.totK + ' / ' + s.totals.logK + '</td><td>' + s.totals.totBB + ' / ' + s.totals.logBB + '</td><td>' + s.totals.totH + ' / ' + s.totals.logH + '</td></tr>'; });
    d2 += '</table>';
    const show = ['K', 'H', 'R', 'ST', 'WH', 'IM', 'TU', 'PI', 'FL', 'FP', 'FS'];
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Harness Baseline ' + meta.built + '</title><style>' +
      ':root{--bg:#fff;--fg:#1a1a1a;--muted:#555;--line:#ddd;--err:#111}' +
      '@media (prefers-color-scheme: dark){:root{--bg:#15171a;--fg:#e8e8e8;--muted:#aaa;--line:#333;--err:#eee}}' +
      'body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:16px;max-width:980px}' +
      'h1{font-size:22px}h2{font-size:16px;margin:28px 0 4px}p{color:var(--muted);max-width:760px}' +
      '.lbl{font-size:12px;fill:var(--fg)}.val{font-size:11px;fill:var(--muted)}.err{stroke:var(--err);stroke-width:1.5}' +
      'table{border-collapse:collapse;font-size:12px;margin:8px 0;display:block;overflow-x:auto}th,td{border:1px solid var(--line);padding:4px 6px;text-align:left;white-space:nowrap}' +
      '</style></head><body>' +
      '<h1>Sim engine baseline — app commit ' + meta.built + '</h1>' +
      '<p>Six simulated pitchers, ' + meta.blocks + ' blocks × ' + meta.inningsPerBlock + ' innings each (' + (meta.blocks * meta.inningsPerBlock) + ' innings per pitcher), ' +
      'rec12 batters, batter type RANDOM, ML off, home games. Played through the app\'s own functions by tools/harness-engine.js on localhost. ' +
      'Bars show the mean of the blocks; whiskers show the 95% range. ' + meta.pitches + ' pitches; automatic checks failed: ' + meta.checks + '. Run time ' + meta.minutes + ' min. Base seed ' + meta.baseSeed + '.</p>' +
      show.map(k => { const m = METRICS.find(x => x.key === k); return '<h2>' + esc(m.label) + '</h2>' + chart(m); }).join('') +
      '<h2>All numbers (mean ± 95% range)</h2>' + tbl +
      '<h2>On-screen totals vs pitch log (double count D2)</h2>' + d2 +
      '</body></html>';
  }
})();

// 탈락과 점수, 캐릭터 애니메이션, 라운드 진행, 결과 화면, 점수판, 게임 틱
'use strict';

// ---------------- elimination & scoring ----------------
function eliminate(p) {
  p.alive = false;
  if (p.grabbing) drop(p);
  if (p.holdBall) dropBall(p);
  if (p.grabbedBy) { p.grabbedBy.grabbing = null; p.grabbedBy = null; }
  p.m.root.visible = false;
  if (state === 'menu') { p.respawnT = 1.2; return; }
  if (isTeamMode()) p.respawnT = RESPAWN_T;
  if (state !== 'play') return;
  const by = p.lastHitBy && p.lastHitBy !== p && simTime - p.lastHitAt < 5 ? p.lastHitBy : null;
  if (by && !isTeamMode()) { by.score += 1; by.roundPts += 1; by.roundElims += 1; }
  const v = p.name, recent = simTime - p.lastCauseAt < 3 ? p.lastCause : null;
  let f = 1 + Math.min(2.5, Math.hypot(p.vel.x, p.vel.z) / 7) + (p.ko ? 0.5 : 0), cap;
  if (!by && simTime - p.lastDashAt < 1.6) { f += 4; cap = `${v}, 돌진하다 혼자 입수`; }
  else if (recent === 'pend') { f += 3; cap = `${josa(v, '이', '가')} 비치볼에 맞고 날아갔다`; }
  else if (recent === 'sweep') { f += 2.5; cap = `${josa(v, '이', '가')} 회전 막대에 쓸려 나갔다`; }
  else if (recent === 'spring') { f += 2.5; cap = `${josa(v, '이', '가')} 스프링 타고 장외로`; }
  else if (recent === 'throw' && by) { f += 2; cap = `${josa(by.name, '이', '가')} ${josa(v, '을', '를')} 던져 버렸다`; }
  else if (recent === 'dash' && by) { f += 1.5; cap = `${by.name}의 몸통 박치기에 ${josa(v, '이', '가')} 퇴장`; }
  else if (by) { f += 1; cap = `${by.name}의 펀치에 ${josa(v, '이', '가')} 퇴장`; }
  else { f += 3; cap = `${josa(v, '이', '가')} 혼자 미끄러졌다`; }
  elims.push({ victim: p, by, tick: recording.length, funny: f, caption: cap });
  if (isTeamMode()) feed(by ? `${josa(by.name, '이', '가')} ${josa(v, '을', '를')} 빠뜨렸다` : `${josa(v, '이', '가')} 물에 빠졌다`);
  else feed(by ? `${josa(by.name, '이', '가')} ${josa(v, '을', '를')} 빠뜨렸다` : `${josa(v, '이', '가')} 혼자 빠졌다`);
}
function feed(text) {
  if (mode === 'host') { feedLog.push({ i: ++feedSeq, t: text }); if (feedLog.length > 4) feedLog.shift(); }
  showFeed(text);
}
function showFeed(text) {
  const el = document.createElement('div'); el.textContent = text;
  const box = $('#feed'); box.prepend(el);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, 3200);
}
function kickoffReset() {
  for (const p of players) { const [x, z] = teamSpawn(p); resetPlayer(p, x, z); p.yaw = p.team === 0 ? Math.PI / 2 : -Math.PI / 2; }
  balls.forEach(b => placeBall(b, b.i));
}
function teamRules(dt) {
  if (gameMode === 'soccer') {
    if (goalFreeze > 0) {
      goalFreeze -= dt;
      if (goalFreeze <= 0) {
        if (teamScore[0] >= SOCCER_WIN || teamScore[1] >= SOCCER_WIN) { endRound(); return; }
        kickoffReset(); setBanner('', '');
      }
      return;
    }
    const b = balls[0], g = map.goal;
    if (b && b.alive && b.pos.y < 2.7 && Math.abs(b.pos.z) < g.gw) {
      let t = -1;
      if (b.pos.x > g.L + 0.5) t = 0; else if (b.pos.x < -(g.L + 0.5)) t = 1;
      if (t >= 0) {
        teamScore[t]++;
        goalFreeze = 1.8;
        const who = b.lastTouch;
        setBanner(`${TEAM_NAMES[t]} 골!`, who ? (who.team === t ? `${who.name}의 슛` : `${who.name}의 자책골`) : '');
        feed(`${TEAM_NAMES[t]} 득점, ${teamScore[0]} 대 ${teamScore[1]}`);
        fx('goal', b.pos.x, b.pos.y, b.pos.z);
      }
    }
  } else if (gameMode === 'collect') {
    const c = [0, 0];
    for (const b of balls) for (let t = 0; t < 2; t++) if (b.alive && !b.heldBy && inBase(b, map.bases[t])) c[t]++;
    if (c[0] !== teamScore[0] || c[1] !== teamScore[1]) {
      if (c[0] > teamScore[0] || c[1] > teamScore[1]) fx('score', 0, 0, 0);
      teamScore = c;
    }
    if (c[0] >= 4 || c[1] >= 4) endRound();
  }
}

// ---------------- visuals ----------------
function animate(p, dt) {
  const v = p.vis, st = p.st;
  if (!p.alive) { st[18] = 0; return; }
  const dvx = p.vel.x - p.prevVel.x, dvz = p.vel.z - p.prevVel.z;
  p.prevVel.copy(p.vel);
  const spd = Math.hypot(p.vel.x, p.vel.z);
  let tx = p.vel.x * 0.035, tz = p.vel.z * 0.035;
  if (!p.grounded) { tx *= 0.5; tz *= 0.5; }
  if (p.dashT > 0) { tx *= 2; tz *= 2; }
  v.lvx += ((tx - v.lx) * 75 - v.lvx * 5.5) * dt - dvx * 0.6 * (Math.abs(dvx) > 0.5 ? 1 : 0.45);
  v.lvz += ((tz - v.lz) * 75 - v.lvz * 5.5) * dt - dvz * 0.6 * (Math.abs(dvz) > 0.5 ? 1 : 0.45);
  v.lx = clamp(v.lx + v.lvx * dt, -1.1, 1.1); v.lz = clamp(v.lz + v.lvz * dt, -1.1, 1.1);
  v.hvx += (-v.hx * 95 - v.hvx * 4.5) * dt - dvx * 0.07;
  v.hvz += (-v.hz * 95 - v.hvz * 4.5) * dt - dvz * 0.07;
  v.hx = clamp(v.hx + v.hvx * dt, -0.32, 0.32); v.hz = clamp(v.hz + v.hvz * dt, -0.32, 0.32);
  const isLimp = limp(p);
  v.ko += ((isLimp ? 1 : 0) - v.ko) * (1 - Math.exp(-(isLimp ? 12 : 6) * dt));

  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  const llx = v.lx * cy - v.lz * sy, llz = v.lx * sy + v.lz * cy;
  const hlx = v.hx * cy - v.hz * sy, hlz = v.hx * sy + v.hz * cy;
  let tiltX = llz, tiltZ = -llx;
  if (p.grabbedBy && !isLimp) tiltZ += 0.7 + Math.sin(simTime * 18) * 0.15;
  const flop = p.ko ? 0 : Math.sin(simTime * 9 + p.i) * 0.25 * v.ko;
  tiltX = tiltX * (1 - v.ko) + -1.45 * v.ko;
  tiltZ = tiltZ * (1 - v.ko) + (Math.sin(simTime * 2 + p.i) * 0.08 + flop) * v.ko;
  // floppy walk: waddle side to side, bob forward, and stagger a little on every step
  const walking = p.grounded && !isLimp && !p.grabbedBy;
  v.wob = (v.wob || 0) + ((walking ? Math.min(1, spd / 4.5) : 0) - (v.wob || 0)) * (1 - Math.exp(-6 * dt));
  const w = v.wob * (1 - v.ko), wph = v.ph;
  const wm = p.grabbing && !isLimp ? CARRY_SHAKE : 1;
  tiltZ += clamp((Math.sin(wph) * 0.24 + Math.sin(simTime * 7.3 + p.i * 2.1) * 0.07) * w * wm, -0.95, 0.95);
  tiltX += clamp((0.1 + Math.abs(Math.cos(wph)) * 0.12 + Math.sin(simTime * 5.1 + p.i) * 0.05) * w * wm, -0.8, 0.8);
  if (walking && spd < 0.6) tiltZ += clamp(Math.sin(simTime * 2.2 + p.i) * 0.04 * wm + (wm > 1 ? Math.sin(simTime * 5.3 + p.i) * 0.12 : 0), -0.6, 0.6);
  const abOn = p.abT > 0 && !isLimp;
  if (abOn && p.ab === 'slide') { tiltX = 1.35; tiltZ = Math.sin(simTime * 9) * 0.12; }
  if (abOn && p.ab === 'sprint') tiltX += 0.3;
  v.sc = (v.sc || 1) + ((abOn && p.ab === 'heavy' ? 1.35 : 1) - (v.sc || 1)) * (1 - Math.exp(-10 * dt));

  const t = simTime;
  let L, Rh;
  if (p.grounded) { v.ph += spd * dt * 2.6; v.amp += (Math.min(1, spd / 5) - v.amp) * 0.2; }
  else { v.ph += dt * 14; v.amp += (0.45 - v.amp) * 0.1; }
  const sw = Math.sin(v.ph) * v.amp;
  if (isLimp || v.ko > 0.5) { L = [-0.8, 0.45 + Math.sin(t * 11) * 0.1 * (p.ko ? 0 : 1), 0.25]; Rh = [0.8, 0.45 + Math.cos(t * 13) * 0.1 * (p.ko ? 0 : 1), 0.25]; }
  else if (p.grabbedBy) { L = [-0.65, 1.25 + Math.sin(t * 22) * 0.2, 0.2]; Rh = [0.65, 1.25 + Math.cos(t * 22) * 0.2, 0.2]; }
  else if (p.grabbing || p.holdBall) { L = [-0.3, 1.15, 0.75]; Rh = [0.3, 1.15, 0.75]; }
  else if (p.punchT > 0) {
    const e = Math.sin((1 - p.punchT / 0.28) * Math.PI);
    const hit = [0.18, 1.0, 0.35 + e * 0.9], guard = [0.35, 1.05, 0.4];
    if (p.punchHand) { Rh = hit; L = [-guard[0], guard[1], guard[2]]; } else { L = [-hit[0], hit[1], hit[2]]; Rh = guard; }
  }
  else if (p.grabWhiff > 0) { L = [-0.28, 0.95, 0.95]; Rh = [0.28, 0.95, 0.95]; }
  else if (p.dashT > 0) { L = [-0.55, 0.85, -0.55]; Rh = [0.55, 0.85, -0.55]; }
  else if (!p.grounded) { L = [-0.72, 1.35 + Math.sin(t * 20) * 0.15, 0]; Rh = [0.72, 1.35 + Math.cos(t * 20) * 0.15, 0]; }
  else {
    const out = Math.abs(Math.cos(v.ph)) * 0.14 * v.amp;
    L = [-0.64 - out, 0.66 + Math.abs(sw) * 0.2, 0.05 + sw * 0.42];
    Rh = [0.64 + out, 0.66 + Math.abs(sw) * 0.2, 0.05 - sw * 0.42];
  }
  const dlx = dvx * cy - dvz * sy, dlz = dvx * sy + dvz * cy;
  const loose = !isLimp && p.grounded && spd > 0.6 && !(p.punchT > 0) && !p.grabbing && !p.holdBall;
  const kH = isLimp ? 90 : loose ? 110 : 260, dH = isLimp || loose ? 6 : 14;
  [L, Rh].forEach((tg, h) => {
    const hp = v.hands[h], hv = v.hv[h];
    for (let a = 0; a < 3; a++) hv[a] += ((tg[a] - hp[a]) * kH - hv[a] * dH) * dt;
    hv[0] -= dlx * 0.5; hv[2] -= dlz * 0.5;
    for (let a = 0; a < 3; a++) hp[a] += hv[a] * dt;
  });
  const sqT = p.grounded && !isLimp ? (spd < 0.5 ? 1 + Math.sin(t * 3 + p.i) * 0.025 : 1 - Math.abs(Math.sin(v.ph)) * 0.08 * Math.min(1, spd / 5)) : 1;
  v.sqv += ((sqT - v.sq) * 300 - v.sqv * 12) * dt;
  v.sq = clamp(v.sq + v.sqv * dt, 0.6, 1.3);

  st[0] = p.pos.x; st[1] = p.pos.y; st[2] = p.pos.z; st[3] = p.yaw;
  st[4] = tiltX; st[5] = tiltZ;
  st[6] = hlx + Math.sin(wph) * 0.09 * w; st[7] = Math.abs(Math.sin(wph)) * 0.07 * w; st[8] = hlz + Math.cos(wph * 2) * 0.04 * w;
  st[9] = v.hands[0][0]; st[10] = v.hands[0][1]; st[11] = v.hands[0][2];
  st[12] = v.hands[1][0]; st[13] = v.hands[1][1]; st[14] = v.hands[1][2];
  st[15] = v.ph; st[16] = p.grounded ? v.amp : 0.3; st[17] = p.ko ? 1 : 0; st[18] = 1; st[19] = v.sq; st[20] = v.sc;
  if (abOn && p.ab === 'spin') st[3] = p.yaw + simTime * 24;
}
function applyState(m, s, time) {
  m.root.visible = s[18] > 0.5;
  if (!m.root.visible) return;
  m.root.position.set(s[0], s[1], s[2]);
  m.yawG.rotation.y = s[3];
  m.tiltG.rotation.set(s[4], 0, s[5]);
  m.headG.position.set(s[6], 1.42 + s[7], s[8]);
  m.hands[0].position.set(s[9], s[10], s[11]);
  m.hands[1].position.set(s[12], s[13], s[14]);
  const ph = s[15], amp = s[16];
  m.feet[0].position.set(-0.22, 0.1 + Math.max(0, Math.sin(ph)) * 0.14 * amp, 0.06 + Math.cos(ph) * 0.22 * amp);
  m.feet[1].position.set(0.22, 0.1 + Math.max(0, -Math.sin(ph)) * 0.14 * amp, 0.06 - Math.cos(ph) * 0.22 * amp);
  const ko = s[17] > 0.5;
  m.eyes.visible = !ko; m.xEyes.visible = ko; m.stars.visible = ko;
  if (ko) m.stars.rotation.y = time * 5;
  const sq = s[19];
  m.tiltG.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
  m.root.scale.setScalar(s[20] || 1);
}

// ---------------- flow ----------------
function spawnPlayers() {
  if (isTeamMode()) { kickoffReset(); return; }
  const sp = map.spawns.slice().sort(() => Math.random() - 0.5);
  players.forEach((p, k) => { const [x, z] = sp[k % sp.length]; resetPlayer(p, x, z); });
}
function showMenu() {
  $('#menu').hidden = false; $('#hud').hidden = true; $('#result').hidden = true; $('#replay').hidden = true;
  setBanner('', '');
}
function startDemo() {
  replay = null;
  clearPlayers();
  gameMode = 'battle';
  const dc = [settings.char, ...freeChars([settings.char])];
  for (let i = 0; i < 4; i++) players.push(makePlayer(i, 'cpu', i === 0 ? '나' : 'CPU', null, dc[i]));
  players.forEach((p, k) => p.lab.visible = k === 0);
  setupRoundWorld('battle', 'none', Math.floor(Math.random() * 1e9));
  spawnPlayers();
  state = 'menu';
  recordOn = false;
  showMenu();
  syncModeUI();
  renderLobby();
}
// roster: array of { kind: 'local'|'remote'|'cpu', peer }
function startMatch(roster) {
  if (document.activeElement) document.activeElement.blur();
  clearPlayers();
  gameMode = settings.mode;
  roster.forEach((r, i) => {
    const tag = r.kind === 'local' ? '나' : r.kind === 'remote' ? 'P' + (i + 1) : 'CPU';
    const p = makePlayer(i, r.kind, tag, r.peer, r.ch);
    if (r.kind === 'remote') { const pr = net && net.peerMap.get(r.peer); const inp = pr && pr.presence && pr.presence.inp; if (inp) p.lastCnt = { j: num(inp.j), p: num(inp.p), g: num(inp.g), d: num(inp.d), a: num(inp.a), b: num(inp.b) }; }
    players.push(p);
  });
  round = 0; teamWins = [0, 0]; lastEv = 'none';
  netFx = []; feedLog = [];
  if (mode === 'host') net.gid = Math.random().toString(36).slice(2, 10);
  buildChips();
  $('#menu').hidden = true; $('#hud').hidden = false; $('#result').hidden = true;
  nextRound();
}
const settings = { mode: 'battle', char: 0 };
function freeChars(taken) { return DEFS.map((_, k) => k).filter(k => !taken.includes(k)).sort(() => Math.random() - 0.5); }
function soloRoster() {
  const r = [{ kind: 'local', ch: settings.char }];
  const free = freeChars([settings.char]);
  for (let i = 0; i < cpuCount; i++) r.push({ kind: 'cpu', ch: free[i] });
  return r;
}
// each seat's wished character, first come first served; clashes get the next free one
function lobbyChars() {
  const out = [];
  net.seats.slice(0, 4).forEach((pe, i) => {
    const pr = net.peerMap.get(pe);
    let want = i === 0 ? settings.char : num(pr && pr.presence && pr.presence.ch, -1);
    if (!(want >= 0 && want < DEFS.length) || out.includes(want)) want = DEFS.map((_, k) => k).find(k => !out.includes(k));
    out.push(want);
  });
  return out;
}
function hostRoster() {
  const chs = lobbyChars();
  const r = net.seats.slice(0, 4).map((pe, i) => ({ kind: i === 0 ? 'local' : 'remote', peer: pe, ch: chs[i] }));
  if ($('#fillChk').checked) { const free = freeChars(chs); let k = 0; while (r.length < 4) r.push({ kind: 'cpu', ch: free[k++] }); }
  return r;
}
function restartMatch() {
  if (mode === 'host') startMatch(hostRoster());
  else if (mode === 'solo') startMatch(soloRoster());
}
function pickEvent() {
  if (gameMode !== 'battle') return 'none';
  const opts = ['none', 'ice', 'spin', 'spring', 'pend', 'hex', 'hex'].filter(e => e !== lastEv);
  return opts[Math.floor(Math.random() * opts.length)];
}
function nextRound() {
  round++;
  const e = pickEvent(); lastEv = e;
  mapSeed = Math.floor(Math.random() * 1e9);
  setupRoundWorld(gameMode, e, mapSeed);
  spawnPlayers();
  players.forEach(p => { p.roundPts = 0; p.roundElims = 0; });
  recording = []; fxLog = []; elims = []; recordOn = false; repInfo = null;
  teamScore = [0, 0]; roundWinner = -1; goalFreeze = 0;
  roundTime = ROUND_TIME; cdT = 3.4; lastCd = 4;
  state = 'countdown';
  $('#result').hidden = true; $('#replay').hidden = true; $('#hud').hidden = false;
  updateRoundLabels();
  setBanner(...roundBanner());
}
function roundBanner() {
  if (gameMode === 'soccer') return ['축구', `${map.name}. 공을 펀치해서 상대 골대에 넣으세요. 3골을 먼저 넣으면 라운드 승리입니다.`];
  if (gameMode === 'collect') return ['공 가져오기', `${map.name}. 공 5개 중 4개를 우리 팀 원 안에 모으면 바로 이깁니다.`];
  return ev === 'none' ? [`${map.name} 경기장`, '상대를 물에 빠뜨리세요.'] : [EVENTS[ev].name, `${map.name} 경기장. ${EVENTS[ev].desc}`];
}
function updateRoundLabels() {
  $('#roundLbl').textContent = `라운드 ${round}/${ROUNDS}`;
  const parts = [MODES[gameMode].name, map ? map.name : ''];
  if (ev !== 'none' && EVENTS[ev]) parts.push(EVENTS[ev].name);
  $('#eventLbl').textContent = parts.filter(Boolean).join(', ');
  $('#teamScore').hidden = !isTeamMode();
}
function endRound() {
  if (state !== 'play') return;
  state = 'roundEnd'; endT = 1.5;
  fx('whistle', 0, 0, 0);
  if (isTeamMode()) {
    roundWinner = teamScore[0] > teamScore[1] ? 0 : teamScore[1] > teamScore[0] ? 1 : -1;
    if (roundWinner >= 0) {
      teamWins[roundWinner]++;
      players.forEach(p => { if (p.team === roundWinner) { p.score += 1; p.roundPts += 1; } });
      setBanner(`${TEAM_NAMES[roundWinner]} 승리!`, gameMode === 'soccer' ? `${teamScore[0]} 대 ${teamScore[1]}` : `공 ${teamScore[roundWinner]}개를 모았습니다`);
    } else setBanner('무승부!', '');
    return;
  }
  const alive = players.filter(p => p.alive);
  alive.forEach(p => { p.score += 1; p.roundPts += 1; });
  if (alive.length === 1) setBanner(`${alive[0].name} 생존!`, '');
  else if (alive.length === 0) setBanner('전원 입수!', '');
  else setBanner('시간 종료!', '');
}
function finishRound() {
  recordOn = false;
  setBanner('', '');
  const best = elims.slice().sort((a, b) => b.funny - a.funny)[0];
  if (best && recording.length > 10) startReplay(best);
  else showResult();
}
function startReplay(e) {
  const start = Math.max(0, e.tick - 150), end = Math.min(recording.length - 1, e.tick + 40);
  replay = { start, end, idx: start, prev: start, victim: e.victim.i, caption: e.caption };
  repInfo = { v: e.victim.i, cap: e.caption };
  state = 'replay';
  $('#hud').hidden = true; $('#replay').hidden = false;
  $('#replayCap').textContent = e.caption;
  $('#replaySkip').hidden = mode === 'client';
  if (map && map.hex) for (const t of map.hex.tiles) {
    if (t.trigTick !== undefined && t.trigTick <= start) { t.vt = 99; if (t.mesh) t.mesh.visible = false; }
    else resetTileVisual(t);
  }
}
function stepReplay(dt) {
  const r = replay;
  r.idx += dt * 60 * 0.55;
  const fi = Math.min(r.end, Math.floor(r.idx));
  for (const l of fxLog) if (l.tick > r.prev && l.tick <= fi) fx(l.kind, l.x, l.y, l.z, false);
  if (map && map.hex) for (const t of map.hex.tiles) if (t.trigTick !== undefined && t.trigTick > r.prev && t.trigTick <= fi) t.vt = 0;
  r.prev = fi;
  applyFrame(recording[fi]);
  if (r.idx >= r.end) endReplay();
}
function endReplay() {
  if (state !== 'replay') return;
  replay = null;
  $('#replay').hidden = true;
  if (mode === 'client') { state = 'waitResult'; $('#hud').hidden = false; return; }
  showResult();
}
function recordFrame() {
  const fr = new Float32Array(players.length * NS + NH + NB * 4);
  players.forEach((p, k) => fr.set(p.st, k * NS));
  fr.set(hazardState(), players.length * NS);
  const o = players.length * NS + NH;
  balls.forEach((b, k) => { fr[o + k * 4] = b.pos.x; fr[o + k * 4 + 1] = b.pos.y; fr[o + k * 4 + 2] = b.pos.z; fr[o + k * 4 + 3] = b.alive ? 1 : 0; });
  recording.push(fr);
}
function applyFrame(fr) {
  players.forEach((p, k) => applyState(p.m, fr.subarray(k * NS, k * NS + NS), simTime));
  applyHazards(fr.subarray(players.length * NS));
  const o = players.length * NS + NH;
  balls.forEach((b, k) => { b.mesh.visible = fr[o + k * 4 + 3] > 0.5; b.mesh.position.set(fr[o + k * 4], fr[o + k * 4 + 1], fr[o + k * 4 + 2]); });
}
function showResult() {
  state = 'result';
  $('#hud').hidden = false; $('#replay').hidden = true;
  const final = round >= ROUNDS;
  const team = isTeamMode();
  const sorted = players.slice().sort((a, b) => team ? (a.team - b.team) || (a.i - b.i) : b.score - a.score);
  const topScore = Math.max(...players.map(p => p.score), 0);
  const winners = players.filter(p => p.score === topScore);
  if (team) {
    const tw = teamWins, lead = tw[0] > tw[1] ? 0 : tw[1] > tw[0] ? 1 : -1;
    if (final) {
      $('#resTitle').textContent = lead >= 0 ? `${TEAM_NAMES[lead]} 우승!` : '무승부!';
      $('#resSub').textContent = `${ROUNDS}라운드 결과 ${TEAM_NAMES[0]} ${tw[0]}승, ${TEAM_NAMES[1]} ${tw[1]}승`;
      play('win');
    } else {
      $('#resTitle').textContent = roundWinner >= 0 ? `라운드 ${round}: ${TEAM_NAMES[roundWinner]} 승리` : `라운드 ${round}: 무승부`;
      $('#resSub').textContent = `${TEAM_NAMES[0]} ${tw[0]}승, ${TEAM_NAMES[1]} ${tw[1]}승. 먼저 많이 이긴 팀이 우승합니다.`;
    }
  } else if (final) {
    $('#resTitle').textContent = winners.length > 1 ? '공동 우승!' : `${winners[0].name} 우승!`;
    $('#resSub').textContent = winners.length > 1 ? `${winners.map(w => w.name).join(', ')}, 모두 ${topScore}점입니다.` : `${ROUNDS}라운드 합계 ${topScore}점`;
    play('win');
  } else {
    $('#resTitle').textContent = `라운드 ${round} 결과`;
    $('#resSub').textContent = '다음 라운드는 새 경기장에서 열립니다.';
  }
  $('#resNext').textContent = final ? '다시 하기' : '다음 라운드';
  const list = $('#resList'); list.innerHTML = '';
  sorted.forEach(p => {
    const li = document.createElement('li');
    if (!team && p.score === topScore) li.className = 'top';
    if (team && p.team === roundWinner && !final) li.className = 'top';
    li.style.setProperty('--pc', p.def.css);
    const bits = [];
    if (team) { if (p.roundPts) bits.push('팀 승리'); }
    else { if (p.roundElims) bits.push(`빠뜨림 ${p.roundElims}`); if (p.roundPts > p.roundElims) bits.push('생존 1'); }
    const dot = document.createElement('span'); dot.className = 'dot';
    const nm = document.createElement('span'); nm.textContent = `${p.name} `;
    const tg = document.createElement('small'); tg.textContent = team ? `${p.tag}, ${TEAM_NAMES[p.team]}` : p.tag; nm.appendChild(tg);
    const plus = document.createElement('span'); plus.className = 'plus';
    plus.textContent = bits.length ? `+${p.roundPts} (${bits.join(', ')})` : '+0';
    const tot = document.createElement('span'); tot.className = 'total'; tot.textContent = p.score;
    li.append(dot, nm, plus, tot);
    list.appendChild(li);
  });
  const isClient = mode === 'client';
  $('#resNext').hidden = isClient;
  $('#resWait').hidden = !isClient;
  $('#resWait').textContent = final ? '방장이 다시 하기를 누르면 새 경기가 시작됩니다.' : '방장이 다음 라운드를 시작하면 이어집니다.';
  $('#resMenu').textContent = mode === 'solo' ? '처음 화면으로' : mode === 'host' ? '대기실로 돌아가기' : '방 나가기';
  $('#result').hidden = false;
  if (!isClient) setTimeout(() => $('#resNext').focus({ preventScroll: true }), 50);
}
function setBanner(big, small) {
  curBanner = [big, small];
  const b = $('#bannerBig'), s = $('#bannerSmall');
  if (b.textContent !== big) {
    b.textContent = big;
    b.classList.remove('pop'); void b.offsetWidth; if (big) b.classList.add('pop');
  }
  s.textContent = small;
}

// ---------------- HUD ----------------
function buildChips() {
  const box = $('#chips'); box.innerHTML = '';
  players.forEach(p => {
    const el = document.createElement('div');
    el.className = 'chip' + (p.kind === 'local' || p.kind === 'me' ? ' me' : '') + (isTeamMode() ? ' team' + p.team : '');
    el.style.setProperty('--pc', p.def.css);
    const top = document.createElement('div'); top.className = 'chip-top';
    const nm = document.createElement('span'); nm.textContent = p.name;
    const tg = document.createElement('span'); tg.className = 'chip-tag'; tg.textContent = p.tag;
    top.append(nm, tg);
    const row = document.createElement('div'); row.className = 'chip-row';
    const sc = document.createElement('span'); sc.className = 'chip-score'; sc.textContent = '0';
    const da = document.createElement('span'); da.className = (p.kind === 'local' || p.kind === 'me') ? 'chip-dash' : 'chip-team'; da.textContent = (p.kind === 'local' || p.kind === 'me') ? '돌진' : (isTeamMode() ? TEAM_NAMES[p.team] : '');
    const ab = document.createElement('span'); ab.className = 'chip-dash'; ab.textContent = (p.kind === 'local' || p.kind === 'me') ? AB[p.ab].name : '';
    row.append(sc, da, ab);
    const bar = document.createElement('div'); bar.className = 'chip-bar'; const fill = document.createElement('i'); bar.appendChild(fill);
    el.append(top, row, bar);
    p.ui = { el, score: sc, bar: fill, dash: da, ab, last: -1 };
    box.appendChild(el);
  });
  $('#netLbl').hidden = mode === 'solo';
  if (net) $('#netLbl').textContent = `방 ${net.code}`;
}
// faded label with seconds left while on cooldown, full colour when ready
function setCool(el, label, cd) {
  const t = cd > 0 ? `${label} ${Math.ceil(cd)}` : label;
  if (el.textContent !== t) el.textContent = t;
  el.classList.toggle('ready', cd <= 0);
}
let teamScoreKey = '';
function updateHUD() {
  if (state === 'menu') return;
  for (const p of players) {
    if (!p.ui) continue;
    if (p.ui.last !== p.score) { p.ui.score.textContent = p.score; p.ui.last = p.score; }
    p.ui.bar.style.width = (p.ko ? 100 : p.dizzy) + '%';
    p.ui.el.classList.toggle('ko', !!p.ko);
    p.ui.el.classList.toggle('out', !p.alive);
    if (p.kind === 'local' || p.kind === 'me') { setCool(p.ui.dash, '돌진', p.dashCd); setCool(p.ui.ab, AB[p.ab].name, p.abCd); }
  }
  const tEl = $('#timer');
  const tt = state === 'countdown' ? ROUND_TIME : Math.max(0, Math.ceil(roundTime));
  if (tEl.textContent !== String(tt)) tEl.textContent = tt;
  tEl.classList.toggle('low', state === 'play' && roundTime <= 10);
  if (isTeamMode()) {
    const key = teamScore.join(':') + gameMode;
    if (key !== teamScoreKey) {
      teamScoreKey = key;
      const el = $('#teamScore'); el.textContent = '';
      const a = document.createElement('b'); a.className = 't0'; a.textContent = `빨강 ${teamScore[0]}`;
      const b = document.createElement('b'); b.className = 't1'; b.textContent = `${teamScore[1]} 파랑`;
      el.append(a, document.createTextNode(gameMode === 'collect' ? ' 공 ' : ' : '), b);
    }
  }
}

// ---------------- authoritative tick (solo & host) ----------------
function tick(dt) {
  simTime += dt;
  updateHazards(dt);
  if (state === 'countdown') {
    cdT -= dt;
    const n = Math.ceil(cdT);
    if (cdT < 2.6 && n !== lastCd && n > 0 && n <= 3) { lastCd = n; setBanner(String(n), ''); fx('tick', 0, 0, 0); }
    if (cdT <= 0) {
      state = 'play'; recordOn = true; setBanner('시작!', ''); fx('go', 0, 0, 0);
      setTimeout(() => { if (state === 'play' && curBanner[0] === '시작!') setBanner('', ''); }, 700);
    }
  }
  const live = state === 'play' || state === 'menu' || state === 'roundEnd';
  if (live) {
    const inputs = players.map(p => {
      if (p.kind === 'cpu') return aiInput(p, dt);
      if (state === 'roundEnd') return NO_INPUT;
      if (p.kind === 'remote') return remoteInput(p);
      return keyboardInput();
    });
    players.forEach((p, k) => stepPlayer(p, inputs[k], dt));
    collidePairs();
    players.forEach(hazardCollide);
    if (map.hex) updateHexSolid(dt);
  }
  if (live || state === 'countdown') { balls.forEach(b => stepBall(b, dt)); collideBalls(); }
  players.forEach(p => animate(p, dt));
  if (recordOn) recordFrame();
  pressed.clear();
  if (state === 'play') {
    roundTime -= dt;
    if (isTeamMode()) {
      teamRules(dt);
      if (state === 'play' && roundTime <= 0) endRound();
    } else {
      const alive = players.filter(p => p.alive).length;
      if (roundTime <= 0 || alive <= 1) endRound();
    }
  } else if (state === 'roundEnd') {
    endT -= dt;
    if (endT <= 0) finishRound();
  }
  if (state === 'menu' || (isTeamMode() && (state === 'play' || state === 'roundEnd'))) {
    for (const p of players) {
      if (p.alive) continue;
      p.respawnT -= dt;
      if (p.respawnT <= 0) respawnPlayer(p);
    }
  }
}

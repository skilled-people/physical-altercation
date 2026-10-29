// 게임 상태, 사라지는 육각판, 전투, 잡기와 던지기, 컴퓨터 AI, 물리, 리듬 반격, 캐릭터 능력, 공 물리
'use strict';

// ---------------- state ----------------
let mode = 'solo';             // solo | host | client
let gameMode = 'battle';       // battle | soccer | collect
let state = 'menu';            // menu | countdown | play | roundEnd | replay | result | waitResult
let players = [];
let ev = 'none';
let simTime = 0, roundTime = ROUND_TIME, cdT = 0, endT = 0, round = 0, lastCd = 0;
let spinA = 0, sweepA = 0, sweepW = 0.8, pendT = 0, pendTheta = 0, pendAxis = 0;
const pendPos = new V3(0, PIV - PL, 0), pendVel = new V3();
let recording = [], fxLog = [], elims = [];
let recordOn = false;
let shake = 0;
let replay = null, repInfo = null;
let curBanner = ['', ''];
let cpuCount = 3;
let netFx = [], fxSeq = 0, feedLog = [], feedSeq = 0;
let teamScore = [0, 0], teamWins = [0, 0], roundWinner = -1, goalFreeze = 0, mapSeed = 1, lastEv = 'none';
const isTeamMode = () => gameMode !== 'battle';
const joy = { active: false, id: null, cx: 0, cy: 0, x: 0, z: 0 };
// third-person camera state: yaw is the direction the camera looks along the ground
let camYaw = Math.PI, camPitch = 0.42, lastCamInput = 0, camRound = -1, camSnap = false, camSpec = null;
const camIn = { x: 0, z: 0 };

function fwd(yaw) { return { x: Math.sin(yaw), z: Math.cos(yaw) }; }
function newAI() { return { think: 0, target: null, jitter: 0, punchWait: 0 }; }
function isFloor(x, z, y) {
  if (!map) return false;
  if (map.hex) return hexFloorAI(x, z, y === undefined ? 0 : y);
  if (map.spin) { const c = Math.cos(spinA), s = Math.sin(spinA); return floorTest(map, x * c - z * s, x * s + z * c); }
  return floorTest(map, x, z);
}

// ---------------- disappearing hexagon tiles ----------------
const hexMats = [[toon(0xffd23f), toon(0xffe68a)], [toon(0x7fd6ff), toon(0xb3e8ff)]];
const hexWarnA = toon(0xffffff), hexWarnB = toon(0xff6b8b);
function hexLookup(x, z, li) {
  const H = map.hex, s = H.s;
  const qf = (Math.sqrt(3) / 3 * x - z / 3) / s, rf = (2 / 3 * z) / s, yf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), c = Math.round(yf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), dc = Math.abs(c - yf);
  if (dq > dr && dq > dc) q = -r - c; else if (dr > dc) r = -q - c;
  return H.index.get(li + ':' + q + ',' + r) || null;
}
// tile a body standing at foot height y is resting on (still solid while it shakes)
function hexAt(x, z, y) {
  const H = map.hex;
  for (let li = 0; li < H.layers.length; li++) {
    const L = H.layers[li];
    if (y <= L.y + 0.0001 && y > L.y - 0.7) { const t = hexLookup(x, z, li); if (t && t.state < 2) return t; }
  }
  return null;
}
// for the computer players: is there an untouched tile on the floor they are on?
function hexFloorAI(x, z, y) {
  const H = map.hex;
  for (let li = 0; li < H.layers.length; li++) {
    if (H.layers[li].y <= y + 0.5) { const t = hexLookup(x, z, li); return !!t && t.state === 0; }
  }
  return false;
}
function triggerTile(t, visualOnly) {
  if (t.state !== 0) return;
  t.state = 1; t.timer = HEX_DELAY; t.vt = 0; t.trigTick = recording.length;
  if (!visualOnly) map.hex.trig.push(t.i);
}
function updateHexSolid(dt) {
  for (const t of map.hex.tiles) if (t.state === 1) { t.timer -= dt; if (t.timer <= 0) t.state = 2; }
}
function resetTileVisual(t) {
  t.vt = -1;
  if (!t.mesh) return;
  t.mesh.visible = true; t.mesh.material = hexMats[t.li][t.shade];
  t.mesh.position.set(t.x, t.y - 0.25, t.z); t.mesh.scale.setScalar(1);
}
function updateTiles(dt) {
  if (!map || !map.hex) return;
  for (const t of map.hex.tiles) {
    if (t.vt < 0 || !t.mesh || !t.mesh.visible) continue;
    t.vt += dt;
    const me = t.mesh;
    if (t.vt < HEX_DELAY) {
      me.material = (Math.floor(t.vt * 14) % 2) ? hexWarnA : hexWarnB;
      me.position.set(t.x + Math.sin(t.vt * 70) * 0.05, t.y - 0.25, t.z + Math.cos(t.vt * 63) * 0.05);
    } else {
      const f = t.vt - HEX_DELAY;
      me.material = hexWarnB;
      me.position.set(t.x, t.y - 0.25 - f * f * 14, t.z);
      me.scale.setScalar(Math.max(0.05, 1 - f * 1.1));
      if (f > 0.85) me.visible = false;
    }
  }
}
function inSolid(x, z, pad) {
  if (!map) return false;
  return map.blocks.some(b => Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad) || map.pillars.some(p => Math.hypot(x - p.x, z - p.z) < p.r + pad);
}
function groundAt(x, z, y) {
  if (map.hex) { const t = hexAt(x, z, y); return t ? t.y : null; }
  let best = null;
  if (y <= 0.0001 && y > -0.7 && isFloor(x, z)) best = 0;
  for (const b of map.blocks) {
    if (b.net) continue;
    if (Math.abs(x - b.x) <= b.hw && Math.abs(z - b.z) <= b.hd && y <= b.h + 0.0001 && y > b.h - 0.7 && (best === null || b.h > best)) best = b.h;
  }
  return best;
}
// push a vertical body (foot at footY, radius rad) out of blocks/pillars
function pushOut(pos, rad, vel, footY, bounce, prev, isBall) {
  let hit = false;
  for (const b of map.blocks) {
    const bh = isBall && (b.rail || b.net) ? Math.max(b.h, 2.6) : b.h;
    if (footY >= bh - 0.6 && !b.net && !isBall) continue;
    if (footY >= bh) continue;
    const cx = clamp(pos.x, b.x - b.hw, b.x + b.hw), cz = clamp(pos.z, b.z - b.hd, b.z + b.hd);
    let dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz), nx, nz;
    if (d >= rad) continue;
    // keep the body on the side it came from so nothing tunnels through thin rails
    const sideX = prev ? (prev.x <= b.x - b.hw ? -1 : prev.x >= b.x + b.hw ? 1 : 0) : 0;
    const sideZ = prev ? (prev.z <= b.z - b.hd ? -1 : prev.z >= b.z + b.hd ? 1 : 0) : 0;
    const crossedX = sideX && Math.sign(pos.x - b.x) !== sideX, crossedZ = sideZ && Math.sign(pos.z - b.z) !== sideZ;
    if ((crossedX || crossedZ) && !(sideX && sideZ)) {
      if (sideX) { nx = sideX; nz = 0; pos.x = b.x + sideX * (b.hw + rad); }
      else { nz = sideZ; nx = 0; pos.z = b.z + sideZ * (b.hd + rad); }
    } else if (d < 1e-5) {
      const px = b.hw - Math.abs(pos.x - b.x), pz = b.hd - Math.abs(pos.z - b.z);
      if (px < pz) { nx = Math.sign(pos.x - b.x) || 1; nz = 0; pos.x = b.x + nx * (b.hw + rad); }
      else { nz = Math.sign(pos.z - b.z) || 1; nx = 0; pos.z = b.z + nz * (b.hd + rad); }
    } else { nx = dx / d; nz = dz / d; pos.x = cx + nx * rad; pos.z = cz + nz * rad; }
    const vn = vel.x * nx + vel.z * nz;
    if (vn < 0) { vel.x -= (1 + bounce) * vn * nx; vel.z -= (1 + bounce) * vn * nz; }
    hit = true;
  }
  for (const p of map.pillars) {
    if (footY >= p.h) continue;
    const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz), min = p.r + rad;
    if (d >= min || d < 1e-5) continue;
    const nx = dx / d, nz = dz / d;
    pos.x = p.x + nx * min; pos.z = p.z + nz * min;
    const vn = vel.x * nx + vel.z * nz;
    if (vn < 0) { vel.x -= (1 + bounce) * vn * nx; vel.z -= (1 + bounce) * vn * nz; }
    hit = true;
  }
  return hit;
}

function makePlayer(i, kind, tag, peer, ci) {
  if (!(ci >= 0 && ci < DEFS.length)) ci = i;
  const def = DEFS[ci];
  const m = buildChar(def);
  scene.add(m.root);
  const lab = labelSprite(tag, def.css);
  lab.position.y = 2.45; m.root.add(lab);
  const team = i % 2;
  m.teamRing.material.color.setHex(TEAM_HEX[team]);
  m.teamRing.visible = isTeamMode();
  return {
    i, ci, def, name: def.name, ab: AB_OF[def.animal], kind, tag, peer: peer || null, m, lab, team,
    ai: kind === 'cpu' ? newAI() : null,
    pos: new V3(), vel: new V3(), prevVel: new V3(), yaw: 0,
    score: 0, roundPts: 0, roundElims: 0,
    vis: null, st: new Float32Array(NS), ui: null, lastCnt: null,
  };
}
function resetPlayer(p, x, z, y) {
  p.pos.set(x, y || 0, z); p.vel.set(0, 0, 0); p.prevVel.set(0, 0, 0);
  p.yaw = Math.atan2(-x, -z);
  Object.assign(p, {
    alive: true, grounded: !y, splashed: false, ko: false, koT: 0, dizzy: 0, ragT: 0,
    punchT: 0, punchCd: 0, punchHand: 0, punchHit: true, dashT: 0, dashCd: 0, grabCd: 0, grabWhiff: 0,
    hitStun: 0, sweepCd: 0, pendCd: 0, grabbing: null, grabbedBy: null, holdBall: null, holdLeft: 0, grabT: 0,
    lastHitBy: null, lastHitAt: -99, lastCause: null, lastCauseAt: -99, lastDashAt: -99, respawnT: 0,
    abCd: 0, abT: 0, slideT: 0, flurryN: 0, flurryT: 0, pounding: false,
  });
  p.vis = {
    lx: 0, lz: 0, lvx: 0, lvz: 0, hx: 0, hz: 0, hvx: 0, hvz: 0, ko: 0,
    hands: [[-0.62, 0.72, 0.05], [0.62, 0.72, 0.05]], hv: [[0, 0, 0], [0, 0, 0]],
    ph: Math.random() * 6, amp: 0, sq: 1, sqv: 0,
  };
  p.m.root.visible = true;
}
function clearPlayers() {
  for (const p of players) scene.remove(p.m.root);
  players = [];
}
function teamSpawn(p) {
  const list = map.teamSpawns[p.team];
  const k = players.filter(q => q.team === p.team).indexOf(p);
  return list[Math.max(0, k) % list.length] || [0, 0];
}
function respawnPlayer(p) {
  let x, z;
  if (isTeamMode()) [x, z] = teamSpawn(p);
  else { const s = map.spawns[Math.floor(Math.random() * map.spawns.length)]; x = s[0]; z = s[1]; }
  resetPlayer(p, x, z, 6);
  if (isTeamMode()) p.yaw = p.team === 0 ? Math.PI / 2 : -Math.PI / 2;
}

// ---------------- hazards update ----------------
function computePend(dt) {
  pendTheta = 1.05 * Math.sin(pendT * PEND_W);
  pendAxis = 0.6 + pendT * 0.13;
  const px = PL * Math.sin(pendTheta), py = PIV - PL * Math.cos(pendTheta);
  const nx = px * Math.cos(pendAxis), nz = -px * Math.sin(pendAxis);
  if (dt > 0) pendVel.set((nx - pendPos.x) / dt, (py - pendPos.y) / dt, (nz - pendPos.z) / dt);
  pendPos.set(nx, py, nz);
}
function setupEvent(e) {
  ev = e;
  spinA = 0; sweepA = 0; sweepW = 0.8; pendT = 0;
  hub.visible = e === 'spin';
  padG.visible = e === 'spring';
  pendG.visible = e === 'pend';
  computePend(0);
}
function setupRoundWorld(mo, e, seed) {
  gameMode = mo;
  map = genMap(mo, e, seed);
  WATER_Y = map.waterY || -4;
  water.position.y = WATER_Y;
  buildMap(map);
  setupEvent(e);
  setupBalls(map);
}
function updateHazards(dt) {
  if (ev === 'spin') {
    const delta = 0.22 * dt;
    spinA += delta;
    if (state === 'play' && mode !== 'client') sweepW = 0.8 + (ROUND_TIME - roundTime) * 0.009;
    sweepA += sweepW * dt;
    if (mode !== 'client' && dt > 0 && (state === 'play' || state === 'roundEnd')) {
      for (const p of players) {
        if (!p.alive || !p.grounded || p.grabbedBy) continue;
        const c = Math.cos(delta), s = Math.sin(delta), x = p.pos.x, z = p.pos.z;
        p.pos.x = x * c + z * s; p.pos.z = -x * s + z * c; p.yaw += delta;
      }
    }
  }
  if (ev === 'pend') { pendT += dt; computePend(dt); }
  for (const pd of pads) pd.s = Math.max(0, pd.s - dt * 2.2);
}
function applyHazards(h) {
  mapG.rotation.y = map && map.spin ? h[0] : 0;
  sweepG.rotation.y = h[1];
  pendArm.rotation.z = h[2];
  pendG.rotation.y = h[3];
  pads.forEach((pd, k) => {
    const b = Math.sin(h[4 + k] * Math.PI);
    pd.top.position.y = 0.2 + b * 0.45;
    pd.coil.scale.set(1, 1, 1 + b * 2.5);
    pd.coil.position.y = 0.14 + b * 0.2;
  });
}
const hzBuf = new Float32Array(NH);
function hazardState() {
  hzBuf.fill(0);
  hzBuf[0] = spinA; hzBuf[1] = sweepA; hzBuf[2] = pendTheta; hzBuf[3] = pendAxis;
  pads.forEach((pd, k) => { if (k < PAD_MAX) hzBuf[4 + k] = pd.s; });
  return hzBuf;
}

// ---------------- fx ----------------
const SOUND_ONLY = new Set(['whoosh', 'throw', 'grab', 'jump', 'swing', 'tick', 'go', 'whistle', 'score', 'kick']);
function fx(kind, x, y, z, live) {
  if (live !== false) {
    if (recordOn) fxLog.push({ tick: recording.length, kind, x, y, z });
    if (mode === 'host') { netFx.push({ i: ++fxSeq, k: kind, x: r2(x), y: r2(y), z: r2(z) }); if (netFx.length > 16) netFx.shift(); }
  }
  const m = reduceMotion ? 0.3 : 1;
  if (kind === 'punch') {
    for (let i = 0; i < 9; i++) emit(x, y, z, rnd(-4, 4), rnd(0, 5), rnd(-4, 4), i % 2 ? 0xffd23f : 0xffffff, rnd(0.07, 0.13), rnd(0.25, 0.4), 8);
    shake = Math.max(shake, 0.14 * m); play('punch');
  } else if (kind === 'bonk') {
    for (let i = 0; i < 14; i++) emit(x, y, z, rnd(-6, 6), rnd(1, 7), rnd(-6, 6), i % 2 ? 0xff6b8b : 0xffffff, rnd(0.1, 0.18), rnd(0.3, 0.5), 10);
    shake = Math.max(shake, 0.35 * m); play('bonk');
  } else if (kind === 'splash') {
    for (let i = 0; i < 26; i++) { const a = rnd(0, TAU), s = rnd(1, 4); emit(x, WATER_Y + 0.1, z, Math.cos(a) * s, rnd(5, 11), Math.sin(a) * s, i % 3 ? 0xffffff : 0xbfeaff, rnd(0.1, 0.22), rnd(0.6, 1.0), 20); }
    const r = rings[rIdx++ % rings.length]; r.m.position.set(x, WATER_Y + 0.08, z); r.life = 1.1; r.m.visible = true;
    shake = Math.max(shake, 0.15 * m); play('splash');
  } else if (kind === 'dust') {
    for (let i = 0; i < 7; i++) { const a = rnd(0, TAU); emit(x, y + 0.05, z, Math.cos(a) * 2.5, rnd(0.5, 1.5), Math.sin(a) * 2.5, 0xfff5e4, rnd(0.1, 0.16), 0.35, 2); }
  } else if (kind === 'boing') {
    for (let i = 0; i < 8; i++) emit(x, y + 0.3, z, rnd(-2, 2), rnd(3, 6), rnd(-2, 2), 0xff6b8b, 0.1, 0.4, 6);
    let best = null, bd = 1e9;
    for (const pd of pads) { const d = Math.hypot(pd.x - x, pd.z - z); if (d < bd) { bd = d; best = pd; } }
    if (best && bd < 1.5) best.s = 1;
    play('boing');
  } else if (kind === 'ko') {
    for (let i = 0; i < 10; i++) emit(x, y, z, rnd(-3, 3), rnd(2, 5), rnd(-3, 3), 0xffd23f, 0.12, 0.6, 6);
    play('ko');
  } else if (kind === 'goal') {
    const cols = [0xff6b8b, 0xffd23f, 0x4aa8ff, 0x5fd18a, 0xffffff];
    for (let i = 0; i < 40; i++) emit(x, y + 1, z, rnd(-6, 6), rnd(6, 13), rnd(-6, 6), cols[i % 5], rnd(0.1, 0.2), rnd(0.8, 1.4), 14);
    shake = Math.max(shake, 0.3 * m); play('goal');
  } else if (kind === 'quake') {
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; emit(x + Math.cos(a) * 0.6, y + 0.1, z + Math.sin(a) * 0.6, Math.cos(a) * 9, rnd(1, 3), Math.sin(a) * 9, i % 2 ? 0xfff5e4 : 0xffd23f, rnd(0.14, 0.22), 0.5, 6); }
    shake = Math.max(shake, 0.45 * m); play('quake');
  } else if (kind === 'quack') {
    for (let i = 0; i < 14; i++) emit(x, y, z, rnd(-5, 5), rnd(-1, 3), rnd(-5, 5), i % 2 ? 0xffd23f : 0xffffff, rnd(0.1, 0.18), 0.45, 0);
    shake = Math.max(shake, 0.12 * m); play('quack');
  } else if (kind === 'blink') {
    for (let i = 0; i < 14; i++) emit(x + rnd(-0.4, 0.4), y + rnd(-0.8, 0.8), z + rnd(-0.4, 0.4), rnd(-1, 1), rnd(1, 3), rnd(-1, 1), i % 2 ? 0xb79cff : 0xffffff, rnd(0.08, 0.15), 0.5, -2);
    play('blink');
  } else if (kind === 'heavy') {
    for (let i = 0; i < 12; i++) emit(x, y, z, rnd(-3, 3), rnd(1, 4), rnd(-3, 3), 0x9a8fa8, rnd(0.12, 0.2), 0.5, 8);
    play('heavy');
  } else if (kind === 'tongue') {
    for (let i = 0; i < 10; i++) emit(x, y, z, rnd(-2, 2), rnd(0, 3), rnd(-2, 2), i % 2 ? 0xff7a90 : 0xffb3c4, rnd(0.08, 0.14), 0.35, 4);
    play('tongue');
  } else if (kind === 'counter') {
    const cols = [0xffd23f, 0xff6b8b, 0xffffff, 0x4aa8ff];
    for (let i = 0; i < 22; i++) emit(x, y, z, rnd(-7, 7), rnd(2, 8), rnd(-7, 7), cols[i % 4], rnd(0.1, 0.2), rnd(0.4, 0.7), 10);
    shake = Math.max(shake, 0.4 * m); play('counter');
  } else if (SOUND_ONLY.has(kind)) play(kind);
}

// ---------------- combat helpers ----------------
const limp = p => p.ko || p.ragT > 0;
function addDizzy(q, amt) {
  if (q.ko) return;
  q.dizzy = Math.min(100, q.dizzy + amt);
  if (q.dizzy >= 100) {
    q.ko = true; q.koT = KO_TIME;
    if (q.grabbing) drop(q);
    if (q.holdBall) dropBall(q);
    fx('ko', q.pos.x, q.pos.y + 1.8, q.pos.z);
  }
}
function setCause(q, cause, by) {
  q.lastCause = cause; q.lastCauseAt = simTime;
  if (by && by !== q) { q.lastHitBy = by; q.lastHitAt = simTime; }
}
function drop(p) {
  const q = p.grabbing; if (!q) return;
  q.grabbedBy = null; p.grabbing = null; p.grabCd = 0.6;
  q.vel.y = Math.max(q.vel.y, 2);
}
function dropBall(p) {
  const b = p.holdBall; if (!b) return;
  b.heldBy = null; p.holdBall = null; p.grabCd = 0.4;
  b.vel.set(p.vel.x * 0.6, 2, p.vel.z * 0.6);
}
function throwHeld(p, inp) {
  const f = fwd(p.yaw);
  if (p.holdBall) {
    const b = p.holdBall; b.heldBy = null; p.holdBall = null; p.grabCd = 0.35;
    const moving = Math.hypot(inp.mx, inp.mz) > 0.25;
    b.pos.set(p.pos.x + f.x * 1.1, p.pos.y + 1.1, p.pos.z + f.z * 1.1);
    if (moving) b.vel.set(f.x * 13 + p.vel.x * 0.3, 6, f.z * 13 + p.vel.z * 0.3);
    else b.vel.set(f.x * 2.5, 1.5, f.z * 2.5);
    b.lastTouch = p;
    fx('throw', b.pos.x, b.pos.y, b.pos.z);
    return;
  }
  const q = p.grabbing; if (!q) return;
  q.grabbedBy = null; p.grabbing = null; p.grabCd = 0.6;
  q.pos.set(p.pos.x + f.x * 1.2, Math.max(q.pos.y, p.pos.y + 0.6), p.pos.z + f.z * 1.2);
  q.vel.set(f.x * 16 + p.vel.x * 0.4, 7.5, f.z * 16 + p.vel.z * 0.4);
  q.ragT = Math.max(q.ragT, RAG_THROW);
  setCause(q, 'throw', p);
  addDizzy(q, 10);
  q.vis.lvx -= f.x * 4; q.vis.lvz -= f.z * 4;
  fx('throw', q.pos.x, q.pos.y, q.pos.z);
}
function frontTarget(p, list, maxD, cone, isBall) {
  const f = fwd(p.yaw);
  let best = null, bd = 1e9;
  for (const q of list) {
    const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    const dy = isBall ? q.pos.y - (p.pos.y + 0.9) : q.pos.y - p.pos.y;
    if (d > maxD + (isBall ? q.r * 0.6 : 0) || Math.abs(dy) > (isBall ? 1.4 : 1.3)) continue;
    if (d > 0.3 && (dx * f.x + dz * f.z) / d < cone) continue;
    if (d < bd) { bd = d; best = q; }
  }
  return best ? { t: best, d: bd } : null;
}
function tryGrab(p) {
  const pl = frontTarget(p, players.filter(q => q !== p && q.alive && !q.grabbedBy && q.grabbing !== p && !isHeavy(q)), 1.75, 0.35, false);
  const bl = gameMode === 'collect' ? frontTarget(p, balls.filter(b => b.alive && !b.heldBy), 1.5, 0.3, true) : null;
  if (bl && (!pl || bl.d <= pl.d)) {
    const b = bl.t;
    b.heldBy = p; p.holdBall = b; b.lastTouch = p;
    fx('grab', b.pos.x, b.pos.y, b.pos.z);
    return;
  }
  if (!pl) { p.grabCd = 0.5; p.grabWhiff = 0.3; return; }
  const q = pl.t;
  if (q.grabbing) drop(q);
  if (q.holdBall) dropBall(q);
  p.grabbing = q; q.grabbedBy = p; p.grabT = 0;
  q.holdLeft = limp(q) ? 99 : HOLD_MAX; q.rhythmPts = 0; q.aiRh = 0.9;
  setCause(q, 'grab', p);
  fx('grab', q.pos.x, q.pos.y + 1, q.pos.z);
}
function doPunch(p) {
  const f = fwd(p.yaw);
  const pl = frontTarget(p, players.filter(q => q !== p && q.alive && q !== p.grabbing && q.grabbedBy !== p), 1.8, 0.45, false);
  const bl = gameMode !== 'battle' ? frontTarget(p, balls.filter(b => b.alive && !b.heldBy), 1.9, 0.3, true) : null;
  if (bl && (!pl || bl.d <= pl.d + 0.3)) {
    const b = bl.t;
    const pow = gameMode === 'soccer' ? 12 : 9;
    b.vel.set(f.x * pow + p.vel.x * 0.3, gameMode === 'soccer' ? 3 : 3.5, f.z * pow + p.vel.z * 0.3);
    b.lastTouch = p;
    fx('kick', b.pos.x, b.pos.y, b.pos.z);
    for (let i = 0; i < 5; i++) emit(b.pos.x, b.pos.y, b.pos.z, rnd(-3, 3), rnd(0, 3), rnd(-3, 3), 0xffffff, 0.08, 0.3, 6);
    return;
  }
  if (!pl) return;
  const q = pl.t;
  const power = 6.5 + q.dizzy * 0.05 + (p.grounded ? 0 : 1.5) + (q.ko ? 2 : 0);
  const hv = isHeavy(q) ? 0.15 : 1;
  q.vel.x += f.x * power * hv; q.vel.z += f.z * power * hv; q.vel.y += 3.2 * hv;
  if (hv === 1) q.ragT = Math.max(q.ragT, RAG_PUNCH);
  setCause(q, 'punch', p);
  if (q.grabbing) drop(q);
  if (q.holdBall) dropBall(q);
  if (q.grabbedBy && !limp(q)) q.holdLeft -= 0.3;
  addDizzy(q, 24);
  q.vis.lvx += f.x * 3; q.vis.lvz += f.z * 3;
  p.vel.x -= f.x * 1.2; p.vel.z -= f.z * 1.2;
  fx('punch', q.pos.x - f.x * 0.3, q.pos.y + 1.2, q.pos.z - f.z * 0.3);
}

// ---------------- input sources ----------------
const NO_INPUT = { mx: 0, mz: 0, jump: false, punch: false, grab: false, dash: false, ability: false, any: false };
function keyboardInput() {
  const k = KEYS;
  // stick/keys are read relative to the camera: up = away from the camera
  let ix = 0, iz = 0;
  if (isDown(k.left)) ix -= 1; if (isDown(k.right)) ix += 1;
  if (isDown(k.up)) iz += 1; if (isDown(k.down)) iz -= 1;
  if (joy.active) { ix = joy.x; iz = -joy.z; }
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  camIn.x = ix; camIn.z = iz;
  const Fx = Math.sin(camYaw), Fz = Math.cos(camYaw), Rx = -Math.cos(camYaw), Rz = Math.sin(camYaw);
  let mx = Rx * ix + Fx * iz, mz = Rz * ix + Fz * iz;
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  const jump = wasPressed(k.jump), punch = wasPressed(k.punch), grab = wasPressed(k.grab), dash = wasPressed(k.dash), ability = wasPressed(k.ability);
  const any = jump || punch || grab || dash || ability || wasPressed(k.up) || wasPressed(k.down) || wasPressed(k.left) || wasPressed(k.right);
  return { mx, mz, jump, punch, grab, dash, ability, any };
}
function remoteInput(p) {
  const peer = net && net.peerMap.get(p.peer);
  const inp = peer && peer.presence && peer.presence.inp;
  if (!inp || typeof inp !== 'object') return NO_INPUT;
  const c = { j: num(inp.j), p: num(inp.p), g: num(inp.g), d: num(inp.d), a: num(inp.a), b: num(inp.b), h: num(inp.h) };
  const last = p.lastCnt || c;
  let mx = clamp(num(inp.x), -1, 1), mz = clamp(num(inp.z), -1, 1);
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  const out = { mx, mz, jump: c.j !== last.j, punch: c.p !== last.p, grab: c.g !== last.g, dash: c.d !== last.d, ability: c.b !== last.b, any: c.a !== last.a, rhythm: clamp(c.h - num(last.h), 0, 4) };
  p.lastCnt = c;
  return out;
}

// ---------------- AI ----------------
function dirTo(p, x, z, slow) {
  const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz);
  if (d < 1e-3) return [0, 0];
  const k = slow ? Math.min(1, d / slow) : 1;
  return [dx / d * k, dz / d * k];
}
const safeSpot = (x, z) => isFloor(x, z) && !inSolid(x, z, 0.4);
function safeDir(p, mx, mz) {
  const l = Math.hypot(mx, mz);
  if (l < 0.05) {
    if (!isFloor(p.pos.x, p.pos.z) || safeSpot(p.pos.x, p.pos.z)) return [mx, mz];
    return [mx, mz];
  }
  const look = ev === 'ice' ? 3.2 : 2.0;
  const dx = mx / l, dz = mz / l;
  for (const a of [0, 0.45, -0.45, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
    const c = Math.cos(a), s = Math.sin(a), x = dx * c - dz * s, z = dx * s + dz * c;
    if (isFloor(p.pos.x + x * look, p.pos.z + z * look, p.pos.y) && isFloor(p.pos.x + x * look * 0.5, p.pos.z + z * look * 0.5, p.pos.y)) {
      const blocked = inSolid(p.pos.x + x * 1.1, p.pos.z + z * 1.1, 0.3);
      if (blocked && a === 0) continue;
      return [x * Math.min(1, l), z * Math.min(1, l)];
    }
  }
  return [dx, dz];
}
const enemies = p => players.filter(q => q !== p && q.alive && (!isTeamMode() || q.team !== p.team));
function punchNear(p, ai, inp, chance) {
  const f = fwd(p.yaw);
  for (const q of enemies(p)) {
    const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.6 && Math.abs(q.pos.y - p.pos.y) < 1.2 && (dx * f.x + dz * f.z) / (d || 1) > 0.4 && ai.punchWait <= 0 && Math.random() < chance) {
      inp.punch = true; ai.punchWait = rnd(0.25, 0.7); return q;
    }
  }
  return null;
}
function aiBattle(p, ai, inp, dt) {
  if (ai.think <= 0 || !ai.target || !ai.target.alive) {
    ai.think = rnd(0.15, 0.4);
    let best = null, bs = 1e9;
    for (const q of enemies(p)) {
      let s = Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
      if (limp(q)) s -= 4;
      const qr = Math.hypot(q.pos.x, q.pos.z) || 1;
      if (!isFloor(q.pos.x + q.pos.x / qr * 2.5, q.pos.z + q.pos.z / qr * 2.5)) s -= 3;
      if (q === ai.target) s -= 1.5;
      s += rnd(0, 3);
      if (s < bs) { bs = s; best = q; }
    }
    ai.target = best; ai.jitter = rnd(-0.6, 0.6);
  }
  const t = ai.target;
  if (p.grabbing) {
    const r = Math.hypot(p.pos.x, p.pos.z);
    const out = r > 0.4 ? [p.pos.x / r, p.pos.z / r] : [1, 0];
    const f = fwd(p.yaw);
    if (!isFloor(p.pos.x + f.x * 3, p.pos.z + f.z * 3) || p.grabT > 3.2) inp.grab = true;
    return out;
  }
  if (!t) return [0, 0];
  const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
  const j = ai.jitter * (d > 3 ? 1 : 0.2), c = Math.cos(j), s = Math.sin(j);
  let mx = (dx * c - dz * s) / d, mz = (dx * s + dz * c) / d;
  if (d < 1.6) {
    if (limp(t) && !t.grabbedBy && Math.random() < 0.12) inp.grab = true;
    else if (ai.punchWait <= 0 && Math.random() < 0.25) { inp.punch = true; ai.punchWait = rnd(0.2, 0.7); }
    if (d < 1.0) { mx *= 0.3; mz *= 0.3; }
  }
  const f = fwd(p.yaw);
  if (d > 2.5 && d < 8 && p.dashCd <= 0 && (dx * f.x + dz * f.z) / d > 0.92 && isFloor(p.pos.x + f.x * 6, p.pos.z + f.z * 6) && Math.random() < (ev === 'ice' ? 0.006 : 0.02)) inp.dash = true;
  return [mx, mz];
}
function aiSoccer(p, ai, inp) {
  const b = balls[0], g = map.goal;
  const tgtX = p.team === 0 ? g.L + 2 : -(g.L + 2), ownX = -tgtX;
  if (!b || !b.alive) return dirTo(p, ownX * 0.35, 0, 1);
  const mates = players.filter(q => q.team === p.team && q.alive);
  let closest = p, cd = 1e9;
  for (const q of mates) { const d = Math.hypot(q.pos.x - b.pos.x, q.pos.z - b.pos.z); if (d < cd) { cd = d; closest = q; } }
  const gx = tgtX - b.pos.x, gz = -b.pos.z, gl = Math.hypot(gx, gz) || 1, ux = gx / gl, uz = gz / gl;
  const db = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
  if (closest === p) {
    const rel = (p.pos.x - b.pos.x) * ux + (p.pos.z - b.pos.z) * uz;
    if (rel > -0.4 && db < 4) {
      const sx = -uz, sz = ux, side = ((p.pos.x - b.pos.x) * sx + (p.pos.z - b.pos.z) * sz) >= 0 ? 1 : -1;
      return dirTo(p, b.pos.x - ux * 1.9 + sx * side * 1.7, b.pos.z - uz * 1.9 + sz * side * 1.7);
    }
    if (db < 2.0) {
      const f = fwd(p.yaw);
      if (f.x * ux + f.z * uz > 0.55 && ai.punchWait <= 0) { inp.punch = true; ai.punchWait = rnd(0.25, 0.55); }
      const [ax, az] = dirTo(p, b.pos.x, b.pos.z);
      return [ax * 0.6 + ux * 0.4, az * 0.6 + uz * 0.4];
    }
    const f = fwd(p.yaw), tx = b.pos.x - p.pos.x, tz = b.pos.z - p.pos.z;
    if (db > 3 && db < 7 && p.dashCd <= 0 && (tx * f.x + tz * f.z) / db > 0.95 && (tx * ux + tz * uz) / db > 0.7 && Math.random() < 0.02) inp.dash = true;
    return dirTo(p, b.pos.x - ux * 1.2, b.pos.z - uz * 1.2);
  }
  punchNear(p, ai, inp, 0.2);
  return dirTo(p, b.pos.x * 0.5 + ownX * 0.5, b.pos.z * 0.5, 1.2);
}
const inBase = (b, base) => Math.hypot(b.pos.x - base.x, b.pos.z - base.z) < base.r && b.pos.y < 3;
function aiCollect(p, ai, inp) {
  const my = map.bases[p.team], en = map.bases[1 - p.team];
  if (p.holdBall) {
    const d = Math.hypot(p.pos.x - my.x, p.pos.z - my.z);
    if (d < my.r - 1.2) { if (p.grabCd <= 0) inp.grab = true; return [0, 0]; }
    return dirTo(p, my.x, my.z);
  }
  if (p.grabbing) { inp.grab = true; return [0, 0]; }
  if (ai.think <= 0 || !ai.target || (ai.target.heldBy && ai.target.heldBy.team === p.team) || !ai.target.alive) {
    ai.think = rnd(0.3, 0.6);
    let best = null, bs = 1e9;
    for (const b of balls) {
      if (!b.alive || inBase(b, my)) continue;
      if (b.heldBy && b.heldBy.team === p.team) continue;
      let s = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (b.heldBy) s -= 3;
      if (inBase(b, en)) s -= 1;
      if (players.some(q => q !== p && q.team === p.team && q.ai && q.ai.target === b)) s += 6;
      s += rnd(0, 2);
      if (s < bs) { bs = s; best = b; }
    }
    ai.target = best;
  }
  const b = ai.target;
  if (!b) { punchNear(p, ai, inp, 0.3); return dirTo(p, (my.x + en.x) * 0.3 + my.x * 0.4, 0, 1); }
  if (b.heldBy) {
    const e = b.heldBy;
    if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 1.7) punchNear(p, ai, inp, 0.5);
    return dirTo(p, e.pos.x, e.pos.z);
  }
  const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
  if (d < 1.4 && p.grabCd <= 0) inp.grab = true;
  punchNear(p, ai, inp, 0.08);
  return dirTo(p, b.pos.x, b.pos.z);
}
function aiInput(p, dt) {
  const ai = p.ai;
  const inp = { mx: 0, mz: 0, jump: false, punch: false, grab: false, dash: false, any: false };
  if (limp(p)) return inp;
  if (p.grabbedBy) { inp.any = Math.random() < 0.3; return inp; }
  ai.think -= dt; ai.punchWait -= dt;
  let dir = gameMode === 'soccer' ? aiSoccer(p, ai, inp) : gameMode === 'collect' ? aiCollect(p, ai, inp) : aiBattle(p, ai, inp, dt);
  let [mx, mz] = dir;
  if (!p.grabbing) [mx, mz] = safeDir(p, mx, mz);
  if (ev === 'spin' && p.grounded) {
    const r = Math.hypot(p.pos.x, p.pos.z);
    if (r < HUB_R + 1.4) { mx += p.pos.x / (r || 1) * 1.5; mz += p.pos.z / (r || 1) * 1.5; }
    const ux = Math.cos(sweepA), uz = -Math.sin(sweepA), nx = Math.sin(sweepA), nz = Math.cos(sweepA);
    const along = p.pos.x * ux + p.pos.z * uz, perp = p.pos.x * nx + p.pos.z * nz;
    for (const s of [1, -1]) {
      const ahead = -s * perp;
      if (along * s > HUB_R && ahead > 0 && ahead < 0.8 + sweepW * Math.abs(along) * 0.12 && Math.random() < 0.3) inp.jump = true;
    }
  }
  if (ev === 'pend' && pendPos.y < 5) {
    const bx = p.pos.x - pendPos.x, bz = p.pos.z - pendPos.z, bd = Math.hypot(bx, bz) || 1;
    if (bd < 5) { mx += bx / bd * 2; mz += bz / bd * 2; }
  }
  if (p.grounded && inSolid(p.pos.x + mx * 1.0, p.pos.z + mz * 1.0, 0.3) && Math.random() < 0.08) inp.jump = true;
  aiAbility(p, inp);
  if (Math.random() < 0.003) inp.jump = true;
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  inp.mx = mx; inp.mz = mz;
  return inp;
}

// ---------------- physics ----------------
function stepPlayer(p, inp, dt) {
  if (!p.alive) return;
  p.punchCd -= dt; p.dashCd -= dt; p.grabCd -= dt; p.grabWhiff -= dt; p.hitStun -= dt;
  p.dashT -= dt; p.sweepCd -= dt; p.pendCd -= dt;
  p.abCd -= dt; if (p.abT > 0) p.abT -= dt; p.slideT -= dt;
  if (p.ragT > 0) p.ragT -= dt;
  if (p.punchT > 0) p.punchT -= dt;
  if (p.ko) { p.koT -= dt; if (p.koT <= 0) { p.ko = false; p.dizzy = 0; } }
  else p.dizzy = Math.max(0, p.dizzy - 7 * dt);

  if (p.grabbedBy) {
    const h = p.grabbedBy;
    if (!limp(p) && p.holdLeft > 50) p.holdLeft = HOLD_MAX;
    p.holdLeft -= dt;
    if (inp.rhythm) p.rhythmPts = (p.rhythmPts || 0) + inp.rhythm;
    if (p.kind === 'cpu' && !limp(p)) {
      p.aiRh = (p.aiRh === undefined ? 0.9 : p.aiRh) - dt;
      if (p.aiRh <= 0) { p.aiRh = 0.45; if (Math.random() < 0.45) p.rhythmPts = (p.rhythmPts || 0) + 1; }
    }
    if ((p.rhythmPts || 0) >= RH_NEED && !limp(p)) { counterEscape(p); return; }
    if (p.holdLeft <= 0) {
      const f = fwd(h.yaw);
      h.grabbing = null; p.grabbedBy = null; h.grabCd = 0.8;
      p.vel.set(f.x * 5, 4, f.z * 5); h.vel.x -= f.x * 3; h.vel.z -= f.z * 3;
      return;
    }
    const f = fwd(h.yaw);
    const tx = h.pos.x + f.x * 0.95, ty = h.pos.y + 0.55, tz = h.pos.z + f.z * 0.95;
    p.pos.x += (tx - p.pos.x) * 0.5; p.pos.y += (ty - p.pos.y) * 0.5; p.pos.z += (tz - p.pos.z) * 0.5;
    p.vel.copy(h.vel);
    p.yaw = lerpAngle(p.yaw, h.yaw + Math.PI, 0.2);
    p.grounded = false;
    return;
  }

  const canAct = !limp(p);
  const ice = ev === 'ice';
  let mx = canAct ? inp.mx : 0, mz = canAct ? inp.mz : 0;
  // zigzag: even when the stick points straight, the clumsy body weaves left and right
  const inMag = Math.hypot(mx, mz);
  if (inMag > 0.1 && p.grounded && p.dashT <= 0) {
    const carry = p.grabbing ? CARRY_SHAKE : 1;
    p.zig = (p.zig || Math.PI / 2 + p.i * 1.7) + dt * (p.grabbing ? 2.6 : 4.2 + p.i * 0.35);
    const za = clamp((Math.sin(p.zig) * 0.36 + Math.sin(p.zig * 2.3 + p.i) * 0.12) * Math.min(1, inMag) * carry, -1.35, 1.35);
    const zc = Math.cos(za), zs = Math.sin(za);
    const nx = mx * zc - mz * zs, nz = mx * zs + mz * zc;
    mx = nx; mz = nz;
  }
  if (inMag > 0.1) p.yaw = lerpAngle(p.yaw, Math.atan2(mx, mz), 1 - Math.exp(-14 * dt));
  const maxSp = ((p.grabbing || p.holdBall) ? 4.6 : 7.4) * (p.ab === 'sprint' && p.abT > 0 ? 1.65 : 1);
  let rate;
  if (limp(p)) rate = p.grounded ? (ice ? 0.4 : 3.5) : 0.2;
  else if (p.hitStun > 0 || p.dashT > 0) rate = p.grounded ? (ice ? 0.25 : 1.6) : 0.3;
  else rate = p.grounded ? (ice ? 1.1 : 11) : 2.2;
  if (p.slideT > 0 && !limp(p)) rate = p.grounded ? 0.35 : 0.3;
  // lugging someone around makes you stagger sideways even when standing still
  if (p.grabbing && p.grounded && !limp(p)) {
    const f = fwd(p.yaw), sway = (Math.sin(simTime * 3.1 + p.i * 1.3) * 0.34 + Math.sin(simTime * 7.7 + p.i) * 0.14) * CARRY_SHAKE;
    p.vel.x += -f.z * sway * dt * 6; p.vel.z += f.x * sway * dt * 6;
  }
  const k = 1 - Math.exp(-rate * dt);
  p.vel.x += (mx * maxSp - p.vel.x) * k;
  p.vel.z += (mz * maxSp - p.vel.z) * k;

  if (canAct) {
    if (inp.jump && p.grounded) { p.vel.y = 9.2; p.grounded = false; p.vis.sqv += 3; fx('jump', p.pos.x, p.pos.y, p.pos.z); }
    if (inp.dash && p.dashCd <= 0) {
      // dash toward the direction being pressed; with no direction held, dash where the body faces
      if (Math.hypot(inp.mx, inp.mz) > 0.2) p.yaw = Math.atan2(inp.mx, inp.mz);
      const f = fwd(p.yaw);
      p.vel.x = f.x * 10; p.vel.z = f.z * 10; p.vel.y = Math.max(p.vel.y, 2.5);
      p.dashT = 0.4; p.dashCd = DASH_CD; p.lastDashAt = simTime;
      if (p.grabbing) drop(p);
      if (p.holdBall) dropBall(p);
      fx('whoosh', p.pos.x, p.pos.y, p.pos.z);
    }
    if (inp.punch && p.punchCd <= 0 && !p.grabbing && !p.holdBall) {
      p.punchT = 0.28; p.punchCd = 0.42; p.punchHand ^= 1; p.punchHit = false;
      fx('swing', p.pos.x, p.pos.y, p.pos.z);
    }
    if (inp.grab) { if (p.grabbing || p.holdBall) throwHeld(p, inp); else if (p.grabCd <= 0) tryGrab(p); }
    if (inp.ability && p.abCd <= 0) useAbility(p);
  }
  if (p.grabbing) { p.grabT += dt; if (limp(p) || p.pos.y < -0.8 || !p.grabbing.alive) drop(p); }
  if (p.holdBall && (limp(p) || p.pos.y < -0.8)) dropBall(p);
  if (p.punchT > 0 && !p.punchHit && p.punchT < 0.17) { p.punchHit = true; doPunch(p); }
  if (p.flurryN > 0 && !limp(p)) {
    p.flurryT -= dt;
    if (p.flurryT <= 0) { p.flurryN--; p.flurryT = 0.13; p.punchT = 0.2; p.punchHand ^= 1; p.punchHit = true; doPunch(p); fx('swing', p.pos.x, p.pos.y, p.pos.z); }
  }
  if (p.pounding && p.vel.y < 0) p.vel.y -= 34 * dt;

  const px = p.pos.x, pz = p.pos.z;
  p.vel.y -= GRAV * dt;
  p.pos.addScaledVector(p.vel, dt);
  pushOut(p.pos, PR, p.vel, p.pos.y, 0, { x: px, z: pz });
  const g = groundAt(p.pos.x, p.pos.z, p.pos.y);
  if (g !== null) {
    if (p.vel.y < -7) { p.vis.sqv -= Math.min(6, -p.vel.y * 0.35); fx('dust', p.pos.x, g, p.pos.z); }
    p.pos.y = g; if (p.vel.y < 0) p.vel.y = 0;
    p.grounded = true;
    if (p.pounding) { p.pounding = false; poundWave(p); }
    if (map.hex && state !== 'menu') { const ht = hexAt(p.pos.x, p.pos.z, p.pos.y); if (ht && ht.state === 0) triggerTile(ht); }
  } else p.grounded = false;
  if (!map.hex && p.pos.y < -0.7 && isFloor(p.pos.x, p.pos.z)) {
    p.pos.x = px; p.pos.z = pz; p.vel.x *= -0.3; p.vel.z *= -0.3;
  }
  if (!p.splashed && p.pos.y < WATER_Y + 0.3) { p.splashed = true; fx('splash', p.pos.x, WATER_Y, p.pos.z); }
  if (p.pos.y < WATER_Y - 1.6) eliminate(p);
}

// ---------------- rhythm counter ----------------
function counterEscape(p) {
  const h = p.grabbedBy;
  if (!h || h === true) return;
  h.grabbing = null; p.grabbedBy = null; h.grabCd = 1.2;
  const f = fwd(h.yaw);
  knock(h, -f.x * 11, -f.z * 11, 6, RAG_PUNCH, 30, p, 'counter');
  p.vel.set(f.x * 3, 5, f.z * 3);
  p.rhythmPts = 0;
  fx('counter', h.pos.x, h.pos.y + 1.2, h.pos.z);
  feed(`${josa(p.name, '이', '가')} 리듬 반격 성공!`);
  setBanner('반격!', `${josa(p.name, '이', '가')} 박자를 맞춰 빠져나왔습니다`);
  setTimeout(() => { if (curBanner[0] === '반격!') setBanner('', ''); }, 1100);
}

// ---------------- character abilities ----------------
const isHeavy = q => q.ab === 'heavy' && q.abT > 0;
function abFoes(p) { return players.filter(q => q !== p && q.alive && !q.grabbedBy && (!isTeamMode() || q.team !== p.team)); }
function knock(q, vx, vz, vy, rag, dizzy, by, cause) {
  const hv = isHeavy(q) ? 0.15 : 1;
  q.vel.x += vx * hv; q.vel.z += vz * hv; q.vel.y += vy * hv;
  if (hv === 1 && rag) q.ragT = Math.max(q.ragT, rag);
  if (dizzy) addDizzy(q, dizzy * hv);
  setCause(q, cause, by);
  if (hv === 1) { if (q.grabbing) drop(q); if (q.holdBall) dropBall(q); }
  q.vis.lvx += vx * 0.3 * hv; q.vis.lvz += vz * 0.3 * hv;
}
function pushBalls(p, rad, pow, up, cone) {
  const f = fwd(p.yaw);
  for (const b of balls) {
    if (!b.alive || b.heldBy) continue;
    const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 0.01;
    if (d > rad || Math.abs(b.pos.y - p.pos.y - 0.8) > 2) continue;
    if (cone && (dx * f.x + dz * f.z) / d < cone) continue;
    b.vel.x += dx / d * pow; b.vel.z += dz / d * pow; b.vel.y += up; b.lastTouch = p;
  }
}
function poundWave(p) {
  for (const q of abFoes(p)) {
    const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 0.01;
    if (d > 4 || Math.abs(q.pos.y - p.pos.y) > 2) continue;
    const k = 1.3 - d / 4 * 0.5;
    knock(q, dx / d * 9 * k, dz / d * 9 * k, 5, RAG_THROW, 15, p, 'pound');
  }
  pushBalls(p, 4.5, 8, 4);
  fx('quake', p.pos.x, p.pos.y, p.pos.z);
}
function useAbility(p) {
  const info = AB[p.ab]; if (!info) return;
  const f = fwd(p.yaw);
  switch (p.ab) {
    case 'pound':
      p.pounding = true; p.abT = 2;
      if (p.grounded) { p.vel.y = 8.5; p.grounded = false; } else p.vel.y = Math.min(p.vel.y, -6);
      fx('jump', p.pos.x, p.pos.y, p.pos.z);
      break;
    case 'flurry': p.flurryN = 3; p.flurryT = 0; p.abT = 0.45; break;
    case 'quack':
      for (const q of abFoes(p)) {
        const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 0.01;
        if (d > 4.6 || Math.abs(q.pos.y - p.pos.y) > 2 || (d > 0.8 && (dx * f.x + dz * f.z) / d < 0.45)) continue;
        knock(q, dx / d * 8, dz / d * 8, 3, 0, 32, p, 'quack');
        q.hitStun = Math.max(q.hitStun, 0.5);
      }
      pushBalls(p, 4.6, 9, 3, 0.45);
      p.abT = 0.4;
      fx('quack', p.pos.x + f.x * 1.2, p.pos.y + 1.4, p.pos.z + f.z * 1.2);
      break;
    case 'superjump':
      p.vel.y = 15.5; p.grounded = false; p.abT = 0.6; p.vis.sqv += 5;
      fx('boing', p.pos.x, p.pos.y, p.pos.z);
      break;
    case 'slide':
      p.slideT = 1.2; p.abT = 1.2; p.dashT = 1.2; p.lastDashAt = simTime;
      p.vel.x = f.x * 13; p.vel.z = f.z * 13;
      if (p.grabbing) drop(p);
      if (p.holdBall) dropBall(p);
      fx('whoosh', p.pos.x, p.pos.y, p.pos.z);
      break;
    case 'blink': {
      let spot = null;
      for (let d = 5; d >= 1; d -= 0.5) {
        const x = p.pos.x + f.x * d, z = p.pos.z + f.z * d;
        if (isFloor(x, z, p.pos.y) && !inSolid(x, z, 0.6)) { spot = [x, z]; break; }
      }
      fx('blink', p.pos.x, p.pos.y + 1, p.pos.z);
      if (spot) { p.pos.x = spot[0]; p.pos.z = spot[1]; }
      fx('blink', p.pos.x, p.pos.y + 1, p.pos.z);
      p.abT = 0.3;
      break;
    }
    case 'heavy':
      p.abT = 3; p.ragT = 0;
      fx('heavy', p.pos.x, p.pos.y + 1, p.pos.z);
      break;
    case 'sprint':
      p.abT = 3;
      fx('whoosh', p.pos.x, p.pos.y, p.pos.z);
      break;
    case 'spin':
      p.abT = 0.6;
      for (const q of abFoes(p)) {
        const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 0.01;
        if (d > 2.6 || Math.abs(q.pos.y - p.pos.y) > 1.8) continue;
        knock(q, dx / d * 11, dz / d * 11, 4, 1.0, 20, p, 'spin');
      }
      pushBalls(p, 2.8, 11, 3);
      fx('bonk', p.pos.x, p.pos.y + 1, p.pos.z);
      break;
    case 'tongue': {
      let best = null, bd = 1e9;
      for (const q of abFoes(p)) {
        const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 0.01;
        if (d < 1.2 || d > 8.5 || Math.abs(q.pos.y - p.pos.y) > 2.5 || (dx * f.x + dz * f.z) / d < 0.6) continue;
        if (d < bd) { bd = d; best = q; }
      }
      if (best) {
        const dx = p.pos.x - best.pos.x, dz = p.pos.z - best.pos.z, d = Math.hypot(dx, dz) || 0.01;
        knock(best, dx / d * Math.min(15, 5 + d * 1.6), dz / d * Math.min(15, 5 + d * 1.6), 4.5, RAG_THROW, 0, p, 'tongue');
        fx('tongue', best.pos.x, best.pos.y + 1, best.pos.z);
      } else fx('swing', p.pos.x, p.pos.y, p.pos.z);
      fx('tongue', p.pos.x + f.x * 0.6, p.pos.y + 1.3, p.pos.z + f.z * 0.6);
      p.abT = 0.3;
      break;
    }
  }
  p.abCd = info.cd;
}
function aiAbility(p, inp) {
  if (p.abCd > 0 || Math.random() > 0.08) return;
  const foes = abFoes(p), f = fwd(p.yaw);
  let near = 1e9, front = 1e9;
  for (const q of foes) {
    const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 0.01;
    near = Math.min(near, d);
    if ((dx * f.x + dz * f.z) / d > 0.6) front = Math.min(front, d);
  }
  switch (p.ab) {
    case 'pound': if (near < 3.2) inp.ability = true; break;
    case 'flurry': if (front < 1.7) inp.ability = true; break;
    case 'quack': if (front < 4) inp.ability = true; break;
    case 'superjump':
      if (!p.grounded && p.vel.y < 0 && p.pos.y > -1.5 && !isFloor(p.pos.x, p.pos.z, 0)) inp.ability = true;
      else if (Math.random() < 0.02) inp.ability = true;
      break;
    case 'slide': if (front > 3 && front < 8 && isFloor(p.pos.x + f.x * 8, p.pos.z + f.z * 8, p.pos.y)) inp.ability = true; break;
    case 'blink': if (front > 3 && front < 6) inp.ability = true; break;
    case 'heavy': if (near < 2.2) inp.ability = true; break;
    case 'sprint': if (near > 6) inp.ability = true; break;
    case 'spin': if (near < 2.3) inp.ability = true; break;
    case 'tongue': if (front > 3 && front < 8) inp.ability = true; break;
  }
}

function collidePairs() {
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i], b = players[j];
    if (!a.alive || !b.alive || a.grabbedBy || b.grabbedBy || a.grabbing === b || b.grabbing === a) continue;
    if (Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d = Math.hypot(dx, dz), min = PR * 2;
    if (d >= min || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, ov = (min - d) / 2;
    a.pos.x += nx * ov; a.pos.z += nz * ov; b.pos.x -= nx * ov; b.pos.z -= nz * ov;
    const rv = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
    if (rv < 0) {
      const jj = -1.5 * rv / 2;
      a.vel.x += nx * jj; a.vel.z += nz * jj; b.vel.x -= nx * jj; b.vel.z -= nz * jj;
    }
    for (const [att, vic, sgn] of [[a, b, -1], [b, a, 1]]) {
      if (att.dashT > 0 && (att.vel.x * nx + att.vel.z * nz) * sgn > 2) {
        const hv = isHeavy(vic) ? 0.15 : 1;
        vic.vel.x += nx * sgn * 10 * hv; vic.vel.z += nz * sgn * 10 * hv; vic.vel.y += 4 * hv;
        vic.hitStun = 0.6; setCause(vic, 'dash', att); addDizzy(vic, 16);
        if (vic.grabbing) drop(vic);
        if (vic.holdBall) dropBall(vic);
        att.dashT = 0; att.vel.x *= 0.3; att.vel.z *= 0.3;
        vic.vis.lvx += nx * sgn * 4; vic.vis.lvz += nz * sgn * 4;
        fx('bonk', (a.pos.x + b.pos.x) / 2, a.pos.y + 1, (a.pos.z + b.pos.z) / 2);
      }
    }
  }
}

function hazardCollide(p) {
  if (!p.alive || p.grabbedBy) return;
  if (ev === 'spin') {
    const d = Math.hypot(p.pos.x, p.pos.z);
    if (d < HUB_R + PR && p.pos.y < 1.3 && d > 1e-4) { const s = (HUB_R + PR) / d; p.pos.x *= s; p.pos.z *= s; }
    if (p.sweepCd <= 0 && p.pos.y < 0.62) {
      const ux = Math.cos(sweepA), uz = -Math.sin(sweepA), nx = Math.sin(sweepA), nz = Math.cos(sweepA);
      const along = p.pos.x * ux + p.pos.z * uz, perp = p.pos.x * nx + p.pos.z * nz;
      for (const s of [1, -1]) {
        const r = along * s;
        if (r < HUB_R || r > map.ext + 0.4 || Math.abs(perp) > PR + 0.22) continue;
        if (-s * perp < -0.05) continue;
        const dx = -s * nx, dz = -s * nz, sp = sweepW * r * 0.8 + 4.5;
        const ox = p.pos.x / (d || 1), oz = p.pos.z / (d || 1);
        p.vel.set(dx * sp + ox * 2.5, 5.5, dz * sp + oz * 2.5);
        p.pos.x += dx * (PR + 0.3 - Math.abs(perp)); p.pos.z += dz * (PR + 0.3 - Math.abs(perp));
        p.hitStun = 0.6; p.sweepCd = 0.4;
        setCause(p, 'sweep'); addDizzy(p, 12);
        if (p.grabbing) drop(p);
        p.vis.lvx += dx * 5; p.vis.lvz += dz * 5;
        fx('bonk', p.pos.x, p.pos.y + 0.6, p.pos.z);
        break;
      }
    }
  }
  if (ev === 'pend' && p.pendCd <= 0) {
    const cx = p.pos.x - pendPos.x, cy = p.pos.y + 0.85 - pendPos.y, cz = p.pos.z - pendPos.z;
    const d = Math.hypot(cx, cy, cz);
    if (d < PBALL_R + 0.65 && d > 1e-4) {
      let hx = cx, hz = cz; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
      p.vel.set(hx * 10 + pendVel.x * 0.5, 6.5, hz * 10 + pendVel.z * 0.5);
      p.hitStun = 0.8; p.pendCd = 0.6;
      setCause(p, 'pend'); addDizzy(p, 25);
      if (p.grabbing) drop(p);
      p.vis.lvx += hx * 6; p.vis.lvz += hz * 6;
      fx('bonk', p.pos.x, p.pos.y + 1, p.pos.z);
    }
  }
  if (ev === 'spring' && p.grounded) {
    for (const pd of pads) {
      if (Math.hypot(p.pos.x - pd.x, p.pos.z - pd.z) < 0.85) {
        p.vel.y = 15.5; p.vel.x += rnd(-2.5, 2.5); p.vel.z += rnd(-2.5, 2.5);
        p.grounded = false; p.pos.y = 0.05; pd.s = 1;
        setCause(p, 'spring');
        p.vis.sqv += 5;
        fx('boing', pd.x, 0, pd.z);
      }
    }
  }
}

// ---------------- game balls physics ----------------
function stepBall(b, dt) {
  if (!b.alive) {
    b.respawnT -= dt;
    if (b.respawnT <= 0 && (state === 'play' || state === 'countdown' || state === 'roundEnd')) placeBall(b, b.i);
    return;
  }
  if (b.heldBy) {
    const h = b.heldBy, f = fwd(h.yaw);
    if (!h.alive) { b.heldBy = null; h.holdBall = null; }
    else { b.pos.set(h.pos.x + f.x * 0.9, h.pos.y + 1.05, h.pos.z + f.z * 0.9); b.vel.copy(h.vel); b.safe.x = h.pos.x; b.safe.z = h.pos.z; return; }
  }
  const px = b.pos.x, pz = b.pos.z;
  b.vel.y -= GRAV * 0.8 * dt;
  b.pos.addScaledVector(b.vel, dt);
  pushOut(b.pos, b.r, b.vel, b.pos.y - b.r, 0.6, b.safe, true);
  b.safe.x = b.pos.x; b.safe.z = b.pos.z;
  const g = groundAt(b.pos.x, b.pos.z, b.pos.y - b.r);
  if (g !== null) {
    b.pos.y = g + b.r;
    if (b.vel.y < -2.5) b.vel.y = -b.vel.y * 0.45; else if (b.vel.y < 0) b.vel.y = 0;
    const fr = Math.exp(-(gameMode === 'soccer' ? 0.7 : 1.6) * dt);
    b.vel.x *= fr; b.vel.z *= fr;
  }
  if (b.pos.y - b.r < -0.6 && isFloor(b.pos.x, b.pos.z)) { b.pos.x = px; b.pos.z = pz; b.vel.x *= -0.4; b.vel.z *= -0.4; }
  if (!b.splashed && b.pos.y < WATER_Y + 0.3) { b.splashed = true; fx('splash', b.pos.x, WATER_Y, b.pos.z); }
  if (b.pos.y < WATER_Y - 1.5) { b.alive = false; b.respawnT = RESPAWN_T; b.mesh.visible = false; }
}
function collideBalls() {
  for (const b of balls) {
    if (!b.alive || b.heldBy) continue;
    for (const p of players) {
      if (!p.alive || p.grabbedBy) continue;
      if (b.pos.y + b.r < p.pos.y || b.pos.y - b.r > p.pos.y + 1.9) continue;
      const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z, d = Math.hypot(dx, dz), min = PR + b.r;
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d;
      b.pos.x = p.pos.x + nx * min; b.pos.z = p.pos.z + nz * min;
      pushOut(b.pos, b.r, b.vel, b.pos.y - b.r, 0.6, b.safe, true);
      b.safe.x = b.pos.x; b.safe.z = b.pos.z;
      const rel = (b.vel.x - p.vel.x) * nx + (b.vel.z - p.vel.z) * nz;
      if (rel < 0) {
        const boost = p.dashT > 0 ? 1.5 : 1.25;
        b.vel.x -= rel * nx * boost; b.vel.z -= rel * nz * boost;
        const hs = Math.hypot(b.vel.x, b.vel.z);
        if (hs > 20) { b.vel.x *= 20 / hs; b.vel.z *= 20 / hs; }
        if (p.dashT > 0) b.vel.y = Math.max(b.vel.y, 3);
        b.lastTouch = p;
      }
    }
  }
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const a = balls[i], c = balls[j];
    if (!a.alive || !c.alive || a.heldBy || c.heldBy) continue;
    const dx = a.pos.x - c.pos.x, dy = a.pos.y - c.pos.y, dz = a.pos.z - c.pos.z, d = Math.hypot(dx, dy, dz), min = a.r + c.r;
    if (d >= min || d < 1e-4) continue;
    const nx = dx / d, ny = dy / d, nz = dz / d, ov = (min - d) / 2;
    a.pos.x += nx * ov; a.pos.y += ny * ov; a.pos.z += nz * ov; c.pos.x -= nx * ov; c.pos.y -= ny * ov; c.pos.z -= nz * ov;
    const rv = (a.vel.x - c.vel.x) * nx + (a.vel.y - c.vel.y) * ny + (a.vel.z - c.vel.z) * nz;
    if (rv < 0) { const jj = -rv * 0.9; a.vel.x += nx * jj; a.vel.y += ny * jj; a.vel.z += nz * jj; c.vel.x -= nx * jj; c.vel.y -= ny * jj; c.vel.z -= nz * jj; }
  }
}
function updateBallMeshes(dt) {
  for (const b of balls) {
    b.mesh.visible = b.alive;
    if (!b.alive) continue;
    const vx = b.vel.x, vz = b.vel.z, sp = Math.hypot(vx, vz);
    if (sp > 0.05 && !b.heldBy) {
      b.rx.set(vz / sp, 0, -vx / sp);
      b.mesh.rotateOnWorldAxis(b.rx, sp * dt / b.r);
    }
    b.mesh.position.copy(b.pos);
  }
}

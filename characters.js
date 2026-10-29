// 캐릭터 10종 모델, 공, 파티클 효과, 효과음
'use strict';

// ---------------- characters ----------------
function lighten(hex, amt) { const c = new THREE.Color(hex); c.lerp(new THREE.Color(0xffffff), amt); return c; }
function buildChar(def) {
  const fur = toon(def.color), soft = toon(def.belly !== undefined ? def.belly : lighten(def.color, 0.55)), ink = toon(0x2a2233), blush = toon(0xff9fb3);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const root = new THREE.Group(), yawG = new THREE.Group(), tiltG = new THREE.Group();
  root.add(yawG); yawG.add(tiltG);
  const body = mesh(SPH, fur, 0.55, 0.6, 0.52); body.position.y = 0.72; tiltG.add(body);
  const belly = mesh(SPH, soft, 0.36, 0.4, 0.22); belly.position.set(0, 0.66, 0.34); tiltG.add(belly);
  const headG = new THREE.Group(); headG.position.y = 1.42; tiltG.add(headG);
  headG.add(mesh(SPH, fur, 0.46, 0.43, 0.44));
  const eyes = new THREE.Group(), xEyes = new THREE.Group(); headG.add(eyes, xEyes);
  for (const s of [-1, 1]) {
    const e = mesh(SPH, ink, 0.075, 0.09, 0.05); e.castShadow = false; e.position.set(s * 0.16, 0.06, 0.4); eyes.add(e);
    const hl = mesh(SPH, white, 0.026); hl.castShadow = false; hl.position.set(s * 0.16 + 0.025, 0.1, 0.44); eyes.add(hl);
    for (const r of [0.8, -0.8]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.04), ink); b.position.set(s * 0.16, 0.06, 0.42); b.rotation.z = r; xEyes.add(b);
    }
    const ch = mesh(SPH, blush, 0.08, 0.05, 0.03); ch.castShadow = false; ch.position.set(s * 0.29, -0.08, 0.33); ch.rotation.y = s * 0.6; headG.add(ch);
  }
  xEyes.visible = false;
  const add = (m, x, y, z) => { m.position.set(x, y, z); headG.add(m); return m; };
  if (def.animal === 'bear') {
    for (const s of [-1, 1]) { add(mesh(SPH, fur, 0.15, 0.15, 0.09), s * 0.3, 0.34, -0.02); add(mesh(SPH, soft, 0.08, 0.08, 0.05), s * 0.3, 0.34, 0.05); }
    add(mesh(SPH, soft, 0.17, 0.13, 0.12), 0, -0.1, 0.38);
    add(mesh(SPH, ink, 0.06, 0.045, 0.04), 0, -0.04, 0.5);
  } else if (def.animal === 'cat') {
    for (const s of [-1, 1]) {
      const e = add(mesh(new THREE.ConeGeometry(0.15, 0.32, 4), fur), s * 0.26, 0.42, 0); e.rotation.z = -s * 0.35;
      const i = add(mesh(new THREE.ConeGeometry(0.08, 0.18, 4), soft), s * 0.25, 0.4, 0.07); i.rotation.z = -s * 0.35;
    }
    add(mesh(SPH, soft, 0.13, 0.08, 0.08), 0, -0.11, 0.39);
    add(mesh(SPH, blush, 0.045, 0.035, 0.03), 0, -0.05, 0.45);
  } else if (def.animal === 'duck') {
    add(mesh(SPH, toon(0xff9a2e), 0.21, 0.08, 0.18), 0, -0.09, 0.44);
    const t = add(mesh(new THREE.ConeGeometry(0.07, 0.24, 6), fur), 0.02, 0.5, 0); t.rotation.z = -0.3;
  } else if (def.animal === 'penguin') {
    const beak = add(mesh(new THREE.ConeGeometry(0.08, 0.22, 10), toon(0xff9a2e)), 0, -0.06, 0.5); beak.rotation.x = Math.PI / 2;
    const tuft = add(mesh(new THREE.ConeGeometry(0.05, 0.18, 6), fur), 0, 0.48, -0.02); tuft.rotation.z = 0.25;
  } else if (def.animal === 'fox') {
    for (const s of [-1, 1]) {
      const e = add(mesh(new THREE.ConeGeometry(0.17, 0.42, 4), fur), s * 0.27, 0.44, -0.02); e.rotation.z = -s * 0.3;
      const tip = add(mesh(new THREE.ConeGeometry(0.075, 0.16, 4), ink), s * 0.335, 0.6, -0.02); tip.rotation.z = -s * 0.3;
      const i = add(mesh(new THREE.ConeGeometry(0.08, 0.2, 4), soft), s * 0.26, 0.42, 0.07); i.rotation.z = -s * 0.3;
    }
    add(mesh(SPH, soft, 0.17, 0.11, 0.2), 0, -0.11, 0.38);
    add(mesh(SPH, ink, 0.055, 0.045, 0.04), 0, -0.07, 0.58);
    const tail = mesh(SPH, fur, 0.17, 0.17, 0.4); tail.position.set(0, 0.52, -0.6); tail.rotation.x = 0.6; tiltG.add(tail);
    const tTip = mesh(SPH, soft, 0.12); tTip.position.set(0, 0.7, -0.92); tiltG.add(tTip);
  } else if (def.animal === 'pig') {
    const dark = toon(lighten(def.color, -0.0).offsetHSL(0, 0.05, -0.12));
    for (const s of [-1, 1]) { const e = add(mesh(new THREE.ConeGeometry(0.13, 0.24, 3), fur), s * 0.27, 0.4, 0.05); e.rotation.set(0.5, 0, -s * 0.4); }
    const snout = add(mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.12, 18), dark), 0, -0.08, 0.44); snout.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) add(mesh(SPH, ink, 0.025, 0.035, 0.02), s * 0.045, -0.08, 0.5);
    const curl = mesh(new THREE.TorusGeometry(0.08, 0.03, 6, 14), fur); curl.position.set(0, 0.6, -0.55); tiltG.add(curl);
  } else if (def.animal === 'dog') {
    const ear = toon(new THREE.Color(def.color).offsetHSL(0, 0, -0.18));
    for (const s of [-1, 1]) { const e = add(mesh(SPH, ear, 0.11, 0.24, 0.07), s * 0.4, 0.04, -0.02); e.rotation.z = s * 0.35; }
    add(mesh(SPH, soft, 0.18, 0.13, 0.15), 0, -0.1, 0.38);
    add(mesh(SPH, ink, 0.07, 0.05, 0.045), 0, -0.03, 0.52);
    add(mesh(SPH, toon(0xff7a90), 0.05, 0.02, 0.05), 0, -0.2, 0.47);
  } else if (def.animal === 'panda') {
    const black = toon(0x2f2a36);
    for (const s of [-1, 1]) {
      add(mesh(SPH, black, 0.14, 0.14, 0.09), s * 0.3, 0.34, -0.02);
      const patch = add(mesh(SPH, black, 0.11, 0.14, 0.05), s * 0.16, 0.05, 0.37); patch.rotation.z = s * 0.45; patch.castShadow = false;
    }
    add(mesh(SPH, black, 0.06, 0.045, 0.04), 0, -0.07, 0.46);
  } else if (def.animal === 'frog') {
    const white2 = toon(0xffffff);
    for (const s of [-1, 1]) add(mesh(SPH, white2, 0.13), s * 0.16, 0.3, 0.17);
    eyes.position.set(0, 0.24, -0.08); xEyes.position.copy(eyes.position);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.03), ink), 0, -0.13, 0.42);
  } else {
    for (const s of [-1, 1]) {
      const e = add(mesh(SPH, fur, 0.11, 0.32, 0.07), s * 0.16, 0.62, -0.02); e.rotation.z = -s * 0.18;
      const i = add(mesh(SPH, soft, 0.06, 0.24, 0.04), s * 0.165, 0.62, 0.035); i.rotation.z = -s * 0.18;
    }
    add(mesh(SPH, blush, 0.05, 0.035, 0.03), 0, -0.04, 0.44);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.03), white), 0, -0.16, 0.41);
  }
  const handMat = def.hand !== undefined ? toon(def.hand) : fur;
  const hands = [mesh(SPH, handMat, 0.17), mesh(SPH, handMat, 0.17)];
  const footMat = def.foot !== undefined ? toon(def.foot) : def.animal === 'duck' ? toon(0xff9a2e) : soft;
  const feet = [mesh(SPH, footMat, 0.19, 0.12, 0.25), mesh(SPH, footMat, 0.19, 0.12, 0.25)];
  tiltG.add(...hands, ...feet);
  const stars = new THREE.Group();
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), starMat); s.position.set(Math.cos(k * TAU / 3) * 0.38, 0, Math.sin(k * TAU / 3) * 0.38); stars.add(s); }
  stars.position.set(0, 0.95, -1.35); stars.visible = false; yawG.add(stars);
  const teamRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.82, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  teamRing.rotation.x = -Math.PI / 2; teamRing.position.y = 0.05; teamRing.visible = false; root.add(teamRing);
  return { root, yawG, tiltG, headG, hands, feet, eyes, xEyes, stars, teamRing };
}
function labelSprite(text, color) {
  const tex = canvasTex(128, 64, (ctx) => {
    ctx.fillStyle = color; ctx.strokeStyle = '#074B53'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(24, 6); ctx.arcTo(122, 6, 122, 58, 18); ctx.arcTo(122, 58, 6, 58, 18); ctx.arcTo(6, 58, 6, 6, 18); ctx.arcTo(6, 6, 122, 6, 18); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1F1A2B'; ctx.font = 'bold 34px "Jua", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 34);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.1, 0.55, 1); s.renderOrder = 999;
  return s;
}

// ---------------- game balls ----------------
const soccerTex = canvasTex(256, 128, (ctx) => {
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#1F1A2B';
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    const x = i * 44 + (j % 2) * 22 + 10, y = j * 44 + 20;
    ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); } ctx.fill();
  }
});
const COLLECT_COLORS = [0xffd23f, 0xb79cff, 0xff9e6b, 0x7fd6ff, 0xfffdf7];
const ballPool = [];
for (let i = 0; i < NB; i++) {
  const mat = i === 0 ? toon(0xffffff, { map: soccerTex }) : toon(COLLECT_COLORS[i]);
  const me = mesh(SPH, mat); me.visible = false; scene.add(me);
  ballPool.push({ i, mesh: me, pos: new V3(), vel: new V3(), r: 0.6, alive: false, used: false, heldBy: null, respawnT: 0, splashed: false, lastTouch: null, rx: new V3(), safe: { x: 0, z: 0 } });
}
let balls = [];
function setupBalls(m) {
  balls = [];
  ballPool.forEach(b => { b.used = false; b.mesh.visible = false; b.heldBy = null; });
  if (m.mode === 'soccer') {
    const b = ballPool[0]; b.used = true; b.r = 0.85; b.mesh.material = toon(0xffffff, { map: soccerTex });
    balls.push(b);
  } else if (m.mode === 'collect') {
    for (let i = 0; i < NB; i++) { const b = ballPool[i]; b.used = true; b.r = 0.62; b.mesh.material = toon(COLLECT_COLORS[i]); balls.push(b); }
  }
  balls.forEach(b => { b.mesh.scale.setScalar(b.r); placeBall(b, b.i); });
}
function placeBall(b, k) {
  const sp = map.ballSpawns[k % map.ballSpawns.length] || [0, 0];
  b.pos.set(sp[0], map.mode === 'soccer' ? 3.5 : 2, sp[1]); b.vel.set(0, 0, 0);
  b.alive = true; b.splashed = false; b.heldBy = null; b.respawnT = 0; b.lastTouch = null;
  b.safe.x = b.pos.x; b.safe.z = b.pos.z;
  b.mesh.visible = true;
}

// ---------------- particles ----------------
const PGEO = new THREE.SphereGeometry(1, 8, 6);
const parts = [];
for (let i = 0; i < 240; i++) {
  const m = new THREE.Mesh(PGEO, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  m.visible = false; scene.add(m);
  parts.push({ m, v: new V3(), life: 0, max: 1, g: 0, size: 0.1 });
}
let pIdx = 0;
function emit(x, y, z, vx, vy, vz, color, size, life, g) {
  const p = parts[pIdx++ % parts.length];
  p.m.position.set(x, y, z); p.v.set(vx, vy, vz); p.m.material.color.set(color);
  p.life = p.max = life; p.g = g; p.size = size; p.m.visible = true;
}
const rings = [];
for (let i = 0; i < 6; i++) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
  rings.push({ m, life: 0 });
}
let rIdx = 0;
function updateParticles(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.m.visible = false; continue; }
    p.v.y -= p.g * dt;
    p.m.position.addScaledVector(p.v, dt);
    const k = p.life / p.max;
    p.m.scale.setScalar(p.size * (0.35 + 0.65 * k));
    p.m.material.opacity = Math.min(1, k * 2);
  }
  for (const r of rings) {
    if (r.life <= 0) continue;
    r.life -= dt;
    if (r.life <= 0) { r.m.visible = false; continue; }
    const k = 1 - r.life / 1.1;
    r.m.scale.setScalar(0.6 + k * 3.4);
    r.m.material.opacity = (1 - k) * 0.9;
  }
}

// ---------------- audio ----------------
let AC = null, master = null, noiseBuf = null, muted = false;
function ac() {
  if (!audioUnlocked) return null;
  if (!AC) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    AC = new C();
    master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f0, f1, dur, vol, type, delay) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime + (delay || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, f0, f1, vol, type) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime;
  const s = a.createBufferSource(); s.buffer = noiseBuf;
  const fl = a.createBiquadFilter(); fl.type = type || 'lowpass';
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}
const sfx = {
  punch() { noise(0.12, 1800, 300, 0.55); tone(170, 60, 0.13, 0.4, 'triangle'); },
  kick() { noise(0.1, 2400, 500, 0.4); tone(240, 90, 0.12, 0.35, 'triangle'); },
  swing() { noise(0.09, 2500, 900, 0.08, 'bandpass'); },
  splash() { noise(0.7, 2200, 300, 0.55, 'bandpass'); tone(500, 90, 0.35, 0.12, 'sine'); },
  jump() { tone(280, 620, 0.12, 0.12, 'square'); },
  boing() { tone(160, 900, 0.32, 0.25, 'sine'); tone(170, 880, 0.32, 0.12, 'triangle', 0.02); },
  whoosh() { noise(0.3, 600, 3000, 0.25, 'bandpass'); },
  grab() { tone(520, 380, 0.08, 0.15, 'triangle'); },
  throw() { noise(0.25, 900, 2600, 0.25, 'bandpass'); tone(240, 520, 0.18, 0.15, 'triangle'); },
  ko() { tone(1200, 300, 0.5, 0.15, 'sawtooth'); tone(900, 200, 0.5, 0.08, 'square', 0.06); },
  bonk() { tone(130, 45, 0.3, 0.55, 'sine'); noise(0.15, 1200, 200, 0.4); },
  tick() { tone(660, 660, 0.12, 0.18, 'square'); },
  go() { tone(880, 1320, 0.3, 0.2, 'square'); },
  whistle() { tone(1700, 1500, 0.5, 0.15, 'square'); },
  goal() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.22, 0.16, 'square', i * 0.08)); noise(1.0, 3000, 800, 0.2, 'bandpass'); },
  score() { tone(660, 990, 0.18, 0.15, 'triangle'); },
  quake() { tone(90, 30, 0.55, 0.6, 'sine'); noise(0.4, 900, 120, 0.45); },
  quack() { tone(620, 380, 0.12, 0.25, 'sawtooth'); tone(560, 330, 0.14, 0.2, 'sawtooth', 0.13); },
  blink() { tone(900, 2600, 0.16, 0.15, 'sine'); },
  heavy() { tone(180, 70, 0.45, 0.35, 'square'); },
  tongue() { tone(260, 980, 0.12, 0.2, 'triangle'); noise(0.1, 2000, 600, 0.15, 'bandpass'); },
  counter() { [660, 880, 1320].forEach((f, i) => tone(f, f * 1.02, 0.12, 0.2, 'square', i * 0.06)); noise(0.2, 2400, 500, 0.35); },
  rhHit() { tone(1046, 1046, 0.07, 0.12, 'triangle'); },
  rhMiss() { tone(180, 120, 0.1, 0.12, 'sawtooth'); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.25, 0.18, 'square', i * 0.12)); },
};
function play(name) { if (state === 'menu') return; sfx[name] && sfx[name](); }

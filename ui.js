// 3인칭 카메라, 메인 루프, 메뉴와 캐릭터 미리보기, 터치 조작, 리듬게임 화면, 시작
'use strict';

// ---------------- camera ----------------
const camTarget = new V3(0, 0, 0), camWant = new V3(), lookWant = new V3();
function updateCamera(dt, rt) {
  let dist;
  const ext = map ? map.ext : 15;
  if (state === 'menu') {
    const a = rt * 0.06;
    dist = (ext * 2.8 + 6) * aspectMul;
    lookWant.set(aspectMul > 1 ? 0 : -10, 0, 0);
    camWant.set(lookWant.x + Math.sin(a) * dist * 0.7, dist * 0.6, Math.cos(a) * dist * 0.7);
  } else if (state === 'replay' && replay) {
    const fr = recording[Math.min(replay.end, Math.floor(replay.idx))];
    const o = replay.victim * NS;
    let vx = fr[o], vy = Math.max(fr[o + 1], WATER_Y + 0.5), vz = fr[o + 2];
    if (fr[o + 18] < 0.5 && replay.lx !== undefined) { vx = replay.lx; vy = replay.ly; vz = replay.lz; }
    else { replay.lx = vx; replay.ly = vy; replay.lz = vz; }
    lookWant.set(vx, vy + 0.8, vz);
    const a = (replay.idx - replay.start) * 0.004 + 0.3;
    dist = 10 * Math.min(aspectMul, 1.5);
    camWant.set(vx + Math.sin(a) * dist * 0.75, vy + dist * 0.55, vz + Math.cos(a) * dist * 0.75);
  } else {
    // third person: sit behind my character, looking where the camera yaw points
    const me = players.find(p => p.kind === 'local' || p.kind === 'me');
    if (state === 'countdown' && camRound !== round) { camRound = round; if (me) camYaw = me.yaw; camPitch = 0.42; camSnap = true; }
    let focus = me && me.alive && me.pos.y > WATER_Y + 0.5 ? me : null;
    if (!focus) {
      if (!camSpec || !camSpec.alive || camSpec.pos.y < WATER_Y + 0.5) camSpec = players.find(q => q.alive && q.pos.y > -1) || null;
      focus = camSpec;
    }
    // swing round behind the player while they run forward and leave the mouse alone
    if (focus && focus === me && state === 'play' && performance.now() - lastCamInput > 1200 && camIn.z > 0.5 && Math.abs(camIn.x) < 0.5) {
      const sp = Math.hypot(me.vel.x, me.vel.z);
      if (sp > 3) {
        const d = ((Math.atan2(me.vel.x, me.vel.z) - camYaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
        if (Math.abs(d) < 1.3) camYaw += d * (1 - Math.exp(-0.9 * dt));
      }
    }
    const tx = focus ? focus.pos.x : 0, ty = focus ? Math.max(focus.pos.y, WATER_Y + 1) : 0, tz = focus ? focus.pos.z : 0;
    dist = (focus ? 9.5 : ext * 1.4) * (camera.aspect < 1 ? 1.35 : 1) * (touchOn ? 1.1 : 1);
    const hd = Math.cos(camPitch) * dist, h = Math.sin(camPitch) * dist;
    lookWant.set(tx, ty + 1.3, tz);
    camWant.set(tx - Math.sin(camYaw) * hd, ty + 1.3 + h, tz - Math.cos(camYaw) * hd);
  }
  if (state === 'menu') camRound = -1;
  const k = camSnap ? 1 : 1 - Math.exp(-(state === 'replay' ? 5 : state === 'menu' ? 3 : 12) * dt);
  camSnap = false;
  camera.position.lerp(camWant, k);
  camTarget.lerp(lookWant, k);
  if (shake > 0.001) {
    camera.position.x += rnd(-shake, shake); camera.position.y += rnd(-shake, shake);
    shake *= Math.exp(-9 * dt);
  }
  camera.lookAt(camTarget);
}

// ---------------- water ----------------
let waterFrame = 0;
function updateWater(t) {
  const pos = waterGeo.attributes.position, arr = pos.array;
  for (let i = 0; i < arr.length; i += 3) {
    const x = waterBase[i], y = waterBase[i + 1];
    arr[i + 2] = Math.sin(x * 0.2 + t * 1.3) * 0.18 + Math.cos(y * 0.24 + t * 0.9) * 0.14;
  }
  pos.needsUpdate = true;
  if ((waterFrame++ & 1) === 0) waterGeo.computeVertexNormals();
  for (const f of floaties) { f.m.position.y = WATER_Y + 0.12 + Math.sin(t * 1.4 + f.ph) * 0.2; f.m.rotation.z = t * 0.2 + f.ph; }
}

// ---------------- loop ----------------
let last = performance.now(), acc = 0, frameN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtR = Math.min(0.1, (now - last) / 1000); last = now;
  const rt = now / 1000;
  frameN++;
  let live = false;
  if (state === 'replay') {
    stepReplay(dtR);
    if (mode === 'client') sendClientInput();
  } else if (mode === 'client' && state !== 'menu') {
    if (state !== 'result') {
      acc += dtR;
      let steps = 0;
      while (acc >= DT && steps < 5) { clientTick(DT); acc -= DT; steps++; }
      if (steps === 5) acc = 0;
      live = true;
    }
  } else if (state !== 'result') {
    acc += dtR * (state === 'roundEnd' ? 0.35 : 1);
    let steps = 0;
    while (acc >= DT && steps < 5) { tick(DT); acc -= DT; steps++; }
    if (steps === 5) acc = 0;
    live = true;
  }
  if (live) {
    players.forEach(p => applyState(p.m, p.st, simTime));
    applyHazards(hazardState());
    updateBallMeshes(dtR);
  }
  if (mode === 'host' && state !== 'menu' && frameN % 2 === 0) hostPublish();
  updateTiles(state === 'replay' ? dtR * 0.55 : state === 'roundEnd' ? dtR * 0.35 : dtR);
  updateParticles(dtR);
  updateWater(rt);
  updateCamera(dtR, rt);
  updateHUD();
  updateTouchUI();
  updateRhythm(dtR);
  updatePreview(rt);
  renderer.render(scene, camera);
}

// ---------------- UI wiring ----------------
$('#segCpu').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; cpuCount = +b.dataset.v; syncModeUI(); });
// ---------------- character preview: live 3D model and generated portraits ----------------
const pvCanvas = $('#charPreview');
const pvRenderer = new THREE.WebGLRenderer({ canvas: pvCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
pvRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
pvRenderer.setClearColor(0x000000, 0);
const pvScene = new THREE.Scene();
pvScene.add(new THREE.HemisphereLight(0xffffff, 0x6fb3c4, 0.55));
const pvSun = new THREE.DirectionalLight(0xffffff, 0.6); pvSun.position.set(3, 6, 5); pvScene.add(pvSun);
const pvBase = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.22, 40), toon(0xffd23f));
pvBase.position.y = -0.11; pvScene.add(pvBase);
const pvRim = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 10, 48), toon(0xff6b8b));
pvRim.rotation.x = Math.PI / 2; pvRim.position.y = 0.0; pvScene.add(pvRim);
const pvCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
const pvSt = new Float32Array(NS);
let pvChar = null, pvCi = -1, pvW = 0, pvH = 0;
function pvPose(t, yaw) {
  pvSt.fill(0);
  pvSt[3] = yaw; pvSt[5] = Math.sin(t * 2) * 0.08; pvSt[4] = Math.sin(t * 1.3) * 0.05;
  pvSt[6] = Math.sin(t * 2) * 0.04; pvSt[7] = Math.abs(Math.sin(t * 3)) * 0.03;
  pvSt[9] = -0.62; pvSt[10] = 0.7 + Math.sin(t * 2.4) * 0.05; pvSt[11] = 0.05;
  pvSt[12] = 0.6; pvSt[13] = 1.25 + Math.sin(t * 9) * 0.15; pvSt[14] = 0.25;
  pvSt[18] = 1; pvSt[19] = 1 + Math.sin(t * 3) * 0.03; pvSt[20] = 1;
  applyState(pvChar, pvSt, t);
}
function pvSetChar(ci) {
  if (pvCi === ci && pvChar) return;
  if (pvChar) pvScene.remove(pvChar.root);
  pvChar = buildChar(DEFS[ci]); pvCi = ci;
  pvScene.add(pvChar.root);
}
function pvResize() {
  const w = pvCanvas.clientWidth || 300, h = pvCanvas.clientHeight || 230;
  if (w === pvW && h === pvH) return;
  pvW = w; pvH = h; pvRenderer.setSize(w, h, false);
  pvCam.aspect = w / h; pvCam.updateProjectionMatrix();
}
// portraits for the picker grid, rendered once from the same models
const charThumbs = (() => {
  const out = [];
  pvRenderer.setPixelRatio(1); pvRenderer.setSize(128, 128, false);
  pvCam.aspect = 1; pvCam.position.set(0, 1.45, 3.7); pvCam.lookAt(0, 1.05, 0); pvCam.updateProjectionMatrix();
  pvBase.visible = pvRim.visible = false;
  DEFS.forEach((d, k) => {
    pvSetChar(k); pvPose(0.4, 0.35);
    pvSt[12] = 0.62; pvSt[13] = 0.72; pvSt[14] = 0.05; applyState(pvChar, pvSt, 0);
    pvRenderer.render(pvScene, pvCam);
    out.push(pvCanvas.toDataURL('image/png'));
  });
  pvBase.visible = pvRim.visible = true;
  pvRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  pvW = pvH = 0;
  return out;
})();
function updatePreview(rt) {
  if ($('#menu').hidden || !pvChar) return;
  pvResize();
  pvCam.position.set(0, 1.55, 5.4); pvCam.lookAt(0, 0.95, 0);
  pvPose(rt, -0.35 + Math.sin(rt * 0.7) * 0.7);
  pvRenderer.render(pvScene, pvCam);
}
function showPreviewChar(ci) {
  pvSetChar(ci);
  const d = DEFS[ci], a = AB[AB_OF[d.animal]];
  $('#charName').textContent = d.name;
  $('#charAb').textContent = a.name;
}
function selectChar(k) {
  settings.char = ((k % DEFS.length) + DEFS.length) % DEFS.length;
  if (state === 'menu') startDemo(); else syncModeUI();
  if (net && net.isHost && state === 'menu') hostPeers([...net.peerMap.values()], true);
  else if (net && !net.isHost) net.room.presence({ ch: settings.char }).catch(() => {});
  renderLobby();
}
(() => {
  const g = $('#charGrid');
  DEFS.forEach((d, k) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.v = k; b.style.setProperty('--pc', d.css);
    const img = document.createElement('img'); img.src = charThumbs[k]; img.alt = '';
    const nm = document.createElement('span'); nm.textContent = d.name;
    b.append(img, nm); g.appendChild(b);
  });
  g.addEventListener('click', e => { const b = e.target.closest('button'); if (b) selectChar(+b.dataset.v); });
  $('#charPrev').addEventListener('click', () => selectChar(settings.char - 1));
  $('#charNext').addEventListener('click', () => selectChar(settings.char + 1));
})();
$('#segMode').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || mode === 'client') return;
  settings.mode = b.dataset.v; syncModeUI();
  if (net && net.isHost && state === 'menu') hostPeers([...net.peerMap.values()], true);
  renderLobby();
});
$('#tabSolo').addEventListener('click', () => setTab('solo'));
$('#tabOnline').addEventListener('click', () => setTab('online'));
$('#startBtn').addEventListener('click', () => { if (net) leaveRoom(); mode = 'solo'; startMatch(soloRoster()); });
$('#createBtn').addEventListener('click', createRoom);
$('#joinBtn').addEventListener('click', joinRoom);
$('#codeIn').addEventListener('input', e => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4); });
$('#fillChk').addEventListener('change', renderLobby);
$('#netStartBtn').addEventListener('click', () => { if (net && net.isHost) startMatch(hostRoster()); });
$('#leaveBtn').addEventListener('click', () => { leaveRoom(); setNetMsg(DEFAULT_NET_MSG); renderLobby(); });
$('#resNext').addEventListener('click', () => {
  if (mode === 'client') return;
  if (round >= ROUNDS) restartMatch(); else nextRound();
});
function goHome() {
  if (mode === 'host') { startDemo(); setTab('online'); if (net) hostPeers([...net.peerMap.values()], true); }
  else if (mode === 'client') { leaveRoom(); startDemo(); setTab('online'); setNetMsg(DEFAULT_NET_MSG); }
  else startDemo();
}
$('#resMenu').addEventListener('click', goHome);
$('#sound').addEventListener('click', () => {
  muted = !muted;
  $('#sound').textContent = muted ? '소리 켜기' : '소리 끄기';
  $('#sound').setAttribute('aria-pressed', String(muted));
});
const unlock = () => { audioUnlocked = true; ac(); };
addEventListener('pointerdown', unlock);
addEventListener('keydown', e => {
  unlock();
  const tg = e.target && e.target.tagName;
  if (tg === 'INPUT') {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); joinRoom(); }
    return;
  }
  if (rh && RH_KEYS[e.code] !== undefined) { e.preventDefault(); if (!e.repeat) rhythmPress(RH_KEYS[e.code]); return; }
  // double-tap a direction key to dash that way
  if (!e.repeat && RH_KEYS[e.code] !== undefined && (state === 'play' || state === 'roundEnd')) {
    const tNow = performance.now();
    if (tapDash.code === e.code && tNow - tapDash.t < 260) { pressed.add('TapDash'); tapDash.t = 0; }
    else { tapDash.code = e.code; tapDash.t = tNow; }
  }
  const inGame = state !== 'menu' && state !== 'result';
  if (inGame && GAME_KEYS.has(e.code)) e.preventDefault();
  if (!e.repeat && !down.has(e.code)) pressed.add(e.code);
  down.add(e.code);
  const onButton = tg === 'BUTTON';
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (onButton) return;
    if (state === 'menu' && !$('#soloPane').hidden) $('#startBtn').click();
    else if (state === 'replay' && mode !== 'client') endReplay();
    else if (state === 'result' && mode !== 'client') $('#resNext').click();
  } else if (e.code === 'Escape') {
    if (document.pointerLockElement || performance.now() - lockLostAt < 400) return;
    if (state !== 'menu') goHome();
  } else if (e.code === 'KeyR' && state === 'result' && round >= ROUNDS && mode !== 'client') {
    restartMatch();
  } else if (e.code === 'KeyM') {
    $('#sound').click();
  } else if (state === 'replay' && e.code === 'Space' && mode !== 'client') {
    e.preventDefault(); endReplay();
  }
});
addEventListener('keyup', e => down.delete(e.code));
addEventListener('blur', () => down.clear());
$('#replay').addEventListener('click', () => { if (mode !== 'client') endReplay(); });
addEventListener('pagehide', () => { if (net) leaveRoom(); });

// ---------------- touch controls ----------------
let touchOn = COARSE, touchShown = null, grabLabel = '';
const TOUCH_CODES = ['TouchPunch', 'TouchGrab', 'TouchJump', 'TouchDash'];
const joyZone = $('#joyZone'), joyBase = $('#joyBase'), joyKnob = $('#joyKnob');
function applyTouchMode() {
  document.body.classList.toggle('touch', touchOn);
  $('#replaySkip').textContent = touchOn ? '화면을 누르면 건너뜁니다' : 'Enter 키로 건너뛰기';
}
applyTouchMode();
addEventListener('touchstart', () => { if (!touchOn) { touchOn = true; applyTouchMode(); } unlock(); }, { passive: true });
function moveJoy(e) {
  let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
  const d = Math.hypot(dx, dy), max = 52;
  if (d > max) { dx *= max / d; dy *= max / d; }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  const m = Math.min(1, d / max), dead = 0.15, k = m < dead ? 0 : (m - dead) / (1 - dead), l = Math.hypot(dx, dy) || 1;
  joy.x = dx / l * k; joy.z = dy / l * k;
}
function endJoy() {
  joy.id = null; joy.active = false; joy.x = joy.z = 0;
  joyKnob.style.transform = ''; joyBase.style.left = ''; joyBase.style.top = '';
}
joyZone.addEventListener('pointerdown', e => {
  e.preventDefault(); unlock();
  if (joy.id !== null) return;
  joy.id = e.pointerId;
  try { joyZone.setPointerCapture(e.pointerId); } catch (err) {}
  const r = joyZone.getBoundingClientRect();
  joy.cx = e.clientX; joy.cy = e.clientY; joy.active = true;
  joyBase.style.left = (e.clientX - r.left) + 'px'; joyBase.style.top = (e.clientY - r.top) + 'px';
  moveJoy(e);
});
joyZone.addEventListener('pointermove', e => { if (e.pointerId === joy.id) moveJoy(e); });
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) joyZone.addEventListener(t, e => { if (e.pointerId === joy.id) endJoy(); });
document.querySelectorAll('.tbtn').forEach(b => {
  const code = b.dataset.code;
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); unlock();
    try { b.setPointerCapture(e.pointerId); } catch (err) {}
    if (!down.has(code)) pressed.add(code);
    down.add(code); b.classList.add('on');
  });
  const up = () => { down.delete(code); b.classList.remove('on'); };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, up);
  b.addEventListener('contextmenu', e => e.preventDefault());
});
function releaseTouch() {
  endJoy();
  TOUCH_CODES.forEach(c => down.delete(c));
  document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('on'));
}
// ---------------- third-person camera controls ----------------
const cvs = renderer.domElement;
const inPlay = () => state === 'countdown' || state === 'play' || state === 'roundEnd' || state === 'waitResult';
function rotateCam(dx, dy) {
  camYaw -= dx * 0.0045;
  camPitch = clamp(camPitch + dy * 0.003, 0.12, 1.15);
  lastCamInput = performance.now();
}
let lockLostAt = -1e9, mouseDrag = false;
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== cvs) lockLostAt = performance.now(); });
cvs.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || !inPlay()) return;
  if (cvs.requestPointerLock && document.pointerLockElement !== cvs) {
    try { const r = cvs.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) {}
  }
  mouseDrag = true;
});
addEventListener('pointerup', e => { if (e.pointerType === 'mouse') mouseDrag = false; });
addEventListener('mousemove', e => {
  if (!inPlay()) return;
  if (document.pointerLockElement === cvs || mouseDrag) rotateCam(e.movementX || 0, e.movementY || 0);
});
// touch: drag on the right half (outside the buttons) to look around
const camZone = $('#camZone');
let camTouch = null;
camZone.addEventListener('pointerdown', e => {
  e.preventDefault();
  camTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
  try { camZone.setPointerCapture(e.pointerId); } catch (err) {}
});
camZone.addEventListener('pointermove', e => {
  if (!camTouch || e.pointerId !== camTouch.id) return;
  rotateCam((e.clientX - camTouch.x) * 1.6, (e.clientY - camTouch.y) * 1.6);
  camTouch.x = e.clientX; camTouch.y = e.clientY;
});
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) camZone.addEventListener(t, e => { if (camTouch && e.pointerId === camTouch.id) camTouch = null; });

// ---------------- rhythm mini game (when someone is carrying me) ----------------
const RH_TRAVEL = 1.1, RH_LANE_COL = ['#FF6B8B', '#4AA8FF', '#FFD23F', '#5FD18A'];
const RH_KEYS = { KeyA: 0, ArrowLeft: 0, KeyS: 1, ArrowDown: 1, KeyW: 2, ArrowUp: 2, KeyD: 3, ArrowRight: 3 };
let rh = null, rhJudgeT = 0;
const tapDash = { code: '', t: 0 };
const nowS = () => performance.now() / 1000;
function rhSchedule(from) {
  let t = from;
  for (let k = 0; k < 8; k++) {
    const lane = Math.floor(Math.random() * 4);
    const el = document.createElement('div'); el.className = 'rh-note';
    el.style.left = (4 + lane * 61 + 28.5) + 'px'; el.style.background = RH_LANE_COL[lane];
    $('#rhNotes').appendChild(el);
    rh.notes.push({ lane, t, el, done: false });
    t += [0.42, 0.42, 0.42, 0.63][Math.floor(Math.random() * 4)];
  }
  rh.until = t;
}
function startRhythm() {
  rh = { t0: nowS(), notes: [], pts: 0, until: 0 };
  $('#rhNotes').innerHTML = '';
  rhSchedule(0.9);
  $('#rhythm').hidden = false; rhJudge('', 0); rhPips();
}
function stopRhythm() {
  rh = null;
  $('#rhNotes').innerHTML = '';
  $('#rhythm').hidden = true;
}
function rhPips() { $('#rhPips').querySelectorAll('i').forEach((el, k) => el.classList.toggle('on', !!rh && k < rh.pts)); }
function rhJudge(text, hold) { $('#rhJudge').textContent = text; rhJudgeT = hold; }
function rhythmPress(lane) {
  if (!rh) return;
  const laneEl = $('#rhBoard').querySelector(`.rh-lane[data-l="${lane}"]`);
  laneEl.classList.add('hit'); setTimeout(() => laneEl.classList.remove('hit'), 90);
  const t = nowS() - rh.t0;
  let best = null, bd = 1e9;
  for (const n of rh.notes) { if (n.done || n.lane !== lane) continue; const d = Math.abs(n.t - t); if (d < bd) { bd = d; best = n; } }
  if (!best || bd > 0.17) { rhJudge('빗나감', 0.4); play('rhMiss'); return; }
  best.done = true; best.el.classList.add('ok');
  rh.pts++;
  rhJudge(bd < 0.07 ? '완벽!' : '좋아!', 0.4); play('rhHit');
  const me = players.find(q => q.kind === 'local' || q.kind === 'me');
  if (mode === 'client') { if (net) net.cnt.h++; }
  else if (me) me.rhythmPts = (me.rhythmPts || 0) + 1;
  if (rh.pts >= RH_NEED) rhJudge('반격!', 1);
  rhPips();
}
function updateRhythm(dt) {
  const me = players.find(q => q.kind === 'local' || q.kind === 'me');
  const active = !!me && me.alive && !!me.grabbedBy && !limp(me) && (state === 'play' || state === 'roundEnd');
  if (active && !rh) startRhythm();
  if (!active && rh) stopRhythm();
  if (!rh) return;
  const t = nowS() - rh.t0, lineY = 156;
  for (const n of rh.notes) {
    const y = lineY - 11 - (n.t - t) / RH_TRAVEL * lineY;
    n.el.style.transform = `translateY(${y.toFixed(1)}px)`;
    if (!n.done && t - n.t > 0.17) { n.done = true; n.el.classList.add('miss'); rhJudge('놓침', 0.3); }
  }
  rh.notes = rh.notes.filter(n => { if (t - n.t > 0.6) { n.el.remove(); return false; } return true; });
  if (rh.until - t < 1.5) rhSchedule(rh.until);
  if (rhJudgeT > 0) { rhJudgeT -= dt; if (rhJudgeT <= 0) $('#rhJudge').textContent = ''; }
}
$('#rhBoard').querySelectorAll('.rh-lane').forEach(el => {
  el.addEventListener('pointerdown', e => { e.preventDefault(); unlock(); rhythmPress(+el.dataset.l); });
});

function updateTouchUI() {
  if (document.pointerLockElement === cvs && !inPlay()) document.exitPointerLock();
  const me = players.find(p => p.kind === 'local' || p.kind === 'me');
  const show = touchOn && !!me && (state === 'countdown' || state === 'play' || state === 'roundEnd');
  if (show !== touchShown) { touchShown = show; $('#touchUI').hidden = !show; if (!show) releaseTouch(); }
  if (show) {
    for (const [id, cd] of [['#tDash', me.dashCd], ['#tAb', me.abCd]]) {
      const b = $(id);
      b.classList.toggle('cool', cd > 0);
      const t = cd > 0 ? String(Math.ceil(cd)) : '';
      if (b.dataset.cd !== t) b.dataset.cd = t;
    }
    const g = me.grabbing || me.holdBall ? '던지기' : '잡기';
    if (g !== grabLabel) { grabLabel = g; $('#tGrab').textContent = g; }
  }
  if (touchOn && state !== 'menu') {
    const v = Math.round($('#clock').getBoundingClientRect().bottom + 6) + 'px';
    const chips = $('#chips');
    if (chips.style.paddingTop !== v) chips.style.paddingTop = v;
  }
}

startDemo();
requestAnimationFrame(frame);

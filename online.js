// 온라인 대전 (claude.ai 아티팩트의 room 기능 사용)
'use strict';

// =====================================================================
// ---------------- online (room capability, presence only) ----------------
// =====================================================================
let roomApi = null;
let net = null;
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
function genCode() { let s = ''; for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }

(async () => {
  try {
    if (window.claude && typeof window.claude.use === 'function') roomApi = await window.claude.use('room');
  } catch (e) { roomApi = null; }
  renderLobby();
})();

function setNetMsg(text, warn) { const el = $('#netMsg'); el.textContent = text; el.classList.toggle('warn', !!warn); }
const DEFAULT_NET_MSG = '친구와 2명부터 4명까지 함께할 수 있어요. 모두 claude.ai에 로그인한 상태로 이 페이지를 열어야 합니다.';

async function createRoom() {
  if (!roomApi) return;
  $('#createBtn').disabled = true;
  try {
    const code = genCode();
    const room = await roomApi.join('rr-' + code);
    net = newNet(room, code, true);
    mode = 'host';
    await room.presence({ role: 'host', v: 2, seats: [], mo: settings.mode }).catch(() => {});
    net.unsubs.push(room.onPeers(onNetPeers, onNetError));
    setNetMsg(DEFAULT_NET_MSG);
  } catch (e) {
    setNetMsg('방을 만들지 못했어요. 잠시 후 다시 눌러 주세요.', true);
    net = null; mode = 'solo';
  }
  $('#createBtn').disabled = false;
  syncModeUI();
  renderLobby();
}
async function joinRoom() {
  if (!roomApi) return;
  const code = $('#codeIn').value.trim().toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) { setNetMsg('코드는 영문과 숫자 4자리입니다.', true); return; }
  $('#joinBtn').disabled = true;
  try {
    const room = await roomApi.join('rr-' + code);
    net = newNet(room, code, false);
    mode = 'client';
    await room.presence({ role: 'guest', v: 2, ch: settings.char, inp: { x: 0, z: 0, j: 0, p: 0, g: 0, d: 0, a: 0 } }).catch(() => {});
    net.unsubs.push(room.onPeers(onNetPeers, onNetError));
    net.findTimer = setTimeout(() => {
      if (net && !net.isHost && !net.sawHost) { leaveRoom(); setNetMsg('이 코드로 열린 방을 찾지 못했어요. 코드를 다시 확인해 주세요.', true); renderLobby(); }
    }, 6000);
    setNetMsg('방장을 찾는 중입니다…');
  } catch (e) {
    setNetMsg('방에 들어가지 못했어요. 잠시 후 다시 시도해 주세요.', true);
    net = null; mode = 'solo';
  }
  $('#joinBtn').disabled = false;
  syncModeUI();
  renderLobby();
}
function newNet(room, code, isHost) {
  return { room, code, isHost, myPeer: null, peerMap: new Map(), seats: [], gid: null, unsubs: [], sawHost: false, findTimer: 0,
    snap: null, lastHostPres: null, seatsKey: '', lastFx: -1, lastFeed: -1, banKey: '', cnt: { j: 0, p: 0, g: 0, d: 0, a: 0, b: 0, h: 0 }, lastInpKey: '', elimTick: {} };
}
function leaveRoom() {
  if (!net) return;
  clearTimeout(net.findTimer);
  net.unsubs.forEach(u => { try { u(); } catch (e) {} });
  const room = net.room;
  net = null; mode = 'solo';
  room.leave().catch(() => {});
  syncModeUI();
}
function onNetError() {
  if (!net) return;
  leaveRoom();
  startDemo();
  setTab('online');
  setNetMsg('연결이 끊어졌어요. 다시 방을 만들거나 참가해 주세요.', true);
}
function onNetPeers(ch) {
  if (!net) return;
  const ps = ch.peers;
  net.peerMap = new Map(ps.map(p => [p.peer, p]));
  const me = ps.find(p => p.sameTab);
  if (me) net.myPeer = me.peer;
  if (net.isHost) hostPeers(ps); else clientPeers(ps);
}
function hostPeers(ps, force) {
  if (!net || !net.myPeer) return;
  const guests = new Set(ps.filter(p => !p.sameTab && p.presence && p.presence.role === 'guest').map(p => p.peer));
  if (state === 'menu') {
    const seats = [net.myPeer, ...net.seats.filter(s => s !== net.myPeer && guests.has(s))];
    for (const p of ps) if (guests.has(p.peer) && !seats.includes(p.peer) && seats.length < 4) seats.push(p.peer);
    net.seats = seats;
    const chs = lobbyChars();
    const key = JSON.stringify(seats) + settings.mode + chs.join(',');
    if (force || key !== net.seatsKey) { net.seatsKey = key; net.room.presence({ role: 'host', v: 2, seats, chs, mo: settings.mode, g: null, P: null, B: null }).catch(() => {}); }
    renderLobby();
  } else {
    for (const p of players) {
      if (p.kind === 'remote' && !guests.has(p.peer)) {
        p.kind = 'cpu'; p.ai = newAI(); p.tag = 'CPU';
        if (p.ui) p.ui.el.querySelector('.chip-tag').textContent = 'CPU';
        feed(`${p.name} 연결이 끊겨 컴퓨터가 이어서 합니다`);
      }
    }
  }
}
function clientPeers(ps) {
  const host = ps.find(p => !p.sameTab && p.presence && p.presence.role === 'host');
  if (!host) {
    if (net.sawHost) { leaveRoom(); startDemo(); setTab('online'); setNetMsg('방장이 방을 나갔어요.', true); }
    return;
  }
  if (!net.sawHost) { net.sawHost = true; clearTimeout(net.findTimer); setNetMsg(DEFAULT_NET_MSG); }
  const pr = host.presence;
  if (pr === net.lastHostPres) return;
  net.lastHostPres = pr;
  if (Array.isArray(pr.seats)) net.seats = pr.seats.filter(s => typeof s === 'string').slice(0, 4);
  if (Array.isArray(pr.chs)) net.chs = pr.chs.slice(0, 4).map(c => num(c, -1));
  if (MODES[pr.mo] && settings.mode !== pr.mo) { settings.mode = pr.mo; syncModeUI(); }
  if (pr.g && typeof pr.g === 'object' && Array.isArray(pr.P)) {
    net.snap = { P: pr.P, B: Array.isArray(pr.B) ? pr.B : [], at: performance.now() / 1000 };
    clientApplyG(pr.g);
  } else if (net.gid) {
    net.gid = null;
    startDemo();
    setTab('online');
  } else renderLobby();
}

// ----- host publishing -----
function flagsOf(p) {
  return (p.alive ? 1 : 0) | (p.grounded ? 2 : 0) | (p.ko ? 4 : 0) | (p.grabbing ? 8 : 0) | (p.grabbedBy ? 16 : 0)
    | (p.punchHand ? 32 : 0) | (p.grabWhiff > 0 ? 64 : 0) | (p.dashT > 0 ? 128 : 0) | (p.ragT > 0 ? 256 : 0) | (p.holdBall ? 512 : 0) | (p.abT > 0 ? 1024 : 0);
}
function hostPublish() {
  if (!net || !net.isHost || state === 'menu') return;
  const P = players.map(p => [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.vel.x), r2(p.vel.y), r2(p.vel.z), r2(p.yaw), flagsOf(p),
    r2(Math.max(0, p.punchT)), Math.round(p.dizzy), r2(Math.max(0, p.dashCd)), r2(Math.max(0, p.abCd))]);
  const B = balls.map(b => [r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), b.alive ? 1 : 0, r2(b.vel.x), r2(b.vel.z)]);
  const g = {
    gid: net.gid, st: state, rd: round, tm: r2(roundTime), ev, mo: gameMode, ms: mapSeed,
    ro: players.map(p => p.kind === 'local' ? net.myPeer : p.kind === 'remote' ? p.peer : 'cpu'),
    ch: players.map(p => p.ci),
    sc: players.map(p => p.score), rp: players.map(p => p.roundPts), re: players.map(p => p.roundElims),
    ts: teamScore, tw: teamWins, rw: roundWinner,
    ban: curBanner, fx: netFx, fd: feedLog, rep: repInfo,
    hz: [r2(spinA), r2(sweepA), r2(sweepW), r2(pendT)],
    hx: map && map.hex ? map.hex.trig : null,
  };
  net.room.presence({ role: 'host', v: 2, seats: net.seats, mo: settings.mode, g, P, B }).catch(() => {});
}

// ----- client mirroring -----
function clientApplyG(g) {
  const ro = Array.isArray(g.ro) ? g.ro.slice(0, 4) : [];
  const mo = MODES[g.mo] ? g.mo : 'battle';
  if (g.gid !== net.gid || players.length !== ro.length) {
    net.gid = g.gid;
    gameMode = mo;
    clearPlayers();
    ro.forEach((pe, i) => {
      const kind = pe === net.myPeer ? 'me' : pe === 'cpu' ? 'cpu' : 'remote';
      const tag = kind === 'me' ? '나' : kind === 'cpu' ? 'CPU' : 'P' + (i + 1);
      const p = makePlayer(i, kind, tag, pe, Array.isArray(g.ch) ? num(g.ch[i], -1) : i);
      p.ai = null;
      resetPlayer(p, 0, 0);
      players.push(p);
    });
    round = 0; state = 'countdown';
    buildChips();
    const fxs = Array.isArray(g.fx) ? g.fx : [], fds = Array.isArray(g.fd) ? g.fd : [];
    net.lastFx = fxs.length ? num(fxs[fxs.length - 1].i) : -1;
    net.lastFeed = fds.length ? num(fds[fds.length - 1].i) : -1;
    $('#menu').hidden = true; $('#hud').hidden = false; $('#result').hidden = true;
  }
  const rd = num(g.rd, 1);
  if (rd !== round) {
    round = rd;
    setupRoundWorld(mo, EVENTS[g.ev] ? g.ev : 'none', num(g.ms, 1));
    const P = net.snap.P;
    players.forEach((p, i) => { const a = P[i] || []; resetPlayer(p, num(a[0]), num(a[2])); });
    recording = []; fxLog = []; net.elimTick = {}; replay = null;
    $('#result').hidden = true; $('#replay').hidden = true; $('#hud').hidden = false;
    updateRoundLabels();
  }
  players.forEach((p, i) => {
    p.score = num(g.sc && g.sc[i]); p.roundPts = num(g.rp && g.rp[i]); p.roundElims = num(g.re && g.re[i]);
  });
  roundTime = num(g.tm, ROUND_TIME);
  if (Array.isArray(g.ts)) teamScore = [num(g.ts[0]), num(g.ts[1])];
  if (Array.isArray(g.tw)) teamWins = [num(g.tw[0]), num(g.tw[1])];
  roundWinner = num(g.rw, -1);
  if (Array.isArray(g.hz)) {
    spinA = num(g.hz[0]); sweepA = num(g.hz[1]); sweepW = num(g.hz[2], 0.8);
    if (ev === 'pend') { pendT = num(g.hz[3]); computePend(0); }
  }
  if (map && map.hex && Array.isArray(g.hx)) for (const i of g.hx) { const t = map.hex.tiles[num(i, -1)]; if (t && t.state === 0) triggerTile(t, true); }
  if (Array.isArray(g.ban)) {
    const key = String(g.ban[0] || '') + '|' + String(g.ban[1] || '');
    if (key !== net.banKey) { net.banKey = key; setBanner(String(g.ban[0] || ''), String(g.ban[1] || '')); }
  }
  if (Array.isArray(g.fd)) for (const f of g.fd) { if (f && num(f.i) > net.lastFeed) { net.lastFeed = num(f.i); showFeed(String(f.t || '')); } }
  if (Array.isArray(g.fx)) for (const f of g.fx) {
    if (f && num(f.i) > net.lastFx) { net.lastFx = num(f.i); if (typeof f.k === 'string') fx(f.k, num(f.x), num(f.y), num(f.z)); }
  }
  const st = g.st;
  if (st === 'countdown') { state = 'countdown'; recordOn = false; }
  else if (st === 'play' || st === 'roundEnd') {
    if (state !== 'play' && state !== 'roundEnd') recordOn = true;
    state = st;
  } else if (st === 'replay') {
    if (state !== 'replay' && state !== 'waitResult' && state !== 'result') {
      recordOn = false;
      const rep = g.rep;
      const v = rep ? num(rep.v, -1) : -1;
      const tk = net.elimTick[v];
      if (rep && players[v] && tk !== undefined && recording.length > 10) startReplay({ tick: tk, victim: players[v], caption: String(rep.cap || '') });
      else state = 'waitResult';
    }
  } else if (st === 'result') {
    if (state !== 'result') { replay = null; recordOn = false; showResult(); }
  }
}
function clientTick(dt) {
  simTime += dt;
  updateHazards(dt);
  const s = net && net.snap;
  if (s) {
    const age = Math.min(0.15, performance.now() / 1000 - s.at);
    const k = 1 - Math.exp(-14 * dt);
    players.forEach((p, i) => {
      const a = s.P[i]; if (!Array.isArray(a)) return;
      const f = num(a[7]);
      const alive = !!(f & 1);
      if (p.alive && !alive && (state === 'play' || state === 'roundEnd')) net.elimTick[i] = recording.length;
      if (!p.alive && alive) { p.pos.set(num(a[0]), num(a[1]), num(a[2])); p.prevVel.set(0, 0, 0); }
      p.alive = alive;
      const vx = num(a[3]), vy = num(a[4]), vz = num(a[5]);
      const tx = num(a[0]) + vx * age, ty = Math.max(num(a[1]) + vy * age, f & 2 ? num(a[1]) : -99), tz = num(a[2]) + vz * age;
      if (Math.hypot(tx - p.pos.x, ty - p.pos.y, tz - p.pos.z) > 3) p.pos.set(tx, ty, tz);
      else { p.pos.x += (tx - p.pos.x) * k; p.pos.y += (ty - p.pos.y) * k; p.pos.z += (tz - p.pos.z) * k; }
      p.vel.set(vx, vy, vz);
      p.yaw = lerpAngle(p.yaw, num(a[6]), 0.5);
      p.grounded = !!(f & 2); p.ko = !!(f & 4);
      p.grabbing = (f & 8) ? true : null; p.grabbedBy = (f & 16) ? true : null;
      p.punchHand = (f & 32) ? 1 : 0; p.grabWhiff = (f & 64) ? 0.1 : 0; p.dashT = (f & 128) ? 0.1 : 0;
      p.ragT = (f & 256) ? 0.1 : 0; p.holdBall = (f & 512) ? true : null;
      p.punchT = num(a[8]); p.dizzy = num(a[9]); p.dashCd = num(a[10]); p.abCd = num(a[11]); p.abT = (f & 1024) ? 0.1 : 0;
    });
    balls.forEach((b, i) => {
      const a = s.B[i]; if (!Array.isArray(a)) return;
      const alive = num(a[3]) > 0.5;
      const tx = num(a[0]) + num(a[4]) * age, ty = num(a[1]), tz = num(a[2]) + num(a[5]) * age;
      if (!b.alive && alive) b.pos.set(tx, ty, tz);
      b.alive = alive;
      if (Math.hypot(tx - b.pos.x, ty - b.pos.y, tz - b.pos.z) > 3) b.pos.set(tx, ty, tz);
      else { b.pos.x += (tx - b.pos.x) * k; b.pos.y += (ty - b.pos.y) * k; b.pos.z += (tz - b.pos.z) * k; }
      b.vel.set(num(a[4]), 0, num(a[5]));
    });
  }
  players.forEach(p => animate(p, dt));
  if (recordOn) recordFrame();
  sendClientInput();
  pressed.clear();
}
function sendClientInput() {
  if (!net || net.isHost) return;
  const me = players.find(p => p.kind === 'me');
  const live = me && (state === 'play' || state === 'countdown');
  const k = live ? keyboardInput() : NO_INPUT;
  const c = net.cnt;
  if (k.jump) c.j++; if (k.punch) c.p++; if (k.grab) c.g++; if (k.dash) c.d++; if (k.ability) c.b++; if (k.any) c.a++;
  const inp = { x: r2(k.mx), z: r2(k.mz), j: c.j, p: c.p, g: c.g, d: c.d, a: c.a, b: c.b, h: c.h };
  const key = JSON.stringify(inp);
  if (key !== net.lastInpKey) { net.lastInpKey = key; net.room.presence({ inp }).catch(() => {}); }
}

// ----- lobby rendering -----
function renderLobby() {
  const inRoom = !!net;
  $('#onlineEntry').hidden = inRoom;
  $('#lobby').hidden = !inRoom;
  const avail = !!roomApi;
  $('#createBtn').disabled = !avail; $('#joinBtn').disabled = !avail; $('#codeIn').disabled = !avail;
  if (!avail && !inRoom) setNetMsg('온라인 대전은 claude.ai에 로그인한 상태에서 이 페이지를 열어야 쓸 수 있어요.', true);
  if (!inRoom) return;
  $('#codeOut').textContent = net.code;
  const list = $('#roster'); list.innerHTML = '';
  const team = settings.mode !== 'battle';
  const cs = net.isHost ? lobbyChars() : (net.chs || []);
  for (let i = 0; i < 4; i++) {
    const li = document.createElement('li');
    const pe = net.seats[i];
    if (pe) {
      const cd = DEFS[cs[i]] || DEFS[i];
      li.style.setProperty('--pc', cd.css);
      const dot = document.createElement('span'); dot.className = 'dot';
      const nm = document.createElement('span'); nm.textContent = cd.name;
      const tag = document.createElement('small');
      tag.textContent = [team ? TEAM_NAMES[i % 2] : '', i === 0 ? '방장' : '', pe === net.myPeer ? '나' : ''].filter(Boolean).join(', ');
      li.append(dot, nm, tag);
    } else {
      li.className = 'empty';
      li.textContent = (net.isHost && $('#fillChk').checked ? '빈자리, 컴퓨터가 들어갑니다' : '빈자리') + (team ? ` (${TEAM_NAMES[i % 2]})` : '');
    }
    list.appendChild(li);
  }
  $('#fillRow').hidden = !net.isHost;
  $('#netStartBtn').hidden = !net.isHost;
  const humans = net.seats.length;
  const total = $('#fillChk').checked ? 4 : humans;
  $('#netStartBtn').disabled = total < 2;
  if (net.isHost) {
    $('#lobbyMsg').textContent = total < 2 ? '친구가 들어오거나 빈자리 채우기를 켜면 시작할 수 있어요.' : '방장 화면은 게임하는 동안 다른 탭으로 옮기지 마세요. 방장 화면이 멈추면 모두 멈춥니다.';
  } else {
    const seated = net.seats.includes(net.myPeer);
    $('#lobbyMsg').textContent = !net.sawHost ? '방장을 찾는 중입니다…' : seated ? `방장이 시작하기를 기다리는 중입니다. 게임 모드: ${MODES[settings.mode].name}` : '자리가 다 찼어요. 이번 경기는 관전합니다.';
  }
}
function setTab(t) {
  $('#tabSolo').setAttribute('aria-pressed', String(t === 'solo'));
  $('#tabOnline').setAttribute('aria-pressed', String(t === 'online'));
  $('#soloPane').hidden = t !== 'solo';
  $('#onlinePane').hidden = t !== 'online';
  renderLobby();
}
function syncModeUI() {
  const locked = mode === 'client';
  document.querySelectorAll('#segMode button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.v === settings.mode)); b.disabled = locked; });
  $('#modeHint').textContent = MODES[settings.mode].hint + (locked ? ' 게임 모드는 방장이 고릅니다.' : '');
  document.querySelectorAll('#segCpu button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === cpuCount)));
  const th = $('#teamHint');
  if (settings.mode === 'battle') th.textContent = '모두가 서로의 적입니다.';
  else th.textContent = ['', '1대1로 겨룹니다.', '2대1: 나와 컴퓨터 1명이 한 팀입니다.', '2대2: 나와 컴퓨터 1명이 한 팀, 컴퓨터 2명이 상대 팀입니다.'][cpuCount];
  document.querySelectorAll('#charGrid button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === settings.char)));
  { const d = DEFS[settings.char], a = AB[AB_OF[d.animal]]; $('#charHint').textContent = `${d.name}의 능력은 ${a.name}입니다. ${a.desc} (다시 쓰려면 ${a.cd}초)`; }
  showPreviewChar(settings.char);
}

// 기본 도구, 상수, 입력 상태, 3D 렌더러와 재질
'use strict';

const $ = s => document.querySelector(s);
const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : (d || 0);
const r2 = v => Math.round(v * 100) / 100;
const TAU = Math.PI * 2;
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };
const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1); if (c < 0xac00 || c > 0xd7a3) return w + b; return w + (((c - 0xac00) % 28) ? a : b); };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- constants ----------------
const PR = 0.55;
const GRAV = 26;
let WATER_Y = -4;
const HEX_DELAY = 0.5;
const RH_NEED = 2;         // 반격에 필요한 리듬 성공 횟수
const HOLD_MAX = 4.5;      // 아무것도 못 해도 이만큼 지나면 저절로 풀려남
const CARRY_SHAKE = 7;     // 상대를 들고 있을 때 흔들림 배수     // 밟은 육각판이 떨어지기까지 걸리는 시간
const ROUND_TIME = 60;
const ROUNDS = 9;
const DT = 1 / 60;
const DASH_CD = 2;
const KO_TIME = 3;
const RAG_PUNCH = 1.5;     // 펀치 맞으면 래그돌 시간
const RAG_THROW = 0.75;    // 던져지면 래그돌 시간
const RESPAWN_T = 2;       // 팀 모드 / 공 재생성 시간
const SOCCER_WIN = 3;
const PIV = 20, PL = 18.2, PBALL_R = 1.9, PEND_W = 1.2;
const HUB_R = 1.1;
const NS = 21;
const PAD_MAX = 6;
const NH = 4 + PAD_MAX;
const NB = 5;              // 공 슬롯 수

const DEFS = [
  { name: '분홍곰', animal: 'bear', color: 0xff6b8b, css: '#FF6B8B' },
  { name: '파랑냥', animal: 'cat', color: 0x4aa8ff, css: '#4AA8FF' },
  { name: '노랑꽥', animal: 'duck', color: 0xffcf3a, css: '#FFCF3A' },
  { name: '초록깡총', animal: 'bunny', color: 0x5fd18a, css: '#5FD18A' },
  { name: '보라펭', animal: 'penguin', color: 0x8c7cf0, css: '#8C7CF0', belly: 0xffffff, foot: 0xff9a2e },
  { name: '주황여우', animal: 'fox', color: 0xff9440, css: '#FF9440', belly: 0xfff6ec, foot: 0x3a2a30 },
  { name: '복숭아돼지', animal: 'pig', color: 0xffb3d9, css: '#FFB3D9' },
  { name: '갈색멍멍', animal: 'dog', color: 0xc08a5a, css: '#C08A5A' },
  { name: '흑백판다', animal: 'panda', color: 0xf4f4f4, css: '#F4F4F4', belly: 0xffffff, hand: 0x2f2a36, foot: 0x2f2a36 },
  { name: '연두개굴', animal: 'frog', color: 0xc4e538, css: '#C4E538', belly: 0xf3ffc9 },
];
const TEAM_NAMES = ['빨강팀', '파랑팀'];
const AB_OF = { bear: 'pound', cat: 'flurry', duck: 'quack', bunny: 'superjump', penguin: 'slide', fox: 'blink', pig: 'heavy', dog: 'sprint', panda: 'spin', frog: 'tongue' };
const AB = {
  pound:     { name: '땅 쿵', cd: 6, desc: '뛰어올랐다가 내려찍어 주변 상대를 모두 날려 버립니다.' },
  flurry:    { name: '냥냥 펀치', cd: 5, desc: '앞으로 펀치 세 번을 눈 깜짝할 새에 날립니다.' },
  quack:     { name: '꽥 소리', cd: 6, desc: '크게 꽥 소리를 질러 앞쪽 상대를 밀어내고 어지럽게 만듭니다.' },
  superjump: { name: '슈퍼 점프', cd: 5, desc: '하늘 높이 뜁니다. 공중에서도 쓸 수 있어 떨어질 때 살아날 수 있습니다.' },
  slide:     { name: '배 미끄럼', cd: 6, desc: '엎드려서 길게 미끄러지며 부딪힌 상대를 날립니다.' },
  blink:     { name: '순간이동', cd: 6, desc: '바라보는 방향으로 순식간에 5m 이동합니다. 바닥이 없는 곳으로는 가지 않습니다.' },
  heavy:     { name: '돌덩이 몸', cd: 9, desc: '3초 동안 커지고 무거워져 거의 밀리지 않고, 흐물흐물해지지도 않고, 잡히지도 않습니다.' },
  sprint:    { name: '질주', cd: 8, desc: '3초 동안 아주 빨리 달립니다.' },
  spin:      { name: '회전 휘두르기', cd: 6, desc: '제자리에서 빙글 돌며 주변 상대를 모두 날려 버립니다.' },
  tongue:    { name: '혀 낚아채기', cd: 6, desc: '앞쪽 멀리 있는 상대를 혀로 붙잡아 끌어옵니다.' },
};
const TEAM_HEX = [0xe23e64, 0x2f86e0];
const KEYS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'TouchJump'], punch: ['KeyQ', 'KeyJ', 'TouchPunch'], grab: ['KeyE', 'KeyK', 'TouchGrab'], dash: ['ShiftLeft', 'ShiftRight', 'KeyL', 'TouchDash', 'TapDash'], ability: ['KeyF', 'KeyI', 'TouchAbility'],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());
const EVENTS = {
  none:   { name: '', desc: '' },
  ice:    { name: '얼음 지옥',   desc: '바닥이 미끄러워 멈추기 어렵습니다. 돌진은 신중하게.' },
  spin:   { name: '회전 지옥',   desc: '경기장이 돌고 막대가 쓸고 지나갑니다. 점프로 넘으세요.' },
  spring: { name: '스프링 지옥', desc: '빨간 발판을 밟으면 하늘 높이 튀어 오릅니다.' },
  pend:   { name: '거대 진자',   desc: '커다란 비치볼이 경기장을 가로지릅니다.' },
  hex:    { name: '사라지는 육각판', desc: '밟은 발판은 잠시 뒤 떨어집니다. 멈추지 말고 움직이세요. 아래층으로 떨어져도 살아남을 수 있습니다.' },
};
const MODES = {
  battle:  { name: '난투', hint: '상대를 물에 빠뜨리면 1점, 라운드 끝까지 살아남으면 1점입니다. 경기장 모양과 장애물이 라운드마다 바뀝니다.' },
  soccer:  { name: '축구', hint: '빨강팀과 파랑팀으로 나뉘어 공을 펀치해 상대 골대에 넣습니다. 3골을 먼저 넣거나 시간이 끝났을 때 앞선 팀이 라운드를 가져갑니다. 물에 빠진 공과 사람은 2초 뒤에 다시 나옵니다.' },
  collect: { name: '공 가져오기', hint: '공 5개 중 4개를 우리 팀 원 안에 모으면 바로 이깁니다. 잡기로 공을 들고, 멈춘 채 다시 누르면 내려놓고, 움직이며 누르면 던집니다.' },
};

// ---------------- input ----------------
const down = new Set();
const pressed = new Set();
let audioUnlocked = false;
const isDown = arr => arr.some(c => down.has(c));
const wasPressed = arr => arr.some(c => pressed.has(c));

// ---------------- renderer ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
const COARSE = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fdcf5);
scene.fog = new THREE.Fog(0x9fdcf5, 75, 180);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
camera.position.set(0, 30, 26);
let aspectMul = 1;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  aspectMul = camera.aspect < 1 ? clamp(1.25 / camera.aspect, 1, 2.2) : 1;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight(0xffffff, 0x6fb3c4, 0.48));
const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.position.set(12, 30, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
scene.add(sun);

const gradMap = (() => {
  const t = new THREE.DataTexture(new Uint8Array([95, 165, 220, 255]), 4, 1, THREE.LuminanceFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();
const toon = (c, extra) => new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: gradMap }, extra || {}));
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
const SPH = new THREE.SphereGeometry(1, 20, 14);
function mesh(geo, mat, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  m.castShadow = true;
  return m;
}
function repTex(draw) {
  const t = canvasTex(256, 256, draw);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 8, 1 / 8);
  return t;
}
const tileTex = repTex((ctx) => {
  ctx.fillStyle = '#FFF5E4'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#3CC8C1'; ctx.fillRect(0, 0, 128, 128); ctx.fillRect(128, 128, 128, 128);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.arc(64, 64, 18, 0, TAU); ctx.arc(192, 192, 18, 0, TAU); ctx.fill();
});
const iceTex = repTex((ctx) => {
  ctx.fillStyle = '#EAF9FF'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#C2E9F8'; ctx.fillRect(0, 0, 128, 128); ctx.fillRect(128, 128, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2;
  for (let k = 0; k < 9; k++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 3; s++) { x += rnd(-40, 40); y += rnd(-40, 40); ctx.lineTo(x, y); }
    ctx.stroke();
  }
});
const grassTex = repTex((ctx) => {
  ctx.fillStyle = '#86DB62'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#74CC52'; ctx.fillRect(0, 0, 128, 256);
});
const tileMat = toon(0xffffff, { map: tileTex });
const iceMat = toon(0xffffff, { map: iceTex });
const grassMat = toon(0xffffff, { map: grassTex });
const sideMat = toon(0x2bb7b0);
const curbMatA = toon(0xff6b8b), curbMatB = toon(0xfffdf7);
const BLOCK_COLORS = [0xffd23f, 0xb79cff, 0xff9e6b, 0x7fd6ff];
const railMat = toon(0xfffdf7);
const fenceMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
const netMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradMap, transparent: true, opacity: 0.45 });

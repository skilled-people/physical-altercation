// 경기장 무작위 생성, 경기장 모델, 회전 막대, 스프링, 진자, 물
'use strict';

// ---------------- map generation ----------------
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const circlePts = (cx, cz, r, n) => Array.from({ length: n || 64 }, (_, i) => { const a = i / (n || 64) * TAU; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });
const rectPts = (cx, cz, hw, hd) => [[cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd]];
const ngon = (r, n, rot) => Array.from({ length: n }, (_, i) => { const a = rot + i / n * TAU; return [Math.cos(a) * r, Math.sin(a) * r]; });
function rotRect(x0, z0, ang, len, hw) {
  const c = Math.cos(ang), s = Math.sin(ang), nx = -s * hw, nz = c * hw;
  const x1 = x0 + c * len, z1 = z0 + s * len;
  return [[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]];
}
function pip(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
function floorTest(m, x, z) {
  for (const pc of m.pieces) if (pip(pc.pts, x, z) && !pc.holes.some(h => pip(h, x, z))) return true;
  return false;
}
const SHAPE_NAMES = { circle: '원형', square: '사각', diamond: '마름모', hex: '육각', oct: '팔각', ring: '도넛', cross: '십자', islands: '세 섬', twin: '쌍둥이 섬' };
function shapePieces(kind, s, rng) {
  switch (kind) {
    case 'circle': return [{ pts: circlePts(0, 0, 14 * s), holes: [] }];
    case 'square': return [{ pts: rectPts(0, 0, 12.5 * s, 12.5 * s), holes: [] }];
    case 'diamond': return [{ pts: ngon(16 * s, 4, 0), holes: [] }];
    case 'hex': return [{ pts: ngon(14.5 * s, 6, Math.PI / 6), holes: [] }];
    case 'oct': return [{ pts: ngon(14.5 * s, 8, Math.PI / 8), holes: [] }];
    case 'ring': return [{ pts: circlePts(0, 0, 15 * s), holes: [circlePts(0, 0, 4.6 * s, 40)] }];
    case 'cross': { const a = 15.5 * s, w = 5.5 * s; return [{ pts: [[-w, -a], [w, -a], [w, -w], [a, -w], [a, w], [w, w], [w, a], [-w, a], [-w, w], [-a, w], [-a, -w], [-w, -w]], holes: [] }]; }
    case 'islands': {
      const off = rng() * TAU, out = [{ pts: circlePts(0, 0, 5.5 * s, 48), holes: [] }];
      for (let k = 0; k < 3; k++) {
        const a = off + k * TAU / 3, d = 13 * s;
        out.push({ pts: circlePts(Math.cos(a) * d, Math.sin(a) * d, 6.3 * s, 48), holes: [] });
        out.push({ pts: rotRect(0, 0, a, d, 1.5), holes: [] });
      }
      return out;
    }
    case 'twin': {
      const d = 10.5 * s;
      return [
        { pts: circlePts(-d, 0, 7.5 * s, 56), holes: [] }, { pts: circlePts(d, 0, 7.5 * s, 56), holes: [] },
        { pts: circlePts(0, 0, 4.2 * s, 40), holes: [] },
        { pts: rectPts(0, -3.4 * s, d, 1.5), holes: [] }, { pts: rectPts(0, 3.4 * s, d, 1.5), holes: [] },
      ];
    }
  }
  return [{ pts: circlePts(0, 0, 14), holes: [] }];
}
function genMap(mode, ev, seed) {
  const rng = mulberry(seed);
  const rr = (a, b) => a + rng() * (b - a);
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const m = { mode, ev, seed, pieces: [], blocks: [], pillars: [], pads: [], spawns: [], teamSpawns: [[], []], ballSpawns: [],
    bases: null, goal: null, name: '', ext: 14, floor: ev === 'ice' ? 'ice' : 'tile', spin: ev === 'spin', marks: [] };
  const isF = (x, z) => floorTest(m, x, z);
  const solid = (x, z, pad) => m.blocks.some(b => Math.abs(x - b.x) < b.hw + pad && Math.abs(z - b.z) < b.hd + pad) || m.pillars.some(p => Math.hypot(x - p.x, z - p.z) < p.r + pad);
  const roomy = (x, z, rad) => { if (!isF(x, z)) return false; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; if (!isF(x + Math.cos(a) * rad, z + Math.sin(a) * rad)) return false; } return true; };
  const computeExt = () => { let e = 0; for (const pc of m.pieces) for (const [x, z] of pc.pts) e = Math.max(e, Math.hypot(x, z)); m.ext = e; };
  const blockOk = (b) => {
    for (const [cx, cz] of [[b.x - b.hw, b.z - b.hd], [b.x + b.hw, b.z - b.hd], [b.x + b.hw, b.z + b.hd], [b.x - b.hw, b.z + b.hd], [b.x, b.z]]) if (!roomy(cx, cz, 0.6)) return false;
    return !solid(b.x, b.z, Math.max(b.hw, b.hd) + 1.6);
  };
  // obstacles; mirror=true places pairs mirrored across x=0
  const addObstacles = (nBlock, nPillar, nWall, opts) => {
    const o = opts || {};
    const tryPlace = (make) => {
      for (let t = 0; t < 40; t++) {
        let x = rr(-m.ext * 0.8, m.ext * 0.8), z = rr(-m.ext * 0.8, m.ext * 0.8);
        if (o.mirror) x = rr(o.minX || 3, o.maxX || m.ext * 0.8);
        if (o.avoid && o.avoid(x, z)) continue;
        if (o.avoid && o.mirror && o.avoid(-x, z)) continue;
        const ob = make(x, z);
        if (ob.kind === 'block') {
          if (!blockOk(ob)) continue;
          if (o.mirror) { const mb = Object.assign({}, ob, { x: -ob.x }); if (!blockOk(mb)) continue; m.blocks.push(ob, mb); } else m.blocks.push(ob);
        } else {
          if (!roomy(x, z, ob.r + 1) || solid(x, z, ob.r + 1.8)) continue;
          if (o.mirror) { if (!roomy(-x, z, ob.r + 1) || solid(-x, z, ob.r + 1.8)) continue; m.pillars.push(ob, Object.assign({}, ob, { x: -ob.x })); } else m.pillars.push(ob);
        }
        return;
      }
    };
    for (let i = 0; i < nBlock; i++) tryPlace((x, z) => ({ kind: 'block', x, z, hw: rr(0.9, 1.8), hd: rr(0.9, 1.8), h: rr(0.9, 1.3), c: Math.floor(rng() * 4) }));
    for (let i = 0; i < nWall; i++) tryPlace((x, z) => { const v = rng() < 0.5; return { kind: 'block', x, z, hw: v ? 0.35 : rr(2.4, 3.4), hd: v ? rr(2.4, 3.4) : 0.35, h: 0.8, c: Math.floor(rng() * 4) }; });
    for (let i = 0; i < nPillar; i++) tryPlace((x, z) => ({ kind: 'pillar', x, z, r: 0.7, h: rr(2, 3) }));
  };
  const samplePoints = (n, test, minGap, region) => {
    const out = [];
    for (let t = 0; t < 600 && out.length < n; t++) {
      const x = region ? rr(region[0], region[1]) : rr(-m.ext, m.ext), z = region ? rr(region[2], region[3]) : rr(-m.ext, m.ext);
      if (!test(x, z)) continue;
      if (out.some(p => Math.hypot(p[0] - x, p[1] - z) < minGap)) continue;
      out.push([x, z]);
    }
    return out;
  };

  if (mode === 'soccer') {
    const L = rr(15, 18), W = rr(9, 11), gw = 3.2, variant = pick(['rect', 'cut', 'gap']);
    const c = variant === 'cut' ? 3.5 : 0;
    const pts = c ? [[-L + c, -W], [L - c, -W], [L, -W + c], [L, W - c], [L - c, W], [-L + c, W], [-L, W - c], [-L, -W + c]] : rectPts(0, 0, L, W);
    m.name = { rect: '네모 구장', cut: '팔각 구장', gap: '틈새 구장' }[variant];
    // low rails along the sidelines and end lines keep the ball in play; the gap field leaves openings
    const railH = 0.75, sideLen = L - c - 0.6;
    for (const sz of [1, -1]) {
      if (variant === 'gap') {
        const seg = (sideLen - 3) / 2;
        for (const sx of [1, -1]) m.blocks.push({ kind: 'block', x: sx * (3 + seg), z: sz * (W - 0.22), hw: seg, hd: 0.2, h: railH, rail: true });
      } else m.blocks.push({ kind: 'block', x: 0, z: sz * (W - 0.22), hw: sideLen, hd: 0.2, h: railH, rail: true });
      if (c) for (const sx of [1, -1]) {
        const x0 = sx * (L - c), z0 = sz * W, x1 = sx * L, z1 = sz * (W - c), n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.55);
        for (let k = 0; k <= n; k++) {
          const t = k / n, x = x0 + (x1 - x0) * t - sx * 0.3, z = z0 + (z1 - z0) * t - sz * 0.3;
          m.blocks.push({ kind: 'block', x, z, hw: 0.22, hd: 0.22, h: railH, rail: true });
        }
      }
      const endW = W - c;
      const half = (endW - gw - 0.5) / 2;
      if (half > 0.3) for (const sx of [1, -1]) m.blocks.push({ kind: 'block', x: sx * (L - 0.22), z: sz * (gw + 0.5 + half), hw: 0.2, hd: half, h: railH, rail: true });
    }
    m.floor = 'grass';
    m.pieces.push({ pts, holes: [] });
    for (const sg of [1, -1]) m.pieces.push({ pts: rectPts(sg * (L + 1.5), 0, 1.6, gw + 0.5), holes: [] });
    m.goal = { L, gw };
    for (const sg of [1, -1]) {
      for (const sz of [1, -1]) m.pillars.push({ kind: 'pillar', x: sg * L, z: sz * gw, r: 0.22, h: 2.6, post: true });
      m.blocks.push({ kind: 'block', x: sg * (L + 3.15), z: 0, hw: 0.15, hd: gw + 0.4, h: 2.6, net: true });
      for (const sz of [1, -1]) m.blocks.push({ kind: 'block', x: sg * (L + 1.6), z: sz * (gw + 0.32), hw: 1.55, hd: 0.12, h: 2.6, net: true });
    }
    computeExt();
    addObstacles(Math.floor(rr(0, 2)), Math.floor(rr(0, 2.6)), 0, { mirror: true, minX: 5, maxX: L - 5.5, avoid: (x, z) => Math.abs(z) > W - 3 });
    m.teamSpawns = [[[-L * 0.45, -3], [-L * 0.45, 3]], [[L * 0.45, -3], [L * 0.45, 3]]];
    m.ballSpawns = [[0, 0]];
    m.marks = [{ t: 'line', x: 0, z: 0, w: 0.25, d: W * 2 - 0.8 }, { t: 'ring', x: 0, z: 0, r: 3 }];
  } else if (mode === 'collect') {
    const kind = pick(['circle', 'square', 'hex', 'oct', 'cross', 'ring', 'twin']);
    m.pieces = shapePieces(kind, 1.05, rng); m.name = SHAPE_NAMES[kind];
    computeExt();
    let bx = 8;
    for (let x = 17; x >= 6; x -= 0.5) if (roomy(x, 0, 3.7) && roomy(-x, 0, 3.7)) { bx = Math.max(6, x - 1.2); break; }
    m.bases = [{ x: -bx, z: 0, r: 3.4 }, { x: bx, z: 0, r: 3.4 }];
    const nearBase = (x, z) => Math.hypot(Math.abs(x) - bx, z) < 5.5;
    addObstacles(Math.floor(rr(0, 2)), Math.floor(rr(0, 2)), Math.floor(rr(0, 1.6)), { mirror: true, minX: 3, maxX: bx + 2, avoid: nearBase });
    m.ballSpawns = samplePoints(NB, (x, z) => roomy(x, z, 1.1) && !solid(x, z, 1.2), 2.2, [-3.5, 3.5, -m.ext, m.ext]);
    while (m.ballSpawns.length < NB) m.ballSpawns.push([0, 0]);
    for (let t = 0; t < 2; t++) {
      const sx = t === 0 ? -1 : 1;
      for (const dz of [-2.5, 2.5]) {
        const x = sx * (bx - 1.5), z = dz;
        m.teamSpawns[t].push(isF(x, z) ? [x, z] : [sx * bx, 0]);
      }
    }
  } else if (ev === 'hex') {
    // two floors of hexagon tiles that drop away after being stepped on
    const s = 1.3, sq3 = Math.sqrt(3), tiles = [], index = new Map();
    const layers = [{ y: 0, R: 12 }, { y: -6, R: 10.5 }];
    layers.forEach((L, li) => {
      const n = Math.ceil(L.R / s) + 2;
      for (let q = -n; q <= n; q++) for (let r = -n; r <= n; r++) {
        const x = s * sq3 * (q + r / 2), z = s * 1.5 * r;
        if (Math.hypot(x, z) > L.R) continue;
        const t = { i: tiles.length, li, q, r, x, z, y: L.y, state: 0, timer: 0, vt: -1, trigTick: undefined, shade: (((q - r) % 3) + 3) % 3 === 0 ? 1 : 0, mesh: null };
        tiles.push(t); index.set(li + ':' + q + ',' + r, t);
      }
    });
    m.hex = { s, layers, tiles, index, trig: [] };
    m.waterY = -11; m.ext = 12.5; m.name = '육각 2층';
    const off = rng() * TAU;
    m.spawns = [0, 1, 2, 3].map(k => [Math.cos(off + k * Math.PI / 2) * 6.5, Math.sin(off + k * Math.PI / 2) * 6.5]);
    return m;
  } else {
    const kinds = ev === 'spin' ? ['circle', 'square', 'hex', 'oct', 'cross'] : ['circle', 'square', 'diamond', 'hex', 'oct', 'ring', 'cross', 'islands'];
    const kind = pick(kinds);
    m.pieces = shapePieces(kind, ev === 'spin' ? 1 : rr(0.95, 1.08), rng); m.name = SHAPE_NAMES[kind];
    computeExt();
    if (ev !== 'spin' && kind !== 'ring' && kind !== 'islands') {
      const nh = Math.floor(rr(0, 3));
      for (let i = 0; i < nh; i++) {
        for (let t = 0; t < 30; t++) {
          const r = rr(1.6, 2.4), x = rr(-m.ext * 0.7, m.ext * 0.7), z = rr(-m.ext * 0.7, m.ext * 0.7);
          if (Math.hypot(x, z) < 3.5 || !roomy(x, z, r + 1.6)) continue;
          m.pieces[0].holes.push(circlePts(x, z, r, 28));
          break;
        }
      }
    }
    if (ev !== 'spin') addObstacles(Math.floor(rr(0, 4)), Math.floor(rr(0, 3)), Math.floor(rr(0, 2.5)));
  }
  if (ev === 'spring') m.pads = samplePoints(PAD_MAX, (x, z) => roomy(x, z, 1.3) && !solid(x, z, 1.5), 3.5);
  if (mode === 'battle') {
    const ok = (gap) => (x, z) => roomy(x, z, 2.2) && !solid(x, z, 1.3) && !m.pads.some(p => Math.hypot(p[0] - x, p[1] - z) < 1.8) && (ev !== 'spin' || Math.hypot(x, z) > HUB_R + 1.5);
    m.spawns = samplePoints(4, ok(5), 5);
    if (m.spawns.length < 4) m.spawns = samplePoints(4, (x, z) => roomy(x, z, 1) && !solid(x, z, 1), 2.5);
    while (m.spawns.length < 4) m.spawns.push([0, 0]);
  }
  return m;
}

// ---------------- map meshes ----------------
const mapG = new THREE.Group(); scene.add(mapG);
let map = null;
function clearGroup(g) {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse(o => { if (o.geometry && o.geometry !== SPH) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose && o.dispose(); });
  }
}
function buildMap(m) {
  clearGroup(mapG); mapG.rotation.y = 0;
  const top = m.floor === 'grass' ? grassMat : m.floor === 'ice' ? iceMat : tileMat;
  m.pieces.forEach((pc, i) => {
    const shape = new THREE.Shape(pc.pts.map(([x, z]) => new THREE.Vector2(x, z)));
    for (const h of pc.holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 4.4, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(Math.PI / 2);
    const me = new THREE.Mesh(geo, [top, sideMat]);
    me.position.y = -i * 0.012; me.receiveShadow = true;
    mapG.add(me);
  });
  // curbs on outer edges
  const chunks = [];
  for (const pc of m.pieces) for (const ring of [pc.pts, ...pc.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
      const len = Math.hypot(x1 - x0, z1 - z0); if (len < 1e-3) continue;
      const n = Math.max(1, Math.ceil(len / 1.5)), dx = (x1 - x0) / len, dz = (z1 - z0) / len;
      for (let k = 0; k < n; k++) {
        const t0 = k / n * len, t1 = (k + 1) / n * len, mx = x0 + dx * (t0 + t1) / 2, mz = z0 + dz * (t0 + t1) / 2;
        const a = floorTest(m, mx - dz * 0.35, mz + dx * 0.35), b = floorTest(m, mx + dz * 0.35, mz - dx * 0.35);
        if (a && b) continue;
        chunks.push({ x: mx, z: mz, len: (t1 - t0) * 0.96, rot: Math.atan2(-dz, dx) });
      }
    }
  }
  const curbGeo = new THREE.BoxGeometry(1, 0.16, 0.34);
  const dummy = new THREE.Object3D();
  [curbMatA, curbMatB].forEach((mat, par) => {
    const list = chunks.filter((_, i) => i % 2 === par);
    if (!list.length) return;
    const im = new THREE.InstancedMesh(curbGeo, mat, list.length);
    list.forEach((c, i) => { dummy.position.set(c.x, 0.03, c.z); dummy.rotation.set(0, c.rot, 0); dummy.scale.set(c.len, 1, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.castShadow = true;
    mapG.add(im);
  });
  for (const b of m.blocks) {
    const me = mesh(new THREE.BoxGeometry(b.hw * 2, b.h, b.hd * 2), b.net ? netMat : b.rail ? railMat : toon(BLOCK_COLORS[b.c || 0]));
    me.position.set(b.x, b.h / 2, b.z); me.receiveShadow = true; if (b.net) me.castShadow = false;
    mapG.add(me);
    if (b.rail) {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(b.hw * 2, 1.85, Math.min(b.hd * 2, 0.12)), fenceMat);
      fence.position.set(b.x, b.h + 0.92, b.z); mapG.add(fence);
    }
  }
  for (const p of m.pillars) {
    const me = mesh(new THREE.CylinderGeometry(p.r, p.r * (p.post ? 1 : 1.1), p.h, 20), toon(p.post ? 0xfffdf7 : 0xff6b8b));
    me.position.set(p.x, p.h / 2, p.z); me.receiveShadow = true;
    mapG.add(me);
    if (!p.post) { const cap = mesh(new THREE.CylinderGeometry(p.r * 1.15, p.r * 1.15, 0.2, 20), toon(0xffd23f)); cap.position.set(p.x, p.h, p.z); mapG.add(cap); }
  }
  if (m.goal) {
    const { L, gw } = m.goal;
    for (const sg of [1, -1]) {
      const bar = mesh(new THREE.BoxGeometry(0.3, 0.3, gw * 2 + 0.44), toon(0xfffdf7)); bar.position.set(sg * L, 2.6, 0); mapG.add(bar);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, gw * 2 + 0.6), netMat); roof.position.set(sg * (L + 1.6), 2.6, 0); mapG.add(roof);
      const zone = new THREE.Mesh(new THREE.PlaneGeometry(3, gw * 2), new THREE.MeshBasicMaterial({ color: sg > 0 ? TEAM_HEX[1] : TEAM_HEX[0], transparent: true, opacity: 0.35 }));
      zone.rotation.x = -Math.PI / 2; zone.position.set(sg * (L + 1.55), 0.02, 0); mapG.add(zone);
    }
  }
  for (const mk of m.marks) {
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const me = mk.t === 'line' ? new THREE.Mesh(new THREE.PlaneGeometry(mk.w, mk.d), white) : new THREE.Mesh(new THREE.RingGeometry(mk.r - 0.13, mk.r + 0.13, 48), white);
    me.rotation.x = -Math.PI / 2; me.position.set(mk.x, 0.015, mk.z); mapG.add(me);
  }
  if (m.bases) m.bases.forEach((b, t) => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(b.r, 40), new THREE.MeshBasicMaterial({ color: TEAM_HEX[t], transparent: true, opacity: 0.3 }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(b.x, 0.02, b.z); mapG.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(b.r - 0.2, b.r, 48), new THREE.MeshBasicMaterial({ color: TEAM_HEX[t] }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(b.x, 0.025, b.z); mapG.add(ring);
    const flagPole = mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), toon(0xfffdf7)); flagPole.position.set(b.x, 1.6, b.z - b.r - 0.3); mapG.add(flagPole);
    const flag = mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), toon(TEAM_HEX[t])); flag.position.set(b.x + 0.6, 2.85, b.z - b.r - 0.3); mapG.add(flag);
  });
  if (m.hex) {
    const hexGeo = new THREE.CylinderGeometry(m.hex.s * 0.93, m.hex.s * 0.82, 0.5, 6);
    for (const t of m.hex.tiles) {
      const me = new THREE.Mesh(hexGeo, hexMats[t.li][t.shade]);
      me.position.set(t.x, t.y - 0.25, t.z); me.castShadow = true; me.receiveShadow = true;
      t.mesh = me; mapG.add(me);
    }
  }
  buildPads(m);
  buildHub(m);
}

// ---------------- hazards ----------------
const hub = new THREE.Group(); scene.add(hub);
const hubBody = mesh(new THREE.CylinderGeometry(HUB_R, HUB_R + 0.1, 1.1, 32), toon(0xffd23f)); hubBody.position.y = 0.55; hub.add(hubBody);
const hubCap = mesh(new THREE.CylinderGeometry(0.7, HUB_R, 0.28, 32), toon(0xff6b8b)); hubCap.position.y = 1.24; hub.add(hubCap);
const sweepG = new THREE.Group(); hub.add(sweepG);
const stripeArm = (() => { const t = canvasTex(128, 16, (ctx) => { ctx.fillStyle = '#FF6B8B'; ctx.fillRect(0, 0, 64, 16); ctx.fillStyle = '#FFFDF7'; ctx.fillRect(64, 0, 64, 16); }); t.wrapS = THREE.RepeatWrapping; t.repeat.set(9, 1); return t; })();
const arms = [1, -1].map(s => { const a = mesh(new THREE.BoxGeometry(1, 0.42, 0.42), toon(0xffffff, { map: stripeArm })); a.userData.s = s; sweepG.add(a); return a; });
hub.visible = false;
function buildHub(m) {
  const L = m.ext - HUB_R;
  arms.forEach(a => { a.scale.x = L; a.position.set(a.userData.s * (HUB_R + L / 2), 0.36, 0); });
}
const padG = new THREE.Group(); scene.add(padG);
let pads = [];
function buildPads(m) {
  clearGroup(padG); pads = [];
  for (const [x, z] of m.pads) {
    const g = new THREE.Group(); g.position.set(x, 0, z); padG.add(g);
    const b = mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.12, 28), toon(0x0b6e78)); b.position.y = 0.06; b.receiveShadow = true; g.add(b);
    const t = mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.14, 28), toon(0xff6b8b)); t.position.y = 0.2; g.add(t);
    const coil = mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 24), toon(0xfffdf7)); coil.rotation.x = Math.PI / 2; coil.position.y = 0.14; g.add(coil);
    pads.push({ x, z, top: t, coil, s: 0 });
  }
}
const pendG = new THREE.Group(); pendG.position.set(0, PIV, 0); scene.add(pendG);
const pendArm = new THREE.Group(); pendG.add(pendArm);
const rope = mesh(new THREE.CylinderGeometry(0.07, 0.07, PL, 8), toon(0xfffdf7)); rope.position.y = -PL / 2; pendArm.add(rope);
const beachTex = canvasTex(512, 256, (ctx) => {
  ['#FF6B8B', '#FFFDF7', '#FFD23F', '#FFFDF7', '#4AA8FF', '#FFFDF7'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * 512 / 6, 0, 512 / 6 + 1, 256); });
  ctx.fillStyle = '#FFFDF7'; ctx.fillRect(0, 0, 512, 22); ctx.fillRect(0, 234, 512, 22);
});
const pendBall = mesh(new THREE.SphereGeometry(PBALL_R, 32, 20), toon(0xffffff, { map: beachTex })); pendBall.position.y = -PL; pendArm.add(pendBall);
pendG.visible = false;

// water + decor
const waterGeo = new THREE.PlaneGeometry(320, 320, 64, 64);
const water = new THREE.Mesh(waterGeo, toon(0x2aa8d4));
water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.receiveShadow = true; scene.add(water);
const waterBase = Float32Array.from(waterGeo.attributes.position.array);
const floaties = [];
[[27, 6, 0xff6b8b], [-26, -14, 0xffd23f], [7, -30, 0x5fd18a], [-30, 15, 0x4aa8ff], [31, -19, 0xfffdf7], [-9, 30, 0xffd23f], [21, 26, 0x4aa8ff]].forEach(([x, z, c], i) => {
  const m = mesh(new THREE.TorusGeometry(1.4, 0.5, 12, 28), toon(c));
  m.rotation.x = Math.PI / 2; m.position.set(x, WATER_Y + 0.1, z); scene.add(m);
  floaties.push({ m, ph: i * 1.7 });
});

import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { FerroSim, FLUIDS, DEFAULTS, verdict, gravityOf } from './sim.js';

// ------------------------------------------------------------------ parameters
// UI values are in display units; `scale` converts to SI for the simulation.
const deg = Math.PI / 180;
const CONTROLS = [
  { group: 'Motion', items: [
    { key: 'mode', type: 'seg', options: [['orbit', 'Magnet orbits'], ['spin', 'Sphere spins'], ['earth', 'Earth-like']] },
    { key: 'period', label: p => p.mode === 'earth' ? 'Day length (one spin)' : 'Time per revolution', unit: 's', min: 0.05, max: 20, log: true, scale: 1, digits: 2 },
    { key: 'nMag', label: 'Magnets around the circle', unit: '', min: 1, max: 8, step: 1, scale: 1, digits: 0, show: p => p.mode !== 'earth' },
    { key: 'altPoles', type: 'check', label: 'Alternate poles (N, S, N…)', show: p => p.mode !== 'earth' },
    { key: 'tilt', label: p => p.mode === 'earth' ? 'Axis tilt (obliquity)' : 'Rotation axis tilt', unit: '°', min: 0, max: 90, step: 0.5, scale: deg, digits: 1,
      note: p => p.mode === 'earth' ? 'Earth: 23.4°. The Sun stands overhead anywhere up to this latitude.' : '0° = magnet circles the equator · 90° = goes over the top and under' },
  ] },
  { group: 'Earth-like orbit', show: p => p.mode === 'earth', items: [
    { key: 'earthPreset', type: 'button', label: 'Set Earth’s values (time compressed)' },
    { key: 'year', label: 'Year length (one orbit)', unit: 's', min: 2, max: 300, log: true, scale: 1, digits: 1, note: 'Earth: 365 days per year' },
    { key: 'ecc', label: 'Orbit eccentricity', unit: '', min: 0, max: 0.6, step: 0.005, scale: 1, digits: 3, note: 'Earth: 0.017 now, 0 to 0.06 over 100,000 years. It sets how much the gap changes.' },
    { key: 'precess', label: 'Axis precession period', unit: 's', min: 5, max: 3000, log: true, scale: 1, digits: 0, note: 'The axis traces a cone. Earth: about 26,000 years.' },
    { key: 'oblAmp', label: 'Tilt nodding (± amplitude)', unit: '°', min: 0, max: 20, step: 0.1, scale: deg, digits: 1, note: 'Earth: about ±1.2° (22.1° to 24.5°)' },
    { key: 'oblPeriod', label: 'Tilt nodding period', unit: 's', min: 5, max: 3000, log: true, scale: 1, digits: 0, note: 'Earth: about 41,000 years' },
  ] },
  { group: 'Magnet (NdFeB cylinder)', items: [
    { key: 'Br', label: 'Remanence (grade)', unit: 'T', min: 0.2, max: 1.48, step: 0.01, scale: 1, digits: 2, note: 'N35 ≈ 1.18 T · N42 ≈ 1.30 T · N52 ≈ 1.45 T' },
    { key: 'magD', label: 'Diameter', unit: 'mm', min: 3, max: 60, step: 1, scale: 1e-3, digits: 0 },
    { key: 'magL', label: 'Length', unit: 'mm', min: 2, max: 60, step: 1, scale: 1e-3, digits: 0 },
    { key: 'gap', label: 'Gap to glass', unit: 'mm', min: 1, max: 40, step: 0.5, scale: 1e-3, digits: 1 },
  ] },
  { group: 'Ferrofluid', items: [
    { key: 'preset', type: 'preset' },
    { key: 'mu', label: 'Viscosity', unit: 'mPa·s', min: 1, max: 10000, log: true, scale: 1e-3, digits: 0 },
    { key: 'Ms', label: 'Saturation magnetization', unit: 'mT', min: 5, max: 110, step: 1, scale: 1 / (4e-7 * Math.PI) * 1e-3, digits: 0, note: 'as μ₀Mₛ, the datasheet figure' },
    { key: 'chi', label: 'Initial susceptibility χ', unit: '', min: 0.2, max: 8, step: 0.1, scale: 1, digits: 1 },
    { key: 'sigma', label: 'Surface tension', unit: 'mN/m', min: 15, max: 75, step: 1, scale: 1e-3, digits: 0 },
    { key: 'rho', label: 'Density', unit: 'g/cm³', min: 0.9, max: 2, step: 0.01, scale: 1000, digits: 2 },
    { key: 'h0', label: 'Coating thickness', unit: 'mm', min: 0.02, max: 3, log: true, scale: 1e-3, digits: 2, note: 'changing this re-coats the sphere' },
  ] },
  { group: 'Sphere & world', items: [
    { key: 'R', label: 'Sphere diameter', unit: 'cm', min: 2, max: 30, step: 0.5, scale: 0.005, digits: 1, note: 'changing this re-coats the sphere' },
    { key: 'gravity', type: 'seg', label: 'Gravity points', options: [['center', 'To centre'], ['down', 'Down (table)'], ['off', 'Off']] },
    { key: 'gScale', label: 'Gravity strength', unit: 'g', min: 0.05, max: 5, log: true, scale: 1, digits: 2,
      note: 'To centre: the sphere pulls its own coat inward, like a small planet' },
    { key: 'detach', type: 'check', label: 'Fluid can drip off / jump to magnet' },
  ] },
  { group: 'View', items: [
    { key: 'heat', type: 'check', label: 'Colour by thickness (blue thinner · amber thicker)', view: true },
    { key: 'exag', label: 'Height exaggeration', unit: '×', min: 1, max: 12, step: 0.5, scale: 1, digits: 1, view: true, note: '1× = true scale' },
    { key: 'speed', label: 'Playback speed', unit: '× real time', min: 0.05, max: 4, log: true, scale: 1, digits: 2, view: true },
  ] },
];
const RESET_KEYS = new Set(['h0', 'R']);

// Default starting point: a viscous fluid and a moderately close magnet, which shows the
// trade-off between lifting the film and stripping it off.
const START = { ...DEFAULTS, ...FLUIDS.viscous, gap: 0.012, period: 1.5, h0: 0.0004 };
// Earth's orbital geometry with time compressed: 20 days a year, a precession every 10 years.
const EARTH_VALUES = { mode: 'earth', tilt: 23.44 * deg, ecc: 0.0167, period: 1.5, year: 30, precess: 300, oblAmp: 1.2 * deg, oblPeriod: 200 };
const view = { exag: 5, speed: 1, heat: true };
let preset = 'viscous';

const sim = new FerroSim(4, START);

// ------------------------------------------------------------------ control panel
const panel = document.getElementById('panel');
const ctlRefs = {}, groupRefs = [];
const resolve = (v) => typeof v === 'function' ? v(sim.params) : v;

function toDisplay(c, v) { return v / c.scale; }
function sliderToValue(c, x) { return c.log ? Math.exp(Math.log(c.min) + x * (Math.log(c.max) - Math.log(c.min))) : x; }
function valueToSlider(c, v) { return c.log ? (Math.log(v) - Math.log(c.min)) / (Math.log(c.max) - Math.log(c.min)) : v; }
function fmt(v, digits) {
  if (digits === 0) return Math.round(v).toLocaleString();
  const d = v < 0.1 ? digits + 1 : v >= 100 ? 0 : digits;
  return v.toFixed(d);
}

function currentValue(c) { return c.view ? view[c.key] : toDisplay(c, sim.params[c.key]); }

function buildPanel() {
  for (const g of CONTROLS) {
    const sec = document.createElement('div');
    sec.className = 'ff-group';
    if (g.show) groupRefs.push({ g, sec });
    sec.innerHTML = `<h3>${g.group}</h3>`;
    for (const c of g.items) sec.appendChild(buildControl(c));
    panel.appendChild(sec);
  }
}

function buildControl(c) {
  const wrap = document.createElement('div');
  wrap.className = 'ff-ctl';
  if (c.type === 'button') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ff-btn'; b.textContent = c.label;
    b.addEventListener('click', () => { apply(EARTH_VALUES); sim.reset(); syncPanel(); });
    wrap.appendChild(b);
    ctlRefs[c.key] = { c, wrap };
    return wrap;
  }
  if (c.type === 'seg') {
    const seg = document.createElement('div');
    seg.className = 'ff-seg'; seg.setAttribute('role', 'group');
    if (c.label) {
      seg.setAttribute('aria-label', c.label);
      const lab = document.createElement('div');
      lab.className = 'ff-ctl-top'; lab.style.marginBottom = '.3rem'; lab.textContent = c.label;
      wrap.appendChild(lab);
    }
    for (const [val, lab] of c.options) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = lab; b.dataset.val = val;
      b.addEventListener('click', () => { apply({ [c.key]: val }); syncPanel(); });
      seg.appendChild(b);
    }
    wrap.appendChild(seg);
    ctlRefs[c.key] = { c, seg, wrap };
  } else if (c.type === 'check') {
    const lab = document.createElement('label');
    lab.className = 'ff-check';
    lab.innerHTML = `<input type="checkbox"> <span>${c.label}</span>`;
    const inp = lab.querySelector('input');
    inp.addEventListener('change', () => { if (c.view) view[c.key] = inp.checked; else apply({ [c.key]: inp.checked }); });
    wrap.appendChild(lab);
    ctlRefs[c.key] = { c, inp, wrap };
  } else if (c.type === 'preset') {
    const sel = document.createElement('select');
    sel.className = 'ff-select'; sel.setAttribute('aria-label', 'Ferrofluid preset');
    for (const [k, f] of Object.entries(FLUIDS)) sel.add(new Option(f.label, k));
    sel.add(new Option('Custom', 'custom'));
    sel.addEventListener('change', () => {
      if (sel.value === 'custom') return;
      preset = sel.value;
      const { label, ...f } = FLUIDS[sel.value];
      apply(f, true);
      syncPanel();
    });
    wrap.appendChild(sel);
    ctlRefs.preset = { c, sel, wrap };
  } else {
    const id = 'ctl-' + c.key;
    wrap.innerHTML = `<div class="ff-ctl-top"><label for="${id}"></label><span class="ff-ctl-val"></span></div>
      <input id="${id}" type="range">${c.note ? `<div class="ff-ctl-note"></div>` : ''}`;
    const inp = wrap.querySelector('input'), out = wrap.querySelector('.ff-ctl-val');
    if (c.log) { inp.min = 0; inp.max = 1; inp.step = 0.001; } else { inp.min = c.min; inp.max = c.max; inp.step = c.step; }
    inp.addEventListener('input', () => {
      const v = sliderToValue(c, parseFloat(inp.value));
      out.textContent = `${fmt(v, c.digits)} ${c.unit}`.trim();
      if (c.view) { view[c.key] = v; return; }
      if (['mu', 'Ms', 'chi', 'sigma', 'rho'].includes(c.key)) { preset = 'custom'; ctlRefs.preset.sel.value = 'custom'; }
      scheduleApply({ [c.key]: v * c.scale });
    });
    ctlRefs[c.key] = { c, inp, out, wrap, lab: wrap.querySelector('label'), note: wrap.querySelector('.ff-ctl-note') };
  }
  return wrap;
}

function syncPanel() {
  for (const { g, sec } of groupRefs) sec.hidden = !g.show(sim.params);
  for (const { c, inp, out, seg, sel, wrap, lab, note } of Object.values(ctlRefs)) {
    if (c.show) wrap.hidden = !c.show(sim.params);
    if (lab) lab.textContent = resolve(c.label);
    if (note) note.textContent = resolve(c.note);
    if (c.type === 'button') continue;
    if (c.type === 'seg') {
      for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.val === sim.params[c.key]));
    } else if (c.type === 'check') {
      inp.checked = !!(c.view ? view[c.key] : sim.params[c.key]);
    } else if (c.type === 'preset') {
      sel.value = preset;
    } else {
      const v = currentValue(c);
      inp.value = valueToSlider(c, v);
      out.textContent = `${fmt(v, c.digits)} ${c.unit}`.trim();
    }
  }
}

let pending = null, pendingTimer = 0;
function scheduleApply(p) {
  pending = { ...(pending || {}), ...p };
  if (!pendingTimer) pendingTimer = setTimeout(() => { pendingTimer = 0; const q = pending; pending = null; apply(q); }, 60);
}

function apply(p, fluidPreset = false) {
  const needsReset = Object.keys(p).some(k => RESET_KEYS.has(k) && p[k] !== sim.params[k]);
  sim.setParams(p);
  if (needsReset) sim.reset();
  if (['nMag', 'period', 'mode', 'tilt', 'altPoles', 'ecc', 'gap'].some(k => k in p)) rebuildMagnets();
  if ('mode' in p) { syncPanel(); seasonCard.hidden = p.mode !== 'earth'; }
  if ('R' in p || 'sigma' in p || 'rho' in p || 'gravity' in p || 'gScale' in p || fluidPreset) rebuildSpikePattern();
  if ('R' in p || 'gap' in p || 'magD' in p || 'magL' in p) { rebuildMagnets(); placeCamera(false); }
  if ('tilt' in p) rebuildMagnets();
}

// ------------------------------------------------------------------ three.js scene
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0c10);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x202020, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(3, 5, 4);
scene.add(key);

const CM = 100; // scene units are centimetres
function placeCamera(initial = true) {
  const R = sim.params.R * CM, reach = R + (sim.params.gap + sim.params.magL) * CM;
  const dist = reach * 3.3;
  if (initial) camera.position.set(dist * 0.35, dist * 0.42, dist * 0.84);
  else camera.position.setLength(dist);
  controls.target.set(0, 0, 0);
  controls.minDistance = R * 1.3; controls.maxDistance = dist * 3;
  controls.update();
}

// Fluid surface: each simulation triangle is subdivided 4×4, so every render vertex
// carries exact barycentric weights onto three simulation cells.
const SUB = 4;
const body = new THREE.Group();
scene.add(body);
const rm = buildRenderMesh();
function buildRenderMesh() {
  const u = sim.unit, keyMap = new Map();
  const pos = [], wi = [], ww = [], idx = [];
  const vert = (a, b, c, i, j) => {
    const b2 = i / SUB, b3 = j / SUB, b1 = 1 - b2 - b3;
    let x = b1 * u[3 * a] + b2 * u[3 * b] + b3 * u[3 * c];
    let y = b1 * u[3 * a + 1] + b2 * u[3 * b + 1] + b3 * u[3 * c + 1];
    let z = b1 * u[3 * a + 2] + b2 * u[3 * b + 2] + b3 * u[3 * c + 2];
    const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
    const k = `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`;
    let id = keyMap.get(k);
    if (id === undefined) {
      id = pos.length / 3; keyMap.set(k, id);
      pos.push(x, y, z); wi.push(a, b, c); ww.push(b1, b2, b3);
    }
    return id;
  };
  for (const [a, b, c] of sim.faces) {
    const g = [];
    for (let i = 0; i <= SUB; i++) { g[i] = []; for (let j = 0; j <= SUB - i; j++) g[i][j] = vert(a, b, c, i, j); }
    for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB - i; j++) {
      idx.push(g[i][j], g[i + 1][j], g[i][j + 1]);
      if (j < SUB - i - 1) idx.push(g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]);
    }
  }
  const nv = pos.length / 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.14, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  body.add(mesh);
  return { mesh, geo, unit: Float32Array.from(pos), wi: Uint32Array.from(wi), ww: Float32Array.from(ww), nv, shape: new Float32Array(nv) };
}

// Rosensweig spike lattice: near-hexagonal points (Fibonacci lattice) spaced by the
// critical wavelength; each render vertex stores a cone profile around its nearest point.
function rebuildSpikePattern() {
  const p = sim.params;
  const g = Math.max(gravityOf(p), 2);
  const lam = Math.min(0.03, Math.max(0.004, 2 * Math.PI * Math.sqrt(p.sigma / (p.rho * g))));
  const R = p.R;
  const N = Math.max(12, Math.round(4 * Math.PI * R * R / (0.866 * lam * lam)));
  const pts = new Float32Array(3 * N);
  const ga = Math.PI * (3 - Math.sqrt(5));
  const cell = lam / R, grid = new Map();
  const gk = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let k = 0; k < N; k++) {
    const y = 1 - 2 * (k + 0.5) / N, r = Math.sqrt(1 - y * y), th = ga * k;
    pts[3 * k] = r * Math.cos(th); pts[3 * k + 1] = y; pts[3 * k + 2] = r * Math.sin(th);
    const key = gk(pts[3 * k], y, pts[3 * k + 2]);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(k);
  }
  const { unit, nv, shape } = rm;
  const rc = 0.6 * lam / R;
  let mean = 0;
  for (let v = 0; v < nv; v++) {
    const x = unit[3 * v], y = unit[3 * v + 1], z = unit[3 * v + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = 4;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
      if (!list) continue;
      for (const k of list) {
        const d2 = (x - pts[3 * k]) ** 2 + (y - pts[3 * k + 1]) ** 2 + (z - pts[3 * k + 2]) ** 2;
        if (d2 < best) best = d2;
      }
    }
    const t = Math.max(0, 1 - Math.sqrt(best) / rc);
    shape[v] = t * t * (1 + t) / 2;
    mean += shape[v];
  }
  mean /= nv;
  for (let v = 0; v < nv; v++) shape[v] = (shape[v] - mean) / (1 - mean);
}

const BARE = new THREE.Color(0x9fb7c3), WET = new THREE.Color(0x060608);
const THIN = new THREE.Color(0x2f6fe0), THICK = new THREE.Color(0xf59e0b);
function updateSurface() {
  const { unit, wi, ww, nv, shape, geo } = rm;
  const P = geo.attributes.position.array, C = geo.attributes.color.array;
  const R = sim.params.R, E = view.exag, h = sim.h, s = sim.s, lean = sim.lean;
  const heat = view.heat, invH0 = 1 / sim.params.h0;
  for (let v = 0; v < nv; v++) {
    const a = wi[3 * v], b = wi[3 * v + 1], c = wi[3 * v + 2];
    const w1 = ww[3 * v], w2 = ww[3 * v + 1], w3 = ww[3 * v + 2];
    const hv = w1 * h[a] + w2 * h[b] + w3 * h[c];
    const sv = w1 * s[a] + w2 * s[b] + w3 * s[c];
    const sh = shape[v];
    const thick = Math.max(0, hv + sv * sh);
    const up = sh > 0 ? sv * sh * E : 0;
    const lx = w1 * lean[3 * a] + w2 * lean[3 * b] + w3 * lean[3 * c];
    const ly = w1 * lean[3 * a + 1] + w2 * lean[3 * b + 1] + w3 * lean[3 * c + 1];
    const lz = w1 * lean[3 * a + 2] + w2 * lean[3 * b + 2] + w3 * lean[3 * c + 2];
    const r = (R + E * (sh > 0 ? hv : thick)) * CM;
    P[3 * v] = unit[3 * v] * r + (unit[3 * v] + lx) * up * CM;
    P[3 * v + 1] = unit[3 * v + 1] * r + (unit[3 * v + 1] + ly) * up * CM;
    P[3 * v + 2] = unit[3 * v + 2] * r + (unit[3 * v + 2] + lz) * up * CM;
    let t = (thick - 4e-6) / 3e-5; t = t < 0 ? 0 : t > 1 ? 1 : t;
    let r0 = WET.r, g0 = WET.g, b0 = WET.b;
    if (heat) {
      // log2 of thickness relative to the original coat: -3..+3 doublings
      let q = Math.log2(Math.max(thick, 1e-7) * invH0) / 3;
      q = q < -1 ? -1 : q > 1 ? 1 : q;
      const tc = q < 0 ? THIN : THICK, a = Math.abs(q) * 0.85;
      r0 += (tc.r - r0) * a; g0 += (tc.g - g0) * a; b0 += (tc.b - b0) * a;
    }
    C[3 * v] = BARE.r + (r0 - BARE.r) * t;
    C[3 * v + 1] = BARE.g + (g0 - BARE.g) * t;
    C[3 * v + 2] = BARE.b + (b0 - BARE.b) * t;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

// watch point marker (rides on the sphere)
const watchMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xa78bfa }));
body.add(watchMarker);

// magnets + orbit ring
const magGroup = new THREE.Group();
scene.add(magGroup);
const magMats = {
  N: new THREE.MeshStandardMaterial({ color: 0xc0392b, metalness: 0.6, roughness: 0.35 }),
  S: new THREE.MeshStandardMaterial({ color: 0x2c6fbb, metalness: 0.6, roughness: 0.35 }),
};
let magMeshes = [], ring = null;
function rebuildMagnets() {
  for (const m of magMeshes) { magGroup.remove(m); m.traverse(o => o.geometry && o.geometry.dispose()); }
  magMeshes = [];
  if (ring) { scene.remove(ring); ring.geometry.dispose(); }
  const { magD, magL, altPoles } = sim.params;
  const earth = sim.params.mode === 'earth', nMag = earth ? 1 : sim.params.nMag;
  axisLine.visible = earth;
  const rad = magD / 2 * CM, half = magL / 2 * CM;
  for (let k = 0; k < nMag; k++) {
    const g = new THREE.Group();
    const near = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, half, 40), altPoles && k % 2 ? magMats.S : magMats.N);
    const far = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, half, 40), altPoles && k % 2 ? magMats.N : magMats.S);
    near.position.y = -half / 2; far.position.y = half / 2; // local +y points away from the sphere
    g.add(near, far);
    magGroup.add(g);
    magMeshes.push(g);
  }
  const { e1, e2 } = earth ? { e1: [1, 0, 0], e2: [0, 0, -1] } : sim.frame();
  const { R, gap, ecc } = sim.params;
  const pts = [];
  for (let i = 0; i <= 128; i++) {
    const a = 2 * Math.PI * i / 128;
    // Earth-like: the Sun's ellipse (eccentricity applied to the gap)
    const g = earth ? gap * (1 - ecc * ecc) / (1 + ecc * Math.cos(a)) : gap;
    const rr = (R + g + magL / 2) * CM;
    pts.push(new THREE.Vector3((Math.cos(a) * e1[0] + Math.sin(a) * e2[0]) * rr, (Math.cos(a) * e1[1] + Math.sin(a) * e2[1]) * rr, (Math.cos(a) * e1[2] + Math.sin(a) * e2[2]) * rr));
  }
  ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x6b7280, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.6 }));
  ring.computeLineDistances();
  scene.add(ring);
}


const _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _m4 = new THREE.Matrix4();
// the sphere's spin axis (Earth-like mode): a thin rod through the poles, riding on the body
const axisLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.35, 0), new THREE.Vector3(0, 1.35, 0)]),
  new THREE.LineBasicMaterial({ color: 0xd1d5db, transparent: true, opacity: 0.7 }));
body.add(axisLine);
function updateScene() {
  const ws = sim.worldState();
  const R = sim.params.R * CM, M = ws.rot;
  _m4.set(M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, 0, 0, 0, 1);
  body.quaternion.setFromRotationMatrix(_m4);
  axisLine.scale.setScalar(R);
  ws.mags.forEach((m, k) => {
    const g = magMeshes[k]; if (!g) return;
    _dir.set(...m.dir);
    g.position.copy(_dir).multiplyScalar((sim.params.R + m.gap + sim.params.magL / 2) * CM);
    g.quaternion.setFromUnitVectors(_up, _dir);
  });
  const w = sim.watch, u = sim.unit;
  const rw = (sim.params.R + view.exag * (sim.h[w] + sim.s[w])) * CM + 0.15;
  watchMarker.position.set(u[3 * w] * rw, u[3 * w + 1] * rw, u[3 * w + 2] * rw);
  watchMarker.scale.setScalar(Math.max(0.12, R * 0.035));
  updateSurface();
}

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);

// ------------------------------------------------------------------ chart
const chart = document.getElementById('chart');
const cctx = chart.getContext('2d');
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888'; }
function drawChart(st) {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const W = chart.clientWidth, H = 220;
  if (chart.width !== Math.round(W * dpr)) { chart.width = Math.round(W * dpr); chart.height = Math.round(H * dpr); }
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cctx.clearRect(0, 0, W, H);
  const hist = sim.hist, n = hist.t.length;
  const text = css('--color-text-muted'), accent = css('--color-accent'), border = css('--color-border');
  const padL = 44, padR = 8, padT = 10, padB = 26;
  const span = Math.min(Math.max(3 * st.Tp, 3), 30, Math.max(sim.t, 0.5));
  const t1 = sim.t, t0 = Math.max(0, t1 - span);
  let k0 = n - 1; while (k0 > 0 && hist.t[k0 - 1] >= t0) k0--;
  let ymax = st.hAvg * 1.5;
  for (let k = k0; k < n; k++) ymax = Math.max(ymax, hist.tip[k]);
  ymax = niceMax(ymax * 1e3 * 1.1) / 1e3;
  const X = t => padL + (t - t0) / span * (W - padL - padR);
  const Y = h => padT + (1 - h / ymax) * (H - padT - padB);
  cctx.font = '11px system-ui, sans-serif';
  // magnet-overhead shading
  const cosFoot = Math.cos(sim.footHalfAngle);
  cctx.fillStyle = 'rgba(245,158,11,0.22)';
  let inPass = -1;
  for (let k = k0; k < n; k++) {
    const on = hist.prox[k] > cosFoot;
    if (on && inPass < 0) inPass = hist.t[k];
    if ((!on || k === n - 1) && inPass >= 0) { cctx.fillRect(X(inPass), padT, Math.max(1, X(hist.t[k]) - X(inPass)), H - padT - padB); inPass = -1; }
  }
  // grid + axes
  cctx.strokeStyle = border; cctx.fillStyle = text; cctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = ymax * i / 4, y = Y(v);
    cctx.beginPath(); cctx.moveTo(padL, y); cctx.lineTo(W - padR, y); cctx.stroke();
    cctx.textAlign = 'right'; cctx.fillText((v * 1e3).toFixed(ymax * 1e3 < 1 ? 2 : 1), padL - 6, y + 4);
  }
  cctx.save(); cctx.translate(11, padT + (H - padT - padB) / 2); cctx.rotate(-Math.PI / 2);
  cctx.textAlign = 'center'; cctx.fillText('height (mm)', 0, 0); cctx.restore();
  cctx.textAlign = 'center';
  const step = niceStep(span / 5);
  for (let s = 0; s <= span + 1e-9; s += step) { cctx.textAlign = s === 0 ? 'right' : 'center'; cctx.fillText(s === 0 ? 'now' : `−${+s.toFixed(2)} s`, X(t1 - s), H - 8); }
  // baseline
  cctx.setLineDash([5, 4]); cctx.strokeStyle = text;
  cctx.beginPath(); cctx.moveTo(padL, Y(st.hAvg)); cctx.lineTo(W - padR, Y(st.hAvg)); cctx.stroke();
  cctx.setLineDash([]);
  const line = (arr, color, w) => {
    cctx.strokeStyle = color; cctx.lineWidth = w; cctx.beginPath();
    for (let k = k0; k < n; k++) { const x = X(hist.t[k]), y = Y(arr[k]); k === k0 ? cctx.moveTo(x, y) : cctx.lineTo(x, y); }
    cctx.stroke();
  };
  line(hist.h, text, 1.25);
  line(hist.tip, accent, 2);
}
function niceMax(v) { const p = 10 ** Math.floor(Math.log10(v)); for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; }
function niceStep(v) { const p = 10 ** Math.floor(Math.log10(v)); for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }

// ------------------------------------------------------------------ seasons (Earth-like mode)
const seasonCard = document.getElementById('season-card');
const seasonCanvas = document.getElementById('season-chart');
const sctx = seasonCanvas.getContext('2d');
const seasonOut = document.getElementById('season-out');
function drawSeason() {
  const S = sim.season, n = S.t.length, p = sim.params;
  const dpr = Math.min(window.devicePixelRatio, 2);
  const W = seasonCanvas.clientWidth, H = 200;
  if (seasonCanvas.width !== Math.round(W * dpr)) { seasonCanvas.width = Math.round(W * dpr); seasonCanvas.height = Math.round(H * dpr); }
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.clearRect(0, 0, W, H);
  const text = css('--color-text-muted'), accent = css('--color-accent'), border = css('--color-border');
  const padL = 48, padR = 44, padT = 10, padB = 26;
  const t1 = Math.max(sim.t, p.year * 0.25), span = Math.min(t1, 4 * p.year), t0 = t1 - span;
  let k0 = 0; while (k0 < n - 1 && S.t[k0] < t0) k0++;
  const dmax = Math.max(1 * deg, p.tilt + p.oblAmp) * 1.1;
  let imax = 0.005;
  for (let k = k0; k < n; k++) imax = Math.max(imax, Math.abs(S.imb[k]));
  imax = niceMax(imax * 100 * 1.15) / 100;
  const X = t => padL + (t - t0) / span * (W - padL - padR);
  const yMid = padT + (H - padT - padB) / 2, half = (H - padT - padB) / 2;
  sctx.font = '11px system-ui, sans-serif';
  sctx.strokeStyle = border; sctx.lineWidth = 1;
  for (const f of [-1, 0, 1]) { sctx.beginPath(); sctx.moveTo(padL, yMid - f * half); sctx.lineTo(W - padR, yMid - f * half); sctx.stroke(); }
  sctx.fillStyle = accent; sctx.textAlign = 'right';
  for (const f of [-1, 0, 1]) sctx.fillText(`${f > 0 ? '+' : ''}${(f * imax * 100).toFixed(imax < 0.1 ? 1 : 0)}%`, padL - 6, yMid - f * half + 4);
  sctx.fillStyle = '#d97706'; sctx.textAlign = 'left';
  for (const f of [-1, 0, 1]) sctx.fillText(`${f > 0 ? '+' : ''}${(f * dmax / deg).toFixed(0)}°`, W - padR + 6, yMid - f * half + 4);
  sctx.fillStyle = text; sctx.textAlign = 'center';
  const yr0 = Math.ceil(t0 / p.year), yr1 = Math.floor(t1 / p.year);
  for (let y = yr0; y <= yr1; y++) { sctx.fillText(`year ${y}`, X(y * p.year), H - 8); }
  const line = (arr, scale, color, w) => {
    sctx.strokeStyle = color; sctx.lineWidth = w; sctx.beginPath();
    for (let k = k0; k < n; k++) { const x = X(S.t[k]), y = yMid - arr[k] / scale * half; k === k0 ? sctx.moveTo(x, y) : sctx.lineTo(x, y); }
    sctx.stroke();
  };
  if (n > 1) { line(S.decl, dmax, '#f59e0b', 1.5); line(S.imb, imax, accent, 2); }

  const ss = sim.seasonStats();
  const yrFrac = v => `${(v / p.year).toFixed(2)} of a year`;
  const days = v => Math.round(v / p.year * 365);
  let follow;
  if (ss.noSeasons) follow = `<div class="ff-stat wide"><div class="k">Does it follow the Sun?</div><div class="v">No seasons to follow</div><div class="d">The Sun only moves ±${(ss.declAmp / deg).toFixed(1)}° in latitude. Tilt the axis to give the sphere seasons.</div></div>`;
  else if (ss.years < 1) follow = `<div class="ff-stat wide"><div class="k">Does it follow the Sun?</div><div class="v">Measuring…</div><div class="d">Needs at least one full year (${Math.round(ss.years * 100)}% so far).</div></div>`;
  else {
    const k = ss.r > 0.7 ? 'up' : ss.r > 0.3 ? 'partial' : 'down';
    const word = ss.r > 0.7 ? 'Yes, it follows the Sun' : ss.r > 0.3 ? 'Partly' : 'No clear link';
    follow = `<div class="ff-stat wide verdict" data-k="${k}"><div class="k">Does it follow the Sun?</div><div class="v">${word} (r = ${ss.r.toFixed(2)})</div>
      <div class="d">Best match when the fluid lags the Sun by ${sec(ss.lag)}, which is ${yrFrac(ss.lag)} (about ${days(ss.lag)} days on Earth's calendar).</div></div>
      <div class="ff-stat"><div class="k">Seasonal swing</div><div class="v">±${(ss.amp * 100).toFixed(1)}%</div><div class="d">of all the fluid moves between hemispheres each year</div></div>`;
  }
  const conc = ss.tropArea > 0 ? ss.trop / ss.tropArea : 0;
  seasonOut.innerHTML = `${follow}
    <div class="ff-stat"><div class="k">Sun's latitude now</div><div class="v">${(ss.decl / deg).toFixed(1)}° ${ss.decl >= 0 ? 'N' : 'S'}</div><div class="d">where it stands overhead</div></div>
    <div class="ff-stat"><div class="k">North vs south</div><div class="v">${(50 + ss.imb * 50).toFixed(1)}% / ${(50 - ss.imb * 50).toFixed(1)}%</div><div class="d">share of the fluid in each hemisphere</div></div>
    <div class="ff-stat"><div class="k">Tropics (±${((p.tilt + p.oblAmp) / deg).toFixed(1)}°)</div><div class="v">${(ss.trop * 100).toFixed(0)}% of fluid</div><div class="d">on ${(ss.tropArea * 100).toFixed(0)}% of the surface, ${conc.toFixed(2)}× concentrated</div></div>`;
}

// ------------------------------------------------------------------ readouts
const statsEl = document.getElementById('stats');
const badge = document.getElementById('badge'), badgeText = document.getElementById('badge-text');
const mm = v => `${(v * 1e3).toFixed(v < 1e-3 ? 2 : 1)} mm`;
const sec = v => v >= 100 ? `${v.toFixed(0)} s` : v >= 1 ? `${v.toFixed(1)} s` : `${(v * 1e3).toFixed(0)} ms`;
const pct = v => `${Math.round(v * 100)}%`;
function renderStats(st) {
  const vd = verdict(st);
  badge.dataset.k = vd.key; badgeText.textContent = vd.text;
  const ratio = st.tauFall / st.Tp;
  const spikesOn = st.maxS > 2e-5;
  statsEl.innerHTML = `
    <div class="ff-stat wide verdict" data-k="${vd.key}"><div class="k">Verdict along the magnet path</div><div class="v">${vd.text}</div>
      <div class="d">${verdictDetail(st, vd)}</div></div>
    <div class="ff-stat"><div class="k">Peak lift</div><div class="v">${mm(Math.max(0, st.lift))}</div><div class="d">above the typical film (${mm(st.hAvg)}), median along the path</div></div>
    <div class="ff-stat"><div class="k">Held between passes</div><div class="v">${st.valid ? pct(st.retention) : '…'}</div>
      <div class="ff-bar"><div style="width:${st.valid ? st.retention * 100 : 0}%"></div></div></div>
    <div class="ff-stat"><div class="k">Spikes</div><div class="v">${spikesOn ? mm(st.maxS) : 'none'}</div>
      <div class="d">${spikesOn ? `${pct(st.spikeRetention)} survive between passes` : st.mcRatio > 1 ? `field is ${st.mcRatio.toFixed(1)}× the onset value, but spikes grow too slowly (~${sec(st.tauSpike)}) to form during a pass` : `field reaches ${st.mcRatio.toFixed(2)}× the onset value`}</div></div>
    <div class="ff-stat"><div class="k">Field at glass</div><div class="v">${(st.Bglass * 1e3).toFixed(0)} mT</div><div class="d">directly under one magnet</div></div>
    <div class="ff-stat"><div class="k">Pass interval</div><div class="v">${sec(st.Tp)}</div><div class="d">time between magnets</div></div>
    <div class="ff-stat"><div class="k">Fall-back time</div><div class="v">${st.valid && st.lift > 0 ? (isFinite(st.tauFall) ? sec(st.tauFall) : '∞') : '…'}</div>
      <div class="d">${!st.valid || st.lift <= 0 ? 'measured after each pass' : !isFinite(st.tauFall) ? 'no measurable fall between passes' : ratio >= 1 ? `${ratio.toFixed(1)}× the pass interval, which favours staying up` : `${(1 / ratio).toFixed(1)}× shorter than the pass interval`}</div></div>
    <div class="ff-stat wide"><div class="k">Fluid on the sphere</div><div class="v">${pct(st.remaining)}</div>
      <div class="ff-bar"><div style="width:${Math.min(100, st.remaining * 100)}%"></div></div>
      <div class="d">${pct(st.lostMag)} pulled onto the magnet · ${pct(st.lostDrip)} dripped off</div></div>`;
}
function verdictDetail(st, vd) {
  switch (vd.key) {
    case 'wait': return `Collecting ${Math.max(0, 2 * st.Tp - st.measuredFor).toFixed(1)} s more of passes before judging.`;
    case 'lost': return st.lostMag > st.lostDrip
      ? 'The magnet is close or strong enough to pull fluid off the glass. Increase the gap, weaken the magnet, or thin the coat.'
      : 'Gravity is draining the coat off the bottom. A more viscous fluid or a thinner coat holds on longer.';
    case 'weak': return 'The film barely responds. Try a closer or stronger magnet, or a less viscous fluid if the passes are too quick for it to move.';
    case 'up': return 'The fluid never gets the chance to settle back before the next magnet arrives.';
    case 'partial': return 'Some lift survives to the next pass. Shorten the pass interval (faster rotation or more magnets) or raise the viscosity.';
    default: return 'The fluid settles back before the next pass. Make passes more frequent than the fall-back time, or slow the fall-back.';
  }
}

// ------------------------------------------------------------------ sweep
const SWEEPS = {
  period: { label: 'Time per revolution', values: [0.1, 0.2, 0.4, 0.7, 1, 1.5, 2.5, 4, 7], fmt: v => `${v} s` },
  nMag: { label: 'Number of magnets', values: [1, 2, 3, 4, 5, 6, 8], fmt: v => `${v}` },
  gap: { label: 'Gap to glass', values: [3, 5, 7, 10, 13, 17, 22, 30].map(v => v * 1e-3), fmt: v => `${(v * 1e3).toFixed(0)} mm` },
  Br: { label: 'Magnet strength (remanence)', values: [0.3, 0.5, 0.7, 0.9, 1.1, 1.3, 1.45], fmt: v => `${v} T` },
  mu: { label: 'Viscosity', values: [3, 10, 30, 100, 300, 1000, 3000, 10000].map(v => v * 1e-3), fmt: v => `${(v * 1e3).toFixed(0)} mPa·s` },
  tilt: { label: 'Axis tilt', values: [0, 10, 23.44, 35, 45, 60, 80].map(v => v * deg), fmt: v => `${(v / deg).toFixed(1)}°` },
  h0: { label: 'Coating thickness', values: [0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2].map(v => v * 1e-3), fmt: v => `${(v * 1e3).toFixed(2)} mm` },
};
const scanSel = document.getElementById('scan-param');
for (const [k, s] of Object.entries(SWEEPS)) scanSel.add(new Option(s.label, k));
const scanBtn = document.getElementById('btn-scan'), scanOut = document.getElementById('scan-out');
const prog = document.getElementById('scan-progress');
let scanning = false;

function scanDuration(p) {
  // Earth-like: two full years so the seasonal link can be measured
  if (p.mode === 'earth') return Math.min(120, Math.max(2.05 * p.year, 4 * p.period));
  const Tp = p.period / p.nMag;
  return Math.min(30, Math.max(4 * Tp, 3));
}

async function runSweep() {
  if (scanning) return;
  scanning = true; scanBtn.disabled = true; prog.hidden = false;
  const key = scanSel.value, sw = SWEEPS[key], base = { ...sim.params };
  const rows = [];
  const totalWork = sw.values.reduce((a, v) => a + scanDuration({ ...base, [key]: v }), 0);
  let done = 0;
  for (const v of sw.values) {
    const p = { ...base, [key]: v };
    const s = new FerroSim(4, p);
    const T = scanDuration(p);
    while (s.t < T - 1e-9) {
      s.advance(T - s.t, 28);
      prog.firstElementChild.style.width = `${100 * (done + s.t) / totalWork}%`;
      await new Promise(r => requestAnimationFrame(r));
    }
    done += T;
    const st = s.stats();
    rows.push({ v, st, vd: verdict(st), ss: p.mode === 'earth' ? s.seasonStats() : null, year: p.year });
    renderSweep(key, rows);
  }
  scanning = false; scanBtn.disabled = false; prog.hidden = true;
}

function score(r) {
  if (r.st.remaining < 0.5 || r.st.lift < Math.max(0.25 * r.st.hAvg, 2e-5)) return -1;
  return r.st.retention * Math.min(1, r.st.lift / 3e-4) * r.st.remaining;
}

function renderSweep(key, rows) {
  const sw = SWEEPS[key];
  const best = rows.reduce((b, r) => (score(r) > (b ? score(b) : -0.5) ? r : b), null);
  const maxLift = Math.max(1e-6, ...rows.map(r => r.st.lift));
  scanOut.innerHTML = `<div class="ff-table-wrap"><table class="ff-table"><thead><tr>
    <th>${sw.label}</th><th>Peak lift</th><th>Held between passes</th><th>Fluid lost</th>${rows[0] && rows[0].ss ? '<th>Follows the Sun</th>' : ''}<th>Result</th><th></th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${r === best ? 'best' : ''}">
      <td>${sw.fmt(r.v)}</td>
      <td><div class="cellbar"><span style="width:${Math.max(2, 60 * Math.max(0, r.st.lift) / maxLift)}px"></span>${mm(Math.max(0, r.st.lift))}</div></td>
      <td><div class="cellbar"><span style="width:${Math.max(2, 60 * r.st.retention)}px"></span>${pct(r.st.retention)}</div></td>
      <td>${pct(1 - r.st.remaining)}</td>${r.ss ? `<td>${r.ss.noSeasons ? 'no seasons' : isFinite(r.ss.r) ? `r = ${r.ss.r.toFixed(2)}, lag ${(r.ss.lag / r.year).toFixed(2)} yr, ±${(r.ss.amp * 100).toFixed(1)}%` : '…'}</td>` : ''}
      <td class="vk" data-k="${r.vd.key}">${r.vd.text}</td>
      <td><button type="button" data-i="${i}">Use</button></td></tr>`).join('')}
    </tbody></table></div>
    ${rows.length === sw.values.length ? `<p class="ff-scan-summary">${best
      ? `Best balance in this sweep: <strong>${sw.fmt(best.v)}</strong>. It holds ${pct(best.st.retention)} of a ${mm(best.st.lift)} lift between passes and keeps ${pct(best.st.remaining)} of the fluid.`
      : 'No value in this sweep lifts the fluid without losing it. Change another setting, then sweep again.'}</p>` : ''}`;
  scanOut.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => {
    const r = rows[+b.dataset.i];
    apply({ [key]: r.v });
    if (!RESET_KEYS.has(key)) sim.reset();
    syncPanel();
    document.querySelector('.ff-stage').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
}
scanBtn.addEventListener('click', runSweep);

// ------------------------------------------------------------------ loop
let running = true, last = performance.now(), lastStats = 0, rate = 1;
const playBtn = document.getElementById('btn-play');
playBtn.addEventListener('click', () => { running = !running; playBtn.textContent = running ? 'Pause' : 'Play'; playBtn.setAttribute('aria-label', running ? 'Pause' : 'Play'); });
document.getElementById('btn-reset').addEventListener('click', () => sim.reset());
const clock = document.getElementById('clock');
const heatLegend = document.getElementById('heat-legend');

function frame(now) {
  const dtReal = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (running) {
    const want = dtReal * view.speed;
    const got = sim.advance(want, scanning ? 4 : 14);
    if (want > 0) rate = rate * 0.95 + 0.05 * (got / dtReal);
  }
  updateScene();
  heatLegend.hidden = !view.heat;
  controls.update();
  renderer.render(scene, camera);
  if (now - lastStats > 200) {
    lastStats = now;
    const st = sim.stats();
    renderStats(st);
    drawChart(st);
    if (sim.params.mode === 'earth') drawSeason();
    const slow = running && rate < view.speed * 0.8;
    clock.textContent = `t = ${sim.t.toFixed(1)} s${running ? ` · ${rate < 0.995 ? rate.toFixed(2) : rate.toFixed(1)}× real time${slow ? ' (slowed by compute)' : ''}` : ' · paused'}`;
  }
  requestAnimationFrame(frame);
}

buildPanel();
syncPanel();
seasonCard.hidden = sim.params.mode !== 'earth';
rebuildSpikePattern();
rebuildMagnets();
placeCamera(true);
resize();
requestAnimationFrame(frame);

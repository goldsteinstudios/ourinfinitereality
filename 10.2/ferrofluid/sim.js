// Ferrofluid film on a glass sphere, driven by orbiting permanent magnets.
//
// Physics (all SI units):
//  - Film thickness h lives on the vertices of an icosphere (finite volumes).
//  - Depth-averaged momentum per edge:  rho dv/dt = -grad(Phi) - (3 mu / h^2) v
//    (Poiseuille drag, implicit) so both the viscous (creeping) regime and the
//    inertial (sloshing) regime are represented.
//  - Phi = sigma*kappa - mu0*Mn^2/2 + rho*g_in*h - psi(H) - rho*g.x
//      capillary pressure, magnetic normal traction, hydrostatic film weight,
//      Kelvin body force potential psi = mu0 * int_0^H M dH, gravity.
//  - Magnetization follows the Langevin curve (Ms, initial susceptibility chi).
//  - Magnets are cylinders modelled with the magnetic-charge (pole) model,
//    discretised over both faces; their field is tabulated once.
//  - Rosensweig (normal-field) spikes are sub-grid: an amplitude per vertex that
//    relaxes toward a target set by Mn / Mc, at the thin-film relaxation rate.
//  - Detachment: when the outward force (gravity on the underside, magnetic
//    pull toward the magnet) beats surface tension (Bond number), fluid is lost.

export const MU0 = 4e-7 * Math.PI;
export const G0 = 9.81;
export function gravityOf(p) { return p.gravity === 'off' ? 0 : G0 * (p.gScale ?? 1); }

export const FLUIDS = {
  oil: { label: 'Light oil-based (EFH1-like)', rho: 1210, mu: 0.006, sigma: 0.029, Ms: 35e3, chi: 2.6 },
  water: { label: 'Water-based', rho: 1180, mu: 0.005, sigma: 0.045, Ms: 20e3, chi: 1.5 },
  viscous: { label: 'Viscous oil-based (~500 cP)', rho: 1300, mu: 0.5, sigma: 0.03, Ms: 35e3, chi: 2.6 },
  thick: { label: 'Very viscous (~5000 cP)', rho: 1350, mu: 5, sigma: 0.03, Ms: 35e3, chi: 2.6 },
  strong: { label: 'High-saturation oil (~90 mT)', rho: 1400, mu: 0.02, sigma: 0.029, Ms: 72e3, chi: 5 },
};

export const DEFAULTS = {
  R: 0.05, h0: 0.0005,
  ...FLUIDS.oil,
  Br: 1.3, magD: 0.025, magL: 0.025, gap: 0.01,
  nMag: 1, altPoles: false,
  mode: 'orbit', tilt: 0, period: 2,
  // 'center': pulls toward the sphere's centre everywhere (like a small planet)
  // 'down': ordinary lab gravity, sphere resting on a table · 'off': no gravity
  gravity: 'center', gScale: 1, detach: true,
};

const BO_CRIT = 3.5;        // Bond number at which a pendant / pulled column detaches
const TAU_DETACH = 0.01;    // s, time for an over-critical column to leave
const H_MIN = 1e-6;         // m, precursor film
const DR = 0.001;           // m, radial spacing of the field table
const NA = 721;             // angular samples of the field table

// ---------------------------------------------------------------- math helpers
function langevinExact(x) { return x < 1e-4 ? x / 3 : 1 / Math.tanh(x) - 1 / x; }
function lnSinhOverXExact(x) {
  if (x < 1e-3) return x * x / 6;
  if (x > 20) return x - Math.LN2 - Math.log(x);
  return Math.log(Math.sinh(x) / x);
}
// Tabulated Langevin curve and its integral (hot path).
const X_MAX = 60, X_STEP = 0.01, NX = Math.round(X_MAX / X_STEP) + 1;
const L_TBL = new Float64Array(NX), LS_TBL = new Float64Array(NX);
for (let i = 0; i < NX; i++) { L_TBL[i] = langevinExact(i * X_STEP); LS_TBL[i] = lnSinhOverXExact(i * X_STEP); }
function langevin(x) {
  if (x >= X_MAX) return 1 - 1 / x;
  const f = x / X_STEP, i = f | 0;
  return L_TBL[i] + (L_TBL[i + 1] - L_TBL[i]) * (f - i);
}
function lnSinhOverX(x) {
  if (x >= X_MAX) return x - Math.LN2 - Math.log(x);
  const f = x / X_STEP, i = f | 0;
  return LS_TBL[i] + (LS_TBL[i + 1] - LS_TBL[i]) * (f - i);
}
export function magnetization(H, Ms, chi) { return Ms * langevin(3 * chi * H / Ms); }
export function magEnergy(H, Ms, chi) { return MU0 * Ms * Ms / (3 * chi) * lnSinhOverX(3 * chi * H / Ms); }

function rotate(v, a, ang) { // Rodrigues, a unit
  const c = Math.cos(ang), s = Math.sin(ang);
  const d = (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]) * (1 - c);
  return [
    v[0] * c + (a[1] * v[2] - a[2] * v[1]) * s + a[0] * d,
    v[1] * c + (a[2] * v[0] - a[0] * v[2]) * s + a[1] * d,
    v[2] * c + (a[0] * v[1] - a[1] * v[0]) * s + a[2] * d,
  ];
}

// ---------------------------------------------------------------- geometry
export function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [];
  const add = (x, y, z) => { const l = Math.hypot(x, y, z); verts.push(x / l, y / l, z / l); return verts.length / 3 - 1; };
  [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].forEach(p => add(...p));
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let l = 0; l < level; l++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? a * 1e6 + b : b * 1e6 + a;
      let m = cache.get(k);
      if (m === undefined) {
        m = add(verts[3 * a] + verts[3 * b], verts[3 * a + 1] + verts[3 * b + 1], verts[3 * a + 2] + verts[3 * b + 2]);
        cache.set(k, m);
      }
      return m;
    };
    const nf = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nf;
  }
  return { verts: Float64Array.from(verts), faces };
}

// ---------------------------------------------------------------- simulation
export class FerroSim {
  constructor(level = 4, params = {}) {
    this.level = level;
    const { verts, faces } = icosphere(level);
    this.unit = verts;
    this.faces = faces;
    this.n = verts.length / 3;
    this._buildTopology();
    const n = this.n;
    this.h = new Float64Array(n);
    this.s = new Float64Array(n);      // spike amplitude (tip height above film)
    this.phi = new Float64Array(n);
    this.lap = new Float64Array(n);
    this.psi = new Float64Array(n);
    this.fmag = new Float64Array(n);   // outward magnetic force density, N/m^3
    this.Mn = new Float64Array(n);     // normal magnetization inside the fluid
    this.Hmag = new Float64Array(n);   // |H| outside, A/m
    this.lean = new Float32Array(3 * n); // tangential field / normal field (spike lean)
    this.gin = new Float64Array(n);    // gravity component pressing into the glass
    this.gdotx = new Float64Array(n);  // g . x  (gravity potential)
    this.out = new Float64Array(n);
    this.lim = new Float64Array(n);
    this.v = new Float64Array(this.ne);
    this.Q = new Float64Array(this.ne);
    this.magDirs = [];
    this.magSign = [];
    this.params = { ...DEFAULTS };
    this.setParams(params, true);
    this.reset();
  }

  _buildTopology() {
    const n = this.n, u = this.unit;
    const area = new Float64Array(n);
    const emap = new Map();
    const P = i => [u[3 * i], u[3 * i + 1], u[3 * i + 2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cotAt = (o, p, q) => { const a = sub(p, o), b = sub(q, o); return dot(a, b) / Math.hypot(...cross(a, b)); };
    const addE = (i, j, c) => {
      const k = i < j ? i * n + j : j * n + i;
      emap.set(k, (emap.get(k) || 0) + c);
    };
    for (const [a, b, c] of this.faces) {
      const pa = P(a), pb = P(b), pc = P(c);
      const ar = 0.5 * Math.hypot(...cross(sub(pb, pa), sub(pc, pa)));
      area[a] += ar / 3; area[b] += ar / 3; area[c] += ar / 3;
      addE(b, c, cotAt(pa, pb, pc));
      addE(c, a, cotAt(pb, pc, pa));
      addE(a, b, cotAt(pc, pa, pb));
    }
    // rescale areas so the unit sphere has area 4 pi exactly
    let tot = 0; for (let i = 0; i < n; i++) tot += area[i];
    for (let i = 0; i < n; i++) area[i] *= 4 * Math.PI / tot;
    this.areaU = area;
    this.ne = emap.size;
    this.ei = new Uint32Array(this.ne); this.ej = new Uint32Array(this.ne);
    this.cw = new Float64Array(this.ne); this.dU = new Float64Array(this.ne);
    let e = 0;
    for (const [k, c] of emap) {
      const i = Math.floor(k / n), j = k - i * n;
      this.ei[e] = i; this.ej[e] = j; this.cw[e] = c / 2;
      this.dU[e] = Math.hypot(u[3 * i] - u[3 * j], u[3 * i + 1] - u[3 * j + 1], u[3 * i + 2] - u[3 * j + 2]);
      e++;
    }
    const deg = new Float64Array(n);
    for (let k = 0; k < this.ne; k++) { deg[this.ei[k]] += this.cw[k]; deg[this.ej[k]] += this.cw[k]; }
    let lam = 0, dmin = Infinity;
    for (let i = 0; i < n; i++) lam = Math.max(lam, 2 * deg[i] / area[i]);
    for (let k = 0; k < this.ne; k++) dmin = Math.min(dmin, this.dU[k]);
    this.lamU = lam; // Laplacian spectral bound on the unit sphere (scales 1/R^2)
    this.dminU = dmin;
  }

  setParams(p, force = false) {
    const old = this.params;
    const np = { ...old, ...p };
    this.params = np;
    const geomChanged = force || ['R', 'Br', 'magD', 'magL', 'gap'].some(k => np[k] !== old[k]);
    if (np.R !== old.R || force) {
      this.A = new Float64Array(this.n);
      for (let i = 0; i < this.n; i++) this.A[i] = this.areaU[i] * np.R * np.R;
      this.d = new Float64Array(this.ne);
      for (let e = 0; e < this.ne; e++) this.d[e] = this.dU[e] * np.R;
      this.lstar = new Float64Array(this.ne);
      for (let e = 0; e < this.ne; e++) this.lstar[e] = this.cw[e] * this.d[e];
      this.lam = this.lamU / (np.R * np.R);
      this.dmin = this.dminU * np.R;
      if (!force) this.reset();
    }
    if (geomChanged) this._buildFieldTable();
    if (!force && this.path) {
      if (np.tilt !== old.tilt) this._initPath();
      else if (Object.keys(p).some(k => np[k] !== old[k])) this._clearHist();
    }
  }

  // Field of one cylinder magnet (axis through the sphere centre, north face toward
  // the sphere) tabulated over (angle from the magnet axis, radius from centre).
  _buildFieldTable() {
    const { R, Br, magD, magL, gap } = this.params;
    const a = magD / 2, Mmag = Br / MU0;
    const charges = []; // [rho, phi, z, q]
    const NRING = 8;
    const b = a / NRING;
    for (const [z, sgn] of [[R + gap, 1], [R + gap + magL, -1]]) {
      for (let j = 0; j < NRING; j++) {
        const band = Math.PI * (((j + 1) * b) ** 2 - (j * b) ** 2);
        const m = j === 0 ? 1 : Math.round(2 * Math.PI * (j + 0.5));
        const rm = j === 0 ? 0 : (j + 0.5) * b;
        for (let k = 0; k < m; k++) {
          const ph = 2 * Math.PI * (k + 0.5 * (j % 2)) / m;
          charges.push(rm * Math.cos(ph), rm * Math.sin(ph), z, sgn * Mmag * band / m / (4 * Math.PI));
        }
      }
    }
    const nr = Math.max(2, Math.min(26, Math.floor((gap - 0.0005) / DR) + 1));
    this.tblNR = nr;
    this.tblRmax = R + (nr - 1) * DR;
    const Hr = new Float32Array(nr * NA), Ha = new Float32Array(nr * NA);
    const nc = charges.length / 4;
    for (let j = 0; j < nr; j++) {
      const r = R + j * DR;
      for (let i = 0; i < NA; i++) {
        const al = Math.PI * i / (NA - 1);
        const sa = Math.sin(al), ca = Math.cos(al);
        const x = r * sa, z = r * ca;
        let hx = 0, hy = 0, hz = 0;
        for (let c = 0; c < nc; c++) {
          const dx = x - charges[4 * c], dy = -charges[4 * c + 1], dz = z - charges[4 * c + 2];
          const r2 = dx * dx + dy * dy + dz * dz;
          const f = charges[4 * c + 3] / (r2 * Math.sqrt(r2));
          hx += f * dx; hy += f * dy; hz += f * dz;
        }
        Hr[j * NA + i] = hx * sa + hz * ca;
        Ha[j * NA + i] = hx * ca - hz * sa;
      }
    }
    this.tblHr = Hr; this.tblHa = Ha;
    // footprint: angular half-width where |H| at the glass drops to half its peak
    const H0 = Math.hypot(Hr[0], Ha[0]);
    let ih = NA - 1;
    for (let i = 0; i < NA; i++) if (Math.hypot(Hr[i], Ha[i]) < 0.5 * H0) { ih = i; break; }
    this.footHalfAngle = Math.PI * ih / (NA - 1);
    this.Hglass = H0;
  }

  reset() {
    this.t = 0;
    this.h.fill(this.params.h0);
    this.s.fill(0);
    this.v.fill(0);
    this.lostMag = 0; this.lostDrip = 0;
    this.V0 = 4 * Math.PI * this.params.R ** 2 * this.params.h0;
    this.watch = this._nearest([0, 0, 1]);
    this._initPath();
    this._lastFieldDirs = null;
    this._updateFrame();
    this._computeField();
  }

  // Cells lying on the magnets' path (a great circle around the rotation axis, fixed in
  // the sphere's frame in both modes). The verdict is the median over all of them.
  _initPath() {
    const { axis } = this.frame(), u = this.unit;
    let w = 0.55 * this.dminU, path = [];
    while (path.length < 24) {
      path = [];
      for (let i = 0; i < this.n; i++) {
        if (Math.abs(u[3 * i] * axis[0] + u[3 * i + 1] * axis[1] + u[3 * i + 2] * axis[2]) < w) path.push(i);
      }
      w *= 1.3;
    }
    this.path = Uint32Array.from(path);
    this._clearHist();
  }

  _clearHist() {
    this.hist = { t: [], tip: [], h: [], s: [], prox: [], path: [] };
    this.nextSample = 0;
    this.histStart = this.t;
  }

  _nearest(dir) {
    let best = 0, bd = -2;
    for (let i = 0; i < this.n; i++) {
      const d = this.unit[3 * i] * dir[0] + this.unit[3 * i + 1] * dir[1] + this.unit[3 * i + 2] * dir[2];
      if (d > bd) { bd = d; best = i; }
    }
    return best;
  }

  get passInterval() { return this.params.period / this.params.nMag; }

  // World-frame axis + basis of the rotation.
  frame() {
    const tl = this.params.tilt;
    const axis = [Math.sin(tl), Math.cos(tl), 0];
    const e1 = [0, 0, 1];
    const e2 = [Math.cos(tl), -Math.sin(tl), 0];
    return { axis, e1, e2 };
  }

  // Magnet directions in world frame and body (sphere) rotation angle about the axis.
  worldState(t = this.t) {
    const { axis, e1, e2 } = this.frame();
    const { nMag, period, mode, altPoles } = this.params;
    const th = 2 * Math.PI * t / period;
    const mags = [];
    for (let k = 0; k < nMag; k++) {
      const a = 2 * Math.PI * k / nMag + (mode === 'orbit' ? th : 0);
      mags.push({ dir: [Math.cos(a) * e1[0] + Math.sin(a) * e2[0], Math.cos(a) * e1[1] + Math.sin(a) * e2[1], Math.cos(a) * e1[2] + Math.sin(a) * e2[2]], sign: altPoles && k % 2 ? -1 : 1 });
    }
    return { axis, mags, bodyAngle: mode === 'spin' ? -th : 0 };
  }

  _updateFrame() {
    const { axis, mags, bodyAngle } = this.worldState();
    this.magDirs = mags.map(m => rotate(m.dir, axis, -bodyAngle));
    this.magSign = mags.map(m => m.sign);
    const g = gravityOf(this.params);
    const u = this.unit, R = this.params.R;
    if (this.params.gravity === 'center') {
      // radial: presses the film onto the glass equally everywhere, no downhill direction
      this.gin.fill(g);
      this.gdotx.fill(0);
      return;
    }
    const gb = rotate([0, -g, 0], axis, -bodyAngle);
    for (let i = 0; i < this.n; i++) {
      const gd = gb[0] * u[3 * i] + gb[1] * u[3 * i + 1] + gb[2] * u[3 * i + 2];
      this.gin[i] = -gd;
      this.gdotx[i] = gd * R;
    }
  }

  _lookup(al, rIdx) { // bilinear in (angle, radius); returns [Hr, Ha]
    const fi = al / Math.PI * (NA - 1);
    let i = Math.floor(fi); if (i >= NA - 1) i = NA - 2;
    const wi = fi - i;
    let j = Math.floor(rIdx); if (j >= this.tblNR - 1) j = this.tblNR - 2; if (j < 0) j = 0;
    let wj = rIdx - j; if (wj > 1) wj = 1; if (wj < 0) wj = 0;
    const Hr = this.tblHr, Ha = this.tblHa;
    const k00 = j * NA + i, k10 = k00 + NA;
    const hr0 = Hr[k00] + (Hr[k00 + 1] - Hr[k00]) * wi, hr1 = Hr[k10] + (Hr[k10 + 1] - Hr[k10]) * wi;
    const ha0 = Ha[k00] + (Ha[k00 + 1] - Ha[k00]) * wi, ha1 = Ha[k10] + (Ha[k10 + 1] - Ha[k10]) * wi;
    _lk[0] = hr0 + (hr1 - hr0) * wj; _lk[1] = ha0 + (ha1 - ha0) * wj;
    return _lk;
  }

  _fieldAt(i, rIdx, outV) {
    const u = this.unit, x = u[3 * i], y = u[3 * i + 1], z = u[3 * i + 2];
    let hx = 0, hy = 0, hz = 0;
    for (let k = 0; k < this.magDirs.length; k++) {
      const m = this.magDirs[k];
      let c = x * m[0] + y * m[1] + z * m[2];
      if (c > 1) c = 1; else if (c < -1) c = -1;
      const al = Math.acos(c);
      const [hr, ha] = this._lookup(al, rIdx);
      const sg = this.magSign[k];
      const sa = Math.sin(al);
      let ex = 0, ey = 0, ez = 0;
      if (sa > 1e-6) { ex = (x * c - m[0]) / sa; ey = (y * c - m[1]) / sa; ez = (z * c - m[2]) / sa; }
      hx += sg * (hr * x + ha * ex); hy += sg * (hr * y + ha * ey); hz += sg * (hr * z + ha * ez);
    }
    outV[0] = hx; outV[1] = hy; outV[2] = hz;
    return outV;
  }

  _computeField() {
    const { Ms, chi, R } = this.params;
    const u = this.unit, maxIdx = this.tblNR - 1;
    const H1 = _v1, H2 = _v2;
    for (let i = 0; i < this.n; i++) {
      const rIdx = Math.min((this.h[i] * 0.5) / DR, maxIdx - 1);
      this._fieldAt(i, rIdx, H1);
      this._fieldAt(i, rIdx + 1, H2);
      const x = u[3 * i], y = u[3 * i + 1], z = u[3 * i + 2];
      const psi1 = this._psiIn(H1, x, y, z, Ms, chi, true);
      const Mn = _mn, Hout = _hout;
      const psi2 = this._psiIn(H2, x, y, z, Ms, chi, false);
      this.psi[i] = psi1;
      this.fmag[i] = (psi2 - psi1) / DR;
      this.Mn[i] = Mn.v;
      this.Hmag[i] = Hout.v;
      // spike lean = tangential / normal field ratio (capped)
      const hn = H1[0] * x + H1[1] * y + H1[2] * z;
      let tx = H1[0] - hn * x, ty = H1[1] - hn * y, tz = H1[2] - hn * z;
      const an = Math.abs(hn) + 1e-6;
      tx /= an; ty /= an; tz /= an;
      const tl = Math.hypot(tx, ty, tz);
      const cap = 1.2;
      if (tl > cap) { tx *= cap / tl; ty *= cap / tl; tz *= cap / tl; }
      this.lean[3 * i] = tx; this.lean[3 * i + 1] = ty; this.lean[3 * i + 2] = tz;
    }
    void R;
  }

  // Energy density psi using the field inside the film (normal part reduced by 1+chi_chord).
  _psiIn(H, x, y, z, Ms, chi, record) {
    const Ho = Math.hypot(H[0], H[1], H[2]);
    if (Ho < 1e-9) { if (record) { _mn.v = 0; _hout.v = 0; } return 0; }
    const hn = H[0] * x + H[1] * y + H[2] * z;
    const ht2 = Math.max(0, Ho * Ho - hn * hn);
    const chiC = magnetization(Ho, Ms, chi) / Ho;
    const hnIn = hn / (1 + chiC);
    const Hin = Math.sqrt(ht2 + hnIn * hnIn);
    if (record) {
      _mn.v = Hin > 0 ? magnetization(Hin, Ms, chi) * Math.abs(hnIn) / Hin : 0;
      _hout.v = Ho;
    }
    return magEnergy(Hin, Ms, chi);
  }

  stableDt() {
    const { rho, mu, sigma } = this.params;
    let hmax = H_MIN, vmax = 1e-9;
    for (let i = 0; i < this.n; i++) if (this.h[i] > hmax) hmax = this.h[i];
    for (let e = 0; e < this.ne; e++) { const a = Math.abs(this.v[e]); if (a > vmax) vmax = a; }
    const g = gravityOf(this.params);
    const K = sigma * this.lam * this.lam + rho * g * this.lam;
    const a = hmax * K / rho;
    const D = 3 * mu / (rho * hmax * hmax);
    const dt1 = 0.6 * (D + Math.sqrt(D * D + 4 * a)) / (2 * a);
    const dt2 = 0.6 * this.dmin / vmax;
    const om = 2 * Math.PI / this.params.period;
    const dt3 = this.dmin / (3 * om * this.params.R);
    return Math.min(dt1, dt2, dt3, 0.01);
  }

  step(dt) {
    const p = this.params;
    const { rho, mu, sigma, R } = p;
    this._updateFrame();
    // the field only needs refreshing once the magnets have moved a fraction of a cell
    this._fieldAge = (this._fieldAge || 0) + 1;
    const moved = this._lastFieldDirs ? this.magDirs.reduce((m, d, k) => {
      const o = this._lastFieldDirs[k];
      return o ? Math.max(m, 1 - (d[0] * o[0] + d[1] * o[1] + d[2] * o[2])) : 1;
    }, 0) : 1;
    const thr = 0.5 * (this.dminU / 5) ** 2; // 1 - cos(angle) for a fifth of a cell
    if (moved > thr || this._fieldAge > 6 || this.magDirs.length !== this._lastFieldDirs.length) {
      this._computeField();
      this._lastFieldDirs = this.magDirs.map(d => d.slice());
      this._fieldAge = 0;
    }
    const n = this.n, h = this.h, lap = this.lap, phi = this.phi;
    lap.fill(0);
    for (let e = 0; e < this.ne; e++) {
      const i = this.ei[e], j = this.ej[e];
      const dh = this.cw[e] * (h[j] - h[i]);
      lap[i] += dh; lap[j] -= dh;
    }
    const R2 = R * R;
    for (let i = 0; i < n; i++) {
      const L = lap[i] / this.A[i];
      phi[i] = -sigma * (L + 2 * h[i] / R2) + rho * this.gin[i] * h[i]
        - this.psi[i] - 0.5 * MU0 * this.Mn[i] * this.Mn[i] - rho * this.gdotx[i];
    }
    const v = this.v, Q = this.Q, out = this.out, lim = this.lim;
    out.fill(0);
    const visc = 3 * mu / rho, cd = 0.02;
    for (let e = 0; e < this.ne; e++) {
      const i = this.ei[e], j = this.ej[e];
      const F = -(phi[j] - phi[i]) / this.d[e];
      let he = 0.5 * (h[i] + h[j]); if (he < H_MIN) he = H_MIN;
      const D = visc / (he * he) + cd * Math.abs(v[e]) / he;
      const ve = (v[e] + dt * F / rho) / (1 + dt * D);
      v[e] = ve;
      const src = ve > 0 ? i : j;
      const q = ve * h[src] * this.lstar[e] * dt;
      Q[e] = q;
      out[src] += Math.abs(q);
    }
    for (let i = 0; i < n; i++) {
      const avail = 0.95 * h[i] * this.A[i];
      lim[i] = out[i] > avail ? avail / out[i] : 1;
    }
    for (let e = 0; e < this.ne; e++) {
      const i = this.ei[e], j = this.ej[e];
      const q = Q[e] * lim[Q[e] > 0 ? i : j];
      h[i] -= q / this.A[i]; h[j] += q / this.A[j];
    }

    // sub-grid Rosensweig spikes: slow-ish, so updated in batches of >= 1 ms
    this._spikeDt = (this._spikeDt || 0) + dt;
    if (this._spikeDt >= 1e-3 || this._fieldAge === 0) {
      this._updateSpikes(this._spikeDt);
      this._spikeDt = 0;
    }
    // detachment: drips on the underside, or columns pulled off toward the magnet
    if (p.detach) {
      const fdet = 1 - Math.exp(-dt / TAU_DETACH);
      for (let i = 0; i < n; i++) {
        const fg = -rho * this.gin[i], fm = this.fmag[i], f = fg + fm;
        if (f <= 0) continue;
        const tip = h[i] + this.s[i];
        const allowed = Math.sqrt(BO_CRIT * sigma / f);
        if (tip <= allowed) continue;
        const rm = Math.min(h[i] - H_MIN, tip - allowed) * fdet;
        if (rm <= 0) continue;
        h[i] -= rm;
        if (this.s[i] > 3.8 * h[i]) this.s[i] = 3.8 * h[i];
        if (fm > fg) this.lostMag += rm * this.A[i]; else this.lostDrip += rm * this.A[i];
      }
    }
    this.t += dt;
    this._sample();
  }

  _updateSpikes(dt) {
    const { rho, mu, sigma, chi } = this.params;
    const h = this.h, r0 = 1 + chi;
    for (let i = 0; i < this.n; i++) {
      const geff = Math.max(this.gin[i] - this.fmag[i] / rho, 0.1);
      const kc = Math.sqrt(rho * geff / sigma);
      const hi = Math.max(h[i], H_MIN);
      // Rosensweig onset, with a thin-layer correction (thin films need more field)
      const Mc = Math.sqrt((2 / MU0) * (1 + 1 / r0) * Math.sqrt(rho * geff * sigma) / Math.tanh(kc * hi));
      const lam = 2 * Math.PI / kc;
      const smax = Math.min(3.8 * hi, 0.8 * lam);
      const thr = this.s[i] > 0.05 * smax ? 0.9 * Mc : Mc;  // subcritical hysteresis
      const ratio = this.Mn[i] / thr;
      const st = ratio > 1 ? smax * Math.min(1, 0.35 + 1.5 * Math.sqrt(ratio - 1)) : 0;
      const tau = relaxTime(hi, lam, this.params, geff) / (st > this.s[i] ? 1 + ratio : 1);
      this.s[i] += (st - this.s[i]) * (1 - Math.exp(-dt / tau));
    }
  }

  _sample() {
    if (this.t < this.nextSample) return;
    const sp = Math.min(0.01, this.passInterval / 150);
    this.nextSample = this.t + sp;
    const w = this.watch, H = this.hist;
    const u = this.unit;
    let prox = -1;
    for (const m of this.magDirs) prox = Math.max(prox, u[3 * w] * m[0] + u[3 * w + 1] * m[1] + u[3 * w + 2] * m[2]);
    H.t.push(this.t); H.tip.push(this.h[w] + this.s[w]); H.h.push(this.h[w]); H.s.push(this.s[w]); H.prox.push(prox);
    const P = this.path, snap = new Float32Array(2 * P.length);
    for (let c = 0; c < P.length; c++) { snap[2 * c] = this.h[P[c]] + this.s[P[c]]; snap[2 * c + 1] = this.s[P[c]]; }
    H.path.push(snap);
    if (H.t.length > 6000) for (const k in H) H[k].splice(0, 1000);
  }

  // Advance by simDt seconds of simulated time, but stop after maxMs of wall time.
  advance(simDt, maxMs = 12) {
    const t0 = performance.now(), tEnd = this.t + simDt;
    let steps = 0;
    while (this.t < tEnd - 1e-12) {
      const dt = Math.min(this.stableDt(), tEnd - this.t);
      this.step(dt);
      steps++;
      if ((steps & 3) === 0 && performance.now() - t0 > maxMs) break;
    }
    this.lastSteps = steps;
    return this.t - (tEnd - simDt);
  }

  volume() { let V = 0; for (let i = 0; i < this.n; i++) V += this.h[i] * this.A[i]; return V; }

  // Watch-point statistics over the last pass interval.
  stats() {
    const p = this.params, H = this.hist;
    const Tp = this.passInterval;
    const V = this.volume();
    const hAvg = hAvgOf(this);
    // per path cell, over the last pass interval: peak, trough, spikes, and decay time
    let k0 = H.t.length;
    while (k0 > 0 && H.t[k0 - 1] >= this.t - Tp) k0--;
    const np = this.path.length, nk = H.t.length;
    const lifts = [], rets = [], sMaxs = [], sRets = [], taus = [];
    let maxH = 0;
    for (let k = k0; k < nk; k++) maxH = Math.max(maxH, H.h[k]);
    for (let c = 0; c < np && nk > k0; c++) {
      let mx = -Infinity, mn = Infinity, kmx = k0, smx = 0, smn = Infinity;
      for (let k = k0; k < nk; k++) {
        const v = H.path[k][2 * c], sv = H.path[k][2 * c + 1];
        if (v > mx) { mx = v; kmx = k; }
        if (v < mn) mn = v;
        if (sv > smx) smx = sv;
        if (sv < smn) smn = sv;
      }
      const lift = mx - hAvg;
      lifts.push(lift);
      rets.push(lift > 0 ? Math.max(0, Math.min(1, (mn - hAvg) / lift)) : 0);
      sMaxs.push(smx);
      sRets.push(smx > 1e-6 ? smn / smx : 0);
      // e-folding time of the fall from the peak to the lowest point after it
      let kmn = kmx;
      for (let k = kmx; k < nk; k++) if (H.path[k][2 * c] < H.path[kmn][2 * c]) kmn = k;
      const a = mx - hAvg, b = H.path[kmn][2 * c] - hAvg, dt = H.t[kmn] - H.t[kmx];
      taus.push(a > 0 && dt > 0 && b < 0.98 * a ? dt / Math.log(a / Math.max(b, 0.02 * a)) : Infinity);
    }
    const lift = median(lifts), retention = median(rets), maxS = median(sMaxs);
    const spikeRetention = median(sRets), tauFall = median(taus);
    let mcRatio = 0;
    // strongest normal-field drive anywhere right now, relative to the onset value
    for (let i = 0; i < this.n; i++) {
      const geff = Math.max(this.gin[i] - this.fmag[i] / p.rho, 0.1);
      const kc = Math.sqrt(p.rho * geff / p.sigma);
      const Mc = Math.sqrt((2 / MU0) * (1 + 1 / (1 + p.chi)) * Math.sqrt(p.rho * geff * p.sigma) / Math.tanh(kc * Math.max(this.h[i], H_MIN)));
      mcRatio = Math.max(mcRatio, this.Mn[i] / Mc);
    }
    const L = 2 * p.R * this.footHalfAngle;
    const g = Math.max(gravityOf(p), 0.1);
    const hRef = Math.max(hAvg, maxH, 1e-5);
    const tauMound = relaxTime(hRef, 2 * L, p, g);
    const lamS = 2 * Math.PI * Math.sqrt(p.sigma / (p.rho * g));
    const tauSpike = relaxTime(hRef, lamS, p, g);
    return {
      t: this.t, Tp, hAvg, lift, retention, maxS, spikeRetention,
      remaining: V / this.V0, lostMag: this.lostMag / this.V0, lostDrip: this.lostDrip / this.V0,
      Bglass: MU0 * this.Hglass, mcRatio, footprint: L, tauMound, tauSpike, lamS, tauFall,
      valid: this.t - this.histStart > 2 * Tp && nk > k0 + 3,
      measuredFor: this.t - this.histStart,
    };
  }
}

// Relaxation time of a surface bump of wavelength lam on a film of thickness h:
// viscous thin-film decay plus capillary-gravity wave time (whichever regime dominates).
export function relaxTime(h, lam, { rho, mu, sigma }, g) {
  const k = 2 * Math.PI / lam;
  const stiff = sigma * k * k * k * k + rho * g * k * k;
  const tv = 3 * mu / (h * h * h * stiff);
  const tw = 1 / Math.sqrt(k * Math.tanh(k * h) * (sigma * k * k + rho * g) / rho);
  return tv + tw;
}

function median(a) {
  if (!a.length) return 0;
  const b = a.slice().sort((x, y) => x - y);
  return b[b.length >> 1];
}

// typical (median) film thickness: robust to pools and to the band itself
function hAvgOf(sim) {
  if (sim._medT !== sim.t) {
    const sorted = Float64Array.from(sim.h).sort();
    sim._med = sorted[sorted.length >> 1];
    sim._medT = sim.t;
  }
  return sim._med;
}

export function verdict(st) {
  if (!st.valid) return { key: 'wait', text: 'Measuring…' };
  if (st.remaining < 0.5) return { key: 'lost', text: 'Fluid stripped off the sphere' };
  if (st.lift < Math.max(0.2 * st.hAvg, 2e-5)) return { key: 'weak', text: 'Not lifting — field too weak here' };
  if (st.retention >= 0.75) return { key: 'up', text: 'Stays up between passes' };
  if (st.retention >= 0.35) return { key: 'partial', text: 'Sags between passes' };
  return { key: 'down', text: 'Falls back between passes' };
}

const _lk = [0, 0];
const _v1 = [0, 0, 0], _v2 = [0, 0, 0];
const _mn = { v: 0 }, _hout = { v: 0 };

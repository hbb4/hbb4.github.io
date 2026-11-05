/* The San Francisco sky behind the page, looking roughly south-west toward Sutro Tower.
   Sun, moon, planets and stars are where they really are right now (js/astro.js), seen from central
   San Francisco; the clouds come from the latest KSFO METAR and the day's forecast (js/weather.js).
   The land is drawn, not traced: a ridge with the tower on it, hillside lights, and a plain skyline.
   The view: azimuth VIEW_AZ in the middle, south on the left, west on the right, the true horizon at 80%
   of the height, the same number of pixels per degree across and up. */
(() => {
  "use strict";
  const LAT = 37.7749, LON = -122.4194, TZ = "America/Los_Angeles";
  const VIEW_AZ = 236, TOWER_AZ = 220, TOWER_DEG = 7.5;          // tower: bearing and angular height
  const TOWER_BASE_FT = 834, TOWER_TOP_FT = 1811;                 // ground and top of the tower above sea level
  const RAD = Math.PI / 180;
  const canvas = document.getElementById("sky");
  if (!canvas || !window.Astro) return;
  const mainCtx = canvas.getContext("2d");
  let ctx = mainCtx;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sky = new Astro.Sky(LAT, LON);
  const Wx = window.Weather;

  // ---------- helpers ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const wrap = (d) => ((d % 360) + 540) % 360 - 180;
  function rng(seed) { return () => ((seed = (Math.imul(seed, 16807) + 11) % 2147483647) & 0x7fffffff) / 2147483647; }

  // ---------- San Francisco clock ----------
  const fmtParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  function sfParts(t) { const o = {}; for (const p of fmtParts.formatToParts(new Date(t))) o[p.type] = +p.value || p.value; return o; }
  function sfMidnight(t) {
    const p = sfParts(t), asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Date.UTC(p.year, p.month - 1, p.day) - (asUTC - Math.floor(t / 1000) * 1000);
  }
  const hourOf = (t) => { const p = sfParts(t); return p.hour + p.minute / 60; };

  // ---------- view ----------
  let W = 0, H = 0, DPR = 1, H0 = 0, ppd = 10;
  const X = (az) => W / 2 + wrap(az - VIEW_AZ) * ppd;
  const Y = (alt) => H0 - alt * ppd;
  const inFrame = (x, y, m = 20) => x > -m && x < W + m && y > -m && y < H0 + m;

  // ---------- the land, in degrees ----------
  const B = (az, mu, s, h) => h * Math.exp(-(((az - mu) / s) ** 2));
  const ridgeAlt = (az) => 0.85 + B(az, 220, 4.5, 1.55) + B(az, 229.5, 4, 2.0) + B(az, 237, 5, 0.8) + B(az, 258, 5, 1.05) + B(az, 198, 9, 0.5)
    + 0.06 * Math.sin(az * 2.9) + 0.035 * Math.sin(az * 7.7 + 1.3) + 0.02 * Math.sin(az * 19.1 + 0.4) + 0.012 * Math.sin(az * 41 + 2);
  const farAlt = (az) => 0.8 + B(az, 208, 12, 0.9) + B(az, 247, 9, 1.25) + B(az, 276, 14, 0.7) + 0.03 * Math.sin(az * 4.3);
  const TOWER_BASE_ALT = ridgeAlt(TOWER_AZ) - 0.05;

  // ---------- the city: a small 3D model seen from about 95 m up on Nob Hill, looking south-west ----------
  // Each building has a bearing, a distance, a height and a footprint; the screen shape follows from those, so
  // near ones are big and low in the frame (we look down on their roofs), far ones small and hazy near the hills,
  // and there are gaps between them. A dense carpet of low-rise roofs fills the floor of the city.
  const CAM = 95, DEG = 180 / Math.PI;
  const groundAt = (d, az) => 12 + 150 * smooth(1500, 3300, d) + 18 * Math.sin(az * 0.15 + d / 400) * smooth(800, 2000, d);
  const altOf = (hgt, d) => Math.atan((hgt - CAM) / d) * DEG;
  const floorTop = (az) => Math.min(ridgeAlt(az) - 1.15, -0.05) - 0.3 * (0.5 + 0.5 * Math.sin(az * 1.7 + 0.6));
  const land = (() => {
    const r = rng(20261105), lights = [], cityLights = [];
    for (let i = 0; i < 700; i++) {                       // on the hills above the city
      const az = VIEW_AZ - 62 + r() * 124, top = ridgeAlt(az) - 0.15, bot = floorTop(az) + 0.05;
      if (top <= bot) continue;
      lights.push({ az, alt: top - Math.pow(r(), 0.55) * (top - bot), s: 0.7 + r() * 0.8, warm: r() < 0.82, k: r(), ph: r() * 6.3 });
    }
    for (let i = 0; i < 3600; i++) {                      // streets and windows across the floor of the city
      const az = VIEW_AZ - 66 + r() * 132;
      cityLights.push({ az, alt: floorTop(az) - 0.1 - Math.pow(r(), 1.7) * 21, s: 0.8 + r() * 0.9, warm: r() < 0.78, k: r(), ph: r() * 6.3 });
    }
    return { lights, cityLights };
  })();
  const city = (() => {
    const r = rng(415), items = [];
    const PAL_HOUSE = ["#f3e4c2", "#efcfb8", "#c9dfe6", "#d3e3c8", "#f2d3cf", "#e3dcef", "#f5f2ea", "#ecd99c", "#c6d5ea", "#e2c49e", "#b9d6c6", "#f0e9d8"];
    const PAL_MID = ["#efe4cc", "#dcb98a", "#e6cf88", "#f4f1ea", "#cf916c", "#b0705a", "#b6cfd9", "#ddc6a6", "#a9c2b0", "#e9d7b9"];
    const add = (kind, az, d, h, w, depth, pal, style) => {
      const g = groundAt(d, az), off = wrap(az - VIEW_AZ);
      const fw = w * Math.cos(off * RAD) / d * DEG, sw = depth * Math.abs(Math.sin(off * RAD)) / d * DEG;
      const top = altOf(g + h, d);
      const it = { kind, az, d, h, g, a0: az - fw / 2, a1: az + fw / 2, sw, sideRight: off < 0, top, base: altOf(g, d),
        roof: top < 0 ? Math.min(3, depth * (CAM - g - h) / (d * d) * DEG) : 0, pal: hex(pal), style,
        aer: 1 - Math.exp(-d / 3000), j: 0.92 + r() * 0.16, seed: (r() * 1e9) | 0, lit: [r(), r(), r()] };
      it.dots = []; for (let k = 0, n = kind === "house" ? 3 : 5 + ((h / 6) | 0); k < n; k++) it.dots.push([0.12 + r() * 0.76, 0.08 + r() * 0.7, r(), (r() * 6) | 0]);
      it.pi = PAL_HOUSE.indexOf(pal); it.ab = Math.min(9, (it.aer * 10) | 0);
      if (kind !== "house" && r() < (kind === "tower" ? 0.5 : 0.22)) it.setback = { at: altOf(g + h * (0.72 + r() * 0.12), d), k: 0.6 + r() * 0.2 };
      if (kind !== "house" && r() < 0.5) { const bw = 0.18 + r() * 0.25, bo = r() * (1 - bw); it.box = { f0: bo, f1: bo + bw, top: altOf(g + h + 3 + r() * 3, d) }; }
      if (kind === "tower" && r() < 0.3) it.mast = { f: 0.3 + r() * 0.4, top: altOf(g + h + 10 + r() * 15, d) };
      items.push(it);
      return it;
    };
    for (let i = 0; i < 470; i++) add("house", VIEW_AZ - 66 + r() * 132, 430 + Math.pow(r(), 1.15) * 1900, 8 + r() * 8, 20 + r() * 40, 14 + r() * 14, PAL_HOUSE[(r() * PAL_HOUSE.length) | 0], "house");
    for (let i = 0; i < 75; i++) add("mid", VIEW_AZ - 66 + r() * 132, 360 + Math.pow(r(), 1.1) * 1900, 16 + Math.pow(r(), 1.5) * 44, 16 + r() * 30, 15 + r() * 22, PAL_MID[(r() * PAL_MID.length) | 0], r() < 0.45 ? "punched" : r() < 0.6 ? "bands" : "plain");
    for (let i = 0; i < 13; i++) {                        // towers, mostly in two clusters
      const az = r() < 0.75 ? (r() < 0.6 ? 252 + (r() - 0.5) * 18 : 212 + (r() - 0.5) * 12) : VIEW_AZ - 60 + r() * 120;
      const near = Math.abs(wrap(az - TOWER_AZ)) < 4, glass = r() < 0.45;
      add("tower", az, 850 + r() * 1500, near ? 45 + r() * 15 : 55 + r() * 70, 22 + r() * 20, 22 + r() * 18, glass ? "#3a4650" : PAL_MID[(r() * PAL_MID.length) | 0], glass ? "glass" : r() < 0.6 ? "punched" : "bands");
    }
    for (const c of [{ az: 247, d: 1350, h: 68, jib: 52, dir: 1 }, { az: 229.5, d: 2150, h: 60, jib: 44, dir: -1 }]) {
      const g = groundAt(c.d, c.az);
      items.push(Object.assign(c, { kind: "crane", g, top: altOf(g + c.h, c.d), base: altOf(g, c.d), aer: 1 - Math.exp(-c.d / 3000), jibDeg: c.jib / c.d * DEG }));
    }
    // trees: a few parks and street trees, as rounded clumps
    const tree = (az, d) => { const g = groundAt(d, az), h = 8 + r() * 7, cr = Math.min(3.5 + r() * 3.5, d / 120);
      items.push({ kind: "tree", az, d, g, aer: 1 - Math.exp(-d / 3000), top: altOf(g + h, d), base: altOf(g, d), cy: altOf(g + h - cr, d), rad: cr / d * DEG, shade: r(), j: 0.9 + r() * 0.2 }); };
    for (const [paz, pd, pr, n] of [[244, 820, 140, 40], [226, 1250, 170, 45], [259, 1450, 160, 36], [214, 640, 90, 22], [236, 1750, 200, 40], [270, 1000, 130, 28], [203, 1500, 150, 30]])
      for (let k = 0; k < n; k++) { const dd = pd + (r() - 0.5) * 2 * pr * 0.7, aa = paz + (r() - 0.5) * 2 * pr / dd * DEG; tree(aa, dd); }
    for (let k = 0; k < 320; k++) tree(VIEW_AZ - 66 + r() * 132, 400 + Math.pow(r(), 1.1) * 1800);
    items.sort((a, b) => b.d - a.d);
    return { items };
  })();

  // ---------- stars, constellations, planets (data/sky.json) ----------
  let cat = null;
  fetch("data/sky.json").then((r) => r.json()).then((d) => {
    const years = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 3.15576e10;
    const pre = (ra, dec) => Astro.precess(ra, dec, years);
    const tint = (bv) => bv < 0 ? [205, 220, 255] : bv < 0.5 ? mix([235, 240, 255], [255, 250, 240], bv / 0.5) : mix([255, 246, 230], [255, 205, 150], clamp((bv - 0.5) / 1.2));
    cat = {
      stars: d.stars.map(([ra, dec, mag, bv]) => { const p = pre(ra, dec); return { ra: p.ra, dec: p.dec, mag, c: tint(bv) }; }),
      lines: d.lines.map((con) => con.map((seg) => seg.map(([ra, dec]) => pre(ra, dec)))),
      names: d.names.map(([name, ra, dec, rank]) => Object.assign(pre(ra, dec), { name, rank })),
            planets: d.planets,
    };
  }).catch(() => { /* the sky works without them */ });

  // ---------- cloud texture: tileable fBm value noise ----------
  const NT = 256;
  const noise = (() => {
    const out = new Float32Array(NT * NT), r = rng(7);
    let amp = 0.5, tot = 0;
    for (const period of [4, 8, 16, 32, 64]) {
      const g = new Float32Array(period * period); for (let i = 0; i < g.length; i++) g[i] = r();
      const cell = NT / period;
      for (let y = 0; y < NT; y++) {
        const gy = y / cell, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
        const r0 = (y0 % period) * period, r1 = ((y0 + 1) % period) * period;
        for (let x = 0; x < NT; x++) {
          const gx = x / cell, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
          const c0 = x0 % period, c1 = (x0 + 1) % period;
          const a = g[r0 + c0] + (g[r0 + c1] - g[r0 + c0]) * sx, b = g[r1 + c0] + (g[r1 + c1] - g[r1 + c0]) * sx;
          out[y * NT + x] += (a + (b - a) * sy) * amp;
        }
      }
      tot += amp; amp *= 0.52;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    const sorted = Array.from(out.filter((_, i) => i % 7 === 0)).sort((a, b) => a - b);
    return { tex: out, q: (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))] };
  })();
  function sample(u, v) {
    u = ((u % NT) + NT) % NT; v = ((v % NT) + NT) % NT;
    const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255, T = noise.tex;
    const a = T[y0 * NT + x0] + (T[y0 * NT + x1] - T[y0 * NT + x0]) * fx;
    const b = T[y1 * NT + x0] + (T[y1 * NT + x1] - T[y1 * NT + x0]) * fx;
    return a + (b - a) * fy;
  }

  // ---------- size ----------
  const CS = 5;                          // cloud cell, CSS px
  let cloudCv, cloudCx, cloudImg, cols = [], rows = [];
  function build() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    H0 = Math.round(H * 0.8);
    ppd = Math.max(W / 100, H0 / 72);
    const cw = Math.ceil(W / CS), ch = Math.ceil(H0 / CS);
    cloudCv = document.createElement("canvas"); cloudCv.width = cw; cloudCv.height = ch;
    cloudCx = cloudCv.getContext("2d"); cloudImg = cloudCx.createImageData(cw, ch);
    cols = []; for (let i = 0; i < cw; i++) { const az = VIEW_AZ + ((i + 0.5) * CS - W / 2) / ppd; cols.push({ az, s: Math.sin(az * RAD), c: Math.cos(az * RAD) }); }
    rows = []; for (let j = 0; j < ch; j++) { const alt = (H0 - (j + 0.5) * CS) / ppd; rows.push({ alt, cot: alt > 0.15 ? 1 / Math.tan(alt * RAD) : 1e9 }); }
    sprites = new Map(); nightKey = ""; speckCv = null; lastCityKey = "";
  }

  // ---------- sky colour ----------
  const KEYS = [
    [-18, "#03050b", "#070b16", "#141824"],
    [-12, "#050918", "#0c1634", "#20294a"],
    [-7, "#0b1534", "#29325f", "#6a4567"],
    [-3, "#17255a", "#4b4a83", "#d9704a"],
    [1, "#25468a", "#9c7895", "#f69a4a"],
    [6, "#2f5ea8", "#86a9d6", "#f4c48c"],
    [15, "#3474c6", "#78aee3", "#cfe2ef"],
    [45, "#2c6dc8", "#6aa6e6", "#bcd9ee"],
  ].map(([a, z, m, h]) => [a, hex(z), hex(m), hex(h)]);
  function skyColors(alt) {
    if (alt <= KEYS[0][0]) return KEYS[0].slice(1);
    for (let i = 1; i < KEYS.length; i++) if (alt <= KEYS[i][0]) {
      const a = KEYS[i - 1], b = KEYS[i], k = (alt - a[0]) / (b[0] - a[0]);
      return [mix(a[1], b[1], k), mix(a[2], b[2], k), mix(a[3], b[3], k)];
    }
    return KEYS[KEYS.length - 1].slice(1);
  }
  function phaseName(alt, rising) {
    if (alt < -18) return "Night";
    if (alt < -12) return "Astronomical twilight";
    if (alt < -6) return "Nautical twilight";
    if (alt < -2) return "Blue hour";
    if (alt < 7) return "Golden hour";
    return rising && alt < 20 ? "Morning" : alt >= 20 ? "Daytime" : "Afternoon";
  }

  // ---------- clouds ----------
  const drift = { e: 31.7, n: -17.3, evo: 0 };    // km the air has moved, east and north; evo: how far the clouds have reshaped
  const DECKS = {
    high: { km: 8.5, feat: 7, soft: 0.16, alpha: 0.55, thick: 0.15, speed: 2.6, stretch: 0.28, fade: 90, evolve: 0.4 },
    mid: { km: 3.8, feat: 0.6, soft: 0.08, alpha: 0.85, thick: 0.5, speed: 1.7, stretch: 1, fade: 55, evolve: 0.8 },
    low: { km: 0.8, feat: 0.8, soft: 0.1, alpha: 0.96, thick: 0.62, speed: 1, stretch: 1, fade: 26, evolve: 1 },
  };
  function deckColors(name, km, S, night, hor, overcast, moonLight) {
    const shadow = Math.sqrt(2 * km / 6371) / RAD;           // how far below the horizon the sun still lights it
    const lit = smooth(-shadow - 1, -shadow + 1.5, S.alt);
    const warm = 1 - smooth(1, 12, S.alt);
    let top = mix(hex("#f6f5f1"), mix(hex("#ffc27a"), hex("#ff7f5c"), smooth(4, -1.5, S.alt)), warm);
    if (S.alt < 0) top = mix(top, hex("#e2708a"), smooth(0, -shadow, S.alt));
    let base = mix(hex(name === "high" ? "#dde5ee" : name === "mid" ? "#aab3bf" : "#9aa2ab"), hex("#5e5068"), warm * 0.7);
    base = scale(base, 1 - 0.3 * overcast * (name === "low" ? 1 : 0.5));
    const nightBase = name === "low" ? hex("#3a3f3d") : name === "mid" ? hex("#23272d") : hex("#191c23");  // city light from below
    const nightTop = mix(nightBase, hex("#9aa4b8"), moonLight * 0.35);
    const dim = mix(nightBase, hor, (1 - night) * 0.55);
    return { top: mix(mix(nightTop, hor, (1 - night) * 0.45), top, lit), base: mix(dim, base, smooth(-shadow - 4, -shadow + 2, S.alt)), haze: hor };
  }
  function renderClouds(wx, S, night, hor, overcast, moonLight) {
    const img = cloudImg.data, cw = cloudCv.width, ch = cloudCv.height;
    img.fill(0);
    const decks = ["high", "mid", "low"].filter((k) => wx[k] && wx[k].cover > 0.02);
    if (!decks.length) return false;
    const sAz = S.az, sAlt = S.alt, sunUp = smooth(-4, 4, sAlt), sunCol = mix(hex("#fff4dc"), hex("#ffae63"), 1 - smooth(2, 18, sAlt));
    const wdir = ((wx.windDir ?? 280) + 180) * RAD;              // the way the air moves
    const we = Math.sin(wdir), wn = Math.cos(wdir);
    for (const k of decks) {
      const D = DECKS[k], L = wx[k];
      const km = k === "low" ? clamp((L.baseFt || 2500) * 0.0003048 + 0.15, 0.12, 2) : D.km;
      const cover = clamp(L.cover);
      const th = cover > 0.96 ? noise.q(0.015) : noise.q(1 - cover);
      const soft = D.soft * (cover > 0.85 ? 1.8 : 1), solid = Math.max(0, cover - 0.8) * 4;   // overcast reads as a deck
      const C = deckColors(k, km, S, night, hor, overcast, moonLight);
      const oe = drift.e * D.speed, on = drift.n * D.speed;
      for (let j = 0; j < ch; j++) {
        const R = rows[j]; if (R.alt <= 0.15) continue;
        const dist0 = km * R.cot;
        const dist = Math.min(dist0, 140);
        const fade = Math.exp(-dist / D.fade);
        const altFade = smooth(0.15, 1.2, R.alt);
        for (let i = 0; i < cw; i++) {
          const Cc = cols[i];
          let e = dist * Cc.s - oe, n = dist * Cc.c - on;
          if (D.stretch !== 1) { const a = e * we + n * wn, b = -e * wn + n * we; e = a * D.stretch; n = b; }
          const u = e / D.feat * 9, v = n / D.feat * 9;
          // three octaves that slide against each other, so the clouds build, thin and reshape as they drift
          const ev = drift.evo * D.evolve;
          let val = sample(u + ev * 0.5, v - ev * 0.3) * 0.62 + sample(u * 2.7 + 37 - ev * 1.7, v * 2.7 + 11 + ev * 1.1) * 0.24 + sample(u * 1.6 + 91 + ev * 1.1, v * 1.6 - 5 + ev * 0.8) * 0.14;
          let dens = clamp((val - th) / soft + solid);
          if (dens <= 0.002) continue;
          // light: a lit top that darkens with depth, a silver edge near the sun, and haze with distance
          const dAz = wrap(Cc.az - sAz) * Math.cos(R.alt * RAD), dSun = Math.hypot(dAz, R.alt - sAlt);
          const glow = Math.exp(-dSun / 14) * sunUp * (1 - dens) * 0.9;
          const shade = Math.pow(dens, 0.7) * D.thick;
          let r = C.top[0] + (C.base[0] - C.top[0]) * shade, g = C.top[1] + (C.base[1] - C.top[1]) * shade, b = C.top[2] + (C.base[2] - C.top[2]) * shade;
          r += (sunCol[0] - r) * glow * 0.6; g += (sunCol[1] - g) * glow * 0.6; b += (sunCol[2] - b) * glow * 0.6;
          r = C.haze[0] + (r - C.haze[0]) * (0.35 + 0.65 * fade); g = C.haze[1] + (g - C.haze[1]) * (0.35 + 0.65 * fade); b = C.haze[2] + (b - C.haze[2]) * (0.35 + 0.65 * fade);
          const a = dens * D.alpha * altFade * (0.75 + 0.25 * fade + glow * 0.3);
          const p = (j * cw + i) * 4, a0 = img[p + 3] / 255, ao = a + a0 * (1 - a);
          if (ao <= 0) continue;
          img[p] = (r * a + img[p] * a0 * (1 - a)) / ao; img[p + 1] = (g * a + img[p + 1] * a0 * (1 - a)) / ao; img[p + 2] = (b * a + img[p + 2] * a0 * (1 - a)) / ao;
          img[p + 3] = ao * 255;
        }
      }
    }
    cloudCx.putImageData(cloudImg, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cloudCv, 0, 0, cw, ch, 0, 0, cw * CS, ch * CS);
    return true;
  }

  // ---------- the tower (proportions from a photo of it from the north-east) ----------
  // heights as a fraction of the tower; x as a fraction of its height (left leg, middle leg, right leg)
  const LEG = [[0, -0.072, 0.02, 0.072], [0.627, -0.034, 0.008, 0.034], [0.754, -0.058, 0.012, 0.058]];
  const legX = (f, i) => {
    const [a, b] = f <= LEG[1][0] ? [LEG[0], LEG[1]] : [LEG[1], LEG[2]];
    const k = (f - a[0]) / (b[0] - a[0]);
    return a[i + 1] + (b[i + 1] - a[i + 1]) * k;
  };
  const BARS = [0.093, 0.314, 0.517, 0.627];
  const MASTS = [[-0.058, -0.052], [0.012, 0.012], [0.058, 0.054]];
  const LIGHTS = [[1, -0.052], [1, 0.012], [1, 0.054], [0.754, -0.085], [0.754, 0.085], [0.627, -0.034], [0.627, 0.034], [0.4, 0.01]];
  function towerGeom() {
    const x = X(TOWER_AZ), y = Y(TOWER_BASE_ALT), h = TOWER_DEG * ppd;
    return { x, y, h, P: (f, xf) => [x + xf * h, y - f * h] };
  }
  function drawTower(ink, beacon, time) {
    const T = towerGeom(), { h, P } = T;
    ctx.save();
    ctx.strokeStyle = ink; ctx.lineCap = "round"; ctx.lineJoin = "round";
    // legs
    ctx.lineWidth = Math.max(1, h / 105);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { let first = true; for (const f of [0, 0.627, 0.754]) { const [px, py] = P(f, legX(f, i)); first ? ctx.moveTo(px, py) : ctx.lineTo(px, py); first = false; } }
    ctx.stroke();
    // cross bars and the platform
    ctx.lineWidth = Math.max(1, h / 120);
    ctx.beginPath();
    for (const f of BARS) { const [a, ay] = P(f, legX(f, 0) - 0.006), [b] = P(f, legX(f, 2) + 0.006); ctx.moveTo(a, ay); ctx.lineTo(b, ay); }
    ctx.stroke();
    ctx.lineWidth = Math.max(1.4, h / 70);
    ctx.beginPath(); { const [a, ay] = P(0.754, -0.085), [b] = P(0.754, 0.085); ctx.moveTo(a, ay); ctx.lineTo(b, ay); } ctx.stroke();
    ctx.lineWidth = Math.max(1, h / 95);
    ctx.beginPath(); { const [a, ay] = P(0.735, -0.07), [b] = P(0.735, 0.07); ctx.moveTo(a, ay); ctx.lineTo(b, ay); } ctx.stroke();
    // bracing
    ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(0.5, h / 300);
    ctx.beginPath();
    const levels = [0, ...BARS, 0.754];
    for (let l = 0; l < levels.length - 1; l++) {
      const f0 = levels[l], f1 = levels[l + 1];
      for (const [i, j] of [[0, 1], [1, 2]]) {
        const [a0, a0y] = P(f0, legX(f0, i)), [b1, b1y] = P(f1, legX(f1, j)), [b0, b0y] = P(f0, legX(f0, j)), [a1, a1y] = P(f1, legX(f1, i));
        ctx.moveTo(a0, a0y); ctx.lineTo(b1, b1y); ctx.moveTo(b0, b0y); ctx.lineTo(a1, a1y);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // masts, with a short arm near each top
    ctx.lineWidth = Math.max(1, h / 115);
    ctx.beginPath();
    for (const [m0, m1] of MASTS) { const [a, ay] = P(0.754, m0), [b, by] = P(1, m1); ctx.moveTo(a, ay); ctx.lineTo(b, by); }
    ctx.stroke();
    ctx.lineWidth = Math.max(0.7, h / 220);
    ctx.beginPath();
    for (const [, m1] of MASTS) { const [a, ay] = P(0.93, m1 - 0.012), [b] = P(0.93, m1 + 0.012); ctx.moveTo(a, ay); ctx.lineTo(b, ay); }
    ctx.stroke();
    ctx.restore();
    return T;
  }
  function drawBeacons(T, on, k, diffuse) {
    if (k <= 0.01) return;
    for (const [f, xf] of LIGHTS) {
      const [lx, ly] = T.P(f, xf), R = diffuse ? Math.max(10, T.h / 6) : Math.max(4.5, T.h / 22);
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
      g.addColorStop(0, `rgba(255,60,40,${(diffuse ? 0.35 : 0.85) * k * on})`); g.addColorStop(1, "rgba(255,60,40,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, R, 0, 6.29); ctx.fill();
      if (!diffuse) { ctx.fillStyle = `rgba(255,140,120,${k * on})`; ctx.beginPath(); ctx.arc(lx, ly, Math.max(1, T.h / 110), 0, 6.29); ctx.fill(); }
    }
  }

  // ---------- windows ----------
  const LIT_BY_HOUR = [0.24, 0.16, 0.11, 0.09, 0.09, 0.13, 0.22, 0.25, 0.15, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.12, 0.16, 0.3, 0.42, 0.46, 0.46, 0.44, 0.38, 0.31];
  const litFraction = (hr) => { const a = Math.floor(hr) % 24, k = hr - Math.floor(hr); return LIT_BY_HOUR[a] * (1 - k) + LIT_BY_HOUR[(a + 1) % 24] * k; };
  const WIN_COLORS = [[255, 214, 160], [255, 214, 160], [255, 222, 175], [243, 239, 230], [207, 224, 255], [217, 160, 102]];
  // facade detail for the buildings big enough to show floors: a day sprite (windows, bands or glass
  // spandrels) and a night sprite (lit windows), each the size of the front face
  let sprites = new Map(), nightKey = "", speckCv = null, cityCv = null, lastCityKey = "", lastCityDraw = 0;
  function facade(it) {
    const floorPx = 3.2 / it.d * DEG * ppd, wpx = (it.a1 - it.a0) * ppd;
    if (floorPx < 2.2 || wpx < 6) return null;
    const yT = Y(it.top), hpx = Math.min(H, Y(it.base)) - yT;
    if (hpx < 3) return null;
    const bay = floorPx * 1.15, rows = [], sb = it.setback ? (Y(it.setback.at) - yT) : -1;
    const r = rng(it.seed);
    for (let y = floorPx * 0.8; y < hpx - floorPx * 0.4; y += floorPx) {
      const narrow = y < sb ? (1 - it.setback.k) / 2 * wpx : 0;
      const x0 = narrow + bay * 0.5, x1 = wpx - narrow - bay * 0.5, wins = [];
      for (let x = x0; x < x1 - bay * 0.3; x += bay) if (it.style !== "plain" || r() < 0.55) wins.push([x, r(), (r() * WIN_COLORS.length) | 0]);
      rows.push({ y, x0, x1, wins });
    }
    const mk = () => { const c = document.createElement("canvas"); c.width = Math.ceil(wpx * DPR); c.height = Math.ceil(hpx * DPR); const x = c.getContext("2d"); x.setTransform(DPR, 0, 0, DPR, 0, 0); return [c, x]; };
    const [day, dx] = mk();
    for (const row of rows) {
      if (it.style === "glass") { dx.fillStyle = "rgba(255,255,255,0.5)"; dx.fillRect(row.x0 - bay * 0.4, row.y, row.x1 - row.x0 + bay * 0.8, Math.max(0.6, floorPx * 0.16)); }
      else if (it.style === "bands") { dx.fillStyle = "#0e1215"; dx.fillRect(row.x0 - bay * 0.2, row.y, row.x1 - row.x0 + bay * 0.4, Math.max(1, floorPx * 0.4)); }
      else { dx.fillStyle = "#0e1215"; for (const [x] of row.wins) dx.fillRect(x, row.y, Math.max(1, bay * 0.48), Math.max(1, floorPx * 0.5)); }
    }
    const [night] = mk();
    return { day, night, rows, bay, floorPx, glass: it.style === "glass" };
  }
  function paintNight(sp, frac, k) {
    const x = sp.night.getContext("2d");
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, sp.night.width, sp.night.height); x.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const row of sp.rows) for (const [wx, r, ci] of row.wins) {
      if (r >= frac * k) continue;
      const c = WIN_COLORS[ci]; x.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.6 + 0.4 * ((r * 97) % 1)})`;
      x.fillRect(wx, row.y, Math.max(1, sp.bay * 0.48), Math.max(1, sp.floorPx * 0.5));
    }
  }
  function spriteFor(it) {
    if (!sprites.has(it)) sprites.set(it, facade(it));
    return sprites.get(it);
  }
  // the hills above the city by day: tree cover and a scatter of houses
  function hillTexture() {
    if (speckCv) return speckCv;
    speckCv = document.createElement("canvas"); speckCv.width = Math.round(W * DPR); speckCv.height = Math.round(H * DPR);
    const c = speckCv.getContext("2d"); c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const r = rng(99), k = ppd / 14, HOUSE = ["#f3e4c2", "#c9dfe6", "#f2d3cf", "#f5f2ea", "#d3e3c8", "#ecd99c"];
    for (let i = 0; i < 2600; i++) {
      const az = VIEW_AZ - 66 + r() * 132, top = ridgeAlt(az) - 0.12, bot = floorTop(az) - 0.2;
      if (top <= bot) continue;
      const u = Math.pow(r(), 0.8), alt = top - u * (top - bot), x = X(az), y = Y(alt);
      if (x < -4 || x > W + 4) continue;
      if (r() < 0.8 * (1 - u * 0.4)) {                     // soft tree canopy, thicker near the top
        c.fillStyle = r() < 0.5 ? "rgba(48,74,50,0.2)" : "rgba(84,110,70,0.18)";
        c.beginPath(); c.arc(x, y, (1.8 + r() * 2.6) * k, 0, 6.29); c.fill();
      } else if (u > 0.35) {                              // a few houses, lower down
        c.fillStyle = HOUSE[(r() * HOUSE.length) | 0]; c.globalAlpha = 0.18 + r() * 0.17;
        c.fillRect(x, y, (1.6 + r() * 1.6) * k, (1.1 + r() * 0.7) * k); c.globalAlpha = 1;
      }
    }
    return speckCv;
  }

  // ---------- draw ----------
  let lastStarsT = -1, starPts = [];
  function draw(t, now) {
    if (!cloudCv) build();
    const S = sky.sun(t), M = sky.moon(t), S2 = sky.sun(t + 600000);
    const wx = Wx ? Wx.at(t) : { low: null, mid: null, high: null, visKm: 16 };
    const overcast = Math.max(wx.low ? wx.low.cover : 0, wx.mid ? wx.mid.cover * 0.8 : 0);
    let [zen, mid, hor] = skyColors(S.alt);
    const night = smooth(-4, -14, S.alt), day = 1 - smooth(-6, 2, -S.alt) * 1;
    const dusk = Math.exp(-(((S.alt + 1) / 6) ** 2));
    const moonUp = smooth(-1, 3, M.alt), moonLight = M.lit * moonUp;
    // moonlight lifts the night sky a little; overcast flattens the colours
    const moonSky = moonLight * night * 0.35;
    zen = mix(zen, hex("#1b2a48"), moonSky); mid = mix(mid, hex("#23355a"), moonSky);
    const greyDay = mix(hex("#9aa3ac"), hex("#262a30"), night);
    zen = mix(zen, greyDay, overcast * 0.6); mid = mix(mid, greyDay, overcast * 0.6); hor = mix(hor, mix(greyDay, hex("#c9ccd0"), 1 - night), overcast * 0.55);

    // sky
    const g = ctx.createLinearGradient(0, Math.min(0, Y(50)), 0, H0);
    g.addColorStop(0, rgb(zen)); g.addColorStop(0.55, rgb(mid)); g.addColorStop(1, rgb(hor));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // city glow at night
    if (night > 0.05) {
      const lp = ctx.createLinearGradient(0, Y(14), 0, H0);
      lp.addColorStop(0, "rgba(120,105,90,0)"); lp.addColorStop(1, `rgba(120,105,90,${0.16 * night})`);
      ctx.fillStyle = lp; ctx.fillRect(0, Y(14), W, H0 - Y(14));
    }
    // glow around the sun
    const sx = X(S.az), sy = Y(S.alt);
    if (S.alt > -18) {
      const rr = Math.max(W, H) * (0.3 + 0.35 * dusk), gy = Math.max(sy, H0 - 0.04 * H);
      const gl = ctx.createRadialGradient(sx, gy, 0, sx, gy, rr);
      const warm = mix(hex("#ffd59a"), hex("#ff7a3d"), clamp(dusk * 1.2));
      const a = clamp(0.55 * dusk + 0.12 * smooth(-6, 10, S.alt)) * smooth(-18, -4, S.alt) * (1 - 0.6 * overcast);
      gl.addColorStop(0, rgb(warm, a)); gl.addColorStop(0.4, rgb(warm, a * 0.35)); gl.addColorStop(1, rgb(warm, 0));
      ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H0 + H * 0.1);
    }

    // stars, constellations, planets
    const lim = 4.5 - 6 * (1 - night) - 1.2 * moonLight * night;
    const guide = guideOn;
    const visiblePlanets = [];
    if (cat && night > 0.02) {
      const lst = sky.lst(t);
      if (Math.abs(t - lastStarsT) > 15000) {
        lastStarsT = t; starPts = [];
        for (const s of cat.stars) {
          if (s.mag > 4.6) break;
          const h = sky.altaz(s.ra, s.dec, t, lst);
          if (h.alt < 0.3) continue;
          const x = X(h.az), y = Y(h.alt);
          if (inFrame(x, y)) starPts.push({ x, y, alt: h.alt, s });
        }
      }
      for (const p of starPts) {
        const s = p.s, ext = smooth(0.5, 10, p.alt);
        let a = clamp((lim - s.mag) / 1.3) * ext * night;
        if (a < 0.02) continue;
        const tw = reduce ? 1 : 0.82 + 0.18 * Math.sin(now / 1000 * (1.2 + (s.mag * 7) % 2.5) + s.ra);
        a *= tw;
        const r = 0.6 + Math.max(0, 3 - s.mag) * 0.4;
        ctx.fillStyle = rgb(s.c, a);
        if (r < 1) ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        else {
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.29); ctx.fill();
          if (s.mag < 1.2) { const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5); gg.addColorStop(0, rgb(s.c, a * 0.35)); gg.addColorStop(1, rgb(s.c, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p.x, p.y, r * 5, 0, 6.29); ctx.fill(); }
        }
      }
      if (guide) {
        ctx.save();
        ctx.strokeStyle = `rgba(170,190,240,${0.06 * night})`; ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (const con of cat.lines) for (const seg of con) {
          let prev = null;
          for (const q of seg) {
            const h = sky.altaz(q.ra, q.dec, t, lst), pt = { x: X(h.az), y: Y(h.alt), ok: h.alt > 0.5 };
            if (prev && prev.ok && pt.ok && Math.abs(prev.x - pt.x) < W * 0.5 && (inFrame(prev.x, prev.y, 200) || inFrame(pt.x, pt.y, 200))) {
              const dx = pt.x - prev.x, dy = pt.y - prev.y, L = Math.hypot(dx, dy), gap = Math.min(5, L * 0.2);   // short gaps at the stars
              ctx.moveTo(prev.x + dx / L * gap, prev.y + dy / L * gap); ctx.lineTo(pt.x - dx / L * gap, pt.y - dy / L * gap);
            }
            prev = pt;
          }
        }
        ctx.stroke();
        ctx.font = "500 9.5px 'JetBrains Mono', ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillStyle = `rgba(180,198,240,${0.22 * night})`;
        for (const n of cat.names) {
          const h = sky.altaz(n.ra, n.dec, t, lst), x = X(h.az), y = Y(h.alt);
          if (h.alt > 4 && inFrame(x, y, -10) && clearOfText(x, y)) ctx.fillText(n.name.toUpperCase(), x, y);
        }
        ctx.textAlign = "left";
        ctx.restore();
      }
    }
    if (cat) {
      const PCOL = { mer: "#f0e6dc", ven: "#fffbea", mar: "#ffb08a", jup: "#fff0d8", sat: "#ffe7b4" };
      for (const p of sky.planets(t, cat.planets)) {
        if (p.alt < 0.3) continue;
        const sep = Math.hypot(wrap(p.az - S.az) * Math.cos(p.alt * RAD), p.alt - S.alt);
        const plim = 4.5 - 9 * (1 - smooth(-10, -1, -S.alt)) - 0.8 * moonLight * night;
        let a = clamp((plim - p.mag) / 1.5) * smooth(0.3, 5, p.alt) * smooth(6, 12, sep);
        if (a < 0.03) continue;
        const x = X(p.az), y = Y(p.alt); if (!inFrame(x, y)) continue;
        visiblePlanets.push(p.name);
        const c = hex(PCOL[p.key]), r = clamp(1.4 + (1 - p.mag) * 0.45, 1.3, 3.2);
        const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 6); gg.addColorStop(0, rgb(c, a * 0.4)); gg.addColorStop(1, rgb(c, 0));
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r * 6, 0, 6.29); ctx.fill();
        ctx.fillStyle = rgb(c, a); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill();
        if (clearOfText(x, y)) { ctx.font = "500 10.5px Inter, ui-sans-serif, system-ui, sans-serif"; ctx.fillStyle = `rgba(255,236,200,${0.75 * a})`; ctx.fillText(p.name, x + r + 6, y + 3.5); }
      }
    }

    // moon: the lit side faces the sun, drawn a little larger than life
    if (M.alt > -1.5) {
      const mx = X(M.az), my = Y(M.alt), mr = Math.max(7, 0.26 * ppd * 2.2);
      if (inFrame(mx, my, mr * 8)) {
        const vis = (0.35 + 0.65 * night) * smooth(-1.5, 1.5, M.alt);
        const halo = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 8);
        halo.addColorStop(0, `rgba(215,225,255,${0.22 * vis * M.lit * night})`); halo.addColorStop(1, "rgba(215,225,255,0)");
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(mx, my, mr * 8, 0, 6.29); ctx.fill();
        const dz = (S.az - M.az) * RAD, a1 = S.alt * RAD, a0 = M.alt * RAD;
        const bearing = Math.atan2(Math.cos(a1) * Math.sin(dz), Math.sin(a1) * Math.cos(a0) - Math.cos(a1) * Math.sin(a0) * Math.cos(dz));
        ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.atan2(-Math.cos(bearing), Math.sin(bearing)));
        ctx.fillStyle = `rgba(70,80,105,${0.4 * vis * night})`; ctx.beginPath(); ctx.arc(0, 0, mr, 0, 6.29); ctx.fill();   // earthshine
        const ci = Math.cos(M.phaseAngle * RAD);
        ctx.fillStyle = `rgba(244,240,228,${vis})`;
        ctx.beginPath();
        ctx.arc(0, 0, mr, -Math.PI / 2, Math.PI / 2, false);
        ctx.ellipse(0, 0, Math.max(0.01, Math.abs(ci) * mr), mr, 0, Math.PI / 2, -Math.PI / 2, ci < 0);
        ctx.fill();
        ctx.restore();
      }
    }

    // sun
    if (S.alt > -1.5) {
      const r = Math.max(9, 0.27 * ppd * 2.2), c = mix(hex("#fff8e6"), hex("#ff9a4a"), clamp(dusk));
      const halo = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 7);
      halo.addColorStop(0, rgb(c, 0.6)); halo.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sy, r * 7, 0, 6.29); ctx.fill();
      ctx.fillStyle = rgb(c); ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.29); ctx.fill();
    }

    // clouds
    const hasClouds = renderClouds(wx, S, night, hor, overcast, moonLight);
    if (hasClouds && night > 0.1 && overcast > 0.2) {
      const cg = ctx.createLinearGradient(0, Y(18), 0, H0);
      cg.addColorStop(0, "rgba(120,140,130,0)"); cg.addColorStop(1, `rgba(120,140,130,${0.22 * night * overcast})`);
      ctx.fillStyle = cg; ctx.fillRect(0, Y(18), W, H0 - Y(18));
    }
    if (hasClouds && S.alt > -1 && overcast > 0.2) {                  // the sun's brightness through cloud
      const c = mix(hex("#fff4e0"), hex("#ffb070"), dusk), rr = 0.3 * Math.max(W, H);
      const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr); gg.addColorStop(0, rgb(c, 0.3 * overcast)); gg.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H0);
    }

    // far ridge, ridge, hillside
    const haze = clamp(1 - (wx.visKm ?? 16) / 14);
    const nightLand = hex("#07090c");
    const farCol = mix(mix(hor, hex("#3f4c50"), 0.45), hex("#0e1217"), night * 0.92);
    const ridgeCol = mix(mix(hor, hex("#1f2a27"), 0.72), nightLand, night * 0.95);
    fillProfile(farAlt, rgb(mix(farCol, hor, haze * 0.6)));
    fillProfile(ridgeAlt, rgb(mix(ridgeCol, hor, haze * 0.45)));
    const hillLit = smooth(-1, -9, S.alt);
    for (const L of land.lights) {
      const x = X(L.az); if (x < -2 || x > W + 2) continue;
      const y = Y(L.alt);
      if (hillLit > 0.02 && L.k < 0.55 + 0.35 * hillLit) {
        const tw = reduce ? 1 : 0.8 + 0.2 * Math.sin(now / 900 + L.ph);
        ctx.fillStyle = L.warm ? `rgba(255,214,160,${hillLit * tw * 0.85 * (1 - haze * 0.7)})` : `rgba(215,228,255,${hillLit * tw * 0.7 * (1 - haze * 0.7)})`;
        ctx.fillRect(x, y, L.s, L.s);
      } else if (day > 0.2 && L.k < 0.5) {
        ctx.fillStyle = `rgba(235,228,215,${0.07 * day})`; ctx.fillRect(x, y, 1.6, 1.1);
      }
    }

    // the tower; in a low ceiling its top goes into the cloud
    const sutro = mix(mix(hor, hex("#3b2a28"), 0.62), hex("#05070a"), night * 0.9);
    const T = drawTower(rgb(mix(sutro, hor, haze * 0.4)), 0, now);
    const blink = reduce ? 0.85 : (() => { const ph = (now % 2000) / 2000; return ph < 0.5 ? smooth(0, 0.06, ph) * (1 - smooth(0.38, 0.5, ph)) : 0; })();
    const beaconK = smooth(-1, -7, S.alt) * 0.95 + 0.05 * (1 - night);
    drawBeacons(T, blink, beaconK, false);
    const low = wx.low;
    if (low && low.cover > 0.5 && low.baseFt < TOWER_TOP_FT + 300) {
      const f = (low.baseFt - TOWER_BASE_FT) / (TOWER_TOP_FT - TOWER_BASE_FT);
      const yc = Y(TOWER_BASE_ALT + f * TOWER_DEG), soft = 0.9 * ppd;
      const C = deckColors("low", low.baseFt * 0.0003048, S, night, hor, overcast, moonLight);
      const col = mix(C.base, C.top, 0.25), k = smooth(0.5, 0.9, low.cover);
      if (hasClouds) {                                   // the same cloud again, over the land, down to the ceiling
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, Math.max(0, yc - soft)); ctx.clip();
        ctx.drawImage(cloudCv, 0, 0, cloudCv.width, cloudCv.height, 0, 0, cloudCv.width * CS, cloudCv.height * CS);
        ctx.restore();
      }
      const fg = ctx.createLinearGradient(0, yc - soft, 0, yc + soft);
      fg.addColorStop(0, rgb(col, 0.9 * k)); fg.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = fg; ctx.fillRect(0, yc - soft, W, soft * 2);
      drawBeacons(T, blink, beaconK * k, true);                       // lights glowing inside the cloud
    }
    if (haze > 0.05) { ctx.fillStyle = rgb(hor, haze * 0.35); ctx.fillRect(0, 0, W, H0 + ppd * 1.5); }

    // the city, drawn into its own layer and only redrawn when the light changes
    const lit = smooth(-1, -9, S.alt), frac = litFraction(hourOf(t));
    const cityKey = [W, H, Math.round(S.alt * 2), Math.round(S.az / 2), Math.round(overcast * 20), Math.round(haze * 20), Math.round(frac * 40),
      (hor[0] / 6) | 0, (hor[1] / 6) | 0, (hor[2] / 6) | 0, (mid[0] / 12) | 0, (mid[2] / 12) | 0].join();
    if (!cityCv || (cityKey !== lastCityKey && (mode !== "play" || now - lastCityDraw > 250))) {
      lastCityKey = cityKey; lastCityDraw = now;
      if (!cityCv || cityCv.width !== Math.round(W * DPR) || cityCv.height !== Math.round(H * DPR)) { cityCv = document.createElement("canvas"); cityCv.width = Math.round(W * DPR); cityCv.height = Math.round(H * DPR); }
      ctx = cityCv.getContext("2d"); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cityCv.width, cityCv.height); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      try { drawCity(); } finally { ctx = mainCtx; }
    }
    ctx.drawImage(cityCv, 0, 0, W, H);
    function drawCity() {
    const dayK = smooth(-3, 7, S.alt) * (1 - night), winVis = smooth(-0.5, -7, S.alt);
    const sunUp = smooth(-1, 6, S.alt) * (1 - 0.7 * overcast);
    const amb = (0.64 + 0.12 * smooth(0, 30, S.alt)) * (1 - 0.15 * overcast), dif = 0.4;
    const low01 = 0.62 + 0.38 * smooth(-2, 16, S.alt);
    const litF = clamp(Math.cos(wrap(S.az - (VIEW_AZ + 180)) * RAD));       // faces looking back at us (NE)
    const litNW = clamp(Math.cos(wrap(S.az - (VIEW_AZ + 90)) * RAD));       // right-hand faces (NW)
    const litSE = clamp(Math.cos(wrap(S.az - (VIEW_AZ - 90)) * RAD));       // left-hand faces (SE)
    const litRoof = clamp(Math.sin(Math.max(0, S.alt) * RAD) * 1.6);
    const sunTint = mix([255, 255, 255], hex("#ffcf9c"), dusk * 0.7);
    const nightBase = hex("#05070a");
    const tinted = (c, L) => [c[0] * sunTint[0] / 255 * L, c[1] * sunTint[1] / 255 * L, c[2] * sunTint[2] / 255 * L];
    const fogK = (aer) => Math.min(0.85, aer * 0.62 + haze * 0.3);
    // the floor of the city, up to the foot of the hills
    {
      const top = (az) => floorTop(az), step = Math.max(2, ppd * 0.2);
      const g2 = ctx.createLinearGradient(0, Y(2), 0, H);
      if (dayK > 0.02) { ctx.globalAlpha = dayK * (1 - haze * 0.5); ctx.drawImage(hillTexture(), 0, 0, W, H); ctx.globalAlpha = 1; }
      const fTop = mix(nightBase, mix(tinted(hex("#4f6448"), amb * low01), hor, 0.45), dayK), fBot = mix(nightBase, tinted(hex("#4f4a42"), amb * low01), dayK);
      g2.addColorStop(0, rgb(mix(fTop, hor, haze * 0.4))); g2.addColorStop(0.18, rgb(mix(mix(fTop, fBot, 0.5), tinted(hex("#7a705f"), amb * low01), 0.4 * dayK))); g2.addColorStop(1, rgb(fBot));
      ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(-2, H);
      for (let x = -2; x <= W + step; x += step) ctx.lineTo(x, Y(top(VIEW_AZ + (x - W / 2) / ppd)));
      ctx.lineTo(W + step, H); ctx.closePath(); ctx.fill();
    }
    if (lit > 0.05) { const yg = Y(floorTop(VIEW_AZ) + 1); const gl = ctx.createLinearGradient(0, yg, 0, H); gl.addColorStop(0, `rgba(255,190,130,${0.07 * lit})`); gl.addColorStop(1, "rgba(255,190,130,0)"); ctx.fillStyle = gl; ctx.fillRect(0, yg, W, H - yg); }
    if (lit > 0.02) for (const L of land.cityLights) {
      if (L.k > 0.25 + 0.6 * lit) continue;
      const x = X(L.az); if (x < -2 || x > W + 2) continue;
      ctx.fillStyle = L.warm ? `rgba(255,208,150,${lit * 0.85})` : `rgba(215,228,255,${lit * 0.7})`;
      ctx.fillRect(x, Y(L.alt), L.s, L.s);
    }
    const nk = `${W}x${H}:${Math.round(frac * 40)}`, repaint = nk !== nightKey; nightKey = nk;
    const houseCol = {};
    const houseColors = (it) => {
      const key = it.pi * 10 + it.ab;
      if (houseCol[key]) return houseCol[key];
      const aer = (it.ab + 0.5) / 10, nightC = mix(nightBase, hor, aer * 0.32 * (1 - haze * 0.5)), pal = it.pal;
      const f = mix(nightC, mix(tinted(pal, (amb + dif * litF * sunUp) * low01), hor, fogK(aer)), dayK);
      const sd = mix(scale(nightC, 0.85), mix(tinted(pal, (amb * 0.86 + dif * 0.5 * (litNW + litSE) * sunUp) * low01), hor, fogK(aer)), dayK);
      const rf = mix(scale(nightC, 1.15), mix(tinted(mix(pal, [226, 224, 218], 0.5), (amb * 1.08 + dif * litRoof * sunUp) * low01), hor, fogK(aer)), dayK);
      return (houseCol[key] = { f: rgb(f), s: rgb(sd), r: rgb(rf) });
    };
    for (const it of city.items) {
      const x0 = X(it.a0), x1 = X(it.a1), yT = Y(it.top);
      if (yT >= H) continue;
      if (it.kind === "tree") {                              // a crown, lit on the sun's side
        const cx = X(it.az), rr = Math.max(1, it.rad * ppd), cy = Y(it.cy);
        if (cx < -rr || cx > W + rr || cy - rr > H) continue;
        const nightC = mix(nightBase, hor, it.aer * 0.25);
        const leaf = mix(nightC, mix(tinted(it.shade < 0.5 ? hex("#5b7a48") : hex("#6f8f52"), (amb * 0.9 + dif * 0.6 * sunUp) * low01 * it.j), hor, fogK(it.aer)), dayK);
        ctx.fillStyle = rgb(scale(leaf, 0.82)); ctx.fillRect(cx - rr * 0.12, cy, rr * 0.24, Y(it.base) - cy);
        ctx.fillStyle = rgb(leaf); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.29); ctx.fill();
        if (dayK > 0.05 && rr > 1.6) {
          const sx = Math.sin(wrap(S.az - VIEW_AZ) * RAD) * rr * 0.35;
          ctx.fillStyle = rgb(mix(leaf, tinted(hex("#a9c27a"), 1), 0.35 * sunUp), dayK);
          ctx.beginPath(); ctx.arc(cx + sx, cy - rr * 0.25, rr * 0.62, 0, 6.29); ctx.fill();
        }
        continue;
      }
      if (it.kind === "house") {                             // the carpet: front, side and roof, flat colours
        const x1h = X(it.a1), sw = it.sw * ppd;
        if (x1h + sw < -2 || x0 - sw > W + 2) continue;
        const yB = Math.min(H, Y(it.base)) + 1, hc = houseColors(it), rh = it.roof * ppd;
        if (sw >= 0.6) { ctx.fillStyle = hc.s; ctx.fillRect(it.sideRight ? x1h : x0 - sw, yT, sw + 0.5, yB - yT); }
        ctx.fillStyle = hc.f; ctx.fillRect(x0, yT, x1h - x0 + 0.5, yB - yT);
        if (rh > 0.4) { ctx.fillStyle = hc.r; ctx.fillRect(Math.min(x0, x0 + (it.sideRight ? sw : -sw)), yT - rh, x1h - x0 + sw, rh + 0.5); }
        if (lit > 0.02) for (const [fx, fy, r, ci] of it.dots) if (r < frac * 1.3) { const c = WIN_COLORS[ci]; ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${lit * 0.9})`; ctx.fillRect(x0 + (x1h - x0) * fx, yT + (yB - yT) * fy * 0.6, 1.1, 1.1); }
        continue;
      }
      const nightC = mix(nightBase, hor, it.aer * 0.32 * (1 - haze * 0.5));
      if (it.kind === "crane") { drawCrane(it, mix(nightC, mix(scale(hex("#4a4f55"), amb), hor, fogK(it.aer)), dayK), lit); continue; }
      const sw = it.sw * ppd;
      if (Math.max(x1, x1 + sw) < -2 || Math.min(x0, x0 - sw) > W + 2) continue;
      const yB = Math.min(H, Y(it.base)) + 1;
      const glass = it.style === "glass", pal = glass ? mix(it.pal, mid, 0.3) : it.pal;
      const front = mix(nightC, mix(tinted(pal, (amb + dif * litF * sunUp) * low01 * it.j), hor, fogK(it.aer)), dayK);
      const side = mix(scale(nightC, 0.85), mix(tinted(pal, (amb * 0.86 + dif * (it.sideRight ? litNW : litSE) * sunUp) * low01 * it.j), hor, fogK(it.aer)), dayK);
      const roofC = mix(scale(nightC, 1.15), mix(tinted(mix(pal, [226, 224, 218], 0.5), (amb * 1.08 + dif * litRoof * sunUp) * low01), hor, fogK(it.aer)), dayK);
      const sx0 = it.sideRight ? x1 : x0 - sw, sx1 = it.sideRight ? x1 + sw : x0;
      const ySb = it.setback ? Y(it.setback.at) : yT;
      const nw = it.setback ? (x1 - x0) * (1 - it.setback.k) / 2 : 0;
      // side face, front face (with its setback), roof
      if (sw >= 0.6) {
        ctx.fillStyle = rgb(side);
        ctx.fillRect(Math.floor(sx0), ySb, Math.ceil(sx1 - sx0) + 0.5, yB - ySb);
        if (it.setback) ctx.fillRect(it.sideRight ? x1 - nw : x0 - sw + nw, yT, sw, ySb - yT + 1);
      }
      if (glass && dayK > 0.05) {
        const gg = ctx.createLinearGradient(0, yT, 0, yB);
        gg.addColorStop(0, rgb(mix(front, hor, 0.25))); gg.addColorStop(1, rgb(scale(front, 0.82)));
        ctx.fillStyle = gg;
      } else ctx.fillStyle = rgb(front);
      ctx.fillRect(Math.floor(x0), ySb, Math.ceil(x1 - x0) + 0.5, yB - ySb);
      if (it.setback) ctx.fillRect(Math.floor(x0 + nw), yT, Math.ceil(x1 - x0 - 2 * nw) + 0.5, ySb - yT + 1);
      if (it.roof > 0.02) {
        const rh = it.roof * ppd, a = it.setback ? x0 + nw : x0, b = it.setback ? x1 - nw : x1;
        ctx.fillStyle = rgb(roofC);
        ctx.beginPath();
        if (it.sideRight) { ctx.moveTo(a, yT); ctx.lineTo(b, yT); ctx.lineTo(b + sw, yT - rh); ctx.lineTo(a + sw, yT - rh); }
        else { ctx.moveTo(a, yT); ctx.lineTo(b, yT); ctx.lineTo(b - sw, yT - rh); ctx.lineTo(a - sw, yT - rh); }
        ctx.closePath(); ctx.fill();
      } else if (dayK > 0.05 && x1 - x0 > 3) { ctx.fillStyle = rgb(mix(front, [255, 255, 255], 0.3), 0.5 * dayK); ctx.fillRect(x0, yT, x1 - x0, 1); }
      if (it.box) { const bx = x0 + (x1 - x0) * it.box.f0, bw = (x1 - x0) * (it.box.f1 - it.box.f0), by = Y(it.box.top); if (by < yT - 0.8) { ctx.fillStyle = rgb(scale(side, 0.95)); ctx.fillRect(bx, by, Math.max(1, bw), yT - by - (it.roof > 0.02 ? it.roof * ppd * 0.5 : 0)); } }
      if (it.mast) { ctx.fillStyle = rgb(scale(front, 0.7)); ctx.fillRect(x0 + (x1 - x0) * it.mast.f, Y(it.mast.top), 1, Y(it.top) - Y(it.mast.top)); }
      const sp = spriteFor(it);
      if (!sp) {                                             // too small for floors: a few lit windows at night
        if (lit > 0.02) for (const [fx, fy, r, ci] of it.dots) if (r < frac * 1.4) { const c = WIN_COLORS[ci]; ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${lit * 0.95})`; ctx.fillRect(x0 + (x1 - x0) * fx, yT + (yB - yT) * fy, 1.2, 1.2); }
        continue;
      }
      if (dayK > 0.03) { ctx.globalAlpha = (sp.glass ? 0.22 : 0.26) * dayK * (1 - it.aer * 0.6); ctx.drawImage(sp.day, x0, yT, sp.day.width / DPR, sp.day.height / DPR); }
      if (winVis > 0.02) {
        if (repaint || !sp.painted) { paintNight(sp, frac, it.style === "glass" ? 0.6 : it.kind === "tower" ? 0.8 : 1); sp.painted = true; }
        ctx.globalAlpha = winVis * (1 - haze * 0.4); ctx.drawImage(sp.night, x0, yT, sp.night.width / DPR, sp.night.height / DPR);
      }
      ctx.globalAlpha = 1;
    }

    }

    // the bottom fades into the page
    const fade = ctx.createLinearGradient(0, H * 0.84, 0, H);
    fade.addColorStop(0, "rgba(6,17,14,0)"); fade.addColorStop(1, "rgba(6,17,14,0.9)");
    ctx.fillStyle = fade; ctx.fillRect(0, H * 0.84, W, H * 0.16);

    return { S, M, wx, rising: S2.alt > S.alt, planets: visiblePlanets };
  }
  function drawCrane(c, col, lit) {
    const x = X(c.az), yB = Math.min(H, Y(c.base)), yT = Y(c.top), jw = c.jibDeg * ppd;
    if (yT >= H || x < -jw || x > W + jw) return;
    const lw = Math.max(1, 1.6 / c.d * DEG * ppd);
    ctx.strokeStyle = rgb(col); ctx.fillStyle = rgb(col); ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, yB); ctx.lineTo(x, yT);                                       // mast
    ctx.moveTo(x - c.dir * jw * 0.28, yT + lw); ctx.lineTo(x + c.dir * jw, yT + lw);   // counter-jib and jib
    ctx.moveTo(x, yT - jw * 0.12); ctx.lineTo(x + c.dir * jw * 0.6, yT + lw);        // the jib's tie
    ctx.moveTo(x, yT - jw * 0.12); ctx.lineTo(x - c.dir * jw * 0.28, yT + lw);
    ctx.stroke();
    ctx.fillRect(x - c.dir * jw * 0.28 - (c.dir > 0 ? 0 : jw * 0.08), yT + lw, jw * 0.08, jw * 0.05);   // counterweight
    ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(0.5, lw * 0.5);
    ctx.beginPath(); const hx = x + c.dir * jw * 0.55; ctx.moveTo(hx, yT + lw); ctx.lineTo(hx, yT + jw * 0.45); ctx.stroke();
    ctx.globalAlpha = 1;
    if (lit > 0.05) { ctx.fillStyle = `rgba(255,70,50,${0.9 * lit})`; ctx.beginPath(); ctx.arc(x, yT - jw * 0.12, 1.4, 0, 6.29); ctx.fill(); ctx.beginPath(); ctx.arc(x + c.dir * jw, yT + lw, 1.2, 0, 6.29); ctx.fill(); }
  }
  // the hero's text block, so sky labels stay out of it
  let textBox = null;
  const measureText = () => { const el = document.querySelector(".hero-inner"); if (!el) return; const r = el.getBoundingClientRect(); textBox = { l: r.left - 30, r: r.right + 30, t: r.top + scrollY - 20, b: r.bottom + scrollY + 10 }; };
  const clearOfText = (x, y) => !textBox || x < textBox.l || x > textBox.r || y + scrollY < textBox.t || y + scrollY > textBox.b;
  function fillProfile(fn, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-2, H);
    const step = Math.max(2, ppd * 0.15);
    for (let x = -2; x <= W + step; x += step) ctx.lineTo(x, Y(fn(VIEW_AZ + (x - W / 2) / ppd)));
    ctx.lineTo(W + step, H); ctx.closePath(); ctx.fill();
  }

  // ---------- controls ----------
  const $ = (id) => document.getElementById(id);
  const range = $("sky-range"), playBtn = $("sky-play"), liveBtn = $("sky-live"), playIcon = $("sky-play-icon"), guideBtn = $("sky-guide");
  const PLAY = "M8 5.5v13l11-6.5z", PAUSE = "M7 5h4v14H7zm6 0h4v14h-4z";
  let mode = "live", simT = Date.now(), lastTick = performance.now(), lastLabel = "";
  let guideOn = true;
  try { guideOn = localStorage.getItem("wx.guide") !== "0"; } catch (e) { /* no storage */ }
  const DAY_MS = 86400000, PLAY_RATE = 360;          // time-lapse: 6 minutes of San Francisco time per second, a day in 4 minutes

  function setMode(m) {
    mode = m;
    liveBtn.setAttribute("aria-pressed", m === "live");
    playBtn.setAttribute("aria-pressed", m === "play");
    playIcon.setAttribute("d", m === "play" ? PAUSE : PLAY);
    $("sky-live-dot").classList.toggle("live", m === "live");
  }
  const redrawIfStill = () => { if (reduce) frame(performance.now()); };
  range.addEventListener("input", () => { simT = sfMidnight(simT) + range.value * 60000; if (mode !== "scrub") setMode("scrub"); lastStarsT = -1; redrawIfStill(); });
  playBtn.addEventListener("click", () => { if (mode === "play") setMode("scrub"); else { if (mode === "live") simT = Date.now(); setMode("play"); } });
  liveBtn.addEventListener("click", () => { simT = Date.now(); setMode("live"); lastStarsT = -1; redrawIfStill(); });
  if (guideBtn) {
    guideBtn.setAttribute("aria-pressed", guideOn);
    guideBtn.addEventListener("click", () => { guideOn = !guideOn; guideBtn.setAttribute("aria-pressed", guideOn); try { localStorage.setItem("wx.guide", guideOn ? "1" : "0"); } catch (e) { /* no storage */ } redrawIfStill(); });
  }

  function label(t, info) {
    const s = `${fmtTime.format(new Date(t))} PT`, ph = phaseName(info.S.alt, info.rising);
    const sunTxt = info.S.alt >= 0 ? `sun ${info.S.alt.toFixed(0)}° up` : `sun ${Math.abs(info.S.alt).toFixed(0)}° down`;
    const bits = [];
    if (info.M.alt > 0) bits.push(`Moon ${Math.round(info.M.lit * 100)}%`);
    if (info.planets.length) bits.push(info.planets.join(", ") + " up");
    if (info.wx && info.wx.label) bits.push(info.wx.label);
    const key = s + ph + sunTxt + bits.join("|") + mode;
    if (key === lastLabel) return;
    lastLabel = key;
    $("sky-time").textContent = (mode === "live" ? "San Francisco now · " : "San Francisco · ") + s;
    $("sky-phase").textContent = ph;
    $("sky-sun").textContent = sunTxt;
    const wxl = $("sky-wx"); if (wxl) wxl.textContent = bits.join(" · ");
    if (mode !== "scrub") range.value = Math.round(hourOf(t) * 60);
  }

  let lastDrift = performance.now();
  function frame(now) {
    const dt = now - lastTick; lastTick = now;
    if (mode === "live") simT = Date.now();
    else if (mode === "play") {
      const mid = sfMidnight(simT);
      simT += dt * PLAY_RATE;
      if (simT - mid >= DAY_MS) simT -= DAY_MS;
    }
    if (!reduce && Wx) {                                  // the clouds move with the wind; faster while time-lapsing
      const wx = Wx.at(simT), kmh = (wx.windKt ?? 8) * 1.852, dir = ((wx.windDir ?? 280) + 180) * RAD;
      const hrs = (now - lastDrift) / 3.6e6 * (mode === "play" ? PLAY_RATE : 1);
      drift.e += Math.sin(dir) * kmh * hrs; drift.n += Math.cos(dir) * kmh * hrs; drift.evo += hrs * 7;
    }
    lastDrift = now;
    const info = draw(simT, now);
    label(simT, info);
  }
  let last = 0;
  function loop(now) {
    const veil = parseFloat(document.documentElement.style.getPropertyValue("--veil") || "0");
    const interval = mode === "play" ? 0 : veil > 0.8 ? 120 : 33;          // slow down once the page covers it
    if (now - last >= interval) { frame(now); last = now; }
    requestAnimationFrame(loop);
  }

  const topbar = document.querySelector(".topbar");
  function onScroll() {
    const k = clamp(scrollY / (innerHeight * 0.8));
    document.documentElement.style.setProperty("--veil", (k * 0.85).toFixed(3));
    topbar && topbar.classList.toggle("solid", scrollY > 40);
  }
  addEventListener("scroll", onScroll, { passive: true });
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { build(); measureText(); lastStarsT = -1; redrawIfStill(); }, 80); });

  setMode("live"); build(); onScroll(); measureText();
  if (document.fonts) document.fonts.ready.then(measureText);
  if (Wx) Wx.load().then(() => { lastLabel = ""; redrawIfStill(); }).catch(() => {});
  if (reduce) { frame(performance.now()); setInterval(() => { if (mode === "live") frame(performance.now()); }, 60000); }
  else requestAnimationFrame(loop);
  setInterval(() => { if (Wx && mode === "live") Wx.load().catch(() => {}); }, 15 * 60 * 1000);

  // for the console and for testing: WXSKY.setTime(Date.parse("2026-11-05T01:30:00Z")), WXSKY.setWeather({...})
  window.WXSKY = {
    sky,
    setTime(t) { simT = +t; setMode("scrub"); lastStarsT = -1; frame(performance.now()); },
    setWeather(w) { if (Wx) { Wx.at = () => Object.assign({ low: null, mid: null, high: null, visKm: 16, windDir: 280, windKt: 8, label: "test" }, w); } lastStarsT = -1; frame(performance.now()); },
  };
})();

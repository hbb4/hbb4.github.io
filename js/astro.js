/* Low-precision astronomy for the sky behind the page: sun, moon, planets and stars as altitude/azimuth over
   San Francisco. Good to a small fraction of a degree, which is a pixel or two on screen.
   Sun: the Astronomical Almanac's low-precision formulae. Moon: the same, with topocentric parallax.
   Planets: JPL's approximate Keplerian elements (Standish), from data/sky.json. Stars: J2000 positions, precessed. */
(function (root) {
  "use strict";
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const sin = (d) => Math.sin(d * RAD), cos = (d) => Math.cos(d * RAD);
  const norm = (d) => ((d % 360) + 360) % 360;

  const jd = (t) => t / 86400000 + 2440587.5;
  const cent = (t) => (jd(t) - 2451545.0) / 36525;
  const obliquity = (T) => 23.439291 - 0.0130042 * T;
  const gmst = (t) => norm(280.46061837 + 360.98564736629 * (jd(t) - 2451545.0));

  function eclToEqu(lon, lat, eps) {
    const x = cos(lat) * cos(lon), y = cos(lat) * sin(lon), z = sin(lat);
    const ye = y * cos(eps) - z * sin(eps), ze = y * sin(eps) + z * cos(eps);
    return { ra: norm(Math.atan2(ye, x) * DEG), dec: Math.asin(Math.max(-1, Math.min(1, ze))) * DEG };
  }

  // altitude/azimuth (azimuth from north, through east) for an hour angle and declination
  function horizontal(ha, dec, lat) {
    const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(ha)) * DEG;
    const az = norm(Math.atan2(-cos(dec) * sin(ha), sin(dec) * cos(lat) - cos(dec) * sin(lat) * cos(ha)) * DEG);
    return { alt, az };
  }

  // atmospheric refraction (Saemundsson), degrees to add to a true altitude
  const refraction = (alt) => (alt < -1.5 ? 0 : 1.02 / Math.tan((alt + 10.3 / (alt + 5.11)) * RAD) / 60);

  function sunEcliptic(T) {
    const n = T * 36525;
    const L = norm(280.460 + 0.9856474 * n), g = norm(357.528 + 0.9856003 * n);
    return { lon: norm(L + 1.915 * sin(g) + 0.020 * sin(2 * g)), lat: 0, dist: 1.00014 - 0.01671 * cos(g) - 0.00014 * cos(2 * g) };
  }

  function moonEcliptic(T) {
    const lon = 218.32 + 481267.881 * T
      + 6.29 * sin(135.0 + 477198.87 * T) - 1.27 * sin(259.3 - 413335.36 * T)
      + 0.66 * sin(235.7 + 890534.22 * T) + 0.21 * sin(269.9 + 954397.74 * T)
      - 0.19 * sin(357.5 + 35999.05 * T) - 0.11 * sin(186.5 + 966404.03 * T);
    const lat = 5.13 * sin(93.3 + 483202.02 * T) + 0.28 * sin(228.2 + 960400.89 * T)
      - 0.28 * sin(318.3 + 6003.15 * T) - 0.17 * sin(217.6 - 407332.21 * T);
    const par = 0.9508 + 0.0518 * cos(134.9 + 477198.85 * T) + 0.0095 * cos(259.2 - 413335.38 * T)
      + 0.0078 * cos(235.7 + 890534.23 * T) + 0.0028 * cos(269.9 + 954397.70 * T);
    return { lon: norm(lon), lat, par };
  }

  // J2000 -> date, the usual first-order formulae (good to a few arcseconds over decades)
  function precess(ra, dec, years) {
    const m = 3.07496 * 15 / 3600, n = 1.33621 * 15 / 3600;          // degrees per year
    const dra = (m + n * sin(ra) * Math.tan(dec * RAD)) * years, ddec = n * cos(ra) * years;
    return { ra: norm(ra + dra), dec: dec + ddec };
  }

  function kepler(M, e) {
    let E = M + e * DEG * sin(M);
    for (let i = 0; i < 8; i++) { const dE = (M - (E - e * DEG * sin(E))) / (1 - e * cos(E)); E += dE; if (Math.abs(dE) < 1e-7) break; }
    return E;
  }
  function helio(el, T) {                    // heliocentric ecliptic J2000, AU
    const a = el.a + el.da * T, e = el.e + el.de * T, I = el.i + el.di * T;
    const L = el.L + el.dL * T, W = el.W + el.dW * T, N = el.N + el.dN * T;
    const w = W - N, M = norm(L - W), E = kepler(M > 180 ? M - 360 : M, e);
    const xp = a * (cos(E) - e), yp = a * Math.sqrt(1 - e * e) * sin(E);
    return [
      (cos(w) * cos(N) - sin(w) * sin(N) * cos(I)) * xp + (-sin(w) * cos(N) - cos(w) * sin(N) * cos(I)) * yp,
      (cos(w) * sin(N) + sin(w) * cos(N) * cos(I)) * xp + (-sin(w) * sin(N) + cos(w) * cos(N) * cos(I)) * yp,
      sin(w) * sin(I) * xp + cos(w) * sin(I) * yp,
    ];
  }

  function Sky(lat, lon) {
    this.lat = lat; this.lon = lon;
  }
  Sky.prototype.lst = function (t) { return norm(gmst(t) + this.lon); };
  Sky.prototype.altaz = function (ra, dec, t, lst) {
    const h = horizontal((lst === undefined ? this.lst(t) : lst) - ra, dec, this.lat);
    h.alt += refraction(h.alt);
    return h;
  };
  Sky.prototype.sun = function (t) {
    const T = cent(t), s = sunEcliptic(T), q = eclToEqu(s.lon, 0, obliquity(T));
    return Object.assign(this.altaz(q.ra, q.dec, t), { ra: q.ra, dec: q.dec, lon: s.lon });
  };
  Sky.prototype.moon = function (t) {
    const T = cent(t), m = moonEcliptic(T), q = eclToEqu(m.lon, m.lat, obliquity(T));
    const h = horizontal(this.lst(t) - q.ra, q.dec, this.lat);
    h.alt -= m.par * cos(h.alt);              // topocentric: the moon sits lower than from the earth's centre
    h.alt += refraction(h.alt);
    const s = sunEcliptic(T);
    const elong = Math.acos(cos(m.lat) * cos(m.lon - s.lon)) * DEG;  // 0 new, 180 full
    const phaseAngle = 180 - elong;                                 // approx. (sun distance >> moon distance)
    const waxing = norm(m.lon - s.lon) < 180;
    return Object.assign(h, { ra: q.ra, dec: q.dec, elong, lit: (1 + cos(phaseAngle)) / 2, phaseAngle, waxing });
  };
  // planets: elements = data/sky.json "planets" (mer, ven, ter, mar, jup, sat)
  Sky.prototype.planets = function (t, P) {
    const T = cent(t), earth = helio(P.ter.el, T), out = [];
    const years = T * 100, lst = this.lst(t);
    for (const k of ["mer", "ven", "mar", "jup", "sat"]) {
      const p = helio(P[k].el, T);
      const g = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]];
      const r = Math.hypot(p[0], p[1], p[2]), d = Math.hypot(g[0], g[1], g[2]);
      const lon = norm(Math.atan2(g[1], g[0]) * DEG), lat = Math.asin(g[2] / d) * DEG;
      const q0 = eclToEqu(lon, lat, 23.43928), q = precess(q0.ra, q0.dec, years);
      const h = this.altaz(q.ra, q.dec, t, lst);
      // brightness: H + 5 log(r d), plus a rough phase term for the inner planets
      const cosPhase = (r * r + d * d - (earth[0] ** 2 + earth[1] ** 2 + earth[2] ** 2)) / (2 * r * d);
      const phase = Math.acos(Math.max(-1, Math.min(1, cosPhase))) * DEG;
      const mag = P[k].H + 5 * Math.log10(r * d) + (k === "mer" ? 0.038 * phase : k === "ven" ? 0.0009 * phase + 0.000239 * phase * phase - 0.00000065 * phase ** 3 : k === "mar" ? 0.016 * phase : 0);
      out.push(Object.assign(h, { key: k, name: P[k].name, mag, ra: q.ra, dec: q.dec }));
    }
    return out;
  };

  const Astro = { Sky, jd, cent, gmst, precess, refraction, horizontal, sunEcliptic, moonEcliptic, eclToEqu, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = Astro;
  else root.Astro = Astro;
})(typeof window !== "undefined" ? window : this);

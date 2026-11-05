/* Clouds for the sky: the latest METAR from San Francisco International (KSFO) for "now", and Open-Meteo's
   hourly cloud cover (low / mid / high) for the rest of the day, so scrubbing through the day shows its clouds.
   Both are public, keyless APIs called from the visitor's browser. If neither answers, a plausible made-up sky
   for the day is used and the readout says so. Results are kept for 15 minutes in sessionStorage. */
(function (root) {
  "use strict";
  const METAR_URL = "https://aviationweather.gov/api/data/metar?ids=KSFO&format=json&hours=3";
  const OM_URL = "https://api.open-meteo.com/v1/forecast?latitude=37.62&longitude=-122.38" +
    "&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_direction_10m" +
    "&past_days=1&forecast_days=2&timeformat=unixtime&timezone=UTC";
  const TTL = 15 * 60 * 1000;
  const COVER = { FEW: 0.2, SCT: 0.45, BKN: 0.75, OVC: 1, VV: 1 };

  const store = {
    get(k) { try { const v = JSON.parse(sessionStorage.getItem(k)); return v && Date.now() - v.at < TTL ? v.data : null; } catch (e) { return null; } },
    set(k, data) { try { sessionStorage.setItem(k, JSON.stringify({ at: Date.now(), data })); } catch (e) { /* private mode */ } },
  };
  async function getJSON(url, key) {
    const hit = store.get(key);
    if (hit) return hit;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      store.set(key, d);
      return d;
    } finally { clearTimeout(timer); }
  }

  // ---------- METAR ----------
  function parseMetar(raw) {
    const out = { raw, layers: [], visKm: 16, wx: "" };
    const body = raw.split(/\s(?:RMK|TEMPO|BECMG)\s/)[0];
    for (const m of body.matchAll(/\b(FEW|SCT|BKN|OVC|VV)(\d{3})\b/g)) out.layers.push({ cover: m[1], frac: COVER[m[1]], baseFt: +m[2] * 100 });
    const vis = /\s(?:(\d+)\s)?(?:(\d+)\/(\d+)|(\d+))SM\b/.exec(body);
    if (vis) {
      const miles = vis[4] ? +vis[4] : (+vis[1] || 0) + (+vis[2] / +vis[3]);
      out.visKm = miles * 1.609;
    }
    const wx = /\s(-|\+|VC)?(BR|FG|HZ|FU|DZ|RA|SHRA|TSRA)\b/.exec(body);
    if (wx) out.wx = wx[2];
    const wind = /\b(\d{3}|VRB)(\d{2,3})(?:G\d{2,3})?KT\b/.exec(body);
    if (wind) { out.windDir = wind[1] === "VRB" ? 270 : +wind[1]; out.windKt = +wind[2]; }
    const tm = /\b\d{2}(\d{2})(\d{2})Z\b/.exec(body);
    if (tm) out.time = tm[1] + tm[2] + "Z";
    return out;
  }
  // METAR layers -> the renderer's three decks (low < 6,500 ft, mid < 20,000 ft, high above)
  function decksFromMetar(m) {
    const d = { low: null, mid: null, high: null };
    for (const L of m.layers) {
      const k = L.baseFt < 6500 ? "low" : L.baseFt < 20000 ? "mid" : "high";
      if (!d[k] || L.frac > d[k].cover) d[k] = { cover: L.frac, baseFt: L.baseFt };
    }
    return d;
  }

  // ---------- made-up sky (when nothing answers) ----------
  function hash(n) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function synthetic(t) {
    const day = Math.floor((t - 8 * 3600e3) / 864e5), hr = ((t / 3600e3 - 8) % 24 + 24) % 24;
    const r1 = hash(day), r2 = hash(day * 7 + 3), r3 = hash(day * 13 + 5);
    const marine = r1 < 0.45 ? Math.max(Math.exp(-((hr - 6.5) ** 2) / 10), Math.exp(-((hr - 22) ** 2) / 12)) : 0;
    return {
      low: marine > 0.15 ? { cover: Math.min(1, 0.4 + marine * 0.7), baseFt: 900 + 600 * (1 - marine) } : r2 < 0.3 ? { cover: 0.25 + r2, baseFt: 3500 } : null,
      mid: r2 > 0.6 ? { cover: (r2 - 0.6) * 1.5, baseFt: 12000 } : null,
      high: r3 > 0.45 ? { cover: (r3 - 0.45) * 1.4, baseFt: 28000 } : null,
      visKm: marine > 0.5 ? 6 : 16, windDir: 290, windKt: 9,
    };
  }

  // ---------- the model the sky reads ----------
  const W = {
    metar: null, hourly: null, status: "loading",
    async load() {
      const [m, h] = await Promise.allSettled([getJSON(METAR_URL, "wx.metar"), getJSON(OM_URL, "wx.om")]);
      if (m.status === "fulfilled" && Array.isArray(m.value) && m.value.length) {
        const latest = m.value.slice().sort((a, b) => (b.obsTime || 0) - (a.obsTime || 0))[0];
        if (latest && latest.rawOb) { W.metar = parseMetar(latest.rawOb); W.metar.obsTime = (latest.obsTime || 0) * 1000 || Date.now(); }
      }
      if (h.status === "fulfilled" && h.value && h.value.hourly && h.value.hourly.time) W.hourly = h.value.hourly;
      W.status = W.metar || W.hourly ? "live" : "synthetic";
      return W;
    },
    // conditions at time t: decks {low, mid, high: {cover 0..1, baseFt} | null}, visKm, wind, and a short label
    at(t) {
      const now = Date.now();
      if (W.metar && Math.abs(t - now) < 45 * 60e3 && now - W.metar.obsTime < 3 * 3600e3) {
        const m = W.metar, d = decksFromMetar(m);
        const lab = m.layers.length ? m.layers.map((L) => `${L.cover} ${L.baseFt.toLocaleString("en-US")} ft`).join(", ") : "clear";
        return Object.assign(d, { visKm: m.visKm, fog: /BR|FG/.test(m.wx), windDir: m.windDir ?? 280, windKt: m.windKt ?? 8, label: `KSFO ${m.time || ""}: ${lab}`.replace(":  ", ": "), source: "metar" });
      }
      const H = W.hourly;
      if (H && t / 1000 >= H.time[0] && t / 1000 <= H.time[H.time.length - 1]) {
        let i = H.time.findIndex((x) => x > t / 1000) - 1; if (i < 0) i = 0;
        const k = Math.min(1, Math.max(0, (t / 1000 - H.time[i]) / 3600)), j = Math.min(i + 1, H.time.length - 1);
        const v = (key) => (H[key][i] ?? 0) * (1 - k) + (H[key][j] ?? 0) * k;
        const low = v("cloud_cover_low") / 100, mid = v("cloud_cover_mid") / 100, high = v("cloud_cover_high") / 100;
        const visKm = v("visibility") / 1000;
        const pct = Math.round((1 - (1 - low) * (1 - mid) * (1 - high)) * 100);
        // keep the METAR's ceiling for the low deck when we have one
        const lowBase = W.metar && W.metar.layers.find((L) => L.baseFt < 6500) ? W.metar.layers.find((L) => L.baseFt < 6500).baseFt : visKm < 4 ? 800 : 2500;
        return {
          low: low > 0.03 ? { cover: low, baseFt: lowBase } : null, mid: mid > 0.03 ? { cover: mid, baseFt: 12000 } : null,
          high: high > 0.03 ? { cover: high, baseFt: 28000 } : null, visKm, fog: visKm < 3,
          windDir: v("wind_direction_10m"), windKt: v("wind_speed_10m") / 1.852, label: `SFO forecast: ${pct}% cloud`, source: "forecast",
        };
      }
      return Object.assign(synthetic(t), { label: W.status === "loading" ? "" : "Clouds: made up (no weather data)", source: "synthetic" });
    },
  };
  W._parse = parseMetar; W._decks = decksFromMetar;
  root.Weather = W;
})(window);

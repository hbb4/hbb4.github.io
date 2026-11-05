/* The record: tiles, the latest pick, and four charts, all from data/record.json (written by
   python -m picks.src.site_record). When the file says "placeholder": true every number is shown as X's,
   so the layout can go up before the real numbers do. Charts are plain SVG; no libraries. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const EX = { kalshi: "Kalshi", polymarket_us: "Polymarket US", polymarket_global: "Polymarket" };
  const state = { exchange: "all", period: "all", slip: 0 };
  let doc = null;

  // ---------- formatting ----------
  const mask = (s) => (doc && doc.placeholder ? String(s).replace(/\d/g, "X") : String(s));
  const sign = (x) => (x > 0 ? "+" : x < 0 ? "−" : "");
  const fR = (x, d = 1) => mask(`${sign(x)}${Math.abs(x).toFixed(d)}R`);
  const fPct = (x, d = 0) => mask(`${(x * 100).toFixed(d)}%`);
  const fC = (x, d = 1) => mask(`${x.toFixed(d)}¢`);
  const fEdge = (x) => mask(`${sign(x)}${Math.abs(x).toFixed(1)}¢`);
  const fDeg = (x) => mask(`${(+x).toFixed(1)}°F`);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const LONG_M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fDate = (iso) => { const d = day(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"));
  const fLongDate = (iso) => { const d = day(iso); return `${DAYS[d.getUTCDay()]} ${LONG_M[d.getUTCMonth()]} ${ordinal(d.getUTCDate())}`; };
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- data ----------
  function profit(p) {
    // a tailer pays `slip` cents more per contract with the same dollars: fewer contracts, the same 1 R at risk
    if (p.outcome === "LOSS") return -1;
    if (p.outcome === "PUSH") return 0;
    if (state.slip && p.cost_cents) { const c = p.cost_cents + state.slip; return (100 - c) / c; }
    return +p.profit_r || 0;
  }
  function filtered() {
    let ps = doc.picks.filter((p) => p.outcome);
    if (state.exchange === "kalshi") ps = ps.filter((p) => p.exchange === "kalshi");
    if (state.exchange === "polymarket") ps = ps.filter((p) => (p.exchange || "").startsWith("polymarket"));
    if (state.period !== "all" && ps.length) {
      const last = day(doc.picks[doc.picks.length - 1].date);
      const from = state.period === "ytd" ? new Date(Date.UTC(last.getUTCFullYear(), 0, 1)) : new Date(last - (+state.period - 1) * 864e5);
      ps = ps.filter((p) => day(p.date) >= from);
    }
    return ps;
  }
  const marketTitle = (p) => `${p.city || ""} ${p.kind ? cap(p.kind) + " Temperature" : ""}`.trim();

  // ---------- svg helpers ----------
  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgFor(box, h) {
    box.innerHTML = "";
    const w = Math.max(280, box.clientWidth);
    const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, height: h, role: "img" }, box);
    const tip = document.createElement("div"); tip.className = "tip"; box.appendChild(tip);
    return { svg, w, h, tip };
  }
  function niceTicks(lo, hi, n = 4) {
    if (lo === hi) { lo -= 1; hi += 1; }
    const span = hi - lo, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 0.5);
    const t = []; for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) t.push(+v.toFixed(10));
    return t;
  }
  function showTip(c, html, x, y) {
    c.tip.innerHTML = html; c.tip.classList.add("on");
    const bw = c.tip.offsetWidth, bh = c.tip.offsetHeight, W = c.svg.clientWidth || c.w;
    let left = x + 14; if (left + bw > W) left = x - bw - 14; if (left < 0) left = Math.max(0, Math.min(W - bw, x - bw / 2));
    let top = y - bh - 10; if (top < 0) top = y + 14;
    c.tip.style.left = left + "px"; c.tip.style.top = top + "px";
  }
  const hideTip = (c) => c.tip.classList.remove("on");
  const resChip = (p) => `<span class="res"><i style="background:var(--${p.outcome === "WIN" ? "win" : "loss"})"></i>${p.outcome === "WIN" ? "Win" : p.outcome === "LOSS" ? "Loss" : "Push"}</span>`;
  function pickTip(p, extra = "") {
    return `<b>${esc(fDate(p.date))} · ${esc(marketTitle(p))}</b><br>${esc(p.side || "")} ${esc(mask(p.bin || ""))}${p.exchange ? " · " + esc(EX[p.exchange] || p.exchange) : ""}` +
      `<div class="row"><span>${resChip(p)}</span><span>${fR(profit(p), 2)}</span></div>` +
      (p.model_prob != null ? `<div class="row"><span>Our model</span><span>${fPct(p.model_prob, 1)}</span></div>` : "") +
      (p.cost_cents != null ? `<div class="row"><span>Price + fees</span><span>${fC(p.cost_cents)}</span></div>` : "") +
      (p.observed != null ? `<div class="row"><span>Observed</span><span>${esc(mask(Math.round(p.observed) + "°F"))}</span></div>` : "") + extra;
  }
  function watermark(c) {
    if (!doc.illustrative) return;
    const t = el("text", { x: c.w / 2, y: c.h / 2, "text-anchor": "middle", "dominant-baseline": "middle", class: "wm" }, c.svg);
    t.textContent = "ILLUSTRATIVE";
  }
  function yAxis(c, ticks, y, x0, x1, fmt) {
    const g = el("g", { class: "grid" }, c.svg);
    for (const v of ticks) {
      if (v !== 0) el("line", { x1: x0, x2: x1, y1: y(v), y2: y(v) }, g);
      const t = el("text", { x: x0 - 8, y: y(v), "text-anchor": "end", "dominant-baseline": "middle" }, c.svg);
      t.textContent = fmt(v);
    }
    if (ticks[0] <= 0 && ticks[ticks.length - 1] >= 0) el("line", { x1: x0, x2: x1, y1: y(0), y2: y(0), class: "zero" }, c.svg);
  }
  const roundTopRect = (x, y0, w, h, r, up) => {
    // a bar with a rounded data end (r) and a square baseline end; h > 0, grows up from y0 or down
    r = Math.min(r, h, w / 2);
    if (up) return `M${x},${y0}V${y0 - h + r}Q${x},${y0 - h} ${x + r},${y0 - h}H${x + w - r}Q${x + w},${y0 - h} ${x + w},${y0 - h + r}V${y0}Z`;
    return `M${x},${y0}V${y0 + h - r}Q${x},${y0 + h} ${x + r},${y0 + h}H${x + w - r}Q${x + w},${y0 + h} ${x + w},${y0 + h - r}V${y0}Z`;
  };

  // ---------- charts ----------
  function cumulative(ps) {
    const box = $("c-cum"), c = svgFor(box, 260);
    if (!ps.length) return empty(c);
    let run = 0; const pts = ps.map((p) => ({ p, v: (run += profit(p)) }));
    const m = { l: 52, r: 16, t: 14, b: 26 };
    const lo = Math.min(0, ...pts.map((d) => d.v)), hi = Math.max(0, ...pts.map((d) => d.v));
    const ticks = niceTicks(lo, hi);
    const y = (v) => m.t + (1 - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0])) * (c.h - m.t - m.b);
    const t0 = +day(ps[0].date), t1 = Math.max(t0 + 864e5, +day(ps[ps.length - 1].date));
    const x = (iso) => m.l + ((+day(iso) - t0) / (t1 - t0)) * (c.w - m.l - m.r);
    watermark(c);
    yAxis(c, ticks, y, m.l, c.w - m.r, (v) => fR(v, Number.isInteger(v) ? 0 : 1));
    // x labels: first, middle, last
    const xs = [ps[0], ps[Math.floor(ps.length / 2)], ps[ps.length - 1]];
    xs.forEach((p, i) => { const t = el("text", { x: x(p.date), y: c.h - 6, "text-anchor": ["start", "middle", "end"][i] }, c.svg); t.textContent = fDate(p.date); });
    const line = pts.map((d, i) => `${i ? "L" : "M"}${x(d.p.date).toFixed(1)},${y(d.v).toFixed(1)}`).join("");
    el("path", { d: `${line}L${x(ps[ps.length - 1].date)},${y(0)}L${x(ps[0].date)},${y(0)}Z`, fill: "var(--win)", "fill-opacity": 0.1 }, c.svg);
    el("path", { d: line, fill: "none", stroke: "var(--win)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, c.svg);
    const end = pts[pts.length - 1];
    el("circle", { cx: x(end.p.date), cy: y(end.v), r: 4.5, fill: "var(--win)", stroke: "var(--panel-solid)", "stroke-width": 2 }, c.svg);
    const ly = y(end.v) < m.t + 20 ? y(end.v) + 20 : y(end.v) - 12;
    const lab = el("text", { x: x(end.p.date) - 8, y: ly, "text-anchor": "end", class: "lbl-strong" }, c.svg);
    lab.textContent = fR(end.v, 1);
    // crosshair
    const hair = el("line", { y1: m.t, y2: c.h - m.b, class: "hair", visibility: "hidden" }, c.svg);
    const dot = el("circle", { r: 4.5, fill: "var(--win)", stroke: "var(--panel-solid)", "stroke-width": 2, visibility: "hidden" }, c.svg);
    const hit = el("rect", { x: m.l, y: 0, width: c.w - m.l - m.r, height: c.h, class: "hit" }, c.svg);
    const move = (e) => {
      const r = c.svg.getBoundingClientRect(), px = (e.clientX - r.left) * (c.w / r.width);
      let best = pts[0], bd = Infinity;
      for (const d of pts) { const dd = Math.abs(x(d.p.date) - px); if (dd <= bd) { bd = dd; best = d; } }
      const bx = x(best.p.date), by = y(best.v);
      hair.setAttribute("x1", bx); hair.setAttribute("x2", bx); hair.setAttribute("visibility", "visible");
      dot.setAttribute("cx", bx); dot.setAttribute("cy", by); dot.setAttribute("visibility", "visible");
      showTip(c, pickTip(best.p, `<div class="row"><span>Running total</span><span>${fR(best.v, 2)}</span></div>`), bx * (r.width / c.w), by * (r.height / c.h));
    };
    hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { hair.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip(c); });
  }

  function everyPick(ps) {
    const box = $("c-picks"), c = svgFor(box, 200);
    if (!ps.length) return empty(c);
    const m = { l: 52, r: 16, t: 12, b: 22 };
    const vals = ps.map(profit);
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 3);
    const y = (v) => m.t + (1 - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0])) * (c.h - m.t - m.b);
    watermark(c);
    yAxis(c, ticks, y, m.l, c.w - m.r, (v) => fR(v, Number.isInteger(v) ? 0 : 1));
    const slot = (c.w - m.l - m.r) / ps.length, bw = Math.max(1.5, Math.min(24, slot - 2));
    const y0 = y(0);
    ps.forEach((p, i) => {
      const v = vals[i], bx = m.l + i * slot + (slot - bw) / 2, h = Math.max(1, Math.abs(y(v) - y0));
      el("path", { d: roundTopRect(bx, y0, bw, h, Math.min(4, bw / 2), v >= 0), fill: v >= 0 ? "var(--win)" : "var(--loss)" }, c.svg);
      const hit = el("rect", { x: m.l + i * slot, y: m.t, width: slot, height: c.h - m.t - m.b, class: "hit" }, c.svg);
      const show = () => { const r = c.svg.getBoundingClientRect(); showTip(c, pickTip(p), (bx + bw / 2) * (r.width / c.w), Math.min(y(v), y0) * (r.height / c.h)); };
      hit.addEventListener("pointerenter", show); hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => hideTip(c));
    });
    const t0 = el("text", { x: m.l, y: c.h - 4 }, c.svg); t0.textContent = fDate(ps[0].date);
    const t1 = el("text", { x: c.w - m.r, y: c.h - 4, "text-anchor": "end" }, c.svg); t1.textContent = fDate(ps[ps.length - 1].date);
  }

  function byCity(ps) {
    const box = $("c-city");
    const groups = {};
    for (const p of ps) { if (!p.city) continue; const g = (groups[p.city] ||= { city: p.city, r: 0, w: 0, l: 0, n: 0 }); g.r += profit(p); g.n++; if (p.outcome === "WIN") g.w++; if (p.outcome === "LOSS") g.l++; }
    const rows = Object.values(groups).sort((a, b) => b.r - a.r).slice(0, 10);
    const rowH = 28, m = { l: 108, r: 96, t: 6, b: 6 };
    const c = svgFor(box, Math.max(120, m.t + m.b + rows.length * rowH));
    if (!rows.length) return empty(c);
    const lo = Math.min(0, ...rows.map((r) => r.r)), hi = Math.max(0, ...rows.map((r) => r.r));
    const x = (v) => m.l + ((v - lo) / (hi - lo || 1)) * (c.w - m.l - m.r);
    watermark(c);
    el("line", { x1: x(0), x2: x(0), y1: m.t, y2: c.h - m.b, class: "zero" }, c.svg);
    rows.forEach((r, i) => {
      const cy = m.t + i * rowH + rowH / 2, bh = Math.min(16, rowH - 8), up = r.r >= 0;
      const len = Math.max(1, Math.abs(x(r.r) - x(0)));
      // horizontal bar: square at zero, rounded at the data end
      const x0 = x(0), rr = Math.min(4, len, bh / 2);
      const d = up
        ? `M${x0},${cy - bh / 2}H${x0 + len - rr}Q${x0 + len},${cy - bh / 2} ${x0 + len},${cy - bh / 2 + rr}V${cy + bh / 2 - rr}Q${x0 + len},${cy + bh / 2} ${x0 + len - rr},${cy + bh / 2}H${x0}Z`
        : `M${x0},${cy - bh / 2}H${x0 - len + rr}Q${x0 - len},${cy - bh / 2} ${x0 - len},${cy - bh / 2 + rr}V${cy + bh / 2 - rr}Q${x0 - len},${cy + bh / 2} ${x0 - len + rr},${cy + bh / 2}H${x0}Z`;
      el("path", { d, fill: up ? "var(--win)" : "var(--loss)" }, c.svg);
      const name = el("text", { x: m.l - 10, y: cy, "text-anchor": "end", "dominant-baseline": "middle", class: "lbl" }, c.svg);
      name.textContent = r.city;
      const v = el("text", { x: (up ? x0 + len : x0) + 8, y: cy, "dominant-baseline": "middle", class: "lbl" }, c.svg);
      v.textContent = `${fR(r.r, 1)} · ${mask(`${r.w}-${r.l}`)}`;
      const hit = el("rect", { x: 0, y: cy - rowH / 2, width: c.w, height: rowH, class: "hit" }, c.svg);
      const show = () => { const b = c.svg.getBoundingClientRect(); showTip(c, `<b>${esc(r.city)}</b><div class="row"><span>Record</span><span>${mask(`${r.w}-${r.l}`)}</span></div><div class="row"><span>Win rate</span><span>${fPct(r.w / Math.max(1, r.w + r.l))}</span></div><div class="row"><span>Net</span><span>${fR(r.r, 2)}</span></div>`, x(r.r) * (b.width / c.w), cy * (b.height / c.h)); };
      hit.addEventListener("pointerenter", show); hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => hideTip(c));
    });
  }

  function calibration(ps) {
    const box = $("c-cal"), c = svgFor(box, 280);
    const edges = [0, 0.4, 0.5, 0.6, 0.8, 0.9, 0.95, 1.0001];
    const bins = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const g = ps.filter((p) => p.model_prob != null && p.outcome !== "PUSH" && p.model_prob >= edges[i] && p.model_prob < edges[i + 1]);
      if (g.length) bins.push({ n: g.length, model: g.reduce((s, p) => s + p.model_prob, 0) / g.length, won: g.filter((p) => p.outcome === "WIN").length / g.length });
    }
    if (!bins.length) return empty(c);
    const m = { l: 52, r: 16, t: 12, b: 36 };
    const lo = Math.max(0, Math.floor(Math.min(...bins.map((b) => Math.min(b.model, b.won))) * 10) / 10 - 0.1);
    const s = (v) => (v - lo) / (1 - lo);
    const x = (v) => m.l + s(v) * (c.w - m.l - m.r), y = (v) => c.h - m.b - s(v) * (c.h - m.t - m.b);
    watermark(c);
    const ticks = niceTicks(lo, 1, 4).filter((v) => v >= lo && v <= 1);
    const g = el("g", { class: "grid" }, c.svg);
    for (const v of ticks) {
      el("line", { x1: m.l, x2: c.w - m.r, y1: y(v), y2: y(v) }, g);
      const ty = el("text", { x: m.l - 8, y: y(v), "text-anchor": "end", "dominant-baseline": "middle" }, c.svg); ty.textContent = fPct(v);
      const tx = el("text", { x: x(v), y: c.h - m.b + 16, "text-anchor": "middle" }, c.svg); tx.textContent = fPct(v);
    }
    const xl = el("text", { x: (m.l + c.w - m.r) / 2, y: c.h - 2, "text-anchor": "middle" }, c.svg); xl.textContent = "model's probability for the side taken";
    el("line", { x1: x(lo), y1: y(lo), x2: x(1), y2: y(1), stroke: "var(--line-2)", "stroke-width": 1 }, c.svg);
    const maxN = Math.max(...bins.map((b) => b.n));
    for (const b of bins) {
      const r = 4.5 + 6 * Math.sqrt(b.n / maxN);
      const dot = el("circle", { cx: x(b.model), cy: y(b.won), r, fill: "var(--win)", stroke: "var(--panel-solid)", "stroke-width": 2 }, c.svg);
      const hit = el("circle", { cx: x(b.model), cy: y(b.won), r: r + 10, class: "hit" }, c.svg);
      const show = () => { const bb = c.svg.getBoundingClientRect(); showTip(c, `<b>${mask(b.n)} picks</b><div class="row"><span>Model said</span><span>${fPct(b.model, 1)}</span></div><div class="row"><span>Won</span><span>${fPct(b.won, 1)}</span></div>`, x(b.model) * (bb.width / c.w), y(b.won) * (bb.height / c.h)); dot.setAttribute("r", r + 1.5); };
      hit.addEventListener("pointerenter", show); hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => { hideTip(c); dot.setAttribute("r", r); });
    }
  }

  function empty(c) {
    const t = el("text", { x: c.w / 2, y: c.h / 2, "text-anchor": "middle", class: "lbl" }, c.svg);
    t.textContent = "No settled picks in this range yet";
  }

  // ---------- tiles, latest pick, table ----------
  function tiles(ps) {
    const w = ps.filter((p) => p.outcome === "WIN").length, l = ps.filter((p) => p.outcome === "LOSS").length, pu = ps.length - w - l;
    const r = ps.reduce((s, p) => s + profit(p), 0);
    const edges = ps.filter((p) => p.edge_cents != null);
    const per = { all: "since " + (ps[0] ? fDate(ps[0].date) : "—"), ytd: "year to date", 30: "last 30 days", 90: "last 90 days" }[state.period];
    $("t-record").textContent = mask(`${w}-${l}${pu ? "-" + pu : ""}`);
    $("t-record-foot").textContent = `${mask(ps.length)} settled picks`;
    $("t-wr").textContent = w + l ? fPct(w / (w + l)) : "—";
    $("t-wr-foot").textContent = per;
    $("t-r").textContent = fR(r, 1);
    $("t-r-foot").textContent = state.slip ? `tailing at +${state.slip}¢ a contract` : per;
    $("t-edge").textContent = edges.length ? fEdge(edges.reduce((s, p) => s + p.edge_cents, 0) / edges.length) : "—";
  }

  function latest() {
    const p = doc.latest; if (!p) return;
    $("latest").hidden = false;
    $("pc-title").textContent = `${marketTitle(p)}${p.target_date ? " on " + fLongDate(p.target_date) : ""}`;
    const side = $("pc-side"); side.textContent = p.side || ""; side.className = "bubble " + (p.side || "").toLowerCase();
    $("pc-bin").textContent = mask(p.bin || "");
    $("pc-model").textContent = p.model_prob != null ? fPct(p.model_prob, 1) : "—";
    $("pc-cost").textContent = p.cost_cents != null ? fC(p.cost_cents) : "—";
    $("pc-edge").textContent = p.edge_cents != null ? fEdge(p.edge_cents) : "—";
    $("pc-ex").textContent = [EX[p.exchange] || p.exchange, p.date && "posted " + fDate(p.date)].filter(Boolean).join(" · ");
    const m = /(-?\d+)\s*-\s*(-?\d+)/.exec(p.bin || "");
    if (p.blend_mean != null && m) {
      const where = p.blend_mean < +m[1] ? "below this range" : p.blend_mean > +m[2] + 0.99 ? "above this range" : "inside this range";
      $("pc-line").innerHTML = `We forecast <b>${esc(fDeg(p.blend_mean))}</b>, ${where}` + (p.market_consensus != null ? `; the market's consensus is ${esc(fDeg(p.market_consensus))}.` : ".");
    }
  }

  function table(ps) {
    const t = $("t-all");
    t.tHead.innerHTML = "<tr><th>Date</th><th>Market</th><th>Side</th><th>Exchange</th><th class=n>Model</th><th class=n>Price + fees</th><th class=n>Edge</th><th class=n>Observed</th><th>Result</th><th class=n>R</th></tr>";
    t.tBodies[0].innerHTML = ps.slice().reverse().map((p) => `<tr><td>${esc(fDate(p.date))}</td><td>${esc(marketTitle(p))}</td><td>${esc(p.side || "")} ${esc(mask(p.bin || ""))}</td><td>${esc(EX[p.exchange] || p.exchange || "")}</td>` +
      `<td class=n>${p.model_prob != null ? fPct(p.model_prob, 1) : ""}</td><td class=n>${p.cost_cents != null ? fC(p.cost_cents) : ""}</td><td class=n>${p.edge_cents != null ? fEdge(p.edge_cents) : ""}</td>` +
      `<td class=n>${p.observed != null ? esc(mask(Math.round(p.observed) + "°F")) : ""}</td><td>${resChip(p)}</td><td class=n>${fR(profit(p), 2)}</td></tr>`).join("");
  }

  function render() {
    const ps = filtered();
    tiles(ps); cumulative(ps); everyPick(ps); table(ps);
    if (!doc.picks.some((p) => p.city)) document.querySelector('[data-needs="city"]').hidden = true; else byCity(ps);
    if (!doc.picks.some((p) => p.model_prob != null)) document.querySelector('[data-needs="model_prob"]').hidden = true; else calibration(ps);
  }

  // ---------- controls ----------
  document.querySelectorAll(".seg").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      const k = seg.dataset.key; state[k] = k === "slip" ? +b.dataset.v : b.dataset.v;
      if (doc) render();
    });
  });
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => doc && render(), 120); });

  fetch("data/record.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
    doc = d;
    $("record-notice").hidden = !(d.illustrative || d.placeholder);
    if (d.updated) $("t-updated").textContent = `Updated ${fDate(d.updated)}.`;
    latest(); render();
  }).catch(() => {
    $("tiles").insertAdjacentHTML("afterend", '<p class="fine">The record could not be loaded. Open the page through a web server (python3 -m http.server), not as a file.</p>');
  });
})();

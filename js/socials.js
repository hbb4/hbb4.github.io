/* Social links from data/socials.json: the icon row at the foot of the home page (the groups marked
   "footer", each icon opening that account's card on socials.html), and the full list on socials.html. */
(() => {
  "use strict";
  const icon = (k, size) => {
    const d = (window.WX_ICONS || {})[k];
    return d ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>` : "";
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const safeUrl = (u) => (/^https:\/\//.test(u) ? u : "#");
  fetch("data/socials.json").then((r) => r.json()).then((d) => {
    const groups = (d.groups || []).filter((g) => g.accounts && g.accounts.length);
    const row = document.getElementById("social-row");
    if (row) {
      row.innerHTML = groups.filter((g) => g.footer).flatMap((g) => g.accounts.map((a) =>
        `<a href="socials.html#${esc(g.id)}-${esc(a.platform)}" title="${esc(a.name)} ${esc(a.handle)}" aria-label="${esc(a.name)}">${icon(a.platform, 18)}</a>`)).join("") +
        `<a class="all" href="socials.html">All accounts</a>`;
    }
    const list = document.getElementById("social-list");
    if (list) {
      list.innerHTML = groups.map((g) => `<section class="sg" id="${esc(g.id)}"><h2>${esc(g.title)}</h2>${g.blurb ? `<p class="tag">${esc(g.blurb)}</p>` : ""}<ul class="cards">` +
        g.accounts.map((a) => `<li id="${esc(g.id)}-${esc(a.platform)}"><a class="card" href="${esc(safeUrl(a.url))}" rel="noopener me">` +
          `<span class="ic">${icon(a.platform, 22)}</span><span class="who"><b>${esc(a.name)}</b><span>${esc(a.handle)}</span></span>` +
          `<svg class="arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7 17 17 7M9 7h8v8"/></svg></a></li>`).join("") +
        `</ul></section>`).join("");
      if (location.hash) { const el = document.querySelector(location.hash.replace(/[^#\w-]/g, "")); if (el) { el.classList.add("hl"); el.scrollIntoView({ block: "center" }); } }
    }
  }).catch(() => {});
})();

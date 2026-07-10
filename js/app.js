/* ============================================================================
 * ChargeGap Europe — UI layer (no framework)
 * Views: Dashboard · Compare · Analytics · Model Audit — all reactive to the
 * selected market and the scenario cockpit; Analytics additionally reacts to
 * its own panel-builder controls.
 * ========================================================================== */
(function () {
  "use strict";
  const DATA = window.CG_DATA, M = window.CGModel;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const CODES = DATA.countries.map(c => c.code);

  /* ── state ─────────────────────────────────────────────────────────── */
  const PRESETS = {
    baseline:   { label: "Conservative baseline", intensity: 0.30, acEff: 0.13, dcEff: 0.09, speed: 1.0 },
    urban:      { label: "Urban shift (workbook demo)", intensity: 0.80, acEff: 0.13, dcEff: 0.09, speed: 1.3 },
    boom:       { label: "Boom", intensity: 0.80, acEff: 0.20, dcEff: 0.25, speed: 1.5 },
    stagnation: { label: "Stagnation", intensity: 0.30, acEff: 0.10, dcEff: 0.09, speed: 0.5 }
  };
  const state = {
    country: "DE",
    params: { ...PRESETS.urban },
    invest: { ...M.INVEST_DEFAULTS },
    tab: "dashboard",
    sort: { key: "score", dir: -1 },
    site: { preset: "hpc150", region: "de", inputs: { ...M.SITE_PRESETS.hpc150, ...M.AFIR_DEFAULTS } },
    map: { mode: "eu", metric: "revGap", sel: null }
  };

  /* ── scenario permalinks: #tab/CC/i80ac13dc9s130[/x6t2c4000k1o300e20l4y26]
     Segment 4 (optional, v3.1) encodes the AFIR-2027 terminal inputs:
       x = flag bits (pubAccess·4 + preAfir·2 + tenvOrSecure·1, 0–7)
       t = terminal cost line (0 off · 1 on · 2 auto)
       c = termCapex €  ·  k = termPoints  ·  o = termOpexYr €
       e = termTxFee ×10 (20 = 2.0%)  ·  l = termLife yrs  ·  y = termYear−2000
     Omitted when all ten values sit at their defaults, so pre-v3.1 links
     stay valid and unchanged. Mapping documented in Model Audit. ────────── */
  function encodeParams(p) {
    const n = v => Math.round(v * 100);
    return `i${n(p.intensity)}ac${n(p.acEff)}dc${n(p.dcEff)}s${n(p.speed)}`;
  }
  function decodeParams(str) {
    const m = /^i(\d+)ac(\d+)dc(\d+)s(\d+)$/.exec(str || "");
    if (!m) return null;
    return { intensity: +m[1] / 100, acEff: +m[2] / 100, dcEff: +m[3] / 100, speed: +m[4] / 100 };
  }
  function encodeAfir(inp) {
    const i = { ...M.AFIR_DEFAULTS, ...inp };
    const bits = (i.pubAccess ? 4 : 0) + (i.preAfir ? 2 : 0) + (i.tenvOrSecure ? 1 : 0);
    const t = (i.termOn === null || i.termOn === undefined) ? 2 : (i.termOn ? 1 : 0);
    return `x${bits}t${t}c${Math.round(i.termCapex)}k${Math.round(i.termPoints)}` +
           `o${Math.round(i.termOpexYr)}e${Math.round(i.termTxFee * 10)}` +
           `l${Math.round(i.termLife)}y${i.termYear - 2000}`;
  }
  function decodeAfir(str) {
    const m = /^x([0-7])t([012])c(\d+)k(\d+)o(\d+)e(\d+)l(\d+)y(\d+)$/.exec(str || "");
    if (!m) return null;
    return { pubAccess: !!(+m[1] & 4), preAfir: !!(+m[1] & 2), tenvOrSecure: !!(+m[1] & 1),
             termOn: +m[2] === 2 ? null : +m[2] === 1,
             termCapex: +m[3], termPoints: +m[4], termOpexYr: +m[5],
             termTxFee: +m[6] / 10, termLife: +m[7], termYear: 2000 + +m[8] };
  }
  const afirAtDefaults = () =>
    encodeAfir(state.site.inputs) === encodeAfir(M.AFIR_DEFAULTS);
  (function readHash() {
    const h = location.hash.replace("#", "").split("/");
    if (h[0] === "analytics") h[0] = "site";               // legacy links
    if (["dashboard", "compare", "map", "site", "audit"].includes(h[0])) state.tab = h[0];
    if (h[1] && CODES.includes(h[1])) state.country = h[1];
    const p = decodeParams(h[2]);
    if (p) state.params = p;
    const seg4 = (h[3] || "").split("~");
    const a = decodeAfir(seg4[0]);
    if (a) Object.assign(state.site.inputs, a);
    if (seg4[1] && M.SITE_REGIONS[seg4[1]]) state.site.region = seg4[1];
  })();
  function writeHash() {
    const rg = state.site.region !== "de" ? "~" + state.site.region : "";
    const seg4 = (!afirAtDefaults() || rg)
      ? `/${encodeAfir(state.site.inputs)}${rg}` : "";
    const h = `#${state.tab}/${state.country}/${encodeParams(state.params)}` + seg4;
    history.replaceState(null, "", h);
  }

  const cty = () => DATA.countries.find(c => c.code === state.country);

  /* ── formatting ────────────────────────────────────────────────────── */
  const fmtEur = v => {
    const a = Math.abs(v);
    if (a >= 1e9) return "€" + (v / 1e9).toLocaleString("en", { maximumFractionDigits: 1 }) + " bn";
    if (a >= 1e6) return "€" + (v / 1e6).toLocaleString("en", { maximumFractionDigits: 0 }) + " m";
    if (a >= 1e3) return "€" + (v / 1e3).toLocaleString("en", { maximumFractionDigits: 0 }) + " k";
    return "€" + v.toLocaleString("en", { maximumFractionDigits: 0 });
  };
  const fmtN = v => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toLocaleString("en", { maximumFractionDigits: 2 }) + " M";
    if (a >= 1e3) return (v / 1e3).toLocaleString("en", { maximumFractionDigits: 0 }) + " k";
    return Math.round(v).toLocaleString("en");
  };
  const fmtGWh = v => Math.abs(v) >= 1000
    ? (v / 1000).toLocaleString("en", { maximumFractionDigits: 1 }) + " TWh"
    : v.toLocaleString("en", { maximumFractionDigits: 0 }) + " GWh";
  const pct = v => (v * 100).toLocaleString("en", { maximumFractionDigits: 0 }) + "%";
  const stars = p => p < 0.001 ? "★★★" : p < 0.01 ? "★★" : p < 0.05 ? "★" : p < 0.10 ? "✦" : "";

  /* ── Chart.js theme ────────────────────────────────────────────────── */
  const COL = { acid: "#B6FF3C", supply: "#5AC8FF", warn: "#FFB454",
                ink3: "rgba(245,245,245,0.46)", line: "rgba(245,245,245,0.08)" };
  Chart.defaults.color = COL.ink3;
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.font.size = 10;
  Chart.defaults.borderColor = COL.line;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.animation.duration =
    (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? 0 : 300;

  const charts = {};
  function upsertChart(id, cfg) {
    if (charts[id]) { charts[id].data = cfg.data; charts[id].options = cfg.options; charts[id].update(); }
    else charts[id] = new Chart($("#" + id), cfg);
  }
  const projSeg = { borderDash: ctx => (ctx.p0DataIndex >= 8 ? [5, 4] : undefined) }; // dash 2026–2030

  /* ── country pills ─────────────────────────────────────────────────── */
  function renderCountries() {
    $("#countries").innerHTML = DATA.countries.map(c =>
      `<button class="cpill ${c.code === state.country ? "active" : ""}" data-c="${c.code}">${c.flag} ${c.name}${c.quality === "verified" ? " ·✓" : ""}</button>`
    ).join("");
    $$("#countries .cpill").forEach(b => b.onclick = () => { state.country = b.dataset.c; sync(); });
  }

  /* ── cockpit ───────────────────────────────────────────────────────── */
  const SLIDERS = [
    { key: "intensity", label: "Urban Business Intensity", min: 0.10, max: 0.80, step: 0.05, fmt: pct, hist: "history locked at 30%" },
    { key: "acEff", label: "AC Asset Efficiency", min: 0.05, max: 0.30, step: 0.01, fmt: pct, hist: "history locked at 6%" },
    { key: "dcEff", label: "DC/HPC Asset Efficiency", min: 0.05, max: 0.40, step: 0.01, fmt: pct, hist: "history locked at 20%" },
    { key: "speed", label: "Market Adoption Speed", min: 0.5, max: 1.5, step: 0.1, fmt: v => v.toFixed(1) + "×", hist: "history locked at 1.0×" }
  ];
  function paramsChanged() {
    markPreset(); writeHash();
    if (state.tab === "dashboard") renderDashboard();
    if (state.tab === "compare") renderCompare();
    if (state.tab === "audit") renderAudit();
  }
  function renderCockpit() {
    $("#sliders").innerHTML = SLIDERS.map(s => `
      <div class="sl">
        <label for="sl-${s.key}">${s.label} <output id="out-${s.key}">${s.fmt(state.params[s.key])}</output></label>
        <input id="sl-${s.key}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${state.params[s.key]}" aria-label="${s.label}">
        <div class="scale"><span>${s.fmt(s.min)}</span><span>${s.hist}</span><span>${s.fmt(s.max)}</span></div>
      </div>`).join("");
    SLIDERS.forEach(s => {
      $("#sl-" + s.key).addEventListener("input", e => {
        state.params[s.key] = parseFloat(e.target.value);
        $("#out-" + s.key).textContent = s.fmt(state.params[s.key]);
        paramsChanged();
      });
    });
    $("#presets").innerHTML = Object.entries(PRESETS).map(([k, p]) =>
      `<button data-p="${k}">${p.label}</button>`).join("");
    $$("#presets button").forEach(b => b.onclick = () => {
      const p = PRESETS[b.dataset.p];
      SLIDERS.forEach(s => { state.params[s.key] = p[s.key]; $("#sl-" + s.key).value = p[s.key]; $("#out-" + s.key).textContent = s.fmt(p[s.key]); });
      paramsChanged();
    });
    markPreset();
    $("#copyLink").onclick = () => {
      writeHash();
      const url = location.href;
      const done = () => { const b = $("#copyLink"); const t = b.textContent; b.textContent = "✓ Link copied"; setTimeout(() => b.textContent = t, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt("Copy this scenario link:", url));
      else prompt("Copy this scenario link:", url);
    };
  }
  function markPreset() {
    $$("#presets button").forEach(b => {
      const p = PRESETS[b.dataset.p];
      b.classList.toggle("on", SLIDERS.every(s => Math.abs(p[s.key] - state.params[s.key]) < 1e-9));
    });
  }

  /* ── dashboard ─────────────────────────────────────────────────────── */
  function renderDashboard() {
    const c = cty(), sc = M.buildScenario(c, state.params);
    const r = sc.kpi.y2030, rows = sc.rows, years = rows.map(x => x.year);
    const gapPositive = r.gapGWh > 0;
    const gapYear = M.firstYear(rows, x => x.gapGWh > 0);
    const afirBreach = M.firstYear(rows, x => x.afir < M.C.AFIR_MIN);

    $("#kpis").innerHTML = `
      <div class="kpi star">
        <div class="l">★ Revenue Opportunity Gap · 2030</div>
        <div class="v ${gapPositive ? "" : "cool"}">${fmtEur(Math.abs(r.revGap))}${gapPositive ? "" : " surplus"}</div>
        <div class="s">${gapPositive
          ? `${fmtGWh(r.gapGWh)} of addressable demand unserved at €${M.C.PRICE_EUR_KWH.toFixed(2)}/kWh blended` +
            (gapYear ? ` · structural undersupply begins <b>${gapYear}</b>` : "")
          : `supply capacity exceeds addressable demand by ${fmtGWh(-r.gapGWh)} under this scenario`}
          · <a class="alink" data-goto="audit">audit this number →</a></div>
      </div>
      <div class="kpi">
        <div class="l">Unmet Revenue · 2026–30 cum.</div>
        <div class="v ${sc.kpi.cumUnmet26_30 > 0 ? "warn" : "cool"}">${fmtEur(sc.kpi.cumUnmet26_30)}</div>
        <div class="s">Σ max(gap, 0) × €0.50/kWh</div>
      </div>
      <div class="kpi">
        <div class="l">AFIR Compliance Index · 2030</div>
        <div class="v ${r.afir >= M.C.AFIR_MIN ? "" : r.afir >= 1.0 ? "warn" : "bad"}">${r.afir.toFixed(2)}</div>
        <div class="s">kW installed / BEV · <span class="badge ${r.afir >= M.C.AFIR_MIN ? "ok" : r.afir >= 1.0 ? "risk" : "bad"}">${r.afir >= M.C.AFIR_MIN ? "compliant ≥1.3" : r.afir >= 1.0 ? "at risk" : "non-compliant"}</span>${afirBreach ? ` · first breach <b>${afirBreach}</b>` : ""}</div>
      </div>
      <div class="kpi">
        <div class="l">Infrastructure Sufficiency · 2030</div>
        <div class="v ${r.sufficiency >= 1 ? "" : "warn"}">${pct(r.sufficiency)}</div>
        <div class="s">${fmtN(r.points)} points vs ${fmtN(r.requiredPlugs)} required</div>
      </div>
      <div class="kpi">
        <div class="l">EVs per Charging Point · 2030</div>
        <div class="v">${r.evPerPoint.toFixed(1)}</div>
        <div class="s">fleet ${fmtN(r.fleet)}${r.evShare ? " · " + pct(r.evShare) + " of all cars" : ""}</div>
      </div>
      <div class="kpi">
        <div class="l">Demand vs Supply · 2030</div>
        <div class="v">${fmtGWh(r.addressable)}</div>
        <div class="s">addressable CPO demand vs <span style="color:var(--supply)">${fmtGWh(r.supply)}</span> supply</div>
      </div>`;
    $$("#kpis .alink").forEach(a => a.onclick = () => { state.tab = a.dataset.goto; sync(); });

    // fleet chart
    upsertChart("chFleet", {
      type: "line",
      data: { labels: years, datasets: [{
        label: "BEV fleet" + (state.params.speed !== 1 ? ` (×${state.params.speed.toFixed(1)} speed)` : ""),
        data: rows.map(x => x.fleet), borderColor: COL.acid, backgroundColor: "rgba(182,255,60,0.08)",
        fill: true, tension: 0.3, pointRadius: 2, segment: projSeg
      }, ...(state.params.speed !== 1 ? [{
        label: "base trajectory (1.0×)", data: rows.map(x => x.fleetBase),
        borderColor: COL.ink3, borderDash: [2, 3], pointRadius: 0, tension: 0.3, fill: false
      }] : [])] },
      options: { maintainAspectRatio: false, scales: { y: { ticks: { callback: v => fmtN(v) } } },
        plugins: { tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmtN(i.parsed.y)}` } } } }
    });

    // demand vs supply
    upsertChart("chGap", {
      type: "line",
      data: { labels: years, datasets: [
        { label: "Addressable CPO demand", data: rows.map(x => x.addressable), borderColor: COL.acid, pointRadius: 2, tension: 0.3, segment: projSeg, fill: false },
        { label: "Supply capacity", data: rows.map(x => x.supply), borderColor: COL.supply, pointRadius: 2, tension: 0.3, segment: projSeg,
          fill: { target: 0, above: "rgba(90,200,255,0.10)", below: "rgba(255,180,84,0.16)" } },
        { label: "National fleet demand", data: rows.map(x => x.demandNat), borderColor: "rgba(245,245,245,0.25)", borderDash: [2, 3], pointRadius: 0, tension: 0.3, fill: false }
      ] },
      options: { maintainAspectRatio: false, scales: { y: { title: { display: true, text: "GWh / yr" }, ticks: { callback: v => fmtN(v) } } },
        plugins: { tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmtGWh(i.parsed.y)}` } } } }
    });

    // AFIR
    upsertChart("chAfir", {
      type: "line",
      data: { labels: years, datasets: [
        { label: "kW installed per BEV", data: rows.map(x => x.afir), borderColor: COL.acid, pointRadius: 2, tension: 0.3, segment: projSeg, fill: false },
        { label: "AFIR minimum (1.3)", data: years.map(() => M.C.AFIR_MIN), borderColor: COL.warn, borderDash: [6, 4], pointRadius: 0, fill: false }
      ] },
      options: { maintainAspectRatio: false, scales: { y: { suggestedMin: 0 } },
        plugins: { tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${i.parsed.y.toFixed(2)} kW/BEV` } } } }
    });

    // plugs required vs actual
    upsertChart("chPlugs", {
      type: "bar",
      data: { labels: years, datasets: [
        { type: "bar", label: "Charging points (actual / planned)", data: rows.map(x => x.points), backgroundColor: rows.map(x => x.hist ? "rgba(90,200,255,0.55)" : "rgba(90,200,255,0.25)"), borderColor: COL.supply, borderWidth: 1 },
        { type: "line", label: "Required plugs (scenario)", data: rows.map(x => x.requiredPlugs), borderColor: COL.acid, pointRadius: 2, tension: 0.3, segment: projSeg, fill: false }
      ] },
      options: { maintainAspectRatio: false, scales: { y: { ticks: { callback: v => fmtN(v) } } },
        plugins: { tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${fmtN(i.parsed.y)}` } } } }
    });

    renderTicket(c, sc);

    $("#srcnote").innerHTML =
      `<b>${c.flag} ${c.name}</b> · data quality: <b>${c.quality}</b> · fleet 2026–30: ${sc.kpi.fleetMode}${c.fleet_target_note ? " (" + c.fleet_target_note + ")" : ""} · chargers 2026–30: ${sc.kpi.chargerMode}${c.network_target_note ? " (" + c.network_target_note + ")" : ""}<br>Sources: ${c.sources.join(" · ")} · Dashed segments = 2026–2030 projection. History (2017–2025) is locked and never moves with the sliders.`;
  }

  /* ── build-out ticket ──────────────────────────────────────────────── */
  function renderTicket(c, sc) {
    const inv = M.investCase(sc, state.invest);
    const head = `<h3>CPO build-out ticket <em>close the ${c.code} gap by 2030</em></h3>
      <div class="sub">Planning heuristic from 'C_Required_Total_Plugs' — adjust the cost assumptions to your own base · not investment advice</div>`;
    if (inv.oversupplied) {
      $("#ticket").innerHTML = head + `
        <div class="callout" style="margin:0.5rem 0 0.2rem">Under this scenario, <b>${c.flag} ${c.name}</b> is oversupplied — planned capacity already exceeds addressable demand. No gap-closing build-out is required; the levers here are <b>utilisation</b> (efficiency sliders), <b>pricing</b>, or capturing a larger urban share — not more plugs.</div>`;
      return;
    }
    const a = inv.assumptions;
    $("#ticket").innerHTML = head + `
      <div class="ticket-grid">
        <div class="tk"><div class="l">Additional plugs needed</div><div class="v">${fmtN(inv.extraPlugs)}</div><div class="s">${fmtN(inv.acNew)} AC · ${fmtN(inv.dcNew)} DC (80/20 split)</div></div>
        <div class="tk"><div class="l">Capex</div><div class="v warn">${fmtEur(inv.capex)}</div><div class="s">at the assumptions below</div></div>
        <div class="tk"><div class="l">Energy served / yr</div><div class="v cool">${fmtGWh(inv.servedGWh)}</div><div class="s">new capacity ${fmtGWh(inv.newCapGWh)}, capped by the unserved gap</div></div>
        <div class="tk"><div class="l">Revenue / yr</div><div class="v">${fmtEur(inv.revenue)}</div><div class="s">at €${M.C.PRICE_EUR_KWH.toFixed(2)}/kWh blended</div></div>
        <div class="tk"><div class="l">Simple payback</div><div class="v ${inv.payback <= 8 ? "" : "warn"}">${isFinite(inv.payback) ? inv.payback.toFixed(1) + " yrs" : "—"}</div><div class="s">capex ÷ (revenue × margin)</div></div>
      </div>
      <div class="tk-assum">
        <label>Capex / AC point € <input id="tkAC" type="number" min="1000" step="500" value="${a.capexAC}"></label>
        <label>Capex / DC point € <input id="tkDC" type="number" min="10000" step="5000" value="${a.capexDC}"></label>
        <label>Contribution margin <input id="tkM" type="number" min="5" max="60" step="5" value="${Math.round(a.margin * 100)}"> %</label>
      </div>`;
    const re = () => {
      state.invest = {
        capexAC: Math.max(+$("#tkAC").value || 0, 0),
        capexDC: Math.max(+$("#tkDC").value || 0, 0),
        margin: Math.min(Math.max((+$("#tkM").value || 0) / 100, 0.01), 0.9)
      };
      renderTicket(c, sc);
    };
    ["tkAC", "tkDC", "tkM"].forEach(id => $("#" + id).addEventListener("change", re));
  }

  /* ── compare ───────────────────────────────────────────────────────── */
  function renderCompare() {
    const scores = M.opportunityScores(DATA, state.params);
    const rows = DATA.countries.map(c => {
      const sc = M.buildScenario(c, state.params), r = sc.kpi.y2030, s = scores[c.code];
      return { code: c.code, name: c.name, flag: c.flag, quality: c.quality,
        score: s.score, parts: s.parts,
        revGap: r.revGap, cum: sc.kpi.cumUnmet26_30, afir: r.afir, suff: r.sufficiency,
        evpt: r.evPerPoint, fleet: r.fleet, gapGWh: r.gapGWh };
    });
    const { key, dir } = state.sort;
    rows.sort((a, b) => (a[key] > b[key] ? 1 : -1) * dir);

    const top = [...rows].sort((a, b) => b.score - a.score)[0];
    $("#cmpTop").innerHTML = `🏆 Under this scenario, <b>${top.flag} ${top.name}</b> screens as the strongest build-out case — Opportunity Score <b>${top.score}/100</b>: ${fmtEur(top.cum)} unmet revenue 2026–30, AFIR ${top.afir.toFixed(2)} kW/BEV, ${top.evpt.toFixed(0)} EVs per point. Weights: 40% unmet · 20% AFIR shortfall · 20% pressure · 20% growth.`;

    const cols = [
      ["name", "Market"], ["score", "Score"], ["fleet", "Fleet 2030"], ["gapGWh", "Gap 2030"],
      ["revGap", "Revenue Gap 2030"], ["cum", "Unmet 26–30"], ["afir", "AFIR"],
      ["suff", "Sufficiency"], ["evpt", "EV / point"]
    ];
    $("#cmpHead").innerHTML = cols.map(([k, l]) =>
      `<th data-k="${k}" class="${key === k ? "sorted" : ""}">${l}${key === k ? (dir === 1 ? " ↑" : " ↓") : ""}</th>`).join("");
    $$("#cmpHead th").forEach(th => th.onclick = () => {
      const k = th.dataset.k;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : -1 };
      renderCompare();
    });
    const partTip = p => `unmet ${Math.round(p.unmet * 100)} · AFIR-short ${Math.round(p.afirShort * 100)} · pressure ${Math.round(p.pressure * 100)} · growth ${Math.round(p.growth * 100)} (normalised 0–100)`;
    $("#cmpBody").innerHTML = rows.map(r => `
      <tr class="${r.code === state.country ? "sel" : ""}" data-c="${r.code}">
        <td>${r.flag} ${r.name}${r.quality === "verified" ? ' <span class="badge ok">verified</span>' : ""}</td>
        <td class="mono" title="${partTip(r.parts)}"><span class="scorebar"><i style="width:${r.score}%"></i></span>${r.score}</td>
        <td class="mono">${fmtN(r.fleet)}</td>
        <td class="mono ${r.gapGWh > 0 ? "warn" : "cool"}">${fmtGWh(r.gapGWh)}</td>
        <td class="mono ${r.revGap > 0 ? "good" : "cool"}">${r.revGap > 0 ? fmtEur(r.revGap) : fmtEur(Math.abs(r.revGap)) + " surplus"}</td>
        <td class="mono">${fmtEur(r.cum)}</td>
        <td class="mono ${r.afir >= 1.3 ? "good" : r.afir >= 1 ? "warn" : "bad"}">${r.afir.toFixed(2)}</td>
        <td class="mono ${r.suff >= 1 ? "cool" : "warn"}">${pct(r.suff)}</td>
        <td class="mono">${r.evpt.toFixed(1)}</td>
      </tr>`).join("");
    $$("#cmpBody tr").forEach(tr => tr.onclick = () => { state.country = tr.dataset.c; state.tab = "dashboard"; sync(); });

    const sorted = [...rows].sort((a, b) => b.revGap - a.revGap);
    upsertChart("chCmp", {
      type: "bar",
      data: { labels: sorted.map(r => r.flag + " " + r.code), datasets: [{
        label: "Revenue Opportunity Gap 2030",
        data: sorted.map(r => r.revGap / 1e9),
        backgroundColor: sorted.map(r => r.code === top.code ? "rgba(182,255,60,0.85)" : r.revGap > 0 ? "rgba(182,255,60,0.45)" : "rgba(90,200,255,0.35)"),
        borderColor: sorted.map(r => r.revGap > 0 ? COL.acid : COL.supply), borderWidth: 1
      }] },
      options: { indexAxis: "y", maintainAspectRatio: false,
        scales: { x: { title: { display: true, text: "€ bn (negative = surplus capacity)" } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => " " + fmtEur(i.parsed.x * 1e9) } } } }
    });
  }

  /* ── site economics (Standort-Check, Germany) ─────────────────────── */
  const ST_FIELDS = [
    ["Site & grid", [
      ["power", "Connection power / point", "kW", 1],
      ["hardware", "Hardware", "€", 500],
      ["install", "Installation & civil works", "€", 500],
      ["grid", "Grid connection & BKZ", "€", 500],
      ["delayMonths", "Time to energise", "months", 1],
      ["lifetime", "Hardware lifetime", "yrs", 1]
    ]],
    ["Revenue", [
      ["price", "Ad-hoc price (incl. 19% VAT)", "€/kWh", 0.01],
      ["adhocShare", "Ad-hoc share of volume", "%", 5, "pct"],
      ["roamingNet", "Roaming / MSP price (net)", "€/kWh", 0.01],
      ["kwhSession", "Energy per session", "kWh", 1],
      ["thg", "THG proceeds", "ct/kWh", 1, "ct"],
      ["blocking", "Blocking-fee income", "€/yr", 50]
    ]],
    ["Operating costs", [
      ["energyCost", "Energy incl. levies (net)", "€/kWh", 0.01],
      ["demandCharge", "Demand charge (Leistungspreis)", "€/kW·a", 5],
      ["payFee", "Payment & roaming fees", "% of rev.", 1, "pct"],
      ["maint", "Maintenance & service", "€/yr", 50],
      ["backend", "Backend / CPMS & Eichrecht", "€/yr", 20],
      ["lease", "Site lease", "€/yr", 50]
    ]]
  ];
  const stToUi = (k, v, kind) => kind === "pct" ? Math.round(v * 100) : kind === "ct" ? Math.round(v * 100) : v;
  const stToModel = (v, kind) => kind === "pct" ? v / 100 : kind === "ct" ? v / 100 : v;
  let siteBuilt = false;

  /* AFIR 2027 sub-group (v3.1): 3 duty toggles + chip; cost fields collapse
     unless the terminal line is on. Copy rule: the tool prices the duty —
     it never certifies compliance. */
  const AFIR_TOGGLES = [
    ["pubAccess", "Publicly accessible?"],
    ["preAfir", "Commissioned before 13 Apr 2024?"],
    ["tenvOrSecure", "On TEN-T road network / safe & secure parking?"]
  ];
  const AFIR_COSTS = [
    ["termCapex", "Terminal capex (hw + install + integration)", "€", 250],
    ["termPoints", "Charge points served by this terminal", "pts", 1],
    ["termOpexYr", "Terminal service + data fee", "€/yr", 25],
    ["termTxFee", "Payment-service share on ad-hoc turnover", "%", 0.25],
    ["termLife", "Terminal replacement cycle", "yrs", 1],
    ["termYear", "Retrofit year (≤ 2026 meets the deadline)", "", 1]
  ];
  const AFIR_STATE_KEYS = [...AFIR_TOGGLES.map(t => t[0]), "termOn", ...AFIR_COSTS.map(c => c[0])];

  /* Region packs (v3.2): the pack overlays VAT, the certificate scheme and
     sourced price defaults onto the chosen hardware preset; everything else
     stays an editable DE-calibrated heuristic (see Model Audit provenance). */
  const RG = () => M.SITE_REGIONS[state.site.region] || M.SITE_REGIONS.de;
  function applyRegionOverlay() {
    const p = RG(), base = M.SITE_PRESETS[state.site.preset];
    state.site.inputs.vat = p.vat;
    state.site.inputs.thg = p.thg !== undefined ? p.thg : base.thg;
    state.site.inputs.price = p.priceAC !== undefined
      ? (state.site.inputs.power <= 22 ? p.priceAC : p.priceDC)
      : base.price;
  }
  function updateRegionCopy() {
    const p = RG();
    $('label[for="st-price"] > span:first-child').textContent =
      `Ad-hoc price (incl. ${Math.round((p.vat - 1) * 100)}% VAT)`;
    $('label[for="st-thg"] > span:first-child').textContent = p.thgLabel;
    $("#stBenchScale").textContent = p.scale;
    $("#stRegionNote").innerHTML = p.note;
  }
  function setRegion(k) {
    state.site.region = k;
    applyRegionOverlay();
    $$("#stRegions .chip").forEach(b => b.classList.toggle("on", b.dataset.rg === k));
    updateRegionCopy();
    fillSiteInputs(); markSitePreset(); recomputeSite();
  }

  function buildSiteUI() {
    if (siteBuilt) return; siteBuilt = true;
    $("#stRegions").innerHTML = Object.entries(M.SITE_REGIONS).map(([k, p]) =>
      `<button class="chip ${k === state.site.region ? "on" : ""}" data-rg="${k}">${p.label}</button>`).join("");
    $$("#stRegions .chip").forEach(b => b.onclick = () => setRegion(b.dataset.rg));
    $("#stPresets").innerHTML = Object.entries(M.SITE_PRESETS).map(([k, p]) =>
      `<button class="chip ${k === state.site.preset ? "on" : ""}" data-sp="${k}">${p.label}</button>`).join("");
    $$("#stPresets .chip").forEach(b => b.onclick = () => {
      state.site.preset = b.dataset.sp;
      // preset switch resets charger economics but PRESERVES the AFIR duty
      // inputs — the site's regulatory situation doesn't change with hardware
      const keep = {};
      AFIR_STATE_KEYS.forEach(k => { if (k in state.site.inputs) keep[k] = state.site.inputs[k]; });
      state.site.inputs = { ...M.SITE_PRESETS[b.dataset.sp], ...M.AFIR_DEFAULTS, ...keep };
      applyRegionOverlay();
      $$("#stPresets .chip").forEach(x => x.classList.toggle("on", x === b));
      fillSiteInputs(); recomputeSite();
    });
    $("#stInputs").innerHTML = ST_FIELDS.map(([g, fields]) => `
      <div class="st-group"><h4>${g}</h4>${fields.map(([k, label, unit, step, kind]) => `
        <label class="st-field" for="st-${k}"><span>${label}</span>
          <span class="st-in"><input id="st-${k}" type="number" step="${step}" min="0"> <i>${unit}</i></span>
        </label>`).join("")}</div>`).join("") + `
      <div class="st-group st-afir"><h4>AFIR 2027 — card-terminal duty</h4>
        <div id="afirChip" class="afir-chip" role="status"></div>
        ${AFIR_TOGGLES.map(([k, label]) => `
        <label class="st-field st-bool" for="st-${k}"><span>${label}</span>
          <input id="st-${k}" type="checkbox">
        </label>`).join("")}
        <label class="st-field st-bool" for="st-termOn"><span>Include terminal cost line
          <em id="termAuto" class="term-auto"></em></span>
          <input id="st-termOn" type="checkbox">
        </label>
        <div id="afirCosts">
          ${AFIR_COSTS.map(([k, label, unit, step]) => `
          <label class="st-field" for="st-${k}"><span>${label}</span>
            <span class="st-in"><input id="st-${k}" type="number" step="${step}" min="0"> <i>${unit}</i></span>
          </label>`).join("")}
          <div class="afir-note">Terminal defaults are editable planning heuristics — replace with your payment provider's quote. Retrofits are often more complex than expected (Eichrecht pairing, integration).</div>
        </div>
        <div id="afirIso" class="afir-iso"></div>
      </div>`;
    ST_FIELDS.forEach(([g, fields]) => fields.forEach(([k, l, u, s, kind]) => {
      $("#st-" + k).addEventListener("input", e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v >= 0) { state.site.inputs[k] = stToModel(v, kind); markSitePreset(); recomputeSite(); }
      });
    }));
    AFIR_TOGGLES.forEach(([k]) => {
      $("#st-" + k).addEventListener("change", e => {
        state.site.inputs[k] = e.target.checked; recomputeSite();
      });
    });
    $("#st-termOn").addEventListener("change", e => {
      state.site.inputs.termOn = e.target.checked;      // explicit override of auto
      recomputeSite();
    });
    $("#termAuto").addEventListener("click", e => {
      e.preventDefault();
      state.site.inputs.termOn = null;                  // back to auto
      recomputeSite();
    });
    AFIR_COSTS.forEach(([k]) => {
      $("#st-" + k).addEventListener("input", e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v >= 0) { state.site.inputs[k] = v; recomputeSite(); }
      });
    });
    $("#stUtil").addEventListener("input", e => {
      state.site.inputs.util = parseFloat(e.target.value);
      markSitePreset(); recomputeSite();
    });
    applyRegionOverlay(); updateRegionCopy();
    fillSiteInputs();
  }
  function fillSiteInputs() {
    ST_FIELDS.forEach(([g, fields]) => fields.forEach(([k, l, u, s, kind]) => {
      $("#st-" + k).value = stToUi(k, state.site.inputs[k], kind);
    }));
    AFIR_TOGGLES.forEach(([k]) => { $("#st-" + k).checked = !!state.site.inputs[k]; });
    AFIR_COSTS.forEach(([k]) => { $("#st-" + k).value = state.site.inputs[k]; });
    $("#stUtil").value = state.site.inputs.util;
  }
  function markSitePreset() {
    $$("#stPresets .chip").forEach(b => {
      const p = M.SITE_PRESETS[b.dataset.sp];
      b.classList.toggle("on", Object.keys(p).every(k => k === "label" || Math.abs((p[k] ?? 0) - (state.site.inputs[k] ?? 0)) < 1e-9));
    });
  }

  const fmtYrs = v => Number.isFinite(v) ? v.toFixed(1) + " yrs" : "never";
  const AFIR_CHIP = {
    NOT_AFFECTED:  { txt: "AFIR terminal duty: not applicable", cls: "muted" },
    BUILT_IN:      { txt: "AFIR terminal: required since 04/2024 — include in base capex", cls: "cool" },
    RETROFIT_2027: { txt: "AFIR retrofit due by 01 Jan 2027", cls: "warn" },
    GRANDFATHERED: { txt: "Grandfathered — no terminal retrofit duty (verify site vs TEN-T map)", cls: "muted" }
  };
  function recomputeSite() {
    const s = M.siteCase(state.site.inputs), i = s.inputs, P = RG();
    writeHash();
    $("#stUtilOut").textContent = (i.util * 100).toFixed(1) + "%  ·  " + s.hoursDay.toFixed(1) + " h/day  ·  " + s.sessionsDay.toFixed(1) + " sessions/day";

    // AFIR chip + terminal-line state (auto vs manual) + cost-field collapse
    const chip = AFIR_CHIP[s.afir];
    const overdue = s.afir === "RETROFIT_2027" && !s.termOn && new Date() >= new Date("2027-01-01");
    $("#afirChip").textContent = chip.txt;
    $("#afirChip").className = "afir-chip " + (overdue ? "bad" : chip.cls);
    $("#st-termOn").checked = s.termOn;
    $("#termAuto").innerHTML = (state.site.inputs.termOn === null || state.site.inputs.termOn === undefined)
      ? "auto" : "manual · <u>reset to auto</u>";
    $("#afirCosts").style.display = s.termOn ? "" : "none";
    $("#afirIso").innerHTML = !i.preAfir
      ? `ISO 15118-2 mandatory since 08 Jan 2026 (new/renovated public points); ISO 15118-20 from 01 Jan 2027 — Delegated Reg (EU) 2025/656. Hardware-dependent — not modelled as a cost line.`
      : "";

    const beOk = Number.isFinite(s.uBreakEven);
    const beDelta = s.termOn && s.base && beOk && Number.isFinite(s.base.uBreakEven)
      ? (s.uBreakEven - s.base.uBreakEven) * 100 : null;
    $("#stTiles").innerHTML = `
      <div class="tk"><div class="l">★ Break-even utilisation</div><div class="v ${beOk ? "" : "bad"}">${beOk ? (s.uBreakEven * 100).toFixed(1) + "%" : "—"}</div><div class="s">${beOk ? "EBITDA ≥ 0 above this · capex earned back within lifetime above " + (s.uPayback * 100).toFixed(1) + "%" : "margin per kWh is negative"}${beDelta !== null ? `<br><span class="afir-delta">incl. AFIR terminal: +${beDelta.toFixed(beDelta >= 0.1 ? 1 : 2)} pp break-even</span>` : ""}</div></div>
      <div class="tk"><div class="l">EBITDA / yr</div><div class="v ${s.ebitda >= 0 ? "" : "bad"}">${fmtEur(s.ebitda)}</div><div class="s">revenue ${fmtEur(s.revenue)} − costs ${fmtEur(s.costs)}</div></div>
      <div class="tk"><div class="l">Simple payback</div><div class="v ${Number.isFinite(s.payback) && s.payback <= i.lifetime ? "" : "warn"}">${fmtYrs(s.payback)}</div><div class="s">capex ${fmtEur(s.capex)} · + ${i.delayMonths} mo grid delay before revenue${s.termOn ? " · terminal capex on the cash curve" : ""}</div></div>
      <div class="tk"><div class="l">Margin / kWh</div><div class="v ${s.marginKWh > 0 ? "cool" : "bad"}">€${s.marginKWh.toFixed(2)}</div><div class="s">blended net €${s.blendedNet.toFixed(2)} − energy − fees${s.termOn ? " − terminal fee" : ""} + THG</div></div>
      <div class="tk"><div class="l">Energy sold / yr</div><div class="v cool">${fmtN(s.energy)} kWh</div><div class="s">${(i.adhocShare * 100).toFixed(0)}% ad-hoc · ${((1 - i.adhocShare) * 100).toFixed(0)}% roaming</div></div>`;

    let verdict, cls;
    const u = i.util;
    if (!beOk) {
      cls = "warn"; verdict = `<b>No utilisation can save this configuration</b> — the margin per kWh is negative. Raise the ad-hoc price, negotiate better roaming terms, or cut the energy cost before anything else.`;
    } else if (u < s.uBreakEven) {
      cls = "warn"; verdict = `At <b>${(u * 100).toFixed(1)}%</b> this point loses <b>${fmtEur(Math.abs(s.ebitda))}/yr</b>. Break-even sits at <b>${(s.uBreakEven * 100).toFixed(1)}%</b>. ${P.hpcCtx}`;
    } else if (u < s.uPayback) {
      cls = "warn"; verdict = `Covers its running costs (EBITDA <b>${fmtEur(s.ebitda)}/yr</b>) but will <b>not</b> earn back the ${fmtEur(s.capex)} capex within its ${i.lifetime}-year lifetime — that needs ≥ <b>${(s.uPayback * 100).toFixed(1)}%</b> utilisation.`;
    } else {
      cls = ""; verdict = `<b>This site pencils.</b> Payback in <b>${fmtYrs(s.payback)}</b> at ${(u * 100).toFixed(1)}% utilisation (${s.sessionsDay.toFixed(1)} sessions/day) — ${((u - s.uBreakEven) * 100).toFixed(1)} pts of buffer above break-even. ${P.penCtx}`;
    }
    if (s.afir === "RETROFIT_2027" && !s.termOn) {
      verdict += `<div class="afir-warn">⚠ This site carries a card-terminal retrofit duty by 01 Jan 2027 that is not priced in.</div>`;
    }
    $("#stVerdict").innerHTML = `<div class="callout ${cls}" style="margin:0 0 0.9rem">${verdict}</div>`;

    // annual P&L
    const row = (l, v, cls2) => `<tr><td style="text-align:left">${l}</td><td class="mono ${cls2 || ""}">${v}</td></tr>`;
    $("#stPnl").innerHTML =
      row("Charging revenue (net, blended)", fmtEur(s.revCharging)) +
      row(P.thgLabel, fmtEur(s.revThg)) +
      (i.blocking ? row("Blocking fees", fmtEur(i.blocking)) : "") +
      row("Energy incl. levies", "−" + fmtEur(s.costEnergy)) +
      row("Demand charge (Leistungspreis)", "−" + fmtEur(s.costDemand)) +
      row("Payment & roaming fees", "−" + fmtEur(s.costFees)) +
      (s.termOn ? row("AFIR terminal fee on ad-hoc turnover", "−" + fmtEur(s.costTermTx)) +
                  row("AFIR terminal service & data (allocated)", "−" + fmtEur(s.costTermFix)) : "") +
      row("Fixed opex (service, backend, lease)", "−" + fmtEur(s.costFixed)) +
      row("<b>EBITDA</b>", "<b>" + fmtEur(s.ebitda) + "</b>", s.ebitda >= 0 ? "good" : "bad");

    // THG stress test
    $("#stSensHead").innerHTML = `<th>Utilisation ↓</th><th>${P.thgShort} 0 ct</th><th>${P.thgShort} ${Math.round(i.thg * 100)} ct (base)</th><th>${P.thgShort} 15 ct</th>`;
    $("#stSens").innerHTML = [0.75, 1, 1.25].map((f, r) => `<tr>
      <td style="text-align:left">${(i.util * f * 100).toFixed(1)}%${f === 1 ? " (base)" : ""}</td>
      ${s.sens[r].map((v, c) => `<td class="mono ${r === 1 && c === 1 ? "good" : ""}">${Number.isFinite(v) ? v.toFixed(1) : "—"}</td>`).join("")}
    </tr>`).join("");

    // cash curve
    const labels = s.cash.map((_, m) => m);
    upsertChart("chCash", {
      type: "line",
      data: { labels, datasets: [
        { label: "Cumulative cash", data: s.cash, borderColor: COL.acid,
          backgroundColor: "rgba(182,255,60,0.07)", fill: { target: { value: 0 }, above: "rgba(182,255,60,0.10)", below: "rgba(255,180,84,0.10)" },
          pointRadius: 0, tension: 0.15, borderWidth: 2 },
        { label: "break-even line", data: labels.map(() => 0), borderColor: "rgba(245,245,245,0.3)", borderDash: [5, 4], pointRadius: 0, borderWidth: 1 }
      ] },
      options: { maintainAspectRatio: false,
        scales: { x: { ticks: { autoSkip: false, maxRotation: 0, callback: (v, idx) => idx % 12 === 0 ? (idx / 12) + "y" : "" } },
                  y: { ticks: { callback: v => fmtEur(v) } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          title: it => "Month " + it[0].label,
          label: it => " " + fmtEur(it.parsed.y) } } } }
    });
  }
  function renderSite() { buildSiteUI(); recomputeSite(); }

  /* ── model audit (live) ────────────────────────────────────────────── */
  function renderAudit() {
    const c = cty(), sc = M.buildScenario(c, state.params);
    const r = sc.kpi.y2030, p = sc.params, C = M.C;
    $("#auditWho").textContent = `${c.flag} ${c.name} · ${encodeParams(p).replace(/([a-z]+)/g, " $1").trim()}`;
    const perEV = C.MILEAGE_KM / 100 * C.CONSUMPTION_KWH_100KM * C.CHARGING_LOSS;
    const rows = [
      ["Inputs 2030", `fleet base ${fmtN(r.fleetBase)} (${sc.kpi.fleetMode}) · AC ${fmtN(r.ac)} · DC ${fmtN(r.dc)} points (${sc.kpi.chargerMode})`, ""],
      ["C_Interactive_Fleet_Size", `${fmtN(r.fleetBase)} × speed ${p.speed.toFixed(1)}`, fmtN(r.fleet)],
      ["C_National_Fleet_Demand_GWh", `${fmtN(r.fleet)} × (14,000/100 × 19) × 1.12 / 10⁶  (= ${Math.round(perEV).toLocaleString("en")} kWh per EV)`, fmtGWh(r.demandNat)],
      ["C_Addressable_CPO_Market_GWh", `${fmtGWh(r.demandNat)} × intensity ${pct(p.intensity)}`, fmtGWh(r.addressable)],
      ["C_Supply_Capacity_GWh", `(${fmtN(r.ac)} × 11 kW × 8,760 × ${pct(p.acEff)}) + (${fmtN(r.dc)} × 150 kW × 8,760 × ${pct(p.dcEff)})`, fmtGWh(r.supply)],
      ["C_Supply_Gap", `${fmtGWh(r.addressable)} − ${fmtGWh(r.supply)}`, fmtGWh(r.gapGWh)],
      ["C_Revenue_Opportunity_Gap_EUR", `${fmtGWh(r.gapGWh)} × 10⁶ × €0.50`, fmtEur(r.revGap)],
      ["C_Total_5Yr_Gap (Σ unmet 26–30)", `Σ max(gap, 0) × 10⁶ × €0.50 over 2026–2030`, fmtEur(sc.kpi.cumUnmet26_30)],
      ["C_Total_Installed_Power_kW", `${fmtN(r.ac)} × 11 + ${fmtN(r.dc)} × 200`, fmtN(r.installedKW) + " kW"],
      ["C_AFIR_Compliance_Index", `${fmtN(r.installedKW)} kW / ${fmtN(r.fleet)} BEV  (minimum 1.3)`, r.afir.toFixed(2) + " kW/BEV"],
      ["C_Required_Total_Plugs", `${fmtGWh(r.addressable)} × 10⁶ / (50 × 8,760 × (${pct(p.acEff)}×0.8 + ${pct(p.dcEff)}×0.2)) × 2.2`, fmtN(r.requiredPlugs)],
      ["C_Infrastructure_Sufficiency", `${fmtN(r.points)} / ${fmtN(r.requiredPlugs)}`, pct(r.sufficiency)]
    ];
    $("#auditBody").innerHTML = rows.map(([f, calc, res]) =>
      `<tr><td>${f}</td><td class="mono" style="text-align:left;white-space:normal">${calc}</td><td class="mono good">${res}</td></tr>`).join("");
    $("#auditRegions").innerHTML = Object.values(M.SITE_REGIONS).map(p =>
      `<div class="callout" style="margin:0.45rem 0"><b>${p.label}</b> — quality: <b>${p.quality}</b>. ${p.note}</div>`).join("");
    $("#auditSrc").innerHTML =
      `<b>${c.flag} ${c.name}</b> — data quality: <b>${c.quality}</b>. Sources: ${c.sources.join(" · ")}. ` +
      `Germany is verified 1:1 against the original workbook's master dataset (KBA FZ13, 1-Jan convention; Bundesnetzagentur registry; Masterplan Ladeinfrastruktur II targets). ` +
      `All other markets are an indicative snapshot until refreshed — every country carries a <code class="inline">quality</code> flag and this provenance line.`;
  }

  /* ── downloads ─────────────────────────────────────────────────────── */
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    URL.revokeObjectURL(a.href);
  }
  $("#dlJson").onclick = () => download("chargegap-europe-data.json", JSON.stringify(window.CG_DATA, null, 2), "application/json");
  $("#dlCsv").onclick = () => {
    const head = "country,year,bev_stock,ac_points,dc_points,population_m,gdp_per_capita_keur,home_charge_share,ac_price_2025,dc_price_2025,quality";
    const lines = [head];
    DATA.countries.forEach(c => c.years.forEach((y, i) =>
      lines.push([c.code, y, c.bev_stock[i], c.ac_points[i], c.dc_points[i], c.population_m, c.gdp_per_capita_keur, c.home_charge_share, c.ac_price_2025, c.dc_price_2025, c.quality].join(","))));
    download("chargegap-europe-panel.csv", lines.join("\n"), "text/csv");
  };
  $("#dlScenario").onclick = () => {
    const c = cty(), sc = M.buildScenario(c, state.params);
    const head = "year,fleet,ac_points,dc_points,national_demand_gwh,addressable_gwh,supply_gwh,gap_gwh,revenue_gap_eur,afir_index,required_plugs,sufficiency";
    const lines = [head, ...sc.rows.map(r => [r.year, Math.round(r.fleet), Math.round(r.ac), Math.round(r.dc),
      r.demandNat.toFixed(1), r.addressable.toFixed(1), r.supply.toFixed(1), r.gapGWh.toFixed(1),
      Math.round(r.revGap), r.afir.toFixed(3), Math.round(r.requiredPlugs), r.sufficiency.toFixed(3)].join(","))];
    download(`chargegap-${c.code}-scenario-${encodeParams(state.params)}.csv`, lines.join("\n"), "text/csv");
  };

  /* ── tabs / sync ───────────────────────────────────────────────────── */

  /* ── Map view (v3.3): choropleth + Bundesland drill-down ──────────── */
  const GEO = window.CG_GEO, BL = window.CG_BL;
  const MAPC = { lime: "#B6FF3C", cyan: "#5AC8FF", warn: "#FFB454", base: "#181a14" };
  const EU_METRICS = {
    revGap: { label: "\u2605 Revenue Gap 2030", fmt: fmtEur, kind: "div" },
    score:  { label: "Opportunity Score", fmt: v => v + "/100", kind: "lime" },
    afir:   { label: "AFIR 2030 (kW/BEV)", fmt: v => v.toFixed(2), kind: "afir" },
    evpt:   { label: "EVs per point 2030", fmt: v => Math.round(v).toLocaleString("en"), kind: "warm" }
  };
  const DE_METRICS = {
    points: { label: "Ladepunkte", fmt: v => v.toLocaleString("en"), kind: "lime" },
    tWert:  { label: "E-Pkw je Ladepunkt", fmt: v => v.toFixed(1), kind: "warm" }
  };
  function mixHex(a, b, t) {
    const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
    const [r1, g1, b1] = h(a), [r2, g2, b2] = h(b);
    const c = v => Math.round(v).toString(16).padStart(2, "0");
    return "#" + c(r1 + (r2 - r1) * t) + c(g1 + (g2 - g1) * t) + c(b1 + (b2 - b1) * t);
  }
  function fillFor(kind, v, lo, hi) {
    const e = x => Math.sqrt(Math.max(0, Math.min(1, x)));   // perceptual easing
    if (kind === "div") {
      if (v >= 0) return mixHex(MAPC.base, MAPC.lime, e(hi > 0 ? v / hi : 0));
      return mixHex(MAPC.base, MAPC.cyan, e(lo < 0 ? v / lo : 0));
    }
    if (kind === "afir") {
      const T = 1.3;
      return v >= T ? mixHex(MAPC.base, MAPC.cyan, e((v - T) / T))
                    : mixHex(MAPC.base, MAPC.warn, e((T - v) / T));
    }
    const col = kind === "warm" ? MAPC.warn : MAPC.lime;
    return mixHex(MAPC.base, col, e(hi > lo ? (v - lo) / (hi - lo) : 0.5));
  }
  function mapLegend(m, lo, hi) {
    const g = (a, b, c) => c
      ? `linear-gradient(90deg, ${a}, ${b} 50%, ${c})` : `linear-gradient(90deg, ${a}, ${b})`;
    let bar, l = m.fmt(lo), mid = "", r = m.fmt(hi);
    if (m.kind === "div" && lo < 0 && hi > 0) { bar = g(MAPC.cyan, MAPC.base, MAPC.lime); mid = "0 (surplus \u2190 | \u2192 gap)"; }
    else if (m.kind === "afir") { bar = g(MAPC.warn, MAPC.base, MAPC.cyan); mid = "1.3 kW/BEV (AFIR floor)"; }
    else bar = g(MAPC.base, m.kind === "warm" ? MAPC.warn : MAPC.lime);
    $("#mapLegend").innerHTML = `<span>${l}</span><span class="bar" style="background:${bar}"></span>` +
      (mid ? `<span>${mid}</span><span class="bar" style="background:${bar};visibility:hidden;flex:0 0 0"></span>` : "") +
      `<span>${r}</span>`;
  }
  function gotoSite(regionKey) {
    if (regionKey && M.SITE_REGIONS[regionKey]) {
      state.site.region = regionKey;
      if (siteBuilt) setRegion(regionKey);
    }
    state.tab = "site"; sync();
  }
  function renderMap() {
    const mode = state.map.mode, MM = mode === "eu" ? EU_METRICS : DE_METRICS;
    if (!MM[state.map.metric]) state.map.metric = mode === "eu" ? "revGap" : "tWert";
    $("#mapMetrics").innerHTML = Object.entries(MM).map(([k, m]) =>
      `<button class="chip ${k === state.map.metric ? "on" : ""}" data-mm="${k}">${m.label}</button>`).join("");
    $$("#mapMetrics .chip").forEach(b => b.onclick = () => { state.map.metric = b.dataset.mm; renderMap(); });
    if (mode === "eu") {
      $("#mapCrumb").innerHTML = `Europe \u00b7 14 markets \u2014 <b>click a market</b>; Germany offers a Bundesland drill-down.`;
      renderMapEU();
    } else {
      $("#mapCrumb").innerHTML = `<button class="chip" id="mapBack">\u2190 Europe</button>&ensp;Germany \u00b7 16 Bundesl\u00e4nder \u2014 ${BL.meta.source}`;
      $("#mapBack").onclick = () => { state.map.mode = "eu"; renderMap(); };
      renderMapDE();
    }
  }
  function renderMapEU() {
    const m = EU_METRICS[state.map.metric], scores = M.opportunityScores(DATA, state.params);
    const rows = {};
    DATA.countries.forEach(c => {
      const sc = M.buildScenario(c, state.params), r = sc.kpi.y2030;
      rows[c.code] = { c, revGap: r.revGap, score: scores[c.code].score, afir: r.afir,
                       evpt: r.evPerPoint, cum: sc.kpi.cumUnmet26_30, fleet: r.fleet };
    });
    const vals = Object.values(rows).map(r => r[state.map.metric]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const sel = GEO.eu.shapes[state.country] ? state.country : null;
    $("#mapSvg").setAttribute("viewBox", GEO.eu.viewBox);
    $("#mapSvg").innerHTML = Object.entries(GEO.eu.shapes).map(([code, d]) => {
      const r = rows[code];
      return `<path class="mp ${sel === code ? "sel" : ""}" data-c="${code}" d="${d}"` +
        ` fill="${fillFor(m.kind, r[state.map.metric], lo, hi)}">` +
        `<title>${r.c.name} \u00b7 ${m.label}: ${m.fmt(r[state.map.metric])}</title></path>`;
    }).join("");
    $$("#mapSvg .mp").forEach(p => p.addEventListener("click", () => {
      state.country = p.dataset.c; writeHash(); renderMap();
    }));
    mapLegend(m, lo, hi);
    euCard(rows[sel]);
  }
  function euCard(r) {
    if (!r) { $("#mapCard").innerHTML = `<div class="footnote">Select a market on the map.</div>`; return; }
    const q = r.c.quality === "verified" ? "\u2713 verified" : r.c.quality;
    $("#mapCard").innerHTML = `
      <h3>${r.c.flag} ${r.c.name} <span class="mq">${q}</span></h3>
      <div class="mrow"><span>\u2605 Revenue Gap 2030</span><b>${fmtEur(r.revGap)}</b></div>
      <div class="mrow"><span>Unmet revenue 2026\u201330</span><b>${fmtEur(r.cum)}</b></div>
      <div class="mrow"><span>Opportunity Score</span><b>${r.score}/100</b></div>
      <div class="mrow"><span>AFIR 2030</span><b>${r.afir.toFixed(2)} kW/BEV ${r.afir >= 1.3 ? "\u2713" : "\u26a0"}</b></div>
      <div class="mrow"><span>EVs per point 2030</span><b>${Math.round(r.evpt).toLocaleString("en")}</b></div>
      <div class="mrow"><span>Fleet 2030</span><b>${fmtN(r.fleet)}</b></div>
      <div class="mbtns">
        <button class="chip" id="mGoDash">Open Dashboard \u2192</button>
        <button class="chip" id="mGoCmp">Compare \u2192</button>
        ${r.c.code === "DE" ? `<button class="chip on" id="mGoBL">Bundesl\u00e4nder \u2935</button>` : ""}
        ${M.SITE_REGIONS[r.c.code.toLowerCase()] ? `<button class="chip" id="mGoRegion">Standort-Check ${r.c.flag} \u2192</button>` : ""}
      </div>
      <div class="footnote" style="margin-top:0.55rem">Scenario-dependent \u2014 same engine as Dashboard/Compare; audit any number in Model Audit.</div>`;
    $("#mGoDash").onclick = () => { state.tab = "dashboard"; sync(); };
    $("#mGoCmp").onclick = () => { state.tab = "compare"; sync(); };
    const bl = $("#mGoBL"); if (bl) bl.onclick = () => { state.map.mode = "de"; state.map.sel = null; renderMap(); };
    const rg = $("#mGoRegion"); if (rg) rg.onclick = () => gotoSite(r.c.code.toLowerCase());
  }
  function renderMapDE() {
    const m = DE_METRICS[state.map.metric];
    const vals = Object.values(BL.laender).map(l => l[state.map.metric]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    $("#mapSvg").setAttribute("viewBox", GEO.de.viewBox);
    $("#mapSvg").innerHTML = Object.entries(GEO.de.shapes).map(([code, d]) => {
      const l = BL.laender[code];
      return `<path class="mp ${state.map.sel === code ? "sel" : ""}" data-c="${code}" d="${d}"` +
        ` fill="${fillFor(m.kind, l[state.map.metric], lo, hi)}">` +
        `<title>${l.name} \u00b7 ${m.label}: ${m.fmt(l[state.map.metric])}</title></path>`;
    }).join("");
    $$("#mapSvg .mp").forEach(p => p.addEventListener("click", () => {
      state.map.sel = p.dataset.c; renderMap();
    }));
    mapLegend(m, lo, hi);
    deCard(state.map.sel);
  }
  function deCard(code) {
    if (!code) { $("#mapCard").innerHTML = `<div class="footnote">Select a Bundesland \u2014 colours: ${DE_METRICS[state.map.metric].label}.</div>`; return; }
    const l = BL.laender[code], N = BL.meta.national;
    const rank = Object.values(BL.laender).map(x => x.tWert).sort((a, b) => a - b).indexOf(l.tWert) + 1;
    const share = (l.points / N.points * 100).toFixed(1);
    const dT = l.tWert - N.tWert;
    $("#mapCard").innerHTML = `
      <h3>${l.name} <span class="mq">VDA/BNetzA/KBA \u00b7 01.07.2025</span></h3>
      <div class="mrow"><span>Ladepunkte</span><b>${l.points.toLocaleString("en")} (${share}% of DE)</b></div>
      <div class="mrow"><span>E-Pkw (BEV+PHEV)</span><b>${l.epkw.toLocaleString("en")}</b></div>
      <div class="mrow"><span>E-Pkw je Ladepunkt</span><b>${l.tWert.toFixed(1)} (DE \u00d8 ${N.tWert})</b></div>
      <div class="mrow"><span>Coverage rank (T-Wert)</span><b>${rank}/16 \u00b7 ${dT >= 0 ? "+" : ""}${dT.toFixed(1)} vs \u00d8</b></div>
      <div class="mbtns">
        ${code === "NW" ? `<button class="chip on" id="mGoNRW">Standort-Check \u00b7 NRW pack \u2192</button>` : ""}
      </div>
      <div class="footnote" style="margin-top:0.55rem">${code === "NW"
        ? "Region pack with verified NRW context is wired into the Standort-Check."
        : "Bundesland economics packs: roadmap \u2014 DE-national defaults apply in the Standort-Check."}${code === "TH" ? " Thüringen: 3,528 points (source-typo correction, see Model Audit)." : ""}</div>`;
    const b = $("#mGoNRW"); if (b) b.onclick = () => gotoSite("denrw");
  }

  function sync() {
    $$(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === state.tab));
    $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + state.tab));
    writeHash();
    renderCountries();
    if (state.tab === "dashboard") renderDashboard();
    if (state.tab === "compare") renderCompare();
    if (state.tab === "map") renderMap();
    if (state.tab === "site") renderSite();
    if (state.tab === "audit") renderAudit();
  }
  $$(".tabs button").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; sync(); });

  /* ── init ──────────────────────────────────────────────────────────── */
  $("#gen").textContent = DATA.generated;
  $("#dataChip").textContent = `DATA ${DATA.generated} · 14 MARKETS · OPEN DATA · MIT`;
  renderCockpit();
  sync();
})();

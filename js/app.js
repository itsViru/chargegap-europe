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
    site: { preset: "hpc150", inputs: { ...M.SITE_PRESETS.hpc150 } }
  };

  /* ── scenario permalinks: #tab/CC/i80ac13dc9s130 ───────────────────── */
  function encodeParams(p) {
    const n = v => Math.round(v * 100);
    return `i${n(p.intensity)}ac${n(p.acEff)}dc${n(p.dcEff)}s${n(p.speed)}`;
  }
  function decodeParams(str) {
    const m = /^i(\d+)ac(\d+)dc(\d+)s(\d+)$/.exec(str || "");
    if (!m) return null;
    return { intensity: +m[1] / 100, acEff: +m[2] / 100, dcEff: +m[3] / 100, speed: +m[4] / 100 };
  }
  (function readHash() {
    const h = location.hash.replace("#", "").split("/");
    if (h[0] === "analytics") h[0] = "site";               // legacy links
    if (["dashboard", "compare", "site", "audit"].includes(h[0])) state.tab = h[0];
    if (h[1] && CODES.includes(h[1])) state.country = h[1];
    const p = decodeParams(h[2]);
    if (p) state.params = p;
  })();
  function writeHash() {
    const h = `#${state.tab}/${state.country}/${encodeParams(state.params)}`;
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

  function buildSiteUI() {
    if (siteBuilt) return; siteBuilt = true;
    $("#stPresets").innerHTML = Object.entries(M.SITE_PRESETS).map(([k, p]) =>
      `<button class="chip ${k === state.site.preset ? "on" : ""}" data-sp="${k}">${p.label}</button>`).join("");
    $$("#stPresets .chip").forEach(b => b.onclick = () => {
      state.site.preset = b.dataset.sp;
      state.site.inputs = { ...M.SITE_PRESETS[b.dataset.sp] };
      $$("#stPresets .chip").forEach(x => x.classList.toggle("on", x === b));
      fillSiteInputs(); recomputeSite();
    });
    $("#stInputs").innerHTML = ST_FIELDS.map(([g, fields]) => `
      <div class="st-group"><h4>${g}</h4>${fields.map(([k, label, unit, step, kind]) => `
        <label class="st-field" for="st-${k}"><span>${label}</span>
          <span class="st-in"><input id="st-${k}" type="number" step="${step}" min="0"> <i>${unit}</i></span>
        </label>`).join("")}</div>`).join("");
    ST_FIELDS.forEach(([g, fields]) => fields.forEach(([k, l, u, s, kind]) => {
      $("#st-" + k).addEventListener("input", e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v >= 0) { state.site.inputs[k] = stToModel(v, kind); markSitePreset(); recomputeSite(); }
      });
    }));
    $("#stUtil").addEventListener("input", e => {
      state.site.inputs.util = parseFloat(e.target.value);
      markSitePreset(); recomputeSite();
    });
    fillSiteInputs();
  }
  function fillSiteInputs() {
    ST_FIELDS.forEach(([g, fields]) => fields.forEach(([k, l, u, s, kind]) => {
      $("#st-" + k).value = stToUi(k, state.site.inputs[k], kind);
    }));
    $("#stUtil").value = state.site.inputs.util;
  }
  function markSitePreset() {
    $$("#stPresets .chip").forEach(b => {
      const p = M.SITE_PRESETS[b.dataset.sp];
      b.classList.toggle("on", Object.keys(p).every(k => k === "label" || Math.abs((p[k] ?? 0) - (state.site.inputs[k] ?? 0)) < 1e-9));
    });
  }

  const fmtYrs = v => Number.isFinite(v) ? v.toFixed(1) + " yrs" : "never";
  function recomputeSite() {
    const s = M.siteCase(state.site.inputs), i = s.inputs, B = M.SITE_BENCHMARKS;
    $("#stUtilOut").textContent = (i.util * 100).toFixed(1) + "%  ·  " + s.hoursDay.toFixed(1) + " h/day  ·  " + s.sessionsDay.toFixed(1) + " sessions/day";

    const beOk = Number.isFinite(s.uBreakEven);
    $("#stTiles").innerHTML = `
      <div class="tk"><div class="l">★ Break-even utilisation</div><div class="v ${beOk ? "" : "bad"}">${beOk ? (s.uBreakEven * 100).toFixed(1) + "%" : "—"}</div><div class="s">${beOk ? "EBITDA ≥ 0 above this · capex earned back within lifetime above " + (s.uPayback * 100).toFixed(1) + "%" : "margin per kWh is negative"}</div></div>
      <div class="tk"><div class="l">EBITDA / yr</div><div class="v ${s.ebitda >= 0 ? "" : "bad"}">${fmtEur(s.ebitda)}</div><div class="s">revenue ${fmtEur(s.revenue)} − costs ${fmtEur(s.costs)}</div></div>
      <div class="tk"><div class="l">Simple payback</div><div class="v ${Number.isFinite(s.payback) && s.payback <= i.lifetime ? "" : "warn"}">${fmtYrs(s.payback)}</div><div class="s">capex ${fmtEur(s.capex)} · + ${i.delayMonths} mo grid delay before revenue</div></div>
      <div class="tk"><div class="l">Margin / kWh</div><div class="v ${s.marginKWh > 0 ? "cool" : "bad"}">€${s.marginKWh.toFixed(2)}</div><div class="s">blended net €${s.blendedNet.toFixed(2)} − energy − fees + THG</div></div>
      <div class="tk"><div class="l">Energy sold / yr</div><div class="v cool">${fmtN(s.energy)} kWh</div><div class="s">${(i.adhocShare * 100).toFixed(0)}% ad-hoc · ${((1 - i.adhocShare) * 100).toFixed(0)}% roaming</div></div>`;

    let verdict, cls;
    const u = i.util;
    if (!beOk) {
      cls = "warn"; verdict = `<b>No utilisation can save this configuration</b> — the margin per kWh is negative. Raise the ad-hoc price, negotiate better roaming terms, or cut the energy cost before anything else.`;
    } else if (u < s.uBreakEven) {
      cls = "warn"; verdict = `At <b>${(u * 100).toFixed(1)}%</b> this point loses <b>${fmtEur(Math.abs(s.ebitda))}/yr</b>. Break-even sits at <b>${(s.uBreakEven * 100).toFixed(1)}%</b>. For context: German HPC averaged just ${(B.hpcAvg * 100).toFixed(0)}–7% in 2024/25 — this is exactly the market's problem.`;
    } else if (u < s.uPayback) {
      cls = "warn"; verdict = `Covers its running costs (EBITDA <b>${fmtEur(s.ebitda)}/yr</b>) but will <b>not</b> earn back the ${fmtEur(s.capex)} capex within its ${i.lifetime}-year lifetime — that needs ≥ <b>${(s.uPayback * 100).toFixed(1)}%</b> utilisation.`;
    } else {
      cls = ""; verdict = `<b>This site pencils.</b> Payback in <b>${fmtYrs(s.payback)}</b> at ${(u * 100).toFixed(1)}% utilisation (${s.sessionsDay.toFixed(1)} sessions/day) — ${((u - s.uBreakEven) * 100).toFixed(1)} pts of buffer above break-even. Note the Ø German occupancy is ${(B.occupancyDE * 100).toFixed(0)}% and only ~1% of HPC sites exceed ${(B.veryGood * 100).toFixed(0)}%: validate the utilisation assumption hardest.`;
    }
    $("#stVerdict").innerHTML = `<div class="callout ${cls}" style="margin:0 0 0.9rem">${verdict}</div>`;

    // annual P&L
    const row = (l, v, cls2) => `<tr><td style="text-align:left">${l}</td><td class="mono ${cls2 || ""}">${v}</td></tr>`;
    $("#stPnl").innerHTML =
      row("Charging revenue (net, blended)", fmtEur(s.revCharging)) +
      row("THG-Quote proceeds", fmtEur(s.revThg)) +
      (i.blocking ? row("Blocking fees", fmtEur(i.blocking)) : "") +
      row("Energy incl. levies", "−" + fmtEur(s.costEnergy)) +
      row("Demand charge (Leistungspreis)", "−" + fmtEur(s.costDemand)) +
      row("Payment & roaming fees", "−" + fmtEur(s.costFees)) +
      row("Fixed opex (service, backend, lease)", "−" + fmtEur(s.costFixed)) +
      row("<b>EBITDA</b>", "<b>" + fmtEur(s.ebitda) + "</b>", s.ebitda >= 0 ? "good" : "bad");

    // THG stress test
    $("#stSensHead").innerHTML = `<th>Utilisation ↓</th><th>THG 0 ct</th><th>THG ${Math.round(i.thg * 100)} ct (base)</th><th>THG 15 ct</th>`;
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
  function sync() {
    $$(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === state.tab));
    $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + state.tab));
    writeHash();
    renderCountries();
    if (state.tab === "dashboard") renderDashboard();
    if (state.tab === "compare") renderCompare();
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

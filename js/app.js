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
    an: { countries: [...CODES], dv: "registrations",
          preds: M.PANEL_VARS.slice(1).map(v => v.key), x: "wallbox_evs" }
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
    if (["dashboard", "compare", "analytics", "audit"].includes(h[0])) state.tab = h[0];
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

  /* ── analytics (interactive panel builder) ─────────────────────────── */
  function chip(label, on, extra) {
    return `<button class="chip ${on ? "on" : ""}" ${extra || ""}>${label}</button>`;
  }
  function renderBuilder() {
    $("#pbCountries").innerHTML = DATA.countries.map(c =>
      chip(`${c.flag} ${c.code}`, state.an.countries.includes(c.code), `data-c="${c.code}"`)).join("");
    $$("#pbCountries .chip").forEach(b => b.onclick = () => {
      const c = b.dataset.c, set = new Set(state.an.countries);
      set.has(c) ? set.delete(c) : set.add(c);
      if (set.size < 5) return flash(b);           // keep the panel statistically sane
      state.an.countries = CODES.filter(x => set.has(x));
      renderAnalytics();
    });
    const DVS = [["registrations", "BEV Registrations (Δ stock)"], ["bev_stock", "BEV Stock (1 Jan)"]];
    $("#pbDv").innerHTML = DVS.map(([k, l]) => chip(l, state.an.dv === k, `data-dv="${k}"`)).join("");
    $$("#pbDv .chip").forEach(b => b.onclick = () => { state.an.dv = b.dataset.dv; renderAnalytics(); });
    $("#pbPreds").innerHTML = M.PANEL_VARS.slice(1).map(v =>
      chip(v.label, state.an.preds.includes(v.key), `data-p="${v.key}"`)).join("");
    $$("#pbPreds .chip").forEach(b => b.onclick = () => {
      const k = b.dataset.p, set = new Set(state.an.preds);
      set.has(k) ? set.delete(k) : set.add(k);
      if (set.size < 1) return flash(b);
      state.an.preds = M.PANEL_VARS.slice(1).map(v => v.key).filter(x => set.has(x));
      renderAnalytics();
    });
  }
  function flash(el) { el.classList.add("deny"); setTimeout(() => el.classList.remove("deny"), 350); }

  function renderRanks(an) {
    const inc = DATA.countries.filter(c => state.an.countries.includes(c.code));
    const me = cty();
    if (!state.an.countries.includes(me.code)) {
      $("#ranks").innerHTML = `<span class="chip">${me.flag} ${me.name} is excluded from the current panel</span>`;
      return;
    }
    const last = c => c.years.length - 1;
    const metrics = [
      ["Registrations 2025", c => c.bev_stock[last(c)] - c.bev_stock[last(c) - 1], true],
      ["Home-charging share", c => c.home_charge_share, true],
      ["DC points / 1k BEV", c => c.dc_points[last(c)] / (c.bev_stock[last(c)] / 1000), true],
      ["AC price (cheapest)", c => c.ac_price_2025, false]
    ];
    $("#ranks").innerHTML = `<span class="pb-lab" style="align-self:center">Where ${me.flag} sits</span>` + metrics.map(([label, fn, descending]) => {
      const sorted = [...inc].sort((a, b) => descending ? fn(b) - fn(a) : fn(a) - fn(b));
      const pos = sorted.findIndex(c => c.code === me.code) + 1;
      return `<span class="chip rank">${label}: <b>#${pos}</b>/${inc.length}</span>`;
    }).join("");
  }

  function renderAnalytics() {
    renderBuilder();
    const an = M.analyticsCustom(DATA, { countries: state.an.countries, dv: state.an.dv, predictors: state.an.preds });
    $("#anErr").innerHTML = an.err ? `<div class="callout warn" style="margin:0 0 0.9rem">${an.err}</div>` : "";
    renderRanks(an);

    // heatmap (dynamic size)
    const V = an.vars, n = V.length, heat = $("#heat");
    heat.style.gridTemplateColumns = `120px repeat(${n}, 1fr)`;
    const short = l => l.replace(" (proxy)", "").replace(" (Δ stock)", "").replace(" (1 Jan)", "");
    let html = `<div></div>` + V.map(v => `<div class="vlab">${short(v.label)}</div>`).join("");
    an.corr.forEach((row, i) => {
      html += `<div class="hlab">${short(V[i].label)}</div>`;
      row.forEach(cell => {
        const r = cell.r, a = Math.abs(r);
        const bg = r >= 0 ? `rgba(182,255,60,${0.12 + a * 0.75})` : `rgba(255,107,107,${0.12 + a * 0.75})`;
        const fg = a > 0.45 ? "#0a0a0a" : "rgba(245,245,245,0.75)";
        html += `<div class="cell" style="background:${bg};color:${fg}" title="r = ${r.toFixed(3)} · p = ${cell.p.toExponential(1)}">${r.toFixed(2)}</div>`;
      });
    });
    heat.innerHTML = html;

    // scatter with X selector, per-market highlight, click-to-select
    const xSel = $("#scX");
    if (!an.preds.some(v => v.key === state.an.x)) state.an.x = an.preds[0].key;
    xSel.innerHTML = an.preds.map(v => `<option value="${v.key}" ${v.key === state.an.x ? "selected" : ""}>${short(v.label)}</option>`).join("");
    xSel.onchange = () => { state.an.x = xSel.value; renderAnalytics(); };
    $("#scNote").innerHTML = `${cty().flag} ${cty().name}`;
    const xv = an.panel.map(r => r[state.an.x]), yv = an.panel.map(r => r[an.dvVar.key]);
    const mine = an.panel.map(r => r.country === state.country);
    const fit = M.linfit(xv, yv);
    const xMin = Math.min(...xv), xMax = Math.max(...xv);
    upsertChart("chScatter", {
      type: "scatter",
      data: { datasets: [
        { label: "panel country-years", data: an.panel.map((r, i) => ({ x: xv[i], y: yv[i] })),
          pointBackgroundColor: mine.map(m => m ? COL.acid : "rgba(90,200,255,0.35)"),
          pointBorderColor: mine.map(m => m ? COL.acid : "rgba(90,200,255,0.6)"),
          pointRadius: mine.map(m => m ? 5 : 3) },
        { type: "line", label: "OLS fit", data: [{ x: xMin, y: fit.a + fit.b * xMin }, { x: xMax, y: fit.a + fit.b * xMax }],
          borderColor: "rgba(245,245,245,0.4)", borderDash: [5, 4], pointRadius: 0, fill: false }
      ] },
      options: { maintainAspectRatio: false,
        onClick: (e, els) => {
          const el = els.find(x => x.datasetIndex === 0);
          if (!el) return;
          state.country = an.panel[el.index].country; sync();
        },
        scales: { x: { ticks: { callback: v => fmtN(v) } }, y: { ticks: { callback: v => fmtN(v) } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: i => { const r = an.panel[i.dataIndex]; return ` ${r.country} ${r.year}: x=${fmtN(i.parsed.x)}, y=${fmtN(i.parsed.y)}`; } } } } }
    });

    // OLS + VIF
    if (an.model) {
      $("#olsMeta").textContent = `Standardised OLS · DV: ${an.dvVar.label} · ${state.an.countries.length} markets · N = ${an.model.n} country-years · R² = ${an.model.r2.toFixed(3)} · adj. R² = ${an.model.adjR2.toFixed(3)}`;
      $("#olsBody").innerHTML = an.model.terms.map(t => `
        <tr>
          <td>${t.name}</td>
          <td class="mono">${t.beta.toFixed(3)}</td>
          <td class="mono">${t.se.toFixed(3)}</td>
          <td class="mono">${t.t.toFixed(2)}</td>
          <td class="mono ${t.p < 0.05 ? "good" : ""}">${t.p < 0.0001 ? "<0.0001" : t.p.toFixed(4)}</td>
          <td class="stars">${stars(t.p)}</td>
        </tr>`).join("");
      $("#vifBody").innerHTML = an.vif.map(v => `
        <tr><td>${v.name}</td><td class="mono ${v.vif > 10 ? "warn" : ""}">${v.vif.toFixed(1)}</td></tr>`).join("");

      const wb = an.model.terms.find(t => t.name.startsWith("EVs in Wallbox"));
      if (wb && wb.p < 0.05) {
        $("#anCallout").innerHTML =
          `<b>The thesis finding holds on your panel selection:</b> home-charging access dominates ${an.dvVar.label.toLowerCase()} (β = ${wb.beta.toFixed(2)}, p ${wb.p < 0.0001 ? "< 0.0001" : "= " + wb.p.toFixed(4)}). The original 14-market study found the same — wallbox households r = 0.795, the strongest driver, with charging price near zero. <b>Infrastructure availability beats price.</b>`;
      } else {
        const sig = an.model.terms.slice(1).filter(t => t.p < 0.05).sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))[0];
        $("#anCallout").innerHTML = sig
          ? `On this selection, the strongest significant driver is <b>${sig.name}</b> (β = ${sig.beta.toFixed(2)}, p = ${sig.p.toFixed(4)}). Add the wallbox proxy back in to test the original study's headline (wallbox households r = 0.795, R² = 0.735).`
          : `No predictor reaches p < 0.05 on this selection — widen the panel or add predictors. The original study's headline: wallbox access r = 0.795, R² = 0.735.`;
      }
    } else {
      $("#olsMeta").textContent = ""; $("#olsBody").innerHTML = ""; $("#vifBody").innerHTML = ""; $("#anCallout").innerHTML = "";
    }
  }

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
    if (state.tab === "analytics") renderAnalytics();
    if (state.tab === "audit") renderAudit();
  }
  $$(".tabs button").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; sync(); });

  /* ── init ──────────────────────────────────────────────────────────── */
  $("#gen").textContent = DATA.generated;
  $("#dataChip").textContent = `DATA ${DATA.generated} · 14 MARKETS · OPEN DATA · MIT`;
  renderCockpit();
  sync();
})();

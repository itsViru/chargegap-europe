/* ============================================================================
 * ChargeGap Europe — model engine
 * ----------------------------------------------------------------------------
 * Part 1 ports the calculated fields of the "Strategic Investment Planner:
 * Germany 2030" Tableau workbook 1:1 (original field names quoted in comments)
 * and generalises them to any market in data/countries.js.
 *
 * Part 2 ports the quantitative track of the master thesis "E-Mobility Market
 * Dynamics" (RWTH Aachen × Numbat GmbH, 2024): Pearson correlations, a
 * standardised OLS regression with p-values, and VIF diagnostics — computed
 * client-side on the open country panel.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CGModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Model constants (Tableau workbook + case-study deck)                */
  /* ------------------------------------------------------------------ */
  const C = {
    MILEAGE_KM: 14000,        // km/yr, German federal average (Shell/Prognos, KBA)
    CONSUMPTION_KWH_100KM: 19,// mid-range BEV incl. real-world overhead
    CHARGING_LOSS: 1.12,      // +12% AC→DC conversion loss (grid-side demand)
    AC_KW: 11,                // Type 2 destination charging
    DC_KW: 150,               // conservative HPC planning baseline (energy model)
    DC_KW_AFIR: 200,          // DC rating used in 'C_Total_Installed_Power_kW'
    HOURS_YR: 8760,
    PRICE_EUR_KWH: 0.50,      // blended CPO retail price (model constant)
    PLUG_KW: 50,              // weighted avg plug power: 11*0.8 + 200*0.2 ≈ 50
    PLUG_FACTOR: 2.2,         // network head-room factor in 'C_Required_Total_Plugs'
    AC_WEIGHT: 0.8,
    DC_WEIGHT: 0.2,
    AFIR_MIN: 1.3,            // kW installed per BEV (EU 2023/1804)
    // "Validated Logic": historical years are locked to these baselines so
    // sliders can never rewrite history ('C_Validated_*' fields).
    HIST: { intensity: 0.30, acEff: 0.06, dcEff: 0.20, speed: 1.0 },
    // Slider baselines as documented in the public README of the case study.
    DEFAULTS: { intensity: 0.30, acEff: 0.13, dcEff: 0.09, speed: 1.0 },
    LAST_HIST_YEAR: 2025,
    END_YEAR: 2030,
    // Fleet extrapolation when no official 2030 target exists:
    CAGR_CAP: 0.35,           // cap 3-yr CAGR at 35%/yr
    CAGR_DAMP: 0.90           // growth decays 10%/yr beyond 2026
  };

  /* ------------------------------------------------------------------ */
  /* Series construction: history + 2026–2030 projection                 */
  /* ------------------------------------------------------------------ */
  function geometricPath(v0, vT, steps) {
    const r = Math.pow(vT / v0, 1 / steps);
    const out = [];
    for (let i = 1; i <= steps; i++) out.push(v0 * Math.pow(r, i));
    return out;
  }

  function projectFleet(cty) {
    const s = cty.bev_stock, f25 = s[s.length - 1];
    if (cty.fleet_2030_target) {
      return { path: geometricPath(f25, cty.fleet_2030_target, 5), mode: "official target" };
    }
    const f22 = s[s.length - 4];
    let g = Math.pow(f25 / f22, 1 / 3) - 1;
    g = Math.min(Math.max(g, 0), C.CAGR_CAP);
    const path = []; let v = f25, gy = g;
    for (let y = 2026; y <= 2030; y++) { v *= 1 + gy; path.push(v); gy *= C.CAGR_DAMP; }
    return { path, mode: "damped 3-yr CAGR extrapolation" };
  }

  function projectChargers(cty) {
    const ac = cty.ac_points, dc = cty.dc_points, n = ac.length;
    if (cty.network_2030_target) {
      return {
        ac: geometricPath(ac[n - 1], cty.network_2030_target.ac, 5),
        dc: geometricPath(dc[n - 1], cty.network_2030_target.dc, 5),
        mode: "official network target"
      };
    }
    const add = a => ((a[n - 1] - a[n - 4]) / 3);           // mean net adds, last 3 yrs
    const acAdd = add(ac), dcAdd = add(dc), acP = [], dcP = [];
    for (let i = 1; i <= 5; i++) { acP.push(ac[n - 1] + acAdd * i); dcP.push(dc[n - 1] + dcAdd * i); }
    return { ac: acP, dc: dcP, mode: "3-yr deployment-trend continuation" };
  }

  /* ------------------------------------------------------------------ */
  /* Scenario engine — one row per year, 2017–2030                       */
  /* ------------------------------------------------------------------ */
  function buildScenario(cty, params) {
    const p = Object.assign({}, C.DEFAULTS, params || {});
    const fleetProj = projectFleet(cty);
    const chProj = projectChargers(cty);
    const rows = [];

    for (let y = 2017; y <= C.END_YEAR; y++) {
      const hist = y <= C.LAST_HIST_YEAR;
      const i = y - 2017;
      const fleetBase = hist ? cty.bev_stock[i] : fleetProj.path[y - 2026];
      const ac = hist ? cty.ac_points[i] : chProj.ac[y - 2026];
      const dc = hist ? cty.dc_points[i] : chProj.dc[y - 2026];

      // 'C_Validated_*' — history locked, sliders act on 2026–2030 only
      const speed = hist ? C.HIST.speed : p.speed;
      const intensity = hist ? C.HIST.intensity : p.intensity;
      const acEff = hist ? C.HIST.acEff : p.acEff;
      const dcEff = hist ? C.HIST.dcEff : p.dcEff;

      // 'C_Interactive_Fleet_Size'
      const fleet = fleetBase * speed;
      // 'C_National_Fleet_Demand_GWh'
      const demandNat = (fleet * (C.MILEAGE_KM / 100 * C.CONSUMPTION_KWH_100KM) * C.CHARGING_LOSS) / 1e6;
      // 'C_Addressable_CPO_Market_GWh'
      const addressable = demandNat * intensity;
      // 'C_Supply_Capacity_GWh'
      const supply = ((ac * C.AC_KW * C.HOURS_YR * acEff) + (dc * C.DC_KW * C.HOURS_YR * dcEff)) / 1e6;
      // 'C_Supply_Gap' / 'C_Revenue_Opportunity_Gap_EUR' / 'C_Unmet_Revenue_Opportunity_EUR'
      const gapGWh = addressable - supply;
      const revGap = gapGWh * 1e6 * C.PRICE_EUR_KWH;
      const unmetRev = Math.max(gapGWh, 0) * 1e6 * C.PRICE_EUR_KWH;
      // 'C_Total_Revenue_Potential_EUR'
      const revPotential = addressable * 1e6 * C.PRICE_EUR_KWH;
      // ' C_Total_Installed_Power_kW' / 'C_AFIR_Compliance_Index'
      const installedKW = ac * C.AC_KW + dc * C.DC_KW_AFIR;
      const afir = installedKW / fleet;
      // 'C_Required_Total_Plugs' / 'C_Infrastructure_Sufficiency'
      const avgEff = acEff * C.AC_WEIGHT + dcEff * C.DC_WEIGHT;
      const requiredPlugs = (addressable * 1e6 / (C.PLUG_KW * C.HOURS_YR * avgEff)) * C.PLUG_FACTOR;
      const sufficiency = (ac + dc) / requiredPlugs;
      // 'C_EV_to_Charger_Ratio'
      const evPerPoint = fleet / (ac + dc);

      rows.push({
        year: y, hist, fleet, fleetBase, ac, dc, points: ac + dc,
        demandNat, addressable, supply, gapGWh, revGap, unmetRev, revPotential,
        installedKW, afir, requiredPlugs, sufficiency, evPerPoint,
        evShare: cty.total_vehicles_m ? fleet / (cty.total_vehicles_m * 1e6) : null
      });
    }

    // 'C_Total_5Yr_Gap' — WINDOW_SUM of unmet revenue across 2026–2030
    const proj = rows.filter(r => !r.hist);
    const kpi = {
      y2030: rows[rows.length - 1],
      cumUnmet26_30: proj.reduce((a, r) => a + r.unmetRev, 0),
      cumGapGWh26_30: proj.reduce((a, r) => a + Math.max(r.gapGWh, 0), 0),
      fleetMode: fleetProj.mode, chargerMode: chProj.mode
    };
    return { rows, kpi, params: p };
  }

  /* ------------------------------------------------------------------ */
  /* Part 2 — thesis statistics track                                    */
  /* ------------------------------------------------------------------ */

  // Regularised incomplete beta (Lentz continued fraction) → Student-t p-value
  function logGamma(x) {
    const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += g[j] / ++y;
    return -t + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function tPvalue(t, df) { return ibeta(df / 2, 0.5, df / (df + t * t)); } // two-tailed

  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  function std(a) { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); }
  const zscore = a => { const m = mean(a), s = std(a) || 1; return a.map(v => (v - m) / s); };

  function pearson(x, y) {
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    const r = sxy / Math.sqrt(sxx * syy);
    const df = x.length - 2, t = r * Math.sqrt(df / (1 - r * r || 1e-12));
    return { r, p: tPvalue(Math.abs(t), df) };
  }

  // Gauss-Jordan inverse (small symmetric matrices)
  function inverse(M) {
    const n = M.length, A = M.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      [A[col], A[piv]] = [A[piv], A[col]];
      const pv = A[col][col];
      if (Math.abs(pv) < 1e-12) throw new Error("Singular matrix");
      for (let j = 0; j < 2 * n; j++) A[col][j] /= pv;
      for (let r = 0; r < n; r++) if (r !== col) {
        const f = A[r][col];
        for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[col][j];
      }
    }
    return A.map(row => row.slice(n));
  }

  /** OLS with intercept. X: array of predictor columns; y: response array. */
  function ols(Xcols, y, names) {
    const n = y.length, k = Xcols.length;
    const X = []; // design matrix rows with intercept
    for (let i = 0; i < n; i++) X.push([1, ...Xcols.map(c => c[i])]);
    const p = k + 1;
    // X'X and X'y
    const XtX = Array.from({ length: p }, () => Array(p).fill(0));
    const Xty = Array(p).fill(0);
    for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
    const inv = inverse(XtX);
    const beta = inv.map(row => row.reduce((s, v, j) => s + v * Xty[j], 0));
    const yhat = X.map(r => r.reduce((s, v, j) => s + v * beta[j], 0));
    const ym = mean(y);
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) { ssRes += (y[i] - yhat[i]) ** 2; ssTot += (y[i] - ym) ** 2; }
    const df = n - p, sigma2 = ssRes / df;
    const r2 = 1 - ssRes / ssTot, adjR2 = 1 - (1 - r2) * (n - 1) / df;
    const terms = beta.map((b, j) => {
      const se = Math.sqrt(sigma2 * inv[j][j]);
      const t = b / se;
      return { name: j === 0 ? "(Intercept)" : names[j - 1], beta: b, se, t, p: tPvalue(Math.abs(t), df) };
    });
    return { terms, r2, adjR2, n, df };
  }

  /** Build the country-year panel for the analytics track (2018–2025). */
  function buildPanel(data) {
    const rows = [];
    data.countries.forEach(c => {
      for (let i = 1; i < c.years.length; i++) {           // Δ needs prior year
        const y = c.years[i];
        const priceGrowth = 0.70 + 0.0375 * (y - 2017);    // indicative price path
        rows.push({
          country: c.code, year: y,
          registrations: c.bev_stock[i] - c.bev_stock[i - 1], // new-registration proxy (net stock change)
          bev_stock: c.bev_stock[i],
          wallbox_evs: c.bev_stock[i] * c.home_charge_share,  // proxy: BEV stock × home-charging share
          home_charge_share: c.home_charge_share,
          population: c.population_m * 1e6,
          gdp_per_capita: c.gdp_per_capita_keur * 1000,
          ac_points: c.ac_points[i], dc_points: c.dc_points[i],
          total_points: c.ac_points[i] + c.dc_points[i],
          ac_price: c.ac_price_2025 * priceGrowth,
          dc_price: c.dc_price_2025 * priceGrowth
        });
      }
    });
    return rows;
  }

  const PANEL_VARS = [
    { key: "registrations", label: "BEV Registrations (Δ stock)" },
    { key: "wallbox_evs", label: "EVs in Wallbox Households (proxy)" },
    { key: "population", label: "Inhabitants" },
    { key: "gdp_per_capita", label: "GDP per Capita" },
    { key: "ac_points", label: "AC Points" },
    { key: "dc_points", label: "DC/HPC Points" },
    { key: "ac_price", label: "AC Charging Price" },
    { key: "dc_price", label: "DC Charging Price" }
  ];

  function analytics(data) {
    const panel = buildPanel(data);
    const cols = {};
    PANEL_VARS.forEach(v => cols[v.key] = panel.map(r => r[v.key]));
    // correlation matrix
    const corr = PANEL_VARS.map(a => PANEL_VARS.map(b =>
      a.key === b.key ? { r: 1, p: 0 } : pearson(cols[a.key], cols[b.key])));
    // standardised OLS: registrations ~ predictors
    const predictors = PANEL_VARS.slice(1);
    const y = zscore(cols.registrations);
    const X = predictors.map(v => zscore(cols[v.key]));
    const model = ols(X, y, predictors.map(v => v.label));
    // VIF (on standardised predictors)
    const vif = predictors.map((v, idx) => {
      const others = X.filter((_, j) => j !== idx);
      const m = ols(others, X[idx], []);
      return { name: v.label, vif: 1 / (1 - m.r2) };
    });
    return { panel, corr, model, vif, vars: PANEL_VARS };
  }

  /* ------------------------------------------------------------------ */
  /* Part 3 — CPO decision-support helpers                                */
  /* ------------------------------------------------------------------ */

  /** First projected year a predicate holds; null if never. */
  function firstYear(rows, pred) {
    const r = rows.find(x => !x.hist && pred(x));
    return r ? r.year : null;
  }

  /**
   * Build-out ticket for the 2030 scenario year: how many additional plugs
   * close the gap, what they cost, what they earn, simple payback.
   * Planning heuristic — capex/margin are user-adjustable assumptions.
   */
  const INVEST_DEFAULTS = { capexAC: 6000, capexDC: 90000, margin: 0.30 };
  function investCase(scenario, assumptions) {
    const a = Object.assign({}, INVEST_DEFAULTS, assumptions || {});
    const r = scenario.kpi.y2030, p = scenario.params;
    const extraPlugs = Math.max(r.requiredPlugs - r.points, 0);
    const acNew = extraPlugs * C.AC_WEIGHT, dcNew = extraPlugs * C.DC_WEIGHT;
    const capex = acNew * a.capexAC + dcNew * a.capexDC;
    // energy the new plugs can dispense at scenario utilisation…
    const newCapGWh = (acNew * C.AC_KW * C.HOURS_YR * p.acEff +
                       dcNew * C.DC_KW * C.HOURS_YR * p.dcEff) / 1e6;
    // …capped by what the market actually leaves unserved
    const servedGWh = Math.min(newCapGWh, Math.max(r.gapGWh, 0));
    const revenue = servedGWh * 1e6 * C.PRICE_EUR_KWH;
    const contribution = revenue * a.margin;
    const payback = contribution > 0 ? capex / contribution : Infinity;
    return { extraPlugs, acNew, dcNew, capex, newCapGWh, servedGWh,
             revenue, contribution, payback, assumptions: a,
             oversupplied: r.gapGWh <= 0 };
  }

  /**
   * Opportunity Score 0–100 across markets under one scenario.
   * Weighted min-max composite (documented heuristic):
   *   40% cumulative unmet revenue 2026–30 · 20% AFIR shortfall 2030
   *   20% EVs-per-point pressure 2030     · 20% fleet growth 2025→30
   */
  const SCORE_WEIGHTS = { unmet: 0.40, afirShort: 0.20, pressure: 0.20, growth: 0.20 };
  function opportunityScores(data, params) {
    const raw = data.countries.map(c => {
      const sc = buildScenario(c, params), r = sc.kpi.y2030;
      const f25 = sc.rows.find(x => x.year === 2025).fleet;
      return { code: c.code,
        unmet: sc.kpi.cumUnmet26_30,
        afirShort: Math.max(0, C.AFIR_MIN - r.afir),
        pressure: r.evPerPoint,
        growth: Math.pow(r.fleet / f25, 1 / 5) - 1 };
    });
    const norm = key => {
      const vs = raw.map(x => x[key]), lo = Math.min(...vs), hi = Math.max(...vs);
      return v => hi > lo ? (v - lo) / (hi - lo) : 0;
    };
    const n = { unmet: norm("unmet"), afirShort: norm("afirShort"),
                pressure: norm("pressure"), growth: norm("growth") };
    const out = {};
    raw.forEach(x => {
      const parts = {
        unmet: n.unmet(x.unmet), afirShort: n.afirShort(x.afirShort),
        pressure: n.pressure(x.pressure), growth: n.growth(x.growth)
      };
      const score = Object.entries(SCORE_WEIGHTS)
        .reduce((s, [k, w]) => s + w * parts[k], 0) * 100;
      out[x.code] = { score: Math.round(score), parts, raw: x };
    });
    return out;
  }

  /** Least-squares line y = a + b·x for scatter overlays. */
  function linfit(x, y) {
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
    const b = sxx ? sxy / sxx : 0;
    return { a: my - b * mx, b };
  }

  /**
   * Analytics on a configurable sub-panel: choose countries, DV, predictors.
   * opts = { countries:[codes], dv:"registrations"|"bev_stock", predictors:[keys] }
   */
  function analyticsCustom(data, opts) {
    const o = Object.assign({ countries: data.countries.map(c => c.code),
      dv: "registrations",
      predictors: PANEL_VARS.slice(1).map(v => v.key) }, opts || {});
    const panel = buildPanel(data).filter(r => o.countries.includes(r.country));
    const dvVar = PANEL_VARS.find(v => v.key === o.dv) ||
      { key: "bev_stock", label: "BEV Stock (1 Jan)" };
    const preds = PANEL_VARS.filter(v => o.predictors.includes(v.key) && v.key !== o.dv);
    const vars = [dvVar, ...preds];
    const cols = {};
    vars.forEach(v => cols[v.key] = panel.map(r => r[v.key]));
    const corr = vars.map(a => vars.map(b =>
      a.key === b.key ? { r: 1, p: 0 } : pearson(cols[a.key], cols[b.key])));
    const y = zscore(cols[dvVar.key]);
    const X = preds.map(v => zscore(cols[v.key]));
    let model = null, vif = [], err = null;
    try {
      model = ols(X, y, preds.map(v => v.label));
      vif = preds.length > 1 ? preds.map((v, i) => {
        const others = X.filter((_, j) => j !== i);
        const m = ols(others, X[i], []);
        return { name: v.label, vif: 1 / (1 - m.r2) };
      }) : preds.map(v => ({ name: v.label, vif: 1 }));
    } catch (e) { err = "Predictors are collinear for this selection — remove one and retry."; }
    return { panel, vars, dvVar, preds, corr, model, vif, err, cols };
  }

  return { C, buildScenario, analytics, analyticsCustom, buildPanel, PANEL_VARS,
           investCase, INVEST_DEFAULTS, opportunityScores, SCORE_WEIGHTS,
           firstYear, linfit,
           _stats: { ols, pearson, tPvalue, ibeta, zscore, inverse } };
});

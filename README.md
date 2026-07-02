# ⚡ ChargeGap Europe

**Open-source EV charging investment planner & market analytics for 14 European markets — 2017 to 2030.**

ChargeGap Europe answers one question, per market and per scenario:

> *How big is the gap between EV charging demand and public supply capacity by 2030 — and what is that gap worth in euros to a Charge Point Operator?*

It extends the author's **[Strategic Investment Planner: Germany 2030](https://github.com/itsViru/EV_Charging_Infrastructure_Analysis_Tool)** (Tableau) from one market to fourteen, and re-implements the quantitative track of the master thesis **[E-Mobility Market Dynamics](https://github.com/itsViru/E-Mobility_Market_Dynamics_Model)** (RWTH Aachen × Numbat GmbH, 2024) so the correlation matrix, OLS regression and VIF diagnostics run **live in the browser** on an open country panel.

No backend. No build step. No tracking. One HTML file, two JS files, one JSON — hostable on GitHub Pages, runnable from a double-clicked `index.html`.

---

## What it does

| Tab | What you get |
|---|---|
| **Dashboard** | Per-market scenario cockpit: 4 sliders (Urban Business Intensity · AC Efficiency · DC/HPC Efficiency · Adoption Speed) driving the ⭐ **Revenue Opportunity Gap** (with the first structural-undersupply year), cumulative unmet revenue 2026–30, **AFIR Compliance Index** (vs the 1.3 kW/BEV fleet minimum, EU 2023/1804, incl. first-breach year), Infrastructure Sufficiency, EVs per point, four charts — plus a **CPO build-out ticket**: additional plugs (80/20 AC/DC), capex, energy & revenue per year and simple payback with adjustable cost assumptions. |
| **Compare** | One scenario, fourteen markets: an **Opportunity Score** (0–100 weighted composite: 40% unmet revenue · 20% AFIR shortfall · 20% EVs-per-point pressure · 20% fleet growth) with a top-pick callout, sortable league table and ranked Revenue-Gap bar chart. Surplus markets show in cyan, undersupplied in lime. |
| **Site Economics** | **Standort-Check** — per-charge-point unit economics under German conditions: 5 presets (AC 11/22, DC 50, HPC 150/300), a utilisation slider benchmarked against reality (Ø DE occupancy 12%, HPC Ø 6–7%, 30% = "very good"), ad-hoc/roaming revenue mix with 19% VAT handling, **THG-Quote proceeds**, demand charges (Leistungspreis), BKZ/grid capex with energisation delay — producing **break-even utilisation**, the utilisation needed to earn back capex within the hardware lifetime, EBITDA, simple payback, a 10-year cash curve and a **THG stress test** (payback at 0 / base / 15 ct). |
| **Model Audit** | A **live audit trail**: the current market + scenario pushed through every Tableau field with real numbers plugged in — plus Validated Logic, projection rules, constants with sources, per-market provenance, refresh cadence, open-data endpoint and one-click JSON/CSV downloads. The dashboard's ⭐ KPI links straight to it ("audit this number →"). |

**Scenario permalinks:** the URL hash encodes tab, market and all four sliders (`#dashboard/DE/i80ac13dc9s130`) — the cockpit's *Copy scenario link* button gives any stakeholder a URL that reproduces the exact case.

**Markets** (the 14 from the thesis): 🇩🇪 🇳🇴 🇫🇷 🇳🇱 🇬🇧 🇦🇹 🇪🇸 🇮🇹 🇧🇪 🇸🇪 🇩🇰 🇫🇮 🇨🇭 🇨🇿

---

## Quick start

```bash
git clone https://github.com/<user>/chargegap-europe
cd chargegap-europe
python -m http.server 8000     # or simply open index.html — file:// works too
```

**Deploy on GitHub Pages:** push to a repo → *Settings → Pages → Deploy from a branch → main / (root)* → done. The `.nojekyll` file is already included.

---

## The model — ported field-for-field from Tableau

Historical years (2017–2025) are **locked** to source-verified values with the workbook's empirical baselines (Intensity 0.30 · AC-Eff 0.06 · DC-Eff 0.20 · Speed 1.0×). Sliders act on 2026–2030 only — the **Validated Logic** principle: the tool cannot rewrite history.

```text
C_National_Fleet_Demand_GWh   = (Fleet × Speed) × (14,000/100 × 19) × 1.12 / 1e6
C_Addressable_CPO_Market_GWh  = National_Demand × Urban_Business_Intensity
C_Supply_Capacity_GWh         = (AC×11kW×8760h×AC_Eff + DC×150kW×8760h×DC_Eff) / 1e6
C_Supply_Gap                  = Addressable − Supply
C_Revenue_Opportunity_Gap_EUR = Gap × 1e6 × €0.50/kWh          ← ⭐ North-Star KPI
C_Unmet_Revenue_Opportunity   = max(Gap, 0) × 1e6 × €0.50
C_Total_Installed_Power_kW    = AC×11 + DC×200
C_AFIR_Compliance_Index       = Installed_kW / Fleet            (must be ≥ 1.3)
C_Required_Total_Plugs        = Addressable×1e6 / (50kW × 8760 × avg_eff) × 2.2
C_Infrastructure_Sufficiency  = Total_Points / Required_Plugs
```

Constants (14,000 km/yr · 19 kWh/100 km · +12 % charging loss · €0.50/kWh blended · 11/150/200 kW ratings · 80/20 AC-DC split) follow the original case study and its sources (KBA, Shell/Prognos, ADAC, Fraunhofer ISI, Bundesnetzagentur, Masterplan Ladeinfrastruktur II).

**Projections 2026–2030:** markets with an official national target interpolate geometrically to it (Germany: 15 M BEV, 800 k AC / 200 k DC — Masterplan Ladeinfrastruktur II); all others use a damped 3-year CAGR for the fleet (capped 35 %/yr, decaying 10 %/yr) and trend-continuation of net charger additions. The mode used is printed on every dashboard.

---

## Site Economics — the question every German CPO actually asks

The academic regression tab was retired in v3 and replaced with the **Standort-Check**: "does this site pencil, at what utilisation, and when do I get my money back?" It encodes the German specifics that generic calculators miss — the ad-hoc/roaming revenue split (drivers' prices carry 19% VAT; most volume settles at lower roaming rates), **THG-Quote proceeds** (2–6 ct/kWh in 2024, 3–6 ct in 2025, ~8–15 ct expected for 2026 — volatile by design of the market), **demand charges** (Leistungspreis, the profitability killer at low utilisation), the **BKZ** rule (no Baukostenzuschuss below 30 kW in low voltage, NAV §11(3)) and medium-voltage lead times of 12–24 months modelled as a revenue delay on the cash curve.

Grounded defaults, all editable: German public points averaged only **12% simultaneous occupancy in 2025** (BDEW); HPC averaged **6–7%** with only ~1% of sites above the **30%** "very good" mark (Elvah/Automobilwoche, Ionity). The verdict engine tells you plainly whether a configuration loses money, covers opex but never repays capex, or pencils — and stress-tests the THG dependency, because no serious operator should build a case on quota proceeds alone.

The thesis statistics engine (Pearson, standardised OLS with full inference, VIF — validated against critical-value tables) **remains in `js/model.js`** as an MIT-licensed, dependency-free library (`analytics`, `analyticsCustom`, `_stats`); the wallbox-access finding it established lives on in the Urban-Business-Intensity slider of the macro model.

---

## Data & honesty — read before citing

| Series | Status |
|---|---|
| 🇩🇪 Germany | **Verified** — identical to the original workbook's master dataset: KBA FZ13 BEV stock (1-Jan convention), Bundesnetzagentur charging registry, Masterplan-II 2030 targets. |
| Other 13 markets | **Indicative snapshot** — rounded estimates from public sources (EAFO country dashboards, national registries), shipped so the engine is demonstrable out of the box. Refresh before citing. |

Every country carries a `quality` flag and a `sources` list; the UI shows a permanent banner and per-market provenance line. **Nothing in this repo silently claims verified status** — a country flips to `verified` only through an explicit override with a named source.

### Refreshing the data

```bash
pip install -r etl/requirements.txt
python etl/fetch_data.py                # Eurostat pulls + optional EAFO CSV + overrides
```

- **Eurostat (automatic):** BEV stock (`road_eqs_carpda`, end-of-year → shifted to the panel's 1-Jan convention) and population (`demo_pjan`). UK/CH coverage is partial — untouched series keep snapshot values and the run is documented in `refresh_log` inside the JSON.
- **EAFO charging points (manual):** export country data into `etl/manual/eafo_points.csv` (`country,year,ac_points,dc_points`) — EAFO has no stable public API.
- **Overrides:** drop partial country objects into `etl/overrides/*.json` (e.g. an official national 2030 target with its source note).

A **GitHub Action** (`.github/workflows/refresh-data.yml`) runs the ETL **monthly** and commits diffs — enable Actions in your fork and the snapshot keeps itself current where sources allow. Monthly is a deliberate choice: the underlying statistics (KBA, Bundesnetzagentur, Eurostat/EAFO) move monthly at best, so a faster cadence would burn CI minutes without adding information. A **12-hour cron line is already wired in as a comment** for the day live feeds (e.g. national ad-hoc price NAPs) join the panel.

---

## Open data — the JSON is the API

The whole panel is a static file; on GitHub Pages it behaves like a keyless, rate-limit-free endpoint:

```bash
curl https://<user>.github.io/chargegap-europe/data/countries.json
```

```js
const d = await (await fetch(".../data/countries.json")).json();
d.countries.find(c => c.code === "DE").bev_stock;   // → [34022, …, 1651643]
```

CSV exports (panel + current scenario) are one click away in the Methodology tab. MIT-licensed — attribution appreciated.

---

## Architecture

```text
chargegap-europe/
├── index.html                    # single page, four views
├── styles.css                    # design tokens (dark / acid-lime, Inter · Instrument Serif · JetBrains Mono)
├── js/
│   ├── model.js                  # Tableau-ported engine + stats (UMD, node-testable)
│   └── app.js                    # UI: cockpit, KPI tiles, Chart.js charts, tables
├── data/
│   ├── countries.js              # panel as window.CG_DATA (works on file://)
│   └── countries.json            # same panel — the open-data endpoint
├── etl/
│   ├── fetch_data.py             # Eurostat + EAFO CSV + overrides → regenerates data/
│   ├── requirements.txt
│   ├── manual/                   # eafo_points.csv drop-in (documented)
│   └── overrides/                # partial country JSONs, merged last
└── .github/workflows/refresh-data.yml   # monthly auto-refresh
```

Only external dependency at runtime: Chart.js from a CDN. The model layer is plain functions — `node -e "require('./js/model.js')"` and test away.

---

## Positioning & credits

- **Model lineage:** formulas, constants, sliders and the Validated-Logic principle are the author's own work from the *Strategic Investment Planner: Germany 2030* case study (Tableau, for a management consultancy).
- **Analytics lineage:** methodology from the master thesis *E-Mobility Market Dynamics — Drivers, Regulations, and Infrastructure Analysis for Informed Charging Infrastructure Development* (RWTH Aachen University × Numbat GmbH, 2024).
- **Inspiration, not affiliation:** the open-data, AFIR-aware product framing is inspired by live-data tools like [ChargeIntel](https://www.chargeintel.eu). ChargeGap Europe is independent and complementary — ChargeIntel streams live German CPO **ad-hoc prices**; ChargeGap models **investment scenarios and market dynamics** across Europe.

## Roadmap

- [ ] EAFO auto-ingest once a stable endpoint exists (replacing the manual CSV)
- [ ] PHEV term in the AFIR index (0.8 kW per PHEV alongside 1.3 kW per BEV)
- [ ] Standort-Check presets for further countries (AT, NL, FR) and Bundesland-level price/utilisation benchmarks
- [ ] AFIR 2027 contactless-terminal retrofit as a one-click capex line
- [ ] National ad-hoc price feeds (Mobilithek-style NAPs) to replace the €0.50 constant per market
- [ ] Per-country mileage / consumption constants
- [ ] Map view (choropleth of Revenue Gap and AFIR status)
- [ ] Incentive-scoring track from the thesis (multi-criteria country ratings)

## License

MIT © 2026 [Virendra Kowale](https://itsviru.github.io/VirendraKowale.github.io/) · [LinkedIn](https://www.linkedin.com/in/virendra-kowale) · [GitHub](https://github.com/itsViru)

> *"Moving a slider re-calculates a billion-euro forecast. That's the point."*

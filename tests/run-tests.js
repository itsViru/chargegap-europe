#!/usr/bin/env node
/* ============================================================================
 * ChargeGap Europe v3.1 — AFIR-2027 behaviour suite (spec §7) + regression
 * ----------------------------------------------------------------------------
 * Section A  guards the pre-v3.1 baseline: with the terminal line OFF (the
 *            default), every Standort-Check output must be *bit-identical*
 *            to the pristine v3.0 model (tests/fixtures/model.baseline.js).
 *            This substitutes for the private 21-test baseline suite — run
 *            that one too before pushing.
 * Section B  spec tests 1–8 (model level, incl. hand-computed values ±1e-9).
 * Section C  spec tests 9–11 + UI behaviour (jsdom).
 * Run:  node tests/run-tests.js
 * ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const NEW = require(path.join(ROOT, "js", "model.js"));
const OLD = require(path.join(ROOT, "tests", "fixtures", "model.baseline.js"));

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  \u2713 " + name); }
  catch (e) { fail++; console.log("  \u2717 " + name + "\n      " + (e && e.message || e)); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function close(a, b, eps, msg) {
  eps = eps === undefined ? 1e-9 : eps;
  if (a === b) return; // covers Infinity === Infinity
  if (!(Math.abs(a - b) <= eps)) throw new Error((msg || "") + ` expected ${b}, got ${a} (\u0394 ${Math.abs(a - b)})`);
}

/* ────────────────────────────────────────────────────────────────────────
 * Section A — baseline regression: terminal line off ⇒ v3.0 bit-identical
 * ──────────────────────────────────────────────────────────────────────── */
console.log("\nA. Baseline regression (v3.0 outputs unchanged while feature is off)");

const SCALARS = ["energy", "hoursDay", "sessionsDay", "blendedNet", "revCharging",
  "revThg", "revenue", "costEnergy", "costDemand", "costFees", "costFixed",
  "costs", "ebitda", "capex", "marginKWh", "uBreakEven", "uPayback", "payback"];

function identical(inp, label) {
  const a = OLD.siteCase(inp), b = NEW.siteCase(inp);
  SCALARS.forEach(k => ok(a[k] === b[k], `${label}: ${k} drifted (${a[k]} → ${b[k]})`));
  ok(a.cash.length === b.cash.length, label + ": cash length");
  a.cash.forEach((v, i) => ok(v === b.cash[i], `${label}: cash[${i}] drifted`));
  a.sens.forEach((r, ri) => r.forEach((v, ci) =>
    ok(v === b.sens[ri][ci], `${label}: sens[${ri}][${ci}] drifted`)));
}

Object.keys(NEW.SITE_PRESETS).forEach(k =>
  t(`preset ${k}: all outputs identical to v3.0`, () => identical({ ...NEW.SITE_PRESETS[k] }, k)));

[
  ["util 12%", { util: 0.12 }],
  ["util 3%, THG 0", { util: 0.03, thg: 0 }],
  ["blocking 800", { blocking: 800 }],
  ["ad-hoc 60% @ 0.79", { adhocShare: 0.6, price: 0.79 }],
  ["payFee 7%, demand 120", { payFee: 0.07, demandCharge: 120 }],
  ["kwhSession 0 (division guard)", { kwhSession: 0 }],
  ["negative-margin config", { price: 0.30, roamingNet: 0.20, energyCost: 0.40, thg: 0 }]
].forEach(([label, inp]) => t(`variant ${label}: identical to v3.0`, () => identical(inp, label)));

t("new AFIR inputs default safe: GRANDFATHERED, terminal line off", () => {
  const s = NEW.siteCase({});
  ok(s.afir === "GRANDFATHERED", "default status " + s.afir);
  ok(s.termOn === false, "termOn should auto-resolve false");
  ok(s.costTermTx === 0 && s.costTermFix === 0, "no terminal costs by default");
});

/* ────────────────────────────────────────────────────────────────────────
 * Section B — spec §7 tests 1–8 (model level)
 * ──────────────────────────────────────────────────────────────────────── */
console.log("\nB. Spec §7 model tests");

const HPC = { ...NEW.SITE_PRESETS.hpc150 };
const FLAGS = { pubAccess: true, preAfir: true, tenvOrSecure: true };

t("1  HPC-150 + flags {1,1,1} → RETROFIT_2027, termOn auto-true", () => {
  const s = NEW.siteCase({ ...HPC, ...FLAGS });
  ok(s.afir === "RETROFIT_2027", "status " + s.afir);
  ok(s.termOn === true, "termOn " + s.termOn);
});

t("2  AC-22 + same flags → NOT_AFFECTED (power gate), no cost line", () => {
  const s = NEW.siteCase({ ...NEW.SITE_PRESETS.ac22, ...FLAGS });
  ok(s.afir === "NOT_AFFECTED", "status " + s.afir);
  ok(s.termOn === false && s.costTermTx === 0 && s.costTermFix === 0, "cost line leaked in");
});

t("2b exactly 50 kW is IN scope (Art. 5(1): 'equal to or more than')", () => {
  const s = NEW.siteCase({ ...NEW.SITE_PRESETS.dc50, ...FLAGS });   // power = 50
  ok(s.afir === "RETROFIT_2027", "status at 50 kW: " + s.afir);
});

t("3  preAfir:false + HPC-150 → BUILT_IN, termOn stays off, no auto cost line", () => {
  const s = NEW.siteCase({ ...HPC, pubAccess: true, preAfir: false, tenvOrSecure: true });
  ok(s.afir === "BUILT_IN", "status " + s.afir);
  ok(s.termOn === false, "termOn should not auto-enable for BUILT_IN");
  ok(s.costTermTx === 0 && s.costTermFix === 0, "cost line leaked in");
});

t("4  tenvOrSecure:false on Bestand → GRANDFATHERED; !pubAccess → NOT_AFFECTED", () => {
  ok(NEW.siteCase({ ...HPC, pubAccess: true, preAfir: true, tenvOrSecure: false }).afir === "GRANDFATHERED");
  ok(NEW.siteCase({ ...HPC, pubAccess: false, preAfir: true, tenvOrSecure: true }).afir === "NOT_AFFECTED");
});

t("5  HPC-150 @6.5%: retrofit raises break-even & payback-utilisation; hand-computed ±1e-9", () => {
  const P = NEW.SITE_PRESETS.hpc150, H = 8760, VAT = NEW.VAT;
  const on = NEW.siteCase({ ...P, ...FLAGS, util: 0.065, orderYear: 2026 });
  const base = NEW.siteCase({ ...P, ...FLAGS, util: 0.065, termOn: false, orderYear: 2026 });
  // independent hand computation (spec §4 formulas, defaults §3)
  const adhocNet = P.price / VAT;
  const blended = P.adhocShare * adhocNet + (1 - P.adhocShare) * P.roamingNet;
  const mB = blended * (1 - P.payFee) - P.energyCost + P.thg;
  const termTx = P.adhocShare * adhocNet * (2.0 / 100);
  const mO = blended * (1 - P.payFee) - termTx - P.energyCost + P.thg;
  const fixed = P.maint + P.backend + P.lease;
  const fB = P.power * P.demandCharge + fixed;                 // blocking = 0
  const fO = fB + 300 / 1;                                     // + allocated terminal opex
  const capex = P.hardware + P.install + P.grid;
  const uBE_b = fB / (P.power * H * mB);
  const uBE_o = fO / (P.power * H * mO);
  const uPay_b = (capex / P.lifetime + fB) / (P.power * H * mB);
  const uPay_o = (capex / P.lifetime + (4000 / 1) / 4 + fO) / (P.power * H * mO);
  close(base.uBreakEven, uBE_b, 1e-9, "base uBreakEven");
  close(on.uBreakEven, uBE_o, 1e-9, "on uBreakEven");
  close(base.uPayback, uPay_b, 1e-9, "base uPayback");
  close(on.uPayback, uPay_o, 1e-9, "on uPayback");
  ok(on.uBreakEven > base.uBreakEven, "break-even must rise");
  ok(on.uPayback > base.uPayback, "payback utilisation must rise");
  ok(on.payback > base.payback, "sanity anchor: simple payback must increase");
  close(on.base.uBreakEven, base.uBreakEven, 1e-12, "internal base comparison mismatch");
});

t("6  adhocShare = 0 → termTxFee has zero effect on marginKWh (scopes to ad-hoc)", () => {
  const on = NEW.siteCase({ ...HPC, ...FLAGS, adhocShare: 0 });
  const off = NEW.siteCase({ ...HPC, ...FLAGS, adhocShare: 0, termOn: false });
  ok(on.termOn === true, "terminal line should be on");
  ok(on.costTermTx === 0, "tx cost must be exactly 0");
  ok(on.marginKWh === off.marginKWh, "marginKWh must be identical");
});

t("7  termPoints = 4 → allocated capex & opex exactly quartered", () => {
  const s1 = NEW.siteCase({ ...HPC, ...FLAGS, termPoints: 1 });
  const s4 = NEW.siteCase({ ...HPC, ...FLAGS, termPoints: 4 });
  ok(s4.termCapexA * 4 === s1.termCapexA, "capex allocation");
  ok(s4.termOpexA * 4 === s1.termOpexA, "opex allocation");
  ok(s4.termAnnual * 4 === s1.termAnnual, "annualised allocation");
  ok(s4.uBreakEven < s1.uBreakEven && s4.uPayback < s1.uPayback, "sharing must help");
});

t("8  cash curve: −termCapexA at termYear and at termYear + termLife", () => {
  const inp = { ...HPC, ...FLAGS, util: 0.065, delayMonths: 0, orderYear: 2026, termYear: 2026 };
  const on = NEW.siteCase(inp);
  const off = NEW.siteCase({ ...inp, termOn: false });
  close(on.cash[0] - off.cash[0], -on.termCapexA, 1e-9, "initial lump");
  close((on.cash[48] - on.cash[47]) - on.ebitda / 12, -on.termCapexA, 1e-9, "replacement lump at 4y");
  close(on.cash[47] - on.cash[46], on.ebitda / 12, 1e-9, "no lump at month 47");
  close((on.cash[96] - on.cash[95]) - on.ebitda / 12, -on.termCapexA, 1e-9, "second replacement at 8y");
  // retrofit placed one year out
  const on27 = NEW.siteCase({ ...inp, termYear: 2027 });
  close((on27.cash[12] - on27.cash[11]) - on27.ebitda / 12, -on27.termCapexA, 1e-9, "lump at termYear offset");
  close(on27.cash[1] - on27.cash[0], on27.ebitda / 12, 1e-9, "no lump before termYear");
});

t("8b sensitivity grid carries terminal costs when line is on", () => {
  const on = NEW.siteCase({ ...HPC, ...FLAGS, util: 0.065 });
  const off = NEW.siteCase({ ...HPC, ...FLAGS, util: 0.065, termOn: false });
  ok(on.sens[1][1] > off.sens[1][1], "base-cell payback must worsen with terminal on");
});

/* ────────────────────────────────────────────────────────────────────────
 * Section C — spec §7 tests 9–11 + UI behaviour (jsdom)
 * ──────────────────────────────────────────────────────────────────────── */
console.log("\nC. Spec §7 UI tests (jsdom)");

const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const SRC = {
  data: fs.readFileSync(path.join(ROOT, "data", "countries.js"), "utf8"),
  model: fs.readFileSync(path.join(ROOT, "js", "model.js"), "utf8"),
  app: fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8")
};

function boot(hash) {
  const dom = new JSDOM(HTML, {
    url: "https://local.test/" + (hash || ""),
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => ({});
  w.Chart = class {
    constructor() { this.data = {}; this.options = {}; }
    update() {} destroy() {}
  };
  w.Chart.defaults = {
    color: "", borderColor: "",
    font: { family: "", size: 0 },
    plugins: { legend: { labels: { boxWidth: 0, boxHeight: 0 } } },
    animation: { duration: 0 }
  };
  w.eval(SRC.data);
  w.eval(SRC.model);
  w.eval(SRC.app);
  return { dom, w, d: w.document };
}
const fire = (w, el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));

t("9  verdict warning present iff RETROFIT_2027 && !termOn", () => {
  const offCase = boot("#site/DE/i80ac13dc9s130/x7t0c4000k1o300e20l4y26");
  ok(offCase.d.querySelector("#stVerdict").textContent.includes("not priced in"),
    "warning missing when duty applies and line is off");
  const onCase = boot("#site/DE/i80ac13dc9s130/x7t1c4000k1o300e20l4y26");
  ok(!onCase.d.querySelector("#stVerdict").textContent.includes("not priced in"),
    "warning must vanish when line is on");
  const autoCase = boot("#site/DE/i80ac13dc9s130/x7t2c4000k1o300e20l4y26"); // auto ⇒ on
  ok(!autoCase.d.querySelector("#stVerdict").textContent.includes("not priced in"),
    "warning must vanish under auto-on");
  const grand = boot("#site/DE/i80ac13dc9s130");                             // GRANDFATHERED
  ok(!grand.d.querySelector("#stVerdict").textContent.includes("not priced in"),
    "no warning when no duty applies");
});

t("10 hash roundtrip: all 10 params/flags restored, edits re-encoded", () => {
  const seg = "x5t1c5500k3o275e35l6y27";   // pub T · pre F · tenv T · on · 5500/3/275/3.5%/6y/2027
  const { w, d } = boot("#site/DE/i80ac13dc9s130/" + seg);
  ok(d.querySelector("#st-pubAccess").checked === true, "pubAccess");
  ok(d.querySelector("#st-preAfir").checked === false, "preAfir");
  ok(d.querySelector("#st-tenvOrSecure").checked === true, "tenvOrSecure");
  ok(d.querySelector("#st-termOn").checked === true, "termOn");
  ok(+d.querySelector("#st-termCapex").value === 5500, "termCapex");
  ok(+d.querySelector("#st-termPoints").value === 3, "termPoints");
  ok(+d.querySelector("#st-termOpexYr").value === 275, "termOpexYr");
  ok(+d.querySelector("#st-termTxFee").value === 3.5, "termTxFee");
  ok(+d.querySelector("#st-termLife").value === 6, "termLife");
  ok(+d.querySelector("#st-termYear").value === 2027, "termYear");
  ok(w.location.hash.includes(seg), "hash must survive readHash→writeHash: " + w.location.hash);
  const cap = d.querySelector("#st-termCapex");
  cap.value = "6000"; fire(w, cap, "input");
  ok(w.location.hash.includes("c6000"), "edited value must re-encode: " + w.location.hash);
});

t("10b pre-v3.1 links unchanged: default AFIR state writes no 4th segment", () => {
  const { w } = boot("#dashboard/DE/i80ac13dc9s130");
  ok(w.location.hash === "#dashboard/DE/i80ac13dc9s130", "hash mutated: " + w.location.hash);
});

t("11 Model Audit renders the AFIR provenance block", () => {
  const { d } = boot("#audit/DE/i80ac13dc9s130");
  const txt = d.body.textContent;
  ["AFIR & terminal cost sources", "01 Jan 2027", "2025/656", "2023/1804",
   "equal to or more than 50 kW", "heuristic"].forEach(sn =>
    ok(txt.includes(sn), "audit missing: " + sn));
});

t("UI  chip states + auto-enable flow (toggle TEN-T → retrofit, costs open)", () => {
  const { w, d } = boot("#site/DE/i80ac13dc9s130");
  const chip = d.querySelector("#afirChip");
  ok(chip.textContent.startsWith("Grandfathered"), "default chip: " + chip.textContent);
  ok(d.querySelector("#afirCosts").style.display === "none", "costs should start collapsed");
  ok(d.querySelector("#st-termOn").checked === false, "terminal line should start off");
  ok(d.querySelector("#termAuto").textContent.trim() === "auto", "auto tag");
  const tenv = d.querySelector("#st-tenvOrSecure");
  tenv.checked = true; fire(w, tenv, "change");
  ok(chip.textContent === "AFIR retrofit due by 01 Jan 2027", "retrofit chip: " + chip.textContent);
  ok(chip.className.includes("warn"), "retrofit chip colour");
  ok(d.querySelector("#st-termOn").checked === true, "termOn must auto-enable");
  ok(d.querySelector("#afirCosts").style.display === "", "cost fields must open");
  ok(w.location.hash.includes("x7t2"), "hash must carry flags+auto: " + w.location.hash);
  const pnl = d.querySelector("#stPnl").textContent;
  ok(pnl.includes("AFIR terminal fee on ad-hoc turnover"), "P&L tx row missing");
  ok(pnl.includes("AFIR terminal service & data"), "P&L fixed row missing");
  ok(d.querySelector(".afir-delta").textContent.includes("pp break-even"), "tile delta missing");
});

t("UI  BUILT_IN shows ISO 15118 informational chip; manual off keeps warning honest", () => {
  const { w, d } = boot("#site/DE/i80ac13dc9s130");
  const pre = d.querySelector("#st-preAfir");
  pre.checked = false; fire(w, pre, "change");
  ok(d.querySelector("#afirChip").textContent.includes("required since 04/2024"), "BUILT_IN chip");
  ok(d.querySelector("#afirIso").textContent.includes("ISO 15118-2"), "ISO chip missing");
  ok(d.querySelector("#st-termOn").checked === false, "BUILT_IN must not auto-enable the line");
});

t("UI  presets preserve the AFIR duty inputs (regulatory situation ≠ hardware)", () => {
  const { w, d } = boot("#site/DE/i80ac13dc9s130/x7t2c9999k2o300e20l4y26");
  const dc = Array.from(d.querySelectorAll("#stPresets .chip")).find(b => b.dataset.sp === "dc50");
  dc.click();
  ok(d.querySelector("#st-tenvOrSecure").checked === true, "tenv flag lost on preset switch");
  ok(+d.querySelector("#st-termCapex").value === 9999, "terminal capex lost on preset switch");
  ok(d.querySelector("#afirChip").textContent === "AFIR retrofit due by 01 Jan 2027", "dc50 keeps duty");
});

/* ────────────────────────────────────────────────────────────────────────
 * Section D — region packs (v3.2): VAT math, overlays, copy, hash, audit
 * ──────────────────────────────────────────────────────────────────────── */
console.log("\nD. Region packs (v3.2)");

t("D1 pack integrity: schemes, VAT, sourced NL defaults present", () => {
  const R = NEW.SITE_REGIONS;
  ok(R.de.vat === 1.19 && R.denrw.vat === 1.19 && R.nl.vat === 1.21, "VAT rates");
  ok(R.nl.thg === 0.10 && R.nl.priceAC === 0.49 && R.nl.priceDC === 0.85, "NL sourced defaults");
  ok(R.nl.thgShort === "ERE" && R.de.thgShort === "THG", "certificate scheme labels");
  Object.values(R).forEach(p => ok(p.quality && p.note && p.sources.length, p.label + " provenance"));
});

t("D2 NL VAT math: blendedNet & terminal fee computed on price/1.21 (hand-checked)", () => {
  const P = NEW.SITE_PRESETS.hpc150;
  const s = NEW.siteCase({ ...P, ...FLAGS, vat: 1.21, price: 0.85, thg: 0.10 });
  const adhocNet = 0.85 / 1.21;
  const blended = P.adhocShare * adhocNet + (1 - P.adhocShare) * P.roamingNet;
  close(s.blendedNet, blended, 1e-12, "blendedNet");
  close(s.termTxPerKWh, P.adhocShare * adhocNet * 0.02, 1e-12, "terminal fee on NL net price");
  close(s.marginKWh, blended * (1 - P.payFee) - s.termTxPerKWh - P.energyCost + 0.10, 1e-12, "marginKWh");
});

t("D3 UI: boot with ~nl restores region — labels, defaults, hash, provenance", () => {
  const { w, d } = boot("#site/DE/i80ac13dc9s130/x6t2c4000k1o300e20l4y26~nl");
  ok(d.querySelector('label[for="st-price"] > span').textContent.includes("21% VAT"), "VAT label");
  ok(d.querySelector('label[for="st-thg"] > span').textContent.includes("ERE"), "scheme label");
  ok(+d.querySelector("#st-price").value === 0.85, "NL fast-charging price default (hpc150)");
  ok(+d.querySelector("#st-thg").value === 10, "ERE default 10 ct");
  ok(d.querySelector("#stSensHead").textContent.includes("ERE"), "stress-test header scheme");
  ok(d.querySelector("#stRegionNote").textContent.includes("NEa"), "region provenance note");
  ok(d.querySelector("#stBenchScale").textContent.includes("~5–6 EVs/point"), "benchmark scale");
  ok(d.querySelector("#stVerdict").textContent.includes("coverage-saturated"), "region verdict context");
  ok(w.location.hash.includes("~nl"), "hash keeps region: " + w.location.hash);
});

t("D4 UI: region switch nl→de restores preset economics and drops the hash suffix", () => {
  const { w, d } = boot("#site/DE/i80ac13dc9s130/x6t2c4000k1o300e20l4y26~nl");
  Array.from(d.querySelectorAll("#stRegions .chip")).find(b => b.dataset.rg === "de").click();
  ok(d.querySelector('label[for="st-price"] > span').textContent.includes("19% VAT"), "VAT label back");
  ok(+d.querySelector("#st-price").value === 0.69, "preset price restored");
  ok(+d.querySelector("#st-thg").value === 8, "THG default restored");
  ok(!w.location.hash.includes("~"), "suffix dropped: " + w.location.hash);
});

t("D5 UI: hardware preset switch under NL keeps the pack (AC 0.49 / DC 0.85, VAT 21%)", () => {
  const { d } = boot("#site/DE/i80ac13dc9s130/x6t2c4000k1o300e20l4y26~nl");
  const chip = k => Array.from(d.querySelectorAll("#stPresets .chip")).find(b => b.dataset.sp === k);
  chip("ac11").click();
  ok(+d.querySelector("#st-price").value === 0.49, "AC price under NL");
  chip("hpc300").click();
  ok(+d.querySelector("#st-price").value === 0.85, "DC price under NL");
  ok(d.querySelector('label[for="st-price"] > span').textContent.includes("21% VAT"), "VAT survives preset switch");
});

t("D6 UI: NRW pack surfaces demand-pressure context and the per-DSO warning", () => {
  const { w, d } = boot("#site/DE/i80ac13dc9s130");
  Array.from(d.querySelectorAll("#stRegions .chip")).find(b => b.dataset.rg === "denrw").click();
  ok(d.querySelector("#stBenchScale").textContent.includes("rank 14/16"), "coverage rank in scale");
  ok(d.querySelector("#stRegionNote").textContent.includes("Westnetz"), "per-DSO note");
  ok(+d.querySelector("#st-price").value === 0.69, "economics stay DE defaults");
  ok(w.location.hash.includes("~denrw"), "hash region: " + w.location.hash);
});

t("D7 UI: Model Audit renders all region packs with quality flags", () => {
  const { d } = boot("#audit/DE/i80ac13dc9s130");
  const txt = d.body.textContent;
  ["Region packs", "DE · NRW", "🇳🇱 Netherlands", "indicative", "NEa", "Charge24"].forEach(sn =>
    ok(txt.includes(sn), "audit missing: " + sn));
});

/* ──────────────────────────────────────────────────────────────────────── */
console.log(`\n${pass + fail} tests · ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);

/* ChargeGap Europe — German Bundesland layer (map drill-down, v3.3)
 * Source: VDA-E-Ladenetzranking, published 11/2025, Stichtag 01.07.2025;
 * underlying data: BNetzA Ladesäulenregister (Ladepunkte) + KBA (E-Pkw =
 * BEV + PHEV). T-Wert = E-Pkw per public charge point (lower = better
 * coverage). Internal consistency checks live in tests/run-tests.js:
 * points sum EXACTLY to the national 172,150; the E-Pkw sum runs 3,414
 * below the national 2,877,051 because KBA carries vehicles with unknown
 * registration district (VDA footnote) — documented, not an error.
 * Thüringen: the PDF's T-Wert table prints 3,582 points; the A-Wert table
 * and the published T-Wert itself (41,280 / 3,528 = 11.7) confirm 3,528 —
 * source typo, corrected here and disclosed. */
window.CG_BL = {
  meta: {
    asOf: "2025-07-01",
    source: "VDA-E-Ladenetzranking 11/2025 (Stichtag 01.07.2025) · Basis: BNetzA Ladesäulenregister + KBA",
    national: { epkw: 2877051, points: 172150, fast: 40777, tWert: 16.7 },
    notes: [
      "E-Pkw = BEV + PHEV (KBA).",
      "Länder E-Pkw sum to 2,873,637 — 3,414 below national (unknown registration district, VDA footnote).",
      "Thüringen points: 3,528 (A-table + T-Wert math); the T-table's 3,582 is a source typo.",
      "Per-Land Schnellladepunkte (S-Wert) not shipped in v3.3 — national total 40,777; roadmap item."
    ]
  },
  laender: {
    BW: { name: "Baden-Württemberg",      epkw: 465124, points: 29633, tWert: 15.7 },
    BY: { name: "Bayern",                 epkw: 533859, points: 33493, tWert: 15.9 },
    BE: { name: "Berlin",                 epkw:  75589, points:  5933, tWert: 12.7 },
    BB: { name: "Brandenburg",            epkw:  61405, points:  4174, tWert: 14.7 },
    HB: { name: "Bremen",                 epkw:  16224, points:  1317, tWert: 12.3 },
    HH: { name: "Hamburg",                epkw:  65211, points:  3660, tWert: 17.8 },
    HE: { name: "Hessen",                 epkw: 259464, points: 13849, tWert: 18.7 },
    MV: { name: "Mecklenburg-Vorpommern", epkw:  27439, points:  2354, tWert: 11.7 },
    NI: { name: "Niedersachsen",          epkw: 296320, points: 16912, tWert: 17.5 },
    NW: { name: "Nordrhein-Westfalen",    epkw: 647744, points: 33286, tWert: 19.5 },
    RP: { name: "Rheinland-Pfalz",        epkw: 142246, points:  6788, tWert: 21.0 },
    SL: { name: "Saarland",               epkw:  31256, points:  1272, tWert: 24.6 },
    SN: { name: "Sachsen",                epkw:  74433, points:  6205, tWert: 12.0 },
    ST: { name: "Sachsen-Anhalt",         epkw:  37975, points:  2920, tWert: 13.0 },
    SH: { name: "Schleswig-Holstein",     epkw:  98068, points:  6826, tWert: 14.4 },
    TH: { name: "Thüringen",              epkw:  41280, points:  3528, tWert: 11.7 }
  }
};

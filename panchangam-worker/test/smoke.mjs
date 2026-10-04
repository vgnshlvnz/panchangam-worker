// Fails the build if the calculation or the page drifts from a known-good day.
import assert from "node:assert/strict";
import { computePanchangam, computeTarabalam } from "../src/panchangam.js";
import { renderPage } from "../src/render.js";

const params = { date: "2026-10-05", place: "pj", lat: 3.1073, lon: 101.6067, tz: "Asia/Kuala_Lumpur", ayanamsa: "lahiri" };
const p = computePanchangam(params);
const near = (ms, iso, mins = 2) =>
  assert.ok(Math.abs(ms - Date.parse(iso)) < mins * 60000, `${new Date(ms).toISOString()} vs ${iso}`);

// Angas (reference values from Swiss Ephemeris)
assert.equal(p.vaara.name[1], "Monday");
assert.deepEqual(p.tithi[0].name, ["தசமி", "Dasami"]);
assert.equal(p.tithi[0].paksha, "krishna");
near(p.tithi[0].end, "2026-10-05T20:37:52Z");
assert.equal(p.nakshatra[0].name[1], "Poosam");
near(p.nakshatra[0].end, "2026-10-05T17:39:24Z");
assert.equal(p.yoga[0].name[1], "Sivam");
assert.equal(p.karana[0].name[1], "Vanisai");

// Kundli at sunrise: sign index and degree within 0.05°
const ref = { Lagna: 166.612, Sun: 167.5, Moon: 95.821, Mars: 99.746, Mercury: 191.516, Jupiter: 116.056, Venus: 194.204, Saturn: 347.034, Rahu: 303.272 };
for (const x of p.kundli) if (ref[x.key]) assert.ok(Math.abs(x.lon - ref[x.key]) < 0.05, `${x.key} ${x.lon}`);
const by = Object.fromEntries(p.kundli.map((x) => [x.key, x]));
assert.equal(by.Venus.retro, true);
assert.equal(by.Saturn.retro, true);
assert.equal(by.Jupiter.dignity, "exalted");
assert.equal(by.Mars.dignity, "debilitated");

// Tarabalam: Hastham on a Poosam day
const tb = computeTarabalam(p);
assert.equal(tb.rows[12].taras[0].en, "Prathyak");

// Page: Tamil has only the South chart, English has both; no API links
const ta = renderPage({ p, tb, params: { ...params, lang: "ta" } });
const en = renderPage({ p, tb, params: { ...params, lang: "en" } });
assert.ok(ta.includes("திங்கள் கிழமை") && ta.includes(`class="south-grid"`) && !ta.includes(`class="north-box"`));
assert.ok(en.includes("Monday") && en.includes(`class="south-grid"`) && en.includes(`class="north-box"`));
assert.ok(!/\/api\//.test(ta + en));
console.log("smoke test passed");

import * as Astronomy from "astronomy-engine";
import {
  TITHI, AMAVASAI, PAKSHA, NAKSHATRA, YOGA, karanaName, VAARA, TARA,
} from "./names.js";

const DAY_MS = 86400000;
const norm360 = (x) => ((x % 360) + 360) % 360;
const wrap180 = (x) => { const y = norm360(x); return y > 180 ? y - 360 : y; };
const rad = (d) => (d * Math.PI) / 180;

// ---------- Ayanamsa ----------
// Each ayanamsa is a value at a reference epoch plus IAU 2006 general
// precession in longitude since then. Epoch values follow Swiss Ephemeris
// (sweph.h); expect agreement with pyswisseph within about an arcsecond.
const AYANAMSA = {
  lahiri: { jd0: 2435553.5, a0: 23.245524743 }, // 1956-03-21, Lahiri / Chitrapaksha
  raman:  { jd0: 2415020.0, a0: 21.01444 },     // J1900, B.V. Raman
  kp:     { jd0: 2415020.0, a0: 22.363889 },    // J1900, Krishnamurti (KP old)
};

const precessionArcsec = (T) => 5028.796195 * T + 1.1054348 * T * T;

function meanAyanamsa(jd, kind) {
  const a = AYANAMSA[kind];
  const T = (jd - 2451545.0) / 36525;
  const T0 = (a.jd0 - 2451545.0) / 36525;
  return a.a0 + (precessionArcsec(T) - precessionArcsec(T0)) / 3600;
}

// Nutation in longitude (Meeus ch. 22 short series, ~0.5" accuracy), degrees.
function nutationLon(jd) {
  const T = (jd - 2451545.0) / 36525;
  const om = rad(125.04452 - 1934.136261 * T);
  const L = rad(280.4665 + 36000.7698 * T);
  const Lp = rad(218.3165 + 481267.8813 * T);
  return (-17.2 * Math.sin(om) - 1.32 * Math.sin(2 * L)
          - 0.23 * Math.sin(2 * Lp) + 0.21 * Math.sin(2 * om)) / 3600;
}

const jdFromMs = (ms) => ms / DAY_MS + 2440587.5;

// ---------- Positions ----------
// Apparent geocentric longitudes (true equinox of date) from astronomy-engine,
// converted to sidereal by removing nutation and the mean ayanamsa.
export function positions(ms, ayanamsa = "lahiri") {
  const date = new Date(ms);
  const jd = jdFromMs(ms);
  const sunTrop = Astronomy.SunPosition(date).elon;
  const moonTrop = Astronomy.EclipticGeoMoon(date).lon;
  const shift = nutationLon(jd) + meanAyanamsa(jd, ayanamsa);
  return {
    sunTrop, moonTrop,
    sun: norm360(sunTrop - shift),
    moon: norm360(moonTrop - shift),
    ayanamsa: meanAyanamsa(jd, ayanamsa),
  };
}

// ---------- Grahas, node and lagna ----------
const GRAHA_BODIES = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];

function tropicalLon(body, ms) {
  if (body === "Sun") return Astronomy.SunPosition(new Date(ms)).elon;
  if (body === "Moon") return Astronomy.EclipticGeoMoon(new Date(ms)).lon;
  return Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body[body], new Date(ms), true)).elon;
}

// Mean lunar ascending node, mean equinox of date (Meeus 47.7).
function meanNode(jd) {
  const T = (jd - 2451545.0) / 36525;
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441);
}

function obliquity(jd) {
  const T = (jd - 2451545.0) / 36525;
  const om = rad(125.04452 - 1934.136261 * T);
  const L = rad(280.4665 + 36000.7698 * T);
  const Lp = rad(218.3165 + 481267.8813 * T);
  const eps0 = 23.439291111 - (46.815 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
  const deps = (9.2 * Math.cos(om) + 0.57 * Math.cos(2 * L) + 0.1 * Math.cos(2 * Lp) - 0.09 * Math.cos(2 * om)) / 3600;
  return eps0 + deps;
}

// Tropical ascendant (true equinox of date).
function ascendant(ms, lat, lon) {
  const jd = jdFromMs(ms);
  const ramc = rad(norm360(Astronomy.SiderealTime(new Date(ms)) * 15 + lon));
  const eps = rad(obliquity(jd));
  const y = Math.cos(ramc);
  const x = -(Math.sin(ramc) * Math.cos(eps) + Math.tan(rad(lat)) * Math.sin(eps));
  return norm360((Math.atan2(y, x) * 180) / Math.PI);
}

const EXALT = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const OWN = { Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10] };

function dignity(body, sign) {
  if (!(body in EXALT)) return null;
  if (EXALT[body] === sign) return "exalted";
  if ((EXALT[body] + 6) % 12 === sign) return "debilitated";
  if (OWN[body].includes(sign)) return "own";
  return null;
}

function placement(key, sidLon, retro = false) {
  const nak = Math.floor(sidLon / (360 / 27));
  return {
    key,
    lon: sidLon,
    sign: Math.floor(sidLon / 30),
    degInSign: sidLon % 30,
    nakshatra: nak,
    pada: Math.floor((sidLon % (360 / 27)) / (360 / 108)) + 1,
    retro,
    dignity: dignity(key, Math.floor(sidLon / 30)),
  };
}

// Sidereal positions of lagna, 7 grahas, Rahu and Ketu at one instant.
export function kundli(ms, lat, lon, ayanamsa = "lahiri") {
  const jd = jdFromMs(ms);
  const ayan = meanAyanamsa(jd, ayanamsa);
  const shift = nutationLon(jd) + ayan;
  const out = [placement("Lagna", norm360(ascendant(ms, lat, lon) - shift))];
  for (const b of GRAHA_BODIES) {
    const now = tropicalLon(b, ms);
    const later = tropicalLon(b, ms + 3600000);
    const retro = b !== "Sun" && b !== "Moon" && wrap180(later - now) < 0;
    out.push(placement(b, norm360(now - shift), retro));
  }
  const rahu = norm360(meanNode(jd) - ayan); // mean equinox: no nutation
  out.push(placement("Rahu", rahu), placement("Ketu", norm360(rahu + 180)));
  return out;
}

// ---------- Anga definitions ----------
// value(): a monotonically increasing angle in [0,360); span: degrees per unit;
// rate: mean degrees/day, used only as the first guess of the root finder.
function angaDefs(ayanamsa) {
  const pos = (ms) => positions(ms, ayanamsa);
  return {
    tithi: {
      span: 12, rate: 12.19,
      value: (ms) => { const p = pos(ms); return norm360(p.moonTrop - p.sunTrop); },
      describe: (i) => ({
        index: i + 1,
        name: i === 29 ? AMAVASAI : TITHI[i % 15],
        paksha: i < 15 ? "shukla" : "krishna",
        pakshaName: i < 15 ? PAKSHA.shukla : PAKSHA.krishna,
      }),
    },
    nakshatra: {
      span: 360 / 27, rate: 13.18,
      value: (ms) => pos(ms).moon,
      describe: (i) => ({ index: i + 1, name: NAKSHATRA[i] }),
    },
    yoga: {
      span: 360 / 27, rate: 14.17,
      value: (ms) => { const p = pos(ms); return norm360(p.sun + p.moon); },
      describe: (i) => ({ index: i + 1, name: YOGA[i] }),
    },
    karana: {
      span: 6, rate: 12.19,
      value: (ms) => { const p = pos(ms); return norm360(p.moonTrop - p.sunTrop); },
      describe: (i) => ({ index: i + 1, name: karanaName(i) }),
    },
  };
}

// Find the instant near t0 when value() equals `target` degrees.
// Secant iteration on the signed angular distance; converges in ~4 steps.
function findCrossing(value, t0, target, rate) {
  const a0 = value(t0);
  const need = wrap180(target - a0);
  if (Math.abs(need) < 1e-9) return t0;
  const progress = (t) => wrap180(value(t) - a0);
  let ta = t0, pa = 0;
  let tb = t0 + (need / rate) * DAY_MS, pb = progress(tb);
  for (let i = 0; i < 25; i++) {
    const err = pb - need;
    if (Math.abs(err) < 1e-7) break;
    const slope = (pb - pa) / (tb - ta);
    const tn = tb - err / slope;
    ta = tb; pa = pb; tb = tn; pb = progress(tb);
    if (Math.abs(tb - ta) < 500) break; // half a second
  }
  return tb;
}

// All segments of one anga overlapping [from, to).
function segments(def, from, to) {
  const out = [];
  const count = Math.round(360 / def.span);
  let idx = Math.floor(def.value(from) / def.span) % count;
  let start = findCrossing(def.value, from, idx * def.span, def.rate);
  for (let guard = 0; guard < 6 && start < to; guard++) {
    const end = findCrossing(def.value, start + 60000, ((idx + 1) % count) * def.span, def.rate);
    out.push({ ...def.describe(idx), start, end });
    idx = (idx + 1) % count;
    start = end;
  }
  return out;
}

// ---------- Time zone helpers (no DST assumptions) ----------
export function tzOffsetMs(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

export function localMidnight(dateStr, timeZone) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(guess, timeZone);
  t = guess - tzOffsetMs(t, timeZone);
  return t;
}

export function weekdayIn(ms, timeZone) {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(ms));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

// ---------- Rise / set ----------
function riseSet(body, observer, direction, fromMs, limitDays = 1.5) {
  const ev = Astronomy.SearchRiseSet(body, observer, direction, new Date(fromMs), limitDays);
  return ev ? ev.date.getTime() : null;
}

// ---------- Public API ----------
export function computePanchangam({ date, lat, lon, tz, ayanamsa = "lahiri" }) {
  if (!AYANAMSA[ayanamsa]) throw new Error(`Unknown ayanamsa "${ayanamsa}". Use lahiri, raman or kp.`);
  const observer = new Astronomy.Observer(lat, lon, 0);
  const midnight = localMidnight(date, tz);

  const sunrise = riseSet(Astronomy.Body.Sun, observer, +1, midnight);
  if (sunrise === null) throw new Error("No sunrise on this date at this latitude.");
  const sunset = riseSet(Astronomy.Body.Sun, observer, -1, sunrise);
  const nextSunrise = riseSet(Astronomy.Body.Sun, observer, +1, sunrise + 3600000);
  const moonrise = riseSet(Astronomy.Body.Moon, observer, +1, midnight, 1);
  const moonset = riseSet(Astronomy.Body.Moon, observer, -1, midnight, 1);

  const defs = angaDefs(ayanamsa);
  const angas = {};
  for (const key of Object.keys(defs)) angas[key] = segments(defs[key], sunrise, nextSunrise);

  // Nakshatra pada at sunrise.
  const p0 = positions(sunrise, ayanamsa);
  const padaAtSunrise = Math.floor((p0.moon % (360 / 27)) / (360 / 108)) + 1;
  angas.nakshatra[0].padaAtSunrise = padaAtSunrise;

  const w = weekdayIn(sunrise, tz);
  const vaara = { index: w + 1, name: VAARA[w] };

  return {
    date, tz, location: { lat, lon }, ayanamsa,
    ayanamsaValue: p0.ayanamsa,
    sun: { rise: sunrise, set: sunset, nextRise: nextSunrise },
    moon: { rise: moonrise, set: moonset },
    vaara,
    tithi: angas.tithi,
    nakshatra: angas.nakshatra,
    yoga: angas.yoga,
    karana: angas.karana,
    sunriseLongitudes: { sun: p0.sun, moon: p0.moon },
    kundli: kundli(sunrise, lat, lon, ayanamsa),
  };
}

// Tarabalam: for each janma nakshatra, the tara for every nakshatra
// segment active between sunrise and next sunrise.
export function computeTarabalam(panchangam) {
  const columns = panchangam.nakshatra.map((s) => ({ index: s.index, name: s.name, start: s.start, end: s.end }));
  const rows = NAKSHATRA.map((name, j) => ({
    janma: { index: j + 1, name },
    taras: columns.map((c) => {
      const count = ((c.index - 1 - j + 27) % 27) + 1; // inclusive count
      const t = (count - 1) % 9;
      return { tara: t + 1, count, ...TARA[t] };
    }),
  }));
  return { columns, rows };
}

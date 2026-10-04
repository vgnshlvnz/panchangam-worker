import { computePanchangam, computeTarabalam } from "./panchangam.js";
import { renderPage } from "./render.js";
import { PLACES, DEFAULT_PLACE } from "./i18n.js";

const AYANAMSAS = ["lahiri", "raman", "kp"];
const LANGS = ["ta", "en"];
const PREFS = ["lang", "place", "ayanamsa"];
const YEAR = 60 * 60 * 24 * 365;
const BUILD = Date.now(); // fallback when version metadata is unavailable (local dev)

function cookies(request) {
  const out = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  }
  return out;
}

const todayIn = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

// Query string wins, then the visitor's saved cookie, then the default.
export function resolveParams(url, jar = {}) {
  const q = url.searchParams;
  const choose = (key, allowed, fallback) => {
    const v = q.get(key) ?? jar[key];
    return allowed.includes(v) ? v : fallback;
  };
  const place = choose("place", Object.keys(PLACES), DEFAULT_PLACE);
  const { lat, lon, tz } = PLACES[place];
  const lang = choose("lang", LANGS, "ta");
  const ayanamsa = choose("ayanamsa", AYANAMSAS, "lahiri");
  let date = q.get("date");
  const ok = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date))
    && Number(date.slice(0, 4)) >= 1800 && Number(date.slice(0, 4)) <= 2200;
  if (!ok) date = todayIn(tz);
  return { date, place, lat, lon, tz, lang, ayanamsa };
}

function errorPage(status, message) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Panchangam</title>`
    + `<body style="font:16px/1.5 system-ui;margin:3rem auto;max-width:36rem;padding:0 1rem"><h1>Panchangam</h1><p>${message}</p><p><a href="/">Go to today</a></p>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } });
    if (url.pathname !== "/" && url.pathname !== "/index.html") return errorPage(404, "This page does not exist.");

    const params = resolveParams(url, cookies(request));

    // Canonical cache key with every parameter resolved, so cookie-only visitors share entries.
    // The deployment id is part of the key, so every deploy starts with a fresh cache.
    const key = new URL(url.origin + "/");
    for (const k of ["date", "place", "ayanamsa", "lang"]) key.searchParams.set(k, params[k]);
    key.searchParams.set("v", env?.CF_VERSION_METADATA?.id || "dev-" + BUILD);
    const cache = caches.default;
    let res = await cache.match(key.toString());

    if (!res) {
      try {
        const p = computePanchangam(params);
        const html = renderPage({ p, tb: computeTarabalam(p), params });
        res = new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=3600",
            "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; img-src 'self' data:",
          },
        });
        ctx.waitUntil(cache.put(key.toString(), res.clone()));
      } catch (err) {
        return errorPage(500, "Could not calculate this day. Try another date or place.");
      }
    }

    // Remember choices the visitor made explicitly; cookies stay off the cached copy.
    const out = new Response(res.body, res);
    const chosen = PREFS.filter((k) => url.searchParams.has(k));
    for (const k of chosen) out.headers.append("set-cookie", `${k}=${params[k]}; Path=/; Max-Age=${YEAR}; SameSite=Lax; Secure`);
    if (chosen.length || !url.searchParams.has("date")) out.headers.set("cache-control", "private, no-cache");
    return out;
  },
};

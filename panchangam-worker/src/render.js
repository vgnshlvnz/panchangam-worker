import { UI, PLACES } from "./i18n.js";
import { RASI, GRAHA, DIGNITY, WEEKDAY_SHORT, MONTH } from "./names.js";
import { tzOffsetMs } from "./panchangam.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (x) => (Math.max(0, Math.min(1, x)) * 100).toFixed(2) + "%";
const REPO = "https://github.com/vgnshlvnz/panchangam-worker";

// South Indian chart: fixed sign boxes, Meenam top-left. grid-area "row / col" per sign 0..11.
const SOUTH_AREA = ["1 / 2", "1 / 3", "1 / 4", "2 / 4", "3 / 4", "4 / 4", "4 / 3", "4 / 2", "4 / 1", "3 / 1", "2 / 1", "1 / 1"];
// North Indian chart: label centre (x%, y%) for houses 1..12.
const NORTH_POS = [[50, 25], [25, 10], [10, 25], [25, 50], [10, 75], [25, 90], [50, 75], [75, 90], [90, 75], [75, 50], [90, 25], [75, 10]];

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dms(x) {
  const d = Math.floor(x);
  const m = Math.floor((x - d) * 60);
  return `${d}°${String(m).padStart(2, "0")}′`;
}

function moonSvg(elong, size, label) {
  const r = 45;
  const rx = (r * Math.abs(Math.cos((elong * Math.PI) / 180))).toFixed(2);
  const waxing = elong < 180;
  const s1 = waxing ? 1 : 0;
  const s2 = waxing ? (elong < 90 ? 0 : 1) : (elong < 270 ? 0 : 1);
  return `<svg class="moon" width="${size}" height="${size}" viewBox="-50 -50 100 100" role="img" aria-label="${esc(label)}">`
    + `<circle r="${r}" class="moon-dark"/>`
    + `<path d="M0,-${r} A${r},${r} 0 0 ${s1} 0,${r} A${rx},${r} 0 0 ${s2} 0,-${r}Z" class="moon-lit"/></svg>`;
}

export function renderPage({ p, tb, params }) {
  const L = params.lang === "en" ? 1 : 0;
  const u = (k) => UI[k][L];
  const nm = (pair) => pair[L];
  const tz = params.tz;

  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const wdFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hm = (ms) => hmFmt.format(new Date(ms));
  const otherDay = (ms) => dayFmt.format(new Date(ms)) !== p.date;
  const wdName = (ms) => WEEKDAY_SHORT[WD.indexOf(wdFmt.format(new Date(ms)))][L];
  const at = (ms) => (otherDay(ms) ? (L ? `${hm(ms)} ${wdName(ms)}` : `${hm(ms)} (${wdName(ms)})`) : hm(ms));
  const until = (ms) => {
    if (L) return `until ${at(ms)}`;
    return otherDay(ms) ? `${hm(ms)} வரை (${wdName(ms)})` : `${hm(ms)} வரை`;
  };

  const link = (over = {}) => {
    const q = new URLSearchParams({ date: p.date, place: params.place, ayanamsa: params.ayanamsa, lang: params.lang, ...over });
    return "/?" + q.toString();
  };

  const [yy, mm, dd] = p.date.split("-").map(Number);
  const wd0 = p.vaara.index - 1;
  const dateLabel = L
    ? `${WEEKDAY_SHORT[wd0][1]} ${dd} ${MONTH[mm - 1][1]} ${yy}`
    : `${WEEKDAY_SHORT[wd0][0]}, ${dd} ${MONTH[mm - 1][0]} ${yy}`;

  // ---------- Hero ----------
  const t0 = p.tithi[0];
  const tithiLabel = (s) => (s.index === 15 || s.index === 30 ? nm(s.name) : `${nm(s.pakshaName)} ${nm(s.name)}`);
  const elong = ((p.sunriseLongitudes.moon - p.sunriseLongitudes.sun) % 360 + 360) % 360;
  const lit = Math.round(((1 - Math.cos((elong * Math.PI) / 180)) / 2) * 100);
  const moonLabel = L ? `Moon at sunrise, about ${lit} percent lit` : `உதயத்தில் சந்திரன், சுமார் ${lit}% ஒளி`;
  const vaara = p.vaara.name; // [ta, en, ta alt, en alt]
  const dayLine = L
    ? `${tithiLabel(t0)}, ${nm(p.nakshatra[0].name)} ${u("star")}`
    : `${tithiLabel(t0)}, ${nm(p.nakshatra[0].name)} ${u("star")}`;
  const sunMoon = [
    [u("sunrise"), at(p.sun.rise)],
    [u("sunset"), p.sun.set ? at(p.sun.set) : u("none")],
    [u("moonrise"), p.moon.rise ? at(p.moon.rise) : u("none")],
    [u("moonset"), p.moon.set ? at(p.moon.set) : u("none")],
  ];

  // ---------- Ribbon ----------
  const from = p.sun.rise, to = p.sun.nextRise, span = to - from;
  const off = tzOffsetMs(from, tz);
  const ticks = [];
  for (let t = Math.ceil((from + off) / 3600000) * 3600000 - off; t < to - 3600000; t += 3 * 3600000) ticks.push(t);
  const sunsetPos = p.sun.set ? (p.sun.set - from) / span : null;
  const tickHtml = ticks
    .filter((t) => sunsetPos === null || Math.abs((t - from) / span - sunsetPos) > 0.06)
    .map((t) => `<span style="left:${pct((t - from) / span)}">${hm(t)}</span>`).join("")
    + (sunsetPos !== null ? `<span class="tick-sunset" style="left:${pct(sunsetPos)}">${u("sunsetTick")}</span>` : "");

  const karanaLabel = (s) => (L && s.name[1] === "Pathirai" ? "Pathirai (Vishti)" : nm(s.name));
  const angaRows = [
    [u("tithi"), p.tithi, tithiLabel],
    [u("nakshatra"), p.nakshatra, (s, i) => nm(s.name) + (i === 0 && s.padaAtSunrise ? `, ${u("pada")} ${s.padaAtSunrise}` : "")],
    [u("yoga"), p.yoga, (s) => nm(s.name)],
    [u("karana"), p.karana, karanaLabel],
  ].map(([label, segs, fn]) => {
    const cells = segs.map((s, i) => {
      const w = (Math.min(s.end, to) - Math.max(s.start, from)) / span;
      const sub = s.end < to ? until(s.end) : u("pastNext");
      return `<div class="seg s${i % 2}" style="width:${pct(w)}" title="${esc(fn(s, i) + ", " + sub)}"><b>${esc(fn(s, i))}</b><span>${esc(sub)}</span></div>`;
    }).join("");
    return `<div class="row"><div class="what">${esc(label)}</div><div class="bar">${cells}</div></div>`;
  }).join("");

  const angaList = [
    [u("tithi"), p.tithi, tithiLabel],
    [u("nakshatra"), p.nakshatra, (s, i) => nm(s.name) + (i === 0 && s.padaAtSunrise ? `, ${u("pada")} ${s.padaAtSunrise}` : "")],
    [u("yoga"), p.yoga, (s) => nm(s.name)],
    [u("karana"), p.karana, karanaLabel],
  ].map(([label, segs, fn]) => {
    const first = segs[0];
    const rest = segs.slice(1).map((s, i) => fn(s, i + 1)).join(", ");
    const when = first.end < to ? until(first.end) : u("pastNext");
    const then = rest ? `<span>${L ? "then" : "பிறகு"} ${esc(rest)}</span>` : "";
    return `<li><div><small>${esc(label)}</small><b>${esc(fn(first, 0))}</b></div><div class="when"><span>${esc(when)}</span>${then}</div></li>`;
  }).join("");

  // ---------- Kundli ----------
  const K = p.kundli;
  const lagnaSign = K[0].sign;
  const abbr = (x) => GRAHA[x.key][2 + L] + (x.retro ? u("retroMark") : "");
  const southCells = RASI.map((r, i) => {
    const items = K.filter((x) => x.sign === i)
      .map((x) => `<span class="${x.key === "Lagna" ? "pl lagna" : "pl"}">${esc(abbr(x))} ${Math.floor(x.degInSign)}°</span>`).join("");
    return `<div class="cell${i === lagnaSign ? " is-lagna" : ""}" style="grid-area:${SOUTH_AREA[i]}"><span class="sign">${esc(nm(r))}</span>${items}</div>`;
  }).join("");
  const south = `<figure class="chart-card south"><figcaption>${u("south")}</figcaption>
<div class="south-grid">${southCells}<div class="centre"><strong>${u("rasi")}</strong><span>${esc(dateLabel)}, ${at(p.sun.rise)}</span><span>${u("lagna")} ${esc(nm(RASI[lagnaSign]))}</span></div></div></figure>`;

  const northHouses = NORTH_POS.map(([x, y], h) => {
    const s = (lagnaSign + h) % 12;
    const items = K.filter((k) => k.sign === s).map(abbr).join(" ");
    return `<div class="house" style="left:${x}%;top:${y}%"><span class="num">${s + 1}</span><span class="pls">${esc(items)}</span></div>`;
  }).join("");
  const north = `<figure class="chart-card north"><figcaption>${u("north")}</figcaption>
<div class="north-box"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0,0 L100,100 M100,0 L0,100 M50,0 L100,50 L50,100 L0,50 Z"/></svg>${northHouses}</div></figure>`;

  const chartTabs = L
    ? `<div class="chart-tabs" role="group" aria-label="Chart style"><button type="button" data-show="south" aria-pressed="true">${u("southShort")}</button><button type="button" data-show="north" aria-pressed="false">${u("northShort")}</button></div>`
    : "";
  const charts = L ? `${chartTabs}<div class="charts both" data-show="south">${south}${north}</div>` : `<div class="charts">${south}</div>`;

  const planetRows = K.map((x) => {
    const state = [x.retro ? u("retro") : "", x.dignity ? DIGNITY[x.dignity][L] : ""].filter(Boolean).join(", ") || "–";
    const cls = x.dignity === "debilitated" ? "warn" : x.dignity ? "ok" : "";
    return `<tr><td class="b">${esc(GRAHA[x.key][L])}</td><td>${esc(nm(RASI[x.sign]))}</td><td class="num">${dms(x.degInSign)}</td>`
      + `<td>${esc(nm(tbName(x.nakshatra)))}, ${u("pada")} ${x.pada}</td><td class="${cls}">${esc(state)}</td></tr>`;
  }).join("");

  function tbName(i) { return tb.rows[i].janma.name; }

  // ---------- Tarabalam ----------
  const cols = tb.columns.map((c) => {
    const a = c.start <= from ? u("fromSunrise") : at(c.start);
    const b = c.end >= to ? u("toNextSunrise") : at(c.end);
    return { name: nm(c.name), window: `${a} – ${b}` };
  });
  const verdict = { good: u("good"), bad: u("avoid"), mixed: u("mixed") };
  const block = (rows) => `<div class="tara-block" style="--cols:${cols.length}">
<div class="tara-head-row"><span>${u("birthStar")}</span>${cols.map((c) => `<span>${esc(c.name)}</span>`).join("")}</div>
${rows.map((r) => `<button type="button" class="tara-row" data-i="${r.janma.index}" data-name="${esc(nm(r.janma.name))}" aria-pressed="false"><span class="b">${esc(nm(r.janma.name))}</span>${r.taras.map((t) => `<span class="chip ${t.quality}" data-label="${esc(t.tara + ".\u00a0" + (L ? t.en : t.ta))}" data-verdict="${esc(verdict[t.quality])}">${esc(t.tara + ".\u00a0" + (L ? t.en : t.ta))}</span>`).join("")}</button>`).join("")}
</div>`;

  const placeOptions = Object.entries(PLACES).map(([k, v]) => `<option value="${k}"${k === params.place ? " selected" : ""}>${esc(nm(v.name))}</option>`).join("");
  const ayan = ["lahiri", "raman", "kp"].map((a) => `<a class="seg-btn" href="${esc(link({ ayanamsa: a }))}" aria-current="${a === params.ayanamsa}">${u(a)}</a>`).join("");
  const langSwitch = `<a lang="ta" href="${esc(link({ lang: "ta" }))}" aria-current="${!L}">தமிழ்</a><a lang="en" href="${esc(link({ lang: "en" }))}" aria-current="${!!L}">English</a>`;

  return `<!doctype html>
<html lang="${L ? "en" : "ta"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${u("app")}: ${esc(dateLabel)}, ${esc(nm(PLACES[params.place].name))}</title>
<meta name="description" content="${esc(`${u("app")} ${dateLabel}: ${tithiLabel(t0)}, ${nm(p.nakshatra[0].name)}`)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-50 -50 100 100'%3E%3Ccircle r='45' fill='%23C48A0A'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alegreya:wght@500;700&family=Mukta+Malar:wght@400;600&family=Noto+Serif+Tamil:wght@500;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<main>
<header class="top">
<div class="brand">${u("app")}</div>
<nav class="lang" aria-label="Language">${langSwitch}</nav>
<div class="daynav">
<a class="icon-btn" href="${esc(link({ date: shiftDate(p.date, -1) }))}" aria-label="${u("prev")}">${CHEV_L}</a>
<form method="get" action="/" id="f" class="pick">
<input type="hidden" name="lang" value="${params.lang}"><input type="hidden" name="ayanamsa" value="${params.ayanamsa}">
<label class="sr" for="date">${u("date")}</label><input type="date" id="date" name="date" value="${p.date}">
<label class="sr" for="place">${u("place")}</label><select id="place" name="place">${placeOptions}</select>
<noscript><button type="submit">${u("show")}</button></noscript>
</form>
<a class="icon-btn" href="${esc(link({ date: shiftDate(p.date, 1) }))}" aria-label="${u("next")}">${CHEV_R}</a>
</div>
<nav class="ayan" aria-label="${u("ayanamsa")}">${ayan}</nav>
</header>

<section class="hero">
${moonSvg(elong, 168, moonLabel)}
<div class="hero-text">
<h1 class="vaara">${esc(L ? vaara[1] : vaara[0])}</h1>
<div class="vaara-sub">${esc(L ? vaara[3] : vaara[2])}</div>
<div class="dayline">${esc(dayLine)}</div>
</div>
<dl class="sunmoon">${sunMoon.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
</section>

<section class="card ribbon" data-from="${from}" data-to="${to}" data-tz="${esc(tz)}" data-now="${esc(u("now"))}">
<div class="sec-head"><h2>${u("ribbonTitle")}</h2><div class="muted">${u("ayanamsa")} ${p.ayanamsaValue.toFixed(4)}°, ${esc(tz)}</div></div>
<div class="scroll"><div class="ribbon-inner">
<div class="row ticks"><div></div><div class="tick-line">${tickHtml}</div></div>
<div class="rows"><div class="now-line" hidden></div><div class="now-tag" hidden></div>${angaRows}</div>
<div class="scale"><span>${u("sunrise")} ${at(from)}</span><span>${u("nextSunrise")} ${at(to)}</span></div>
</div></div>
<ul class="anga-list">${angaList}</ul>
</section>

<section class="stack">
<div class="sec-head"><h2>${u("kundliTitle")}</h2><div class="muted">${u("kundliSub")} (${at(p.sun.rise)}), ${u(params.ayanamsa)} ${u("ayanamsa")}</div></div>
<div class="kundli-body${L ? "" : " single"}">
${charts}
<div class="card table-wrap"><table>
<thead><tr><th>${u("colPlanet")}</th><th>${u("colSign")}</th><th>${u("colDeg")}</th><th>${u("colNak")}</th><th>${u("colState")}</th></tr></thead>
<tbody>${planetRows}</tbody></table></div>
</div>
</section>

<section class="stack tara" data-cols='${esc(JSON.stringify(cols.map((c) => c.window)))}'>
<div class="sec-head"><div><h2>${u("taraTitle")}</h2><div class="muted">${u("taraHint")}</div></div>
<div class="legend"><span><i class="good"></i>${u("good")}</span><span><i class="bad"></i>${u("avoid")}</span><span><i class="mixed"></i>${u("janmaMixed")}</span></div></div>
<div class="your-star"><div class="ys-label">${u("yourStar")}</div><div class="ys-name">${u("pickStar")}</div><div class="ys-windows"></div></div>
<div class="tara-grid">${block(tb.rows.slice(0, 9))}${block(tb.rows.slice(9, 18))}${block(tb.rows.slice(18, 27))}</div>
</section>

<footer><span>${u("footnote")}</span><a href="${REPO}">${u("source")}</a></footer>
</main>
<script>${JS}</script>
</body>
</html>`;
}

const CHEV_L = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`;
const CHEV_R = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>`;

const CSS = `
:root{--ash:#EEF0EC;--paper:#F8F9F6;--ink:#1C2238;--muted:#5C6070;--line:#D5D8D0;--line2:#E4E6E0;
--turmeric:#C48A0A;--kumkum:#9E2B25;--good-bg:#DCE8F0;--good:#174A63;--bad-bg:#F7E0CF;--bad:#8A3A12;--mixed-bg:#E6E4DC;--mixed:#3E3F45;
--seg0:#E3E5EC;--seg1:#CFD3DE;--hl:#FFF4D6;
--display:Alegreya,"Noto Serif Tamil",Georgia,serif;--body:"Mukta Malar",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root{--ash:#151A2B;--paper:#1C2236;--ink:#E8E9F0;--muted:#A3A7B8;--line:#2F3650;--line2:#272D44;
--good-bg:#1D3646;--good:#9CCBE4;--bad-bg:#43271A;--bad:#F2B48E;--mixed-bg:#34332E;--mixed:#D9D6CC;--seg0:#262D45;--seg1:#323A57;--hl:#3A3220}}
*{box-sizing:border-box}
body{margin:0;background:var(--ash);color:var(--ink);font:400 16px/1.55 var(--body)}
main{max-width:1200px;margin:0 auto;padding:24px 28px 64px;display:flex;flex-direction:column;gap:40px}
a{color:inherit}
:focus-visible{outline:3px solid var(--turmeric);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
h1,h2{margin:0;font-family:var(--display);font-weight:700}
h2{font-size:26px;line-height:1.3}
.muted{color:var(--muted);font-size:14px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px}
.sec-head{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:8px 16px}
.stack{display:flex;flex-direction:column;gap:18px}

.top{display:flex;flex-wrap:wrap;align-items:center;gap:14px 18px}
.brand{font-family:var(--display);font-weight:700;font-size:24px;margin-right:auto}
.lang,.ayan{display:flex;border:1px solid var(--ink);border-radius:22px;overflow:hidden}
.ayan{border-color:var(--line);border-radius:8px}
.lang a,.ayan a{display:flex;align-items:center;min-height:44px;padding:0 16px;text-decoration:none;font-weight:600;background:var(--paper)}
.ayan a{font-weight:400;padding:0 14px}
.ayan a+a{border-left:1px solid var(--line)}
.lang a[aria-current=true],.ayan a[aria-current=true]{background:var(--ink);color:var(--paper)}
.daynav{display:flex;align-items:center;gap:6px}
.pick{display:flex;gap:6px}
.icon-btn{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:8px;background:var(--paper)}
input,select,button{font:inherit;color:var(--ink)}
input[type=date],select{height:44px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper)}

.hero{display:flex;flex-wrap:wrap;align-items:center;gap:28px 48px}
.moon-dark{fill:var(--ink);opacity:.12}.moon-lit{fill:var(--turmeric)}
.hero-text{flex:1 1 420px;display:flex;flex-direction:column;gap:4px}
.vaara{font-size:clamp(40px,7vw,72px);line-height:1.1}
html[lang=en] .vaara{font-size:clamp(48px,8vw,84px);letter-spacing:-.01em}
.vaara-sub{font-size:20px;color:var(--muted)}
.dayline{font-family:var(--display);font-size:clamp(20px,3vw,28px);font-weight:500;margin-top:12px;line-height:1.3}
.sunmoon{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 32px;margin:0;flex:0 1 320px}
.sunmoon dt{color:var(--muted);font-size:14px}.sunmoon dd{margin:0;font-size:22px;font-weight:600}

.ribbon{padding:22px 26px 18px}
.ribbon .sec-head{margin-bottom:16px}
.scroll{overflow-x:auto}
.ribbon-inner{min-width:740px}
.row{display:grid;grid-template-columns:140px 1fr;gap:16px;align-items:center}
.rows{position:relative}
.rows .row{padding:12px 0;border-top:1px solid var(--line)}
.what{font-family:var(--display);font-size:19px;font-weight:700}
.bar{display:flex;height:60px;border-radius:6px;overflow:hidden}
.seg{padding:6px 10px;display:flex;flex-direction:column;justify-content:center;overflow:hidden;white-space:nowrap;line-height:1.35}
.seg+.seg{border-left:2px solid var(--paper)}
.seg.s0{background:var(--seg0)}.seg.s1{background:var(--seg1)}
.seg b{font-weight:600;overflow:hidden;text-overflow:ellipsis}
.seg span{font-size:13px;color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.tick-line{position:relative;height:22px;font-size:13px;color:var(--muted)}
.tick-line span{position:absolute;white-space:nowrap}
.tick-sunset{color:var(--ink);font-weight:600}
.now-line{position:absolute;top:0;bottom:0;width:2px;background:var(--kumkum);z-index:2}
.now-tag{position:absolute;top:-4px;transform:translateX(-50%);background:var(--kumkum);color:#fff;font-size:12px;font-weight:600;padding:0 6px;border-radius:4px;z-index:3;white-space:nowrap}
.scale{display:flex;justify-content:space-between;margin-left:156px;padding-top:6px;font-size:13px;color:var(--muted)}

.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:24px}
.chart-card{margin:0;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px;align-items:center}
.chart-card figcaption{align-self:stretch;font-weight:600}
.south-grid{width:100%;max-width:460px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(4,minmax(84px,108px));gap:1px;background:var(--ink);border:1px solid var(--ink)}
.cell{background:var(--paper);padding:5px 7px;display:flex;flex-direction:column;gap:1px;overflow:hidden;line-height:1.25}
.cell.is-lagna{background:var(--hl)}
.cell .sign{font-size:11px;color:var(--muted)}
.pl{font-size:14px;font-weight:600;white-space:nowrap}.pl.lagna{color:var(--kumkum)}
.centre{grid-area:2/2/4/4;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2px;padding:8px;font-size:13px;color:var(--muted)}
.centre strong{font-family:var(--display);font-size:22px;color:var(--ink)}
.north-box{position:relative;width:100%;max-width:436px;aspect-ratio:1/1;border:1px solid var(--ink);background:var(--paper)}
.north-box svg{position:absolute;inset:0;width:100%;height:100%}
.north-box path{fill:none;stroke:var(--ink);stroke-width:1.2;vector-effect:non-scaling-stroke}
.house{position:absolute;transform:translate(-50%,-50%);width:22%;display:flex;flex-direction:column;align-items:center;text-align:center;line-height:1.25}
.house .num{font-size:11px;color:var(--muted)}.house .pls{font-size:14px;font-weight:600}
.chart-tabs{display:none}
.kundli-body{display:flex;flex-direction:column;gap:18px}
.kundli-body.single{display:grid;grid-template-columns:minmax(340px,500px) minmax(0,1fr);align-items:start;gap:24px}
.kundli-body.single .charts{grid-template-columns:1fr}
.kundli-body.single table{min-width:0}
.anga-list{display:none;list-style:none;margin:0;padding:0}
.anga-list li{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line2)}
.anga-list li:first-child{border-top:0}
.anga-list small{display:block;font-size:13px;color:var(--muted)}
.anga-list b{font-family:var(--display);font-size:20px;line-height:1.3}
.anga-list .when{display:flex;flex-direction:column;align-items:end;text-align:right;font-size:14px;color:var(--muted);line-height:1.4}

.table-wrap{overflow-x:auto}
table{width:100%;min-width:600px;border-collapse:collapse;font-size:15px}
th{text-align:left;padding:10px 14px;font-weight:600;color:var(--muted);font-size:13px}
td{padding:9px 14px;border-top:1px solid var(--line2)}
td.b{font-weight:600}td.num{font-variant-numeric:tabular-nums}td.ok{color:var(--good)}td.warn{color:var(--bad)}

.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:14px;color:var(--muted)}
.legend i{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:6px;vertical-align:-2px}
.legend i.good{background:var(--good-bg);border:1px solid var(--good)}.legend i.bad{background:var(--bad-bg);border:1px solid var(--bad)}.legend i.mixed{background:var(--mixed-bg);border:1px solid var(--mixed)}
.your-star{background:var(--ink);color:var(--paper);border-radius:14px;padding:18px 24px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 32px}
.ys-label{font-size:14px;opacity:.85}
.ys-name{font-family:var(--display);font-size:28px;font-weight:700;margin-right:auto}
.your-star:not(.set) .ys-name{font-family:var(--body);font-size:16px;font-weight:400;opacity:.85}
.ys-windows{display:flex;flex-wrap:wrap;gap:12px 32px}
.ys-w{display:flex;flex-direction:column;line-height:1.3}.ys-w small{font-size:13px;opacity:.8}.ys-w b{font-size:20px}.ys-w span{font-size:14px;opacity:.85}
.tara-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:20px}
.tara-block{background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.tara-head-row,.tara-row{display:grid;grid-template-columns:minmax(104px,1fr) repeat(var(--cols),minmax(0,106px));gap:8px;align-items:center;padding:6px 14px}
.tara-head-row{font-size:13px;color:var(--muted);padding:10px 14px;border-bottom:1px solid var(--line)}
.tara-row{width:100%;min-height:48px;border:0;border-top:1px solid var(--line2);background:transparent;text-align:left;cursor:pointer}
.tara-row[aria-pressed=true]{background:var(--hl);box-shadow:inset 4px 0 0 var(--turmeric)}
.tara-row .b{font-weight:600;font-size:15px;overflow-wrap:break-word;min-width:0}
.chip{padding:4px 7px;border-radius:6px;font-size:13px;font-weight:600;line-height:1.3}
.chip.good{background:var(--good-bg);color:var(--good)}.chip.bad{background:var(--bad-bg);color:var(--bad)}.chip.mixed{background:var(--mixed-bg);color:var(--mixed)}

footer{display:flex;flex-wrap:wrap;gap:8px 24px;color:var(--muted);font-size:14px;border-top:1px solid var(--line);padding-top:18px}

@media (max-width:760px){
main{padding:16px 16px 48px;gap:28px}
.brand{font-size:22px}
.daynav{order:3;width:100%;display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:8px}
.pick{display:contents}
.pick input{grid-column:2;grid-row:1;width:100%}
.pick select{grid-column:1/-1;grid-row:2;width:100%}
.ribbon .scroll{display:none}.anga-list{display:block}.ribbon{padding:18px}
.kundli-body.single{display:flex}
.ayan{order:4}
.hero{gap:16px}.moon{width:96px;height:96px}
.chart-tabs{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.chart-tabs button{min-height:48px;border:0;background:var(--paper);font-weight:600}
.chart-tabs button+button{border-left:1px solid var(--line)}
.chart-tabs button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
.charts.both[data-show=south] .north,.charts.both[data-show=north] .south{display:none}
.tara-grid{grid-template-columns:1fr}
.tara-head-row,.tara-row{grid-template-columns:minmax(104px,1fr) repeat(var(--cols),minmax(0,112px))}
}
@media (prefers-reduced-motion:no-preference){.tara-row{transition:background .15s}}
`;

const JS = `
(function(){
  var f=document.getElementById('f');
  ['date','place'].forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener('change',function(){f.submit();});});

  // "Now" marker on the ribbon, placed in the browser so cached pages stay correct.
  var rb=document.querySelector('.ribbon');
  if(rb){var from=+rb.dataset.from,to=+rb.dataset.to,now=Date.now();
    if(now>=from&&now<to){var rows=rb.querySelector('.rows'),pos=(now-from)/(to-from);
      var left='calc(156px + (100% - 156px) * '+pos.toFixed(4)+')';
      var line=rb.querySelector('.now-line'),tag=rb.querySelector('.now-tag');
      var t=new Intl.DateTimeFormat('en-GB',{timeZone:rb.dataset.tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(now));
      line.style.left=left;tag.style.left=left;tag.textContent=rb.dataset.now+' '+t;line.hidden=false;tag.hidden=false;}}

  // Chart style tabs (English, narrow screens).
  var charts=document.querySelector('.charts.both');
  document.querySelectorAll('.chart-tabs button').forEach(function(b){b.addEventListener('click',function(){
    charts.dataset.show=b.dataset.show;
    document.querySelectorAll('.chart-tabs button').forEach(function(x){x.setAttribute('aria-pressed',String(x===b));});});});

  // Your star: remembered on this device only.
  var sec=document.querySelector('.tara');if(!sec)return;
  var wins=JSON.parse(sec.dataset.cols||'[]'),box=sec.querySelector('.your-star');
  function pick(i){
    var row=sec.querySelector('.tara-row[data-i="'+i+'"]');if(!row)return;
    sec.querySelectorAll('.tara-row').forEach(function(r){r.setAttribute('aria-pressed',String(r===row));});
    box.classList.add('set');box.querySelector('.ys-name').textContent=row.dataset.name;
    var chips=row.querySelectorAll('.chip'),w=box.querySelector('.ys-windows');w.textContent='';
    chips.forEach(function(c,k){var d=document.createElement('div');d.className='ys-w';
      var s=document.createElement('small');s.textContent=wins[k]||'';
      var b=document.createElement('b');b.textContent=c.dataset.label;
      var v=document.createElement('span');v.textContent=c.dataset.verdict;
      d.append(s,b,v);w.append(d);});
  }
  sec.querySelectorAll('.tara-row').forEach(function(r){r.addEventListener('click',function(){
    try{localStorage.setItem('janma',r.dataset.i);}catch(e){} pick(r.dataset.i);});});
  try{var saved=localStorage.getItem('janma');if(saved)pick(saved);}catch(e){}
})();
`;

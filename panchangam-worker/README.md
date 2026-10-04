# Panchangam

A free daily panchangam for the Tamil community, served from one Cloudflare Worker. For any date and place it shows the five angas, the planet positions as a kundli, and a tarabalam table for all 27 birth stars. Every page is available in Tamil and English.

## What's on the page

- **Day:** vaara, tithi, nakshatra, sunrise, sunset, moonrise and moonset, with a moon-phase disc.
- **Sunrise to sunrise:** tithi, nakshatra, yogam and karanam as a timeline with end times and a live "now" marker. Phones get a compact "until / then" list instead.
- **Planet positions at sunrise:** lagna, the seven grahas, Rahu and Ketu, with degree, nakshatra and pada, retrograde, and own/exalted/debilitated sign.
  - Tamil shows the South Indian chart.
  - English shows both South and North Indian charts; on phones a toggle switches between them.
- **Tarabalam:** the tara for each birth star across every nakshatra window of the day. Tapping a star highlights it and remembers it on that device.

Language, place and ayanamsa (Lahiri, Raman, KP) are remembered in cookies. The birth star is kept in the browser's local storage and never reaches the server. There is no public API.

## Run and deploy

```bash
npm install
npm test                  # smoke test against a known day
npm run dev               # http://127.0.0.1:8787
npx wrangler login        # once
npm run deploy
```

To serve on your own domain, uncomment the `routes` line in `wrangler.toml`.

## Deploy on every push to GitHub

`.github/workflows/deploy.yml` runs `npm test` and then deploys on every push to `main`.

1. Create the repo and push:
   ```bash
   git init -b main && git add . && git commit -m "Panchangam worker"
   gh repo create vgnshlvnz/panchangam-worker --public --source . --push
   ```
2. In the Cloudflare dashboard, create an API token from the **Edit Cloudflare Workers** template, and copy your Account ID from the Workers overview page.
3. Add both as repository secrets:
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```
4. Push to `main` (or run the workflow from the Actions tab).

Alternatively, connect the repo in the Cloudflare dashboard (Workers, your worker, Settings, Build) and skip the workflow and secrets.

## Method

- **Positions:** apparent geocentric positions from [astronomy-engine](https://github.com/cosinekitty/astronomy) (MIT, pure JavaScript). Checked against Swiss Ephemeris (Moshier):
  - Sun and Moon agree within about 3″.
  - Planets agree within about 17″.
  - Lagna agrees within about 4″.
- **Sidereal:** tropical longitude minus nutation minus mean ayanamsa. The ayanamsa is the Swiss Ephemeris epoch value plus IAU 2006 precession, matching Swiss to under 1″.
- **Rahu/Ketu:** mean node (Meeus).
- **Lagna:** ascendant from apparent sidereal time and true obliquity, cast for sunrise.
- **Angas:**
  - tithi = (Moon − Sun) / 12°
  - karana = half a tithi
  - nakshatra = sidereal Moon / 13°20′
  - yoga = (sidereal Sun + Moon) / 13°20′
  - End times are solved to sub-second precision and agree with Swiss Ephemeris within about 10 seconds.
- **Day:** sunrise to next sunrise, Sun's upper limb with standard refraction. Vaara is the weekday at sunrise.
- **Tarabalam:** count from the birth star to the day's star, inclusive; tara = ((count − 1) mod 9) + 1.
  - Vipath, Prathyak and Vadham are marked to avoid.
  - Janmam is marked mixed.
  - The other five are good.

## Cost and caching

A page takes a few milliseconds of CPU, inside the free plan's limit. Pages are cached at the edge per date, place, ayanamsa and language. The cache key includes the deployment id, so each deploy starts fresh.

## Files

```
src/index.js        routing, preferences, caching
src/panchangam.js   astronomy, ayanamsa, angas, kundli, tarabalam
src/render.js       the page (server-rendered HTML, CSS, a little JS)
src/names.js        Tamil and English names
src/i18n.js         interface text and places
test/smoke.mjs      known-day checks run before every deploy
```

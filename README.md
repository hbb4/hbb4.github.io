# hbb4.github.io

The WX+EV homepage: a static site for GitHub Pages, with no build step. Copy everything in this folder
(including `.nojekyll`) to the root of the `hbb4/hbb4.github.io` repository.

| file | what it is |
|---|---|
| `index.html` | the page: live sky, what this is, how it works, the record, about the uploader |
| `privacy.html` | the uploader's privacy policy (same text as before, restyled). Its contact line points to the YouTube channel |
| `socials.html` | every account, from `data/socials.json` |
| `404.html` | "Lost in the fog" |
| `style.css` | every style, including the privacy and 404 pages |
| `js/sky.js` | the sky behind the page, looking roughly south-west toward Sutro Tower: the ridge, the tower (lattice, three masts, red beacons blinking every 2 s), hillside lights, and the city as a small 3D model seen from about 95 m up on Nob Hill (a carpet of row houses, ~150 mid-rises, a dozen towers and two cranes, each with its own bearing, distance, height, materials and lit side; hazier with distance; windows lit by time of night). Time-lapse button, scrubber and a constellation toggle. It respects reduced motion |
| `js/astro.js` | sun, moon (phase, bright limb toward the sun), planets and stars as altitude/azimuth over central San Francisco. Within 0.2° of astropy |
| `js/weather.js` | clouds: the latest KSFO METAR for now (cover and ceiling per layer, visibility, wind), Open-Meteo's hourly low/mid/high cover for the rest of the day, and a made-up sky if neither loads. A low ceiling puts the top of the tower in the cloud. Clouds drift with the reported wind and reshape as they go (three noise octaves sliding against each other): at real speed when live, and at the time-lapse's pace (6 minutes a second, `PLAY_RATE` in `js/sky.js`) while it plays |
| `data/sky.json` | 1,627 stars to magnitude 5, constellation lines and names, and planet elements, from d3-celestial (BSD-3-Clause; HYG database, JPL elements) |
| `js/record.js` | the record tiles, the latest pick and four SVG charts, all read from `data/record.json` |
| `data/record.json` | the data. For now it holds made-up picks, shown as XX.X |
| `avatar.png`, `favicon.png`, `img/` | from `branding/wxplusev/` (`img/og.png` is the X banner, used for link previews) |

Keep the "About the uploader" section and the privacy link on the homepage: Google's OAuth review for the
uploader looks for both.

## The record

`data/record.json` is written by `python -m picks.src.site_record` (see its docstring). Only public per-pick
fields get in: date, city, high/low, exchange, side, bin, model probability, price, edge, forecast,
observed, outcome and R. Stakes, contracts, dollars, fills, plan ids, tickers and strategy names are dropped.

```
python -m picks.src.site_record sample -o homepage/data/record.json                  # made-up, shown as XX.X
python -m picks.src.site_record export posted.csv -o homepage/data/record.json --latest pick.json
```

- `"placeholder": true`: every number on the page shows as X's (`XX.X%`, `+X.XR`).
- `"illustrative": true`: the page says the picks are made up and watermarks the charts.

Set both to false (an `export` does this) and the real numbers show. A chart whose fields are missing is
hidden. With no `city` column, for example, the "By city" chart doesn't appear.

The placeholder figures in "What this is" (stills, days filmed, archive size, cities) are plain text in
`index.html`, in elements with `class="ph"`.

## The view

`VIEW_AZ` (the bearing in the middle of the screen), `TOWER_AZ` and `TOWER_DEG` (the tower's bearing and
angular height) at the top of `js/sky.js` set the framing. The land is drawn, not traced from a photo, and the
sky uses central San Francisco's coordinates. Constellation lines and names cover the zodiac and the
best-known constellations only (set when `data/sky.json` is built); only planets get labels.

## Socials

`data/socials.json` lists every account, in groups (WX+EV, Passages, Music). A group with no accounts is
hidden. The icon row at the foot of the home page shows the groups marked `"footer": true`, and each icon
opens that account's card on `socials.html`. Icons are Simple Icons glyphs (CC0) in `js/icons.js`.

Visitors' browsers call aviationweather.gov and api.open-meteo.com for the clouds (no keys, no cookies). If
aviationweather.gov blocks cross-origin requests, the forecast still drives the clouds. Running
`WXSKY.setWeather({low: {cover: 1, baseFt: 1200}})` in the console previews a fog deck.

## Preview locally

```
cd homepage && python3 -m http.server 8000
```

Then open http://localhost:8000. Opening the file directly won't load the record, because browsers block
`fetch` from `file://`.

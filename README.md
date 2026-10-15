# History Timeline

A vertical, continuously zoomable editorial timeline of world history. Recent years sit at the **top**; antiquity at the **bottom**. This is a local reference tool: the UI never loads the whole corpus into the DOM.

## Install and run

Requires **Node 20.19+** or **Node 22.12+** (this repo is developed on Node 24 LTS).

```bash
npm install
npm run dev
```

`npm run dev` rebuilds the seed JSON and starts Vite. Open the printed local URL.

Production build:

```bash
npm run build
npm run preview
```

Tests:

```bash
npm test              # unit tests (vitest)
npx playwright install chromium
npm run test:e2e      # Playwright, including the 20k synthetic corpus
npm run test:all
```

## Data pipeline

| Path | Role |
| --- | --- |
| `data/source/events.csv` | **Source of truth.** Human-authored events. |
| `data/taxonomy.json` | Slug → label for every region and subject. |
| `data/eras.json` | Region-scoped era bands. |
| `public/data/generated/` | **Generated.** Do not hand-edit. |
| `scripts/build-data.ts` | Validates, converts years, emits buckets/index/details. |
| `scripts/gen-synthetic.ts` | Writes ~20,000 `synthetic: true` filler events. |

```bash
npm run build:data      # seed corpus → public/data/generated
npm run gen:synthetic   # filler corpus → public/data/generated/synthetic
```

### Add a real event

1. Append a row to `data/source/events.csv`.
2. `id` is a stable slug (`meiji-restoration`), never `evt_47`.
3. Years are **display years**: `44 BCE`, `1776`, `1776 CE`. The build converts them to astronomical numbering (`1 BCE = year 0`).
4. `regions` and `subjects` are `;`-separated slugs that must exist in `data/taxonomy.json`. A missing slug fails the build.
5. `sources` are `;`-separated names. Put a URL in parentheses only if you are certain it is real; otherwise name only.
6. Optional `salienceByRegion`: `japan:95;world:70`.
7. Run `npm run build:data`.

`scripts/write-seed-csv.ts` bootstrapped the first CSV. **Do not re-run it** — it overwrites `events.csv`.

Every seeded `body` is an **editorial draft**. It is not an authoritative article. Treat summaries as orientation, then follow the named sources.

## Salience rubric

`salience` is 0–100 and drives density selection (who appears at a given zoom), not a moral ranking.

| Band | Meaning | Examples in this corpus |
| --- | --- | --- |
| 90–100 | Alters world history | Qin unification, Black Death, world wars, 1949 PRC, 1991 USSR |
| 70–89 | Major regional turning point | Meiji Restoration, Haitian Revolution, First Opium War |
| 50–69 | Notable, widely taught | Hatshepsut, Jamestown, Waitangi |
| 30–49 | Specialist interest | (used mainly in the synthetic corpus) |
| &lt;30 | Minor | synthetic filler |

When a region filter is on, selection uses `salienceByRegion[region]` if present, else global `salience`. The Meiji Restoration is scored ~98 for Japan and ~78 worldwide so a Japan-filtered view stays curated instead of empty.

## Camera, culling, and the 150-marker cap

There is **no tall scrollable div**. Camera state is exactly `{ centerYear, pxPerYear }`. Pan and zoom mutate those two numbers; the SVG island is updated imperatively so React does not reconcile on every pointer move.

Visible markers are chosen **after filters** by density: the viewport is cut into zoom-sized bins, each bin keeps top-K by salience, then a **hard cap of 150** marker nodes. Cluster chips (`12 events · 1914–1918`) come from bin metadata — the client does not fetch the hidden bodies to show a count.

The Playwright test loads the 20k synthetic corpus at world zoom and asserts `≤ 150` `[data-testid="timeline-marker"]` nodes.

## Theme

Three-state toggle in the header: **Light / Dark / System**.

- **System** (default) follows `prefers-color-scheme` and clears `localStorage`.
- Light or Dark writes `localStorage.theme` and overrides the OS.
- An inline script in `index.html` sets `data-theme` on `<html>` **before first paint**, so there is no flash of the wrong theme.
- All colour lives in CSS variables. Components do not hardcode hex.

## URL

Query params only (works on any static host):

```
/?y=1776&z=8&regions=europe,united-states&subjects=politics-empire&event=american-declaration
```

| Param | Meaning |
| --- | --- |
| `y` | Centre **display** year (BCE as a negative, e.g. `y=-44` → 44 BCE) |
| `z` | Log zoom (`pxPerYear = 0.06 × 2^z`) |
| `regions`, `subjects` | Comma-separated slugs |
| `event` | Open summary card |
| `q` | Search box |
| `synthetic=1` | Merge the generated filler corpus (tests / density work) |

Theme is **not** in the URL.

## How to swap `eventsRepo` for an HTTP API

The UI must not import JSON or call `fetch` except through **one module**:

`src/data/eventsRepo.ts`

That file already exposes:

- `listEvents(q)` → `{ items, total, bins }` (density-selected, capped)
- `getEvent(id)`
- `searchEvents(q)`
- `getTaxonomy()` / `getEras()` / `getManifest()` / `getDensityHistogram()`

All methods are `async` and take `AbortSignal`. In-flight list/search calls are aborted when the camera or filters move.

To point at a real backend, replace the local JSON loader inside that module (or `createHttpBackend`) with `fetch('/api/events?from=&to=&regions=&bins=...')`. Keep the same TypeScript shapes. **No other file should change.**

The in-memory index is sorted by `startYear`; range queries binary-search it. Tens of thousands of compact rows are fine on the main thread.

## Wikidata import (future path to 50k)

The CSV is the right authoring format for a few hundred curated events. A 50k-event world timeline will not be typed by hand. The realistic next step is a **Wikidata dump or SPARQL extract** mapped onto this schema:

- `id` ← stable Wikidata QID (`Q8683`) or a derived slug plus QID in a sidecar
- `startYear` / `endYear` ← point-in-time claims (`P580`/`P582`/`P585`) with qualifiers; convert to astronomical years
- `regions` / `subjects` ← mapped from P31/P17/P276 onto **this** taxonomy (do not dump raw Q-ids into the filter UI)
- `salience` ← a computed mix of sitelink count, claim density, and a hand rubric for the head of the distribution — never sitelinks alone
- `summary` / `body` ← short Wikipedia/Wikidata descriptions, clearly labelled as imported, with **attribution**
- `sources` ← the Wikidata item URL plus the Wikipedia revision you drew prose from

Licensing: Wikidata is CC0; Wikipedia text is CC BY-SA. Imported bodies must carry BY-SA attribution and must not be presented as original scholarship. Deduplicate against the human CSV by QID so editorial overrides win.

## Interaction notes

- Zoom: `Ctrl/Cmd + wheel`, trackpad pinch, two-finger touch pinch, `+`/`−` keys and buttons, zoom slider. Zoom is **cursor-anchored**.
- Pan: drag, arrow keys, `PageUp`/`PageDown`. `Home` / `End` jump to the ends of the loaded range.
- The timeline surface sets `touch-action: none`. Trackpad pinch (`wheel` + `ctrlKey`) and touchscreen pinch (`touchstart` with two points) are separate code paths.
- Two or more region filters open **parallel lanes**. Long empire/dynasty events render as duration bars behind point markers.
- **Compress empty time** (header) enables a piecewise scale so empty millennia take less space. Camera state is still real years.

## Stack

Vite + TypeScript + React (chrome only). The timeline itself is an SVG rendering island. State is a small module + `useSyncExternalStore`. No Redux, no CMS, no UI kit.

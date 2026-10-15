import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { yearBucket } from '../src/data/years.ts'
import { normalizeSearch } from '../src/data/text.ts'
import type { EventMarker, IndexEntry, Manifest, SearchEntry } from '../src/data/types.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'data', 'generated', 'synthetic')

const REGIONS = [
  'world',
  'europe',
  'asia',
  'africa',
  'middle-east',
  'americas',
  'oceania',
  'china',
  'india',
  'united-kingdom',
  'france',
  'united-states',
  'japan',
  'egypt',
  'ottoman-empire',
]
const SUBJECTS = [
  'war-conflict',
  'politics-empire',
  'science-technology',
  'arts-culture',
  'philosophy-religion',
  'exploration',
  'economy-trade',
  'everyday-life',
]

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function pickN<T>(rng: () => number, arr: T[], n: number): T[] {
  const copy = [...arr]
  const out: T[] = []
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(rng() * copy.length)
    out.push(copy.splice(idx, 1)[0])
  }
  return out
}

function yearFromMix(rng: () => number): number {
  const r = rng()
  if (r < 0.28) return 1914 + Math.floor(rng() * 32) // 1914–1945 dense
  if (r < 0.4) return 1789 + Math.floor(rng() * 27) // 1789–1815 dense
  if (r < 0.55) return -500 + Math.floor(rng() * 1000)
  return -3000 + Math.floor(rng() * 5025)
}

function salienceFromRng(rng: () => number): number {
  const u = rng()
  // Power-law-ish: few high-salience events
  return Math.round(100 * (1 - Math.pow(u, 0.35)))
}

async function main(): Promise<void> {
  const rng = mulberry32(20260919)
  const count = 20000
  const index: IndexEntry[] = []
  const search: Record<string, SearchEntry> = {}
  const buckets = new Map<number, EventMarker[]>()
  let minYear = Infinity
  let maxYear = -Infinity
  let maxSpan = 0

  await rm(outDir, { recursive: true, force: true })
  await mkdir(join(outDir, 'events'), { recursive: true })

  for (let i = 0; i < count; i++) {
    const startYear = yearFromMix(rng)
    const month = rng() < 0.35 ? 1 + Math.floor(rng() * 12) : undefined
    const day = month && rng() < 0.5 ? 1 + Math.floor(rng() * 28) : undefined
    const longBar = rng() < 0.08
    const endYear = longBar ? startYear + 5 + Math.floor(rng() * 80) : rng() < 0.15 ? startYear + 1 + Math.floor(rng() * 4) : null
    const regions = pickN(rng, REGIONS, 1 + Math.floor(rng() * 3))
    const subjects = pickN(rng, SUBJECTS, 1 + Math.floor(rng() * 2))
    const salience = Math.max(1, Math.min(100, salienceFromRng(rng)))
    const bucket = yearBucket(startYear)
    const id = `syn-${bucket}-${String(i).padStart(5, '0')}`
    const title = `Synthetic ${pick(rng, subjects)} ${startYear} #${i}`
    const summary = `Generated filler event in ${regions.join(', ')} (${subjects.join(', ')}). Not a historical record.`
    const importance = (salience >= 85 ? 5 : salience >= 70 ? 4 : salience >= 50 ? 3 : salience >= 30 ? 2 : 1) as 1 | 2 | 3 | 4 | 5
    const salienceByRegion =
      rng() < 0.25
        ? { [regions[0]]: Math.min(100, salience + 10 + Math.floor(rng() * 10)) }
        : undefined
    const marker: EventMarker = {
      id,
      title,
      startYear,
      startMonth: month,
      startDay: day,
      endYear,
      precision: day ? 'day' : month ? 'month' : 'year',
      salience,
      salienceByRegion,
      importance,
      regions,
      subjects,
      summary,
      synthetic: true,
    }
    const end = endYear ?? startYear
    minYear = Math.min(minYear, startYear)
    maxYear = Math.max(maxYear, end)
    maxSpan = Math.max(maxSpan, end - startYear)
    index.push({
      id,
      startYear,
      endYear,
      salience,
      salienceByRegion,
      regions,
      subjects,
      synthetic: true,
    })
    search[id] = {
      title: normalizeSearch(title),
      text: normalizeSearch(`${title} ${summary}`),
    }
    const list = buckets.get(bucket) ?? []
    list.push(marker)
    buckets.set(bucket, list)
  }

  index.sort((a, b) => a.startYear - b.startYear || a.id.localeCompare(b.id))
  const bucketYears = [...buckets.keys()].sort((a, b) => a - b)
  for (const b of bucketYears) {
    await writeFile(join(outDir, 'events', `${b}.json`), JSON.stringify(buckets.get(b)), 'utf8')
  }
  const manifest: Manifest = {
    minYear,
    maxYear,
    eventCount: count,
    buckets: bucketYears,
    maxSpanYears: maxSpan,
    generatedAt: new Date().toISOString(),
  }
  await writeFile(join(outDir, 'index.json'), JSON.stringify(index), 'utf8')
  await writeFile(join(outDir, 'search-index.json'), JSON.stringify(search), 'utf8')
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`gen:synthetic wrote ${count} events → ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

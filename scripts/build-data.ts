import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { parseCsv } from './csv.ts'
import { parseDisplayYear, yearBucket } from '../src/data/years.ts'
import { normalizeSearch } from '../src/data/text.ts'
import type { EventMarker, HistoryEvent, IndexEntry, Manifest, Precision, SearchEntry } from '../src/data/types.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'data', 'generated')

const precisionSchema = z.enum(['day', 'month', 'year', 'decade', 'century', 'circa'])
const importanceSchema = z.coerce.number().int().min(1).max(5)

function splitList(s: string): string[] {
  return s
    .split(/[;|]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function parseSalienceByRegion(s: string): Record<string, number> | undefined {
  if (!s.trim()) return undefined
  const out: Record<string, number> = {}
  for (const part of s.split(/[;|]/)) {
    const [k, v] = part.split(':').map((x) => x.trim())
    if (!k || v == null) throw new Error(`Bad salienceByRegion: ${s}`)
    out[k] = Number(v)
  }
  return out
}

function parseSources(s: string): { name: string; url?: string }[] {
  if (!s.trim()) return []
  return s.split(/;/).map((part) => {
    const t = part.trim()
    const urlMatch = t.match(/^(.*)\s+\((https?:\/\/\S+)\)$/)
    if (urlMatch) return { name: urlMatch[1].trim(), url: urlMatch[2] }
    return { name: t }
  })
}

async function main(): Promise<void> {
  const taxonomy = JSON.parse(await readFile(join(root, 'data', 'taxonomy.json'), 'utf8')) as {
    regions: { slug: string; label: string }[]
    subjects: { slug: string; label: string }[]
  }
  const eras = JSON.parse(await readFile(join(root, 'data', 'eras.json'), 'utf8')) as {
    id: string
    label: string
    startYear: number
    endYear: number
    regions: string[]
  }[]
  const regionSlugs = new Set(taxonomy.regions.map((r) => r.slug))
  const subjectSlugs = new Set(taxonomy.subjects.map((s) => s.slug))

  for (const era of eras) {
    for (const r of era.regions) {
      if (!regionSlugs.has(r)) throw new Error(`Era ${era.id} references unknown region ${r}`)
    }
  }

  const csvText = await readFile(join(root, 'data', 'source', 'events.csv'), 'utf8')
  const rows = parseCsv(csvText)
  if (rows.length < 120) {
    throw new Error(`Expected at least 120 seed events, got ${rows.length}`)
  }

  const events: HistoryEvent[] = []
  const seen = new Set<string>()

  for (const [i, row] of rows.entries()) {
    // +1 to move from 0-index to 1-index, +1 more for the header row.
    const line = i + 2
    try {
      const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).parse(row.id)
      if (seen.has(id)) throw new Error(`Duplicate id: ${id}`)
      seen.add(id)
      const precision = precisionSchema.parse(row.precision) as Precision
      const importance = importanceSchema.parse(row.importance) as 1 | 2 | 3 | 4 | 5
      const salience = z.coerce.number().min(0).max(100).parse(row.salience)
      const regions = splitList(row.regions)
      const subjects = splitList(row.subjects)
      for (const r of regions) {
        if (!regionSlugs.has(r)) throw new Error(`${id} unknown region ${r}`)
      }
      for (const s of subjects) {
        if (!subjectSlugs.has(s)) throw new Error(`${id} unknown subject ${s}`)
      }
      if (!row.title) throw new Error(`${id} missing title`)
      if (!row.summary) throw new Error(`${id} missing summary`)
      if (!row.body) throw new Error(`${id} missing body`)
      const startYear = parseDisplayYear(row.startYear)
      const endYear = row.endYear ? parseDisplayYear(row.endYear) : null
      const startMonth = row.startMonth ? z.coerce.number().int().min(1).max(12).parse(row.startMonth) : undefined
      const startDay = row.startDay ? z.coerce.number().int().min(1).max(31).parse(row.startDay) : undefined
      const event: HistoryEvent = {
        id,
        title: row.title,
        startYear,
        startMonth,
        startDay,
        endYear,
        precision,
        salience,
        importance,
        regions,
        subjects,
        summary: row.summary,
        body: row.body,
        sources: parseSources(row.sources ?? ''),
        image: row.image || undefined,
        salienceByRegion: parseSalienceByRegion(row.salienceByRegion ?? ''),
      }
      events.push(event)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`events.csv line ${line} (id "${row.id || '?'}"): ${msg}`)
    }
  }

  await rm(join(outDir, 'events'), { recursive: true, force: true })
  await rm(join(outDir, 'details'), { recursive: true, force: true })
  await mkdir(join(outDir, 'events'), { recursive: true })
  await mkdir(join(outDir, 'details'), { recursive: true })

  const index: IndexEntry[] = []
  const search: Record<string, SearchEntry> = {}
  const buckets = new Map<number, EventMarker[]>()
  let maxSpan = 0
  let minYear = Infinity
  let maxYear = -Infinity

  for (const e of events) {
    const end = e.endYear ?? e.startYear
    maxSpan = Math.max(maxSpan, end - e.startYear)
    minYear = Math.min(minYear, e.startYear)
    maxYear = Math.max(maxYear, end)
    index.push({
      id: e.id,
      startYear: e.startYear,
      endYear: e.endYear,
      salience: e.salience,
      salienceByRegion: e.salienceByRegion,
      regions: e.regions,
      subjects: e.subjects,
    })
    search[e.id] = {
      title: normalizeSearch(e.title),
      text: normalizeSearch(`${e.title} ${e.summary}`),
    }
    const marker: EventMarker = {
      id: e.id,
      title: e.title,
      startYear: e.startYear,
      startMonth: e.startMonth,
      startDay: e.startDay,
      endYear: e.endYear,
      precision: e.precision,
      salience: e.salience,
      salienceByRegion: e.salienceByRegion,
      importance: e.importance,
      regions: e.regions,
      subjects: e.subjects,
      summary: e.summary,
      image: e.image,
    }
    const b = yearBucket(e.startYear)
    const list = buckets.get(b) ?? []
    list.push(marker)
    buckets.set(b, list)
    await writeFile(join(outDir, 'details', `${e.id}.json`), JSON.stringify(e), 'utf8')
  }

  index.sort((a, b) => a.startYear - b.startYear || a.id.localeCompare(b.id))
  const bucketYears = [...buckets.keys()].sort((a, b) => a - b)
  for (const b of bucketYears) {
    await writeFile(join(outDir, 'events', `${b}.json`), JSON.stringify(buckets.get(b)), 'utf8')
  }

  const manifest: Manifest = {
    minYear,
    maxYear,
    eventCount: events.length,
    buckets: bucketYears,
    maxSpanYears: maxSpan,
    generatedAt: new Date().toISOString(),
  }

  await writeFile(join(outDir, 'index.json'), JSON.stringify(index), 'utf8')
  await writeFile(join(outDir, 'search-index.json'), JSON.stringify(search), 'utf8')
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  await writeFile(join(outDir, 'taxonomy.json'), JSON.stringify(taxonomy, null, 2), 'utf8')
  await writeFile(join(outDir, 'eras.json'), JSON.stringify(eras, null, 2), 'utf8')

  console.log(`build:data wrote ${events.length} events, ${bucketYears.length} buckets → ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

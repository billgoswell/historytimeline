import type { Camera } from '../data/types.ts'
import { fromDisplayYearNumber, toDisplayYearNumber } from '../data/years.ts'
import { clampCamera, pxPerYearToZoom, zoomToPxPerYear } from '../camera/scale.ts'

export interface UrlState {
  camera: { y: number; z: number }
  regions: string[]
  subjects: string[]
  event?: string
  q?: string
  synthetic?: boolean
}

export interface ParsedUrl {
  centerYear?: number
  pxPerYear?: number
  regions: string[]
  subjects: string[]
  event?: string
  q?: string
  synthetic: boolean
}

function splitCsv(v: string | null): string[] {
  if (!v) return []
  return v
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function parseUrl(search: string): ParsedUrl {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const yRaw = q.get('y')
  const zRaw = q.get('z')
  let centerYear: number | undefined
  let pxPerYear: number | undefined
  if (yRaw != null && yRaw !== '') {
    const n = Number(yRaw)
    if (Number.isFinite(n)) centerYear = fromDisplayYearNumber(n)
  }
  if (zRaw != null && zRaw !== '') {
    const n = Number(zRaw)
    if (Number.isFinite(n)) pxPerYear = zoomToPxPerYear(n)
  }
  const event = q.get('event') || undefined
  const query = q.get('q') || undefined
  const synthetic = q.get('synthetic') === '1' || q.get('synthetic') === 'true'
  return {
    centerYear,
    pxPerYear,
    regions: splitCsv(q.get('regions')),
    subjects: splitCsv(q.get('subjects')),
    event: event || undefined,
    q: query || undefined,
    synthetic,
  }
}

export function serializeUrl(opts: {
  camera: Camera
  regions: string[]
  subjects: string[]
  event?: string | null
  q?: string
  synthetic?: boolean
}): string {
  const p = new URLSearchParams()
  const y = toDisplayYearNumber(opts.camera.centerYear)
  const z = pxPerYearToZoom(opts.camera.pxPerYear)
  p.set('y', String(Math.round(y * 1000) / 1000))
  p.set('z', String(Math.round(z * 1000) / 1000))
  if (opts.regions.length) p.set('regions', opts.regions.join(','))
  if (opts.subjects.length) p.set('subjects', opts.subjects.join(','))
  if (opts.event) p.set('event', opts.event)
  if (opts.q) p.set('q', opts.q)
  if (opts.synthetic) p.set('synthetic', '1')
  const s = p.toString()
  return s ? `?${s}` : '?'
}

export function roundTrip(search: string, minYear = -4000, maxYear = 2100): string {
  const parsed = parseUrl(search)
  const camera = clampCamera(
    {
      centerYear: parsed.centerYear ?? 1000,
      pxPerYear: parsed.pxPerYear ?? 0.2,
    },
    minYear,
    maxYear,
  )
  return serializeUrl({
    camera,
    regions: parsed.regions,
    subjects: parsed.subjects,
    event: parsed.event,
    q: parsed.q,
    synthetic: parsed.synthetic,
  })
}

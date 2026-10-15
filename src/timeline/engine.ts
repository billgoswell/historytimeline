import type { Camera, DensityBin, Era, EventMarker, ListResult, Viewport } from '../data/types.ts'
import { BAR_MIN_PX } from '../data/types.ts'
import { getEvent } from '../data/eventsRepo.ts'
import { eventPosition, formatEventDate } from '../data/years.ts'
import { panByPx, visibleYearRange, yearToY, zoomAt } from '../camera/scale.ts'
import type { WarpTable } from '../camera/warp.ts'
import { getState, setCamera, setViewport, subscribe } from '../store/appStore.ts'
import { GroupPool, svgEl } from './pool.ts'
import { packMarkers, truncateLabel, wrapTwoLines } from './pack.ts'
import { buildTicks } from './ticks.ts'

export interface EngineHandlers {
  onSelect: (id: string, el: SVGGElement) => void
  onClose: () => void
  onHover: (id: string | null) => void
}

export class TimelineEngine {
  readonly host: HTMLElement
  private svg: SVGSVGElement
  private minimap: SVGSVGElement
  private backdrop: HTMLElement
  private expanded: HTMLElement
  private expandedKicker: HTMLElement
  private expandedTitle: HTMLElement
  private expandedMeta: HTMLElement
  private expandedProse: HTMLElement
  private expandedSources: HTMLElement
  private expandedId: string | null = null
  private eraLayer: SVGGElement
  private barLayer: SVGGElement
  private spineLayer: SVGGElement
  private tickLayer: SVGGElement
  private markerLayer: SVGGElement
  private eraLabelLayer: SVGGElement
  private markerPool: GroupPool
  private barPool: GroupPool
  private eraPool: GroupPool
  private eraLabelPool: GroupPool
  private tickPool: GroupPool
  private spinePool: GroupPool
  private camera: Camera
  private viewport: Viewport
  private warp: WarpTable | null = null
  private items: EventMarker[] = []
  private bars: EventMarker[] = []
  private eras: Era[] = []
  private histogram: DensityBin[] = []
  private lanes: string[] = []
  private selectedId: string | null = null
  private raf = 0
  private dragging = false
  private lastY = 0
  private pointerId: number | null = null
  private pinching = false
  private pinchStartDist = 0
  private pinchPpy = 0
  private miniDrag: { grabYear: number } | null = null
  private unsub: (() => void) | null = null
  private ro: ResizeObserver

  private handlers: EngineHandlers

  constructor(host: HTMLElement, handlers: EngineHandlers) {
    this.handlers = handlers
    this.host = host
    this.viewport = { width: host.clientWidth || 800, height: host.clientHeight || 600 }
    this.camera = getState().camera

    this.svg = svgEl('svg')
    this.svg.setAttribute('class', 'timeline-svg')
    this.svg.setAttribute('role', 'img')
    this.svg.setAttribute('aria-hidden', 'true')
    this.eraLayer = svgEl('g')
    this.barLayer = svgEl('g')
    this.spineLayer = svgEl('g')
    this.tickLayer = svgEl('g')
    this.markerLayer = svgEl('g')
    this.eraLabelLayer = svgEl('g')
    this.svg.append(
      this.eraLayer,
      this.barLayer,
      this.spineLayer,
      this.tickLayer,
      this.markerLayer,
      this.eraLabelLayer,
    )

    this.minimap = svgEl('svg')
    this.minimap.setAttribute('class', 'minimap-svg')
    this.minimap.setAttribute('aria-label', 'Density minimap')

    this.backdrop = document.createElement('div')
    this.backdrop.className = 'marker-expanded-backdrop'
    this.backdrop.hidden = true
    this.backdrop.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      this.handlers.onClose()
    })

    this.expanded = document.createElement('article')
    this.expanded.className = 'marker-expanded'
    this.expanded.hidden = true
    this.expanded.setAttribute('role', 'dialog')
    this.expanded.setAttribute('aria-modal', 'true')
    this.expanded.setAttribute('aria-labelledby', 'expanded-title')
    this.expandedKicker = document.createElement('p')
    this.expandedKicker.className = 'kicker'
    this.expandedTitle = document.createElement('h2')
    this.expandedTitle.id = 'expanded-title'
    this.expandedMeta = document.createElement('p')
    this.expandedMeta.className = 'meta'
    this.expandedProse = document.createElement('div')
    this.expandedProse.className = 'prose'
    const sourcesHead = document.createElement('h3')
    sourcesHead.textContent = 'Sources'
    this.expandedSources = document.createElement('ul')
    this.expandedSources.className = 'expanded-sources'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'icon-close'
    close.setAttribute('aria-label', 'Close')
    close.textContent = '×'
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      this.handlers.onClose()
    })
    this.expanded.append(
      close,
      this.expandedKicker,
      this.expandedTitle,
      this.expandedMeta,
      this.expandedProse,
      sourcesHead,
      this.expandedSources,
    )
    this.expanded.addEventListener('pointerdown', (e) => e.stopPropagation())
    this.expanded.addEventListener('wheel', (e) => e.stopPropagation())

    host.append(this.svg, this.minimap, this.backdrop, this.expanded)
    host.style.touchAction = 'none'
    host.tabIndex = 0

    this.markerPool = new GroupPool(this.markerLayer, (g) => this.setupMarker(g))
    this.barPool = new GroupPool(this.barLayer, (g) => this.setupBar(g))
    this.eraPool = new GroupPool(this.eraLayer, (g) => this.setupEra(g))
    this.eraLabelPool = new GroupPool(this.eraLabelLayer, (g) => this.setupEraLabel(g))
    this.tickPool = new GroupPool(this.tickLayer, (g) => this.setupTick(g))
    this.spinePool = new GroupPool(this.spineLayer, (g) => {
      const line = svgEl('line')
      line.setAttribute('class', 'spine-line')
      g.appendChild(line)
    })

    this.bind()
    this.ro = new ResizeObserver(() => this.measure())
    this.ro.observe(host)
    const stop = subscribe(() => {
      const s = getState()
      this.camera = s.camera
      this.warp = s.warp
      this.items = s.visible.items
      this.bars = s.contextBars
      this.eras = s.eras
      this.histogram = s.histogram
      this.lanes = s.filters.regions.length >= 2 ? s.filters.regions : []
      this.selectedId = s.selectedId
      this.schedule()
    })
    const prev = this.unsub
    this.unsub = () => {
      prev?.()
      stop()
    }
    this.measure()
    this.schedule()
  }

  setItems(result: ListResult): void {
    this.items = result.items
    this.schedule()
  }

  setContextBars(bars: EventMarker[]): void {
    this.bars = bars
    this.schedule()
  }

  setEras(eras: Era[]): void {
    this.eras = eras
    this.schedule()
  }

  setHistogram(h: DensityBin[]): void {
    this.histogram = h
    this.schedule()
  }

  setLanes(lanes: string[]): void {
    this.lanes = lanes
    this.schedule()
  }

  setWarp(warp: WarpTable | null): void {
    this.warp = warp
    this.schedule()
  }

  setSelected(id: string | null): void {
    this.selectedId = id
    this.schedule()
  }

  focusMarker(id: string): void {
    const g = this.markerPool.get(id)
    g?.focus()
  }

  markerEl(id: string): SVGGElement | undefined {
    return this.markerPool.get(id)
  }

  destroy(): void {
    this.unsub?.()
    this.ro.disconnect()
    this.host.replaceChildren()
    if (this.raf) cancelAnimationFrame(this.raf)
  }

  private measure(): void {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    if (!w || !h) return
    this.viewport = { width: w, height: h }
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    this.svg.setAttribute('width', String(w))
    this.svg.setAttribute('height', String(h))
    setViewport(this.viewport)
    this.schedule()
  }

  private bind(): void {
    const h = this.host
    h.addEventListener('wheel', this.onWheel, { passive: false })
    h.addEventListener('pointerdown', this.onPointerDown)
    h.addEventListener('pointermove', this.onPointerMove)
    h.addEventListener('pointerup', this.onPointerUp)
    h.addEventListener('pointercancel', this.onPointerUp)
    h.addEventListener('keydown', this.onKey)
    h.addEventListener('touchstart', this.onTouchStart, { passive: false })
    h.addEventListener('touchmove', this.onTouchMove, { passive: false })
    h.addEventListener('touchend', this.onTouchEnd)
    this.minimap.addEventListener('pointerdown', this.onMiniDown)
    this.minimap.addEventListener('pointermove', this.onMiniMove)
    this.minimap.addEventListener('pointerup', this.onMiniUp)
    this.unsub = () => {
      h.removeEventListener('wheel', this.onWheel)
      h.removeEventListener('pointerdown', this.onPointerDown)
      h.removeEventListener('pointermove', this.onPointerMove)
      h.removeEventListener('pointerup', this.onPointerUp)
      h.removeEventListener('pointercancel', this.onPointerUp)
      h.removeEventListener('keydown', this.onKey)
      h.removeEventListener('touchstart', this.onTouchStart)
      h.removeEventListener('touchmove', this.onTouchMove)
      h.removeEventListener('touchend', this.onTouchEnd)
    }
  }

  private localY(e: { clientY: number }): number {
    const r = this.host.getBoundingClientRect()
    return e.clientY - r.top
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const y = this.localY(e)
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.01)
      setCamera(zoomAt(this.camera, this.viewport, y, factor, this.warp))
    } else {
      setCamera(panByPx(this.camera, e.deltaY, this.warp))
    }
    this.camera = getState().camera
    this.schedule()
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    if ((e.target as Element).closest('.minimap-svg, .marker-expanded, .marker-expanded-backdrop, .timeline-marker')) return
    this.dragging = true
    this.lastY = e.clientY
    this.pointerId = e.pointerId
    this.host.setPointerCapture(e.pointerId)
    this.host.classList.add('is-panning')
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.pointerId) return
    const dy = e.clientY - this.lastY
    this.lastY = e.clientY
    setCamera(panByPx(this.camera, dy, this.warp))
    this.camera = getState().camera
    this.schedule()
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return
    this.dragging = false
    this.pointerId = null
    this.host.classList.remove('is-panning')
  }

  private touchPair(e: TouchEvent): { dist: number; y: number } | null {
    if (e.touches.length < 2) return null
    const a = e.touches[0]
    const b = e.touches[1]
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    const r = this.host.getBoundingClientRect()
    const y = (a.clientY + b.clientY) / 2 - r.top
    return { dist, y }
  }

  private onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const p = this.touchPair(e)
      if (!p) return
      this.pinching = true
      this.pinchStartDist = p.dist
      this.pinchPpy = this.camera.pxPerYear
      this.dragging = false
    }
  }

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.pinching || e.touches.length < 2) return
    e.preventDefault()
    const p = this.touchPair(e)
    if (!p || this.pinchStartDist < 1) return
    const factor = p.dist / this.pinchStartDist
    const cam: Camera = { centerYear: this.camera.centerYear, pxPerYear: this.pinchPpy }
    setCamera(zoomAt(cam, this.viewport, p.y, factor, this.warp))
    this.camera = getState().camera
    this.schedule()
  }

  private onTouchEnd = (e: TouchEvent): void => {
    if (e.touches.length < 2) this.pinching = false
  }

  private onKey = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    const page = this.viewport.height * 0.85
    if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      setCamera(zoomAt(this.camera, this.viewport, this.viewport.height / 2, 1.18, this.warp))
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      setCamera(zoomAt(this.camera, this.viewport, this.viewport.height / 2, 1 / 1.18, this.warp))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCamera(panByPx(this.camera, -40, this.warp))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCamera(panByPx(this.camera, 40, this.warp))
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      setCamera(panByPx(this.camera, -page, this.warp))
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      setCamera(panByPx(this.camera, page, this.warp))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setCamera({ ...this.camera, centerYear: getState().maxYear })
    } else if (e.key === 'End') {
      e.preventDefault()
      setCamera({ ...this.camera, centerYear: getState().minYear })
    }
    this.camera = getState().camera
    this.schedule()
  }

  private onMiniDown = (e: PointerEvent): void => {
    e.stopPropagation()
    this.minimap.setPointerCapture(e.pointerId)
    const year = this.miniYear(e)
    this.miniDrag = { grabYear: year }
    setCamera({ ...this.camera, centerYear: year })
    this.camera = getState().camera
    this.schedule()
  }

  private onMiniMove = (e: PointerEvent): void => {
    if (!this.miniDrag) return
    const year = this.miniYear(e)
    setCamera({ ...this.camera, centerYear: year })
    this.camera = getState().camera
    this.schedule()
  }

  private onMiniUp = (): void => {
    this.miniDrag = null
  }

  private miniYear(e: PointerEvent): number {
    const r = this.minimap.getBoundingClientRect()
    const y = e.clientY - r.top
    const s = getState()
    const t = Math.min(1, Math.max(0, y / Math.max(1, r.height)))
    return s.maxYear - t * (s.maxYear - s.minYear)
  }

  private schedule(): void {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.camera = getState().camera
      this.paint()
    })
  }

  private layout() {
    const w = this.viewport.width
    const mobile = w < 720
    const left = mobile ? 64 : 88
    const right = w - 52
    const usable = Math.max(120, right - left)
    const laneSlugs = this.lanes.length >= 2 ? this.lanes : []
    const n = Math.max(1, laneSlugs.length)
    const laneW = usable / n
    const spines: { slug: string | null; x: number; labelLeft: number; labelRight: number }[] = []
    if (n === 1) {
      const x = mobile ? left + 18 : left + usable * 0.5
      spines.push({ slug: null, x, labelLeft: left + 4, labelRight: right - 4 })
    } else {
      laneSlugs.forEach((slug, i) => {
        const laneLeft = left + laneW * i
        const x = laneLeft + laneW * 0.5
        spines.push({
          slug,
          x,
          labelLeft: laneLeft + 4,
          labelRight: laneLeft + laneW - 8,
        })
      })
    }
    return { left, right, mobile, spines, laneW }
  }

  private paint(): void {
    const { camera, viewport, warp } = this
    const L = this.layout()
    const ticks = buildTicks(camera, viewport, warp, getState().maxYear)
    this.tickPool.sync(
      ticks.map((_tick, i) => `t${i}`),
      (g, id) => {
        const i = Number(id.slice(1))
        const t = ticks[i]
        const line = g.firstChild as SVGLineElement
        const text = g.lastChild as SVGTextElement
        line.setAttribute('x1', String(L.left - (t.major ? 10 : 5)))
        line.setAttribute('x2', String(this.viewport.width - 52))
        line.setAttribute('y1', String(t.y))
        line.setAttribute('y2', String(t.y))
        line.setAttribute('class', t.major ? 'tick-line major' : 'tick-line')
        text.setAttribute('x', String(L.left - 14))
        text.setAttribute('y', String(t.y + 4))
        text.textContent = t.label
        text.setAttribute('class', 'tick-label')
      },
    )

    const visibleEras = this.visibleEras()
    this.eraPool.sync(
      visibleEras.map((e) => e.id),
      (g, id) => {
        const era = visibleEras.find((e) => e.id === id)!
        const y1 = yearToY(era.endYear, camera, viewport, warp)
        const y2 = yearToY(era.startYear, camera, viewport, warp)
        const rect = g.firstChild as SVGRectElement
        rect.setAttribute('x', String(L.left))
        rect.setAttribute('width', String(this.viewport.width - 52 - L.left))
        rect.setAttribute('y', String(Math.min(y1, y2)))
        rect.setAttribute('height', String(Math.max(2, Math.abs(y2 - y1))))
      },
    )
    this.eraLabelPool.sync(
      visibleEras.map((e) => `el-${e.id}`),
      (g, id) => {
        const era = visibleEras.find((e) => `el-${e.id}` === id)!
        const y1 = yearToY(era.endYear, camera, viewport, warp)
        const y2 = yearToY(era.startYear, camera, viewport, warp)
        const label = g.firstChild as SVGTextElement
        label.setAttribute('text-anchor', 'end')
        label.setAttribute('x', String(this.viewport.width - 58))
        label.setAttribute('y', String(Math.min(y1, y2) + 14))
        label.textContent = era.label
      },
    )

    this.spinePool.sync(
      L.spines.map((s, i) => s.slug ?? `spine-${i}`),
      (g, id, isNew) => {
        const spine = L.spines.find((s, i) => (s.slug ?? `spine-${i}`) === id) ?? L.spines[0]
        const line = g.firstChild as SVGLineElement
        line.setAttribute('x1', String(spine.x))
        line.setAttribute('x2', String(spine.x))
        line.setAttribute('y1', '0')
        line.setAttribute('y2', String(viewport.height))
        if (isNew && spine.slug) {
          let lab = g.querySelector('text')
          if (!lab) {
            lab = svgEl('text')
            lab.setAttribute('class', 'lane-label')
            g.appendChild(lab)
          }
          lab.setAttribute('x', String(spine.x))
          lab.setAttribute('y', '16')
          lab.textContent = labelFor(spine.slug)
        } else if (spine.slug) {
          const lab = g.querySelector('text')
          if (lab) {
            lab.setAttribute('x', String(spine.x))
            lab.textContent = labelFor(spine.slug)
          }
        }
      },
    )

    this.barPool.sync(
      this.bars.map((b) => `bar-${b.id}`),
      (g, id) => {
        const ev = this.bars.find((b) => `bar-${b.id}` === id)!
        const spine = this.spineFor(ev, L.spines)
        const y1 = yearToY(ev.endYear ?? ev.startYear, camera, viewport, warp)
        const y2 = yearToY(eventPosition(ev.startYear, ev.startMonth, ev.startDay), camera, viewport, warp)
        const h = Math.abs(y2 - y1)
        const rect = g.firstChild as SVGRectElement
        rect.setAttribute('x', String(spine.x - 3))
        rect.setAttribute('width', '6')
        rect.setAttribute('y', String(Math.min(y1, y2)))
        rect.setAttribute('height', String(Math.max(h, BAR_MIN_PX)))
        rect.setAttribute('rx', '2')
      },
    )

    const bySpine = new Map<string, EventMarker[]>()
    for (const ev of this.items) {
      const spine = this.spineFor(ev, L.spines)
      const key = spine.slug ?? 'main'
      const list = bySpine.get(key) ?? []
      list.push(ev)
      bySpine.set(key, list)
    }

    const packedById = new Map<string, ReturnType<typeof packMarkers>['placed'][number]>()
    for (const spine of L.spines) {
      const key = spine.slug ?? 'main'
      const group = bySpine.get(key) ?? []
      const packItems = group
        .map((ev) => ({
          id: ev.id,
          y: yearToY(eventPosition(ev.startYear, ev.startMonth, ev.startDay), camera, viewport, warp),
          salience: ev.salience,
        }))
        .filter((p) => p.y > -viewport.height && p.y < viewport.height * 2)
      const packed = packMarkers(packItems, {
        spineX: spine.x,
        labelLeft: spine.labelLeft,
        labelRight: spine.labelRight,
        mobile: L.mobile,
      })
      for (const p of packed.placed) packedById.set(p.id, p)
    }

    this.markerPool.sync([...packedById.keys()], (g, id) => {
      const ev = this.items.find((m) => m.id === id)!
      const p = packedById.get(id)!
      const y = p.y
      const boxDy = p.boxY - p.y
      g.dataset.eventId = id
      g.setAttribute('transform', `translate(0 ${y})`)
      g.setAttribute('aria-label', `${ev.title}, ${formatEventDate(ev)}. ${ev.summary}`)
      g.classList.toggle('is-selected', this.selectedId === id)
      g.classList.toggle('is-expanded', this.selectedId === id)
      const bg = g.querySelector('.marker-bg') as SVGRectElement
      const dot = g.querySelector('.marker-dot') as SVGCircleElement
      const stem = g.querySelector('.marker-stem') as SVGLineElement
      const dateEl = g.querySelector('.marker-date') as SVGTextElement
      const label = g.querySelector('.marker-label') as SVGTextElement
      const blurb = g.querySelector('.marker-blurb') as SVGTextElement
      const blurb2 = g.querySelector('.marker-blurb-2') as SVGTextElement
      const range = g.querySelector('.marker-range') as SVGLineElement
      const end = ev.endYear
      const hasRange = end != null && Math.abs(yearToY(end, camera, viewport, warp) - y) >= BAR_MIN_PX
      if (hasRange && end != null) {
        range.style.display = ''
        range.setAttribute('x1', String(p.xDot))
        range.setAttribute('x2', String(p.xDot))
        range.setAttribute('y1', '0')
        range.setAttribute('y2', String(yearToY(end, camera, viewport, warp) - y))
        dot.setAttribute('r', '3.5')
      } else {
        range.style.display = 'none'
        dot.setAttribute('r', '4.5')
      }
      const when = truncateLabel(formatEventDate(ev), p.colWidth - 16)
      const text = truncateLabel(ev.title, p.colWidth - 16)
      const [desc1, desc2] = wrapTwoLines(ev.summary, p.colWidth - 16)
      dateEl.textContent = when
      dateEl.setAttribute('x', String(p.xLabel))
      dateEl.setAttribute('y', String(-16 + boxDy))
      dateEl.setAttribute('text-anchor', p.anchor)
      label.textContent = text
      label.setAttribute('x', String(p.xLabel))
      label.setAttribute('y', String(2 + boxDy))
      label.setAttribute('text-anchor', p.anchor)
      blurb.textContent = desc1
      blurb.setAttribute('x', String(p.xLabel))
      blurb.setAttribute('y', String(18 + boxDy))
      blurb.setAttribute('text-anchor', p.anchor)
      if (blurb2) {
        blurb2.textContent = desc2
        blurb2.setAttribute('x', String(p.xLabel))
        blurb2.setAttribute('y', String(32 + boxDy))
        blurb2.setAttribute('text-anchor', p.anchor)
      }
      const boxW = p.colWidth - 8
      const leftLabel = p.anchor === 'end'
      bg.setAttribute('x', String(leftLabel ? p.xLabel - boxW + 8 : p.xLabel - 8))
      bg.setAttribute('y', String(-30 + boxDy))
      bg.setAttribute('width', String(boxW))
      bg.setAttribute('height', '68')
      bg.setAttribute('rx', '6')
      dot.setAttribute('cx', String(p.xDot))
      const x0 = leftLabel ? p.xDot - 5 : p.xDot + 5
      const x1 = p.gutterX
      const x2 = leftLabel ? p.xLabel + 2 : p.xLabel - 2
      if (Math.abs(boxDy) < 1) {
        stem.setAttribute('d', `M ${x0} 0 H ${x2}`)
      } else {
        stem.setAttribute('d', `M ${x0} 0 H ${x1} V ${boxDy} H ${x2}`)
      }
    })

    this.paintMinimap()
    this.syncExpanded(packedById)
  }

  private syncExpanded(_packedById: Map<string, ReturnType<typeof packMarkers>['placed'][number]>): void {
    const id = this.selectedId
    const ev = id ? this.items.find((e) => e.id === id) : undefined
    if (!id || !ev) {
      this.expanded.hidden = true
      this.backdrop.hidden = true
      this.expandedId = null
      return
    }
    const tax = getState().taxonomy
    this.expandedKicker.textContent = formatEventDate(ev)
    this.expandedTitle.textContent = ev.title
    const regions = ev.regions.map((s) => tax?.regions.find((r) => r.slug === s)?.label ?? s).join(' · ')
    const subjects = ev.subjects.map((s) => tax?.subjects.find((r) => r.slug === s)?.label ?? s).join(' · ')
    const syn = ev.synthetic ? 'Synthetic filler — not a historical source' : ''
    this.expandedMeta.textContent = [subjects, regions, syn].filter(Boolean).join(' · ')
    if (this.expandedId !== id) {
      this.expandedProse.replaceChildren()
      const intro = document.createElement('p')
      intro.textContent = ev.summary
      this.expandedProse.append(intro)
      this.expandedSources.replaceChildren()
      const sid = id
      void getEvent(id, { includeSynthetic: getState().synthetic }).then((full) => {
        if (this.expandedId !== sid) return
        this.expandedProse.replaceChildren()
        for (const part of full.body.split('\n')) {
          if (!part.trim()) continue
          const p = document.createElement('p')
          p.textContent = part
          this.expandedProse.append(p)
        }
        this.expandedSources.replaceChildren()
        for (const src of full.sources) {
          const li = document.createElement('li')
          li.textContent = src.name
          this.expandedSources.append(li)
        }
      })
    }
    this.expandedId = id
    this.expanded.hidden = false
    this.backdrop.hidden = false
  }

  private paintMinimap(): void {
    const s = getState()
    const h = this.viewport.height
    const w = 44
    this.minimap.setAttribute('viewBox', `0 0 ${w} ${h}`)
    this.minimap.setAttribute('width', String(w))
    this.minimap.setAttribute('height', String(h))
    const span = Math.max(1, s.maxYear - s.minYear)
    const maxC = Math.max(1, ...this.histogram.map((b) => b.count))
    let html = ''
    for (const b of this.histogram) {
      const y = ((s.maxYear - (b.year + 50)) / span) * h
      const bh = Math.max(1, (100 / span) * h)
      const bw = 4 + (b.count / maxC) * (w - 12)
      html += `<rect class="mini-bar" x="${w - bw - 4}" y="${y}" width="${bw}" height="${bh}" />`
    }
    const vis = visibleYearRange(this.camera, this.viewport, 0, this.warp)
    const y1 = ((s.maxYear - vis.toYear) / span) * h
    const y2 = ((s.maxYear - vis.fromYear) / span) * h
    html += `<rect class="mini-window" x="1" y="${Math.min(y1, y2)}" width="${w - 2}" height="${Math.max(8, Math.abs(y2 - y1))}" />`
    this.minimap.innerHTML = html
  }

  private visibleEras(): Era[] {
    const s = getState()
    const { fromYear, toYear } = visibleYearRange(this.camera, this.viewport, 40, this.warp)
    const regions = s.filters.regions
    const candidates = this.eras.filter((e) => {
      if (e.endYear < fromYear || e.startYear > toYear) return false
      if (!regions.length) return e.regions.includes('world') || e.regions.length <= 2
      return e.regions.some((r) => regions.includes(r))
    })
    const scored = candidates
      .map((e) => {
        const y1 = yearToY(e.endYear, this.camera, this.viewport, this.warp)
        const y2 = yearToY(e.startYear, this.camera, this.viewport, this.warp)
        return {
          e,
          overlap: Math.min(e.endYear, toYear) - Math.max(e.startYear, fromYear),
          span: e.endYear - e.startYear,
          y: Math.min(y1, y2),
          h: Math.abs(y2 - y1),
        }
      })
      .filter((x) => x.overlap > 0 && x.h >= 18)
    scored.sort((a, b) => b.overlap - a.overlap || b.span - a.span || a.e.id.localeCompare(b.e.id))
    const picked: typeof scored = []
    for (const item of scored) {
      if (picked.length >= 4) break
      if (picked.some((p) => Math.abs(p.y - item.y) < 18)) continue
      picked.push(item)
    }
    return picked.map((p) => p.e)
  }

  private spineFor(
    ev: EventMarker,
    spines: { slug: string | null; x: number; labelLeft: number; labelRight: number }[],
  ): { slug: string | null; x: number; labelLeft: number; labelRight: number } {
    if (spines.length === 1) return spines[0]
    const slug = ev.lane ?? spines.find((s) => s.slug && ev.regions.includes(s.slug))?.slug
    return spines.find((s) => s.slug === slug) ?? spines[0]
  }

  private setupMarker(g: SVGGElement): void {
    g.setAttribute('class', 'timeline-marker')
    g.setAttribute('data-testid', 'timeline-marker')
    g.setAttribute('tabindex', '0')
    g.setAttribute('role', 'button')
    const range = svgEl('line')
    range.setAttribute('class', 'marker-range')
    const stem = svgEl('path')
    stem.setAttribute('class', 'marker-stem')
    const dot = svgEl('circle')
    dot.setAttribute('class', 'marker-dot')
    dot.setAttribute('cy', '0')
    const bg = svgEl('rect')
    bg.setAttribute('class', 'marker-bg')
    const dateEl = svgEl('text')
    dateEl.setAttribute('class', 'marker-date')
    const label = svgEl('text')
    label.setAttribute('class', 'marker-label')
    const blurb = svgEl('text')
    blurb.setAttribute('class', 'marker-blurb')
    const blurb2 = svgEl('text')
    blurb2.setAttribute('class', 'marker-blurb marker-blurb-2')
    g.append(range, stem, dot, bg, dateEl, label, blurb, blurb2)
    g.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = g.dataset.eventId
      if (id) this.handlers.onSelect(id, g)
    })
    g.addEventListener('pointerdown', (e) => e.stopPropagation())
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const id = g.dataset.eventId
        if (id) this.handlers.onSelect(id, g)
      }
    })
    g.addEventListener('focus', () => {
      const id = g.dataset.eventId
      if (id) this.handlers.onHover(id)
    })
    g.addEventListener('mouseenter', () => {
      const id = g.dataset.eventId
      if (id) this.handlers.onHover(id)
    })
    g.addEventListener('mouseleave', () => this.handlers.onHover(null))
  }

  private setupBar(g: SVGGElement): void {
    const rect = svgEl('rect')
    rect.setAttribute('class', 'context-bar')
    g.appendChild(rect)
  }

  private setupEra(g: SVGGElement): void {
    const rect = svgEl('rect')
    rect.setAttribute('class', 'era-band')
    g.appendChild(rect)
  }

  private setupEraLabel(g: SVGGElement): void {
    const label = svgEl('text')
    label.setAttribute('class', 'era-label')
    g.appendChild(label)
  }

  private setupTick(g: SVGGElement): void {
    const line = svgEl('line')
    const text = svgEl('text')
    text.setAttribute('text-anchor', 'end')
    g.append(line, text)
  }
}

function labelFor(slug: string): string {
  const tax = getState().taxonomy
  return tax?.regions.find((r) => r.slug === slug)?.label ?? slug
}

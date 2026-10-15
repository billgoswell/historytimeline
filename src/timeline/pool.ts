const SVG = 'http://www.w3.org/2000/svg'

export function svgEl<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG, name)
}

export class GroupPool {
  private unused: SVGGElement[] = []
  private live = new Map<string, SVGGElement>()
  private parent: SVGElement
  private setup: (g: SVGGElement) => void

  constructor(parent: SVGElement, setup: (g: SVGGElement) => void) {
    this.parent = parent
    this.setup = setup
  }

  sync(ids: string[], update: (g: SVGGElement, id: string, isNew: boolean) => void): void {
    const keep = new Set(ids)
    for (const [id, g] of this.live) {
      if (!keep.has(id)) {
        this.live.delete(id)
        g.style.display = 'none'
        this.unused.push(g)
      }
    }
    for (const id of ids) {
      let g = this.live.get(id)
      let isNew = false
      if (!g) {
        g = this.unused.pop()
        if (!g) {
          g = svgEl('g')
          this.setup(g)
          this.parent.appendChild(g)
        }
        g.style.display = ''
        this.live.set(id, g)
        isNew = true
      }
      update(g, id, isNew)
    }
  }

  get(id: string): SVGGElement | undefined {
    return this.live.get(id)
  }

  clear(): void {
    for (const g of this.live.values()) {
      g.style.display = 'none'
      this.unused.push(g)
    }
    this.live.clear()
  }
}

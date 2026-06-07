// Browser-side SVG helpers used by the preview and the (Phase 1) fill control.

export interface SvgSize {
  width: number | null
  height: number | null
  viewBox: [number, number, number, number] | null
}

function parseLength(v: string | null): number | null {
  if (!v) return null
  const m = /^\s*([0-9]*\.?[0-9]+)/.exec(v)
  return m ? parseFloat(m[1]) : null
}

export function parseSvg(svgText: string): {
  doc: Document
  svg: SVGSVGElement | null
} {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const svg = doc.querySelector('svg') as SVGSVGElement | null
  return { doc, svg }
}

export function svgSize(svgText: string): SvgSize {
  const { svg } = parseSvg(svgText)
  if (!svg) return { width: null, height: null, viewBox: null }
  const width = parseLength(svg.getAttribute('width'))
  const height = parseLength(svg.getAttribute('height'))
  const vbRaw = svg.getAttribute('viewBox')
  let viewBox: [number, number, number, number] | null = null
  if (vbRaw) {
    const p = vbRaw.trim().split(/[\s,]+/).map(Number)
    if (p.length === 4 && p.every((n) => !Number.isNaN(n))) {
      viewBox = [p[0], p[1], p[2], p[3]]
    }
  }
  return { width, height, viewBox }
}

export function nominalSize(svgText: string): { width: number; height: number } | null {
  const s = svgSize(svgText)
  if (s.width && s.height) return { width: s.width, height: s.height }
  if (s.viewBox) return { width: s.viewBox[2], height: s.viewBox[3] }
  return null
}

// Recolor elements matching the template's fillTarget selector. Returns the new
// SVG markup, or the original if nothing matched.
export function applyFill(svgText: string, selector: string, color: string): string {
  const { doc, svg } = parseSvg(svgText)
  if (!svg) return svgText
  let matched = false
  try {
    svg.querySelectorAll(selector).forEach((el) => {
      el.setAttribute('fill', color)
      matched = true
    })
  } catch {
    return svgText
  }
  if (!matched) return svgText
  return new XMLSerializer().serializeToString(doc)
}

// Read the current fill color of the first element matching the selector.
export function currentFill(svgText: string, selector: string): string | null {
  const { svg } = parseSvg(svgText)
  if (!svg) return null
  try {
    const el = svg.querySelector(selector)
    return el ? el.getAttribute('fill') : null
  } catch {
    return null
  }
}

export function svgToDataUrl(svgText: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
}

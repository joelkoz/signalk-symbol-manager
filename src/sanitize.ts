// Server-side SVG sanitization.
//
// Uploaded or edited SVG is untrusted. We sanitize with a strict allowlist over
// a pure-JS DOM (@xmldom/xmldom). This avoids jsdom, which leaks memory at the
// native/realm level and is a heavy dependency for a Raspberry-Pi plugin.
//
// The pass:
//   - rejects oversized input and internal entity definitions (XXE / billion
//     laughs guard) before parsing
//   - keeps only allowlisted SVG elements (this alone removes <script>,
//     <foreignObject>, <a>, <iframe>, and any unknown element)
//   - removes event-handler attributes (on*), unsafe URL references
//     (href/src/xlink:href that are not local fragments, data:image, or
//     relative), external url(...) references, and javascript:/expression()
//   - sanitizes <style> CSS text
//   - extracts nominal dimensions and re-serializes a standalone <svg>

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { ValidationError } from './symbolKey'

const SVG_NS = 'http://www.w3.org/2000/svg'

// Allowlisted SVG element names (compared case-insensitively). Anything not
// listed is dropped along with its subtree.
const ALLOWED_ELEMENTS = new Set(
  [
    'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'metadata',
    'switch', 'view',
    'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'textPath', 'tref',
    'image',
    'marker', 'pattern', 'clipPath', 'mask',
    'linearGradient', 'radialGradient', 'stop',
    'style',
    'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
    'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight',
    'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
    'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology',
    'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
    'feTurbulence'
  ].map((n) => n.toLowerCase())
)

// Attributes that may carry a URL we want to vet.
const URL_ATTRS = new Set(['href', 'xlink:href', 'src'])
const SAFE_URL_RE = /^(#|data:image\/|\/|\.\/|\.\.\/)/i

// xmldom node type constants (DOM Level 1).
const ELEMENT_NODE = 1

export interface SanitizeResult {
  svg: string
  width: number | null
  height: number | null
  viewBox: [number, number, number, number] | null
  warnings: string[]
}

export interface SanitizeOptions {
  maxBytes: number
}

function parseLength(value: string | null): number | null {
  if (!value) return null
  const m = /^\s*([0-9]*\.?[0-9]+)/.exec(value)
  return m ? parseFloat(m[1]) : null
}

function parseViewBox(
  value: string | null
): [number, number, number, number] | null {
  if (!value) return null
  const parts = value.trim().split(/[\s,]+/).map((p) => parseFloat(p))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null
  return [parts[0], parts[1], parts[2], parts[3]]
}

// Replace external url(...) references with `none`, keeping local fragment refs.
function stripExternalUrlRefs(value: string): string {
  return value.replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (whole, _q, ref) => {
    return String(ref).trim().startsWith('#') ? whole : 'none'
  })
}

function sanitizeCss(css: string): string {
  let out = css.replace(/@import[^;]*;?/gi, '')
  out = stripExternalUrlRefs(out)
  out = out.replace(/expression\s*\(/gi, '/* blocked */(')
  out = out.replace(/javascript:/gi, '')
  return out
}

interface XmlNode {
  nodeType: number
  nodeName: string
  parentNode: XmlNode | null
  childNodes: { length: number; item(i: number): XmlNode | null }
  attributes?: {
    length: number
    item(i: number): { name: string; value: string } | null
  }
  textContent?: string
  removeChild(child: XmlNode): unknown
  removeAttribute(name: string): void
  setAttribute(name: string, value: string): void
  getAttribute(name: string): string | null
}

// Walk the tree depth-first, removing disallowed elements and scrubbing
// attributes. Returns true if any external reference was stripped.
function scrub(node: XmlNode, warnings: Set<string>): void {
  // Snapshot children first; we mutate the list as we go.
  const children: XmlNode[] = []
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes.item(i)
    if (c) children.push(c)
  }

  for (const child of children) {
    if (child.nodeType !== ELEMENT_NODE) continue
    const local = child.nodeName.toLowerCase().replace(/^.*:/, '')
    if (!ALLOWED_ELEMENTS.has(local)) {
      warnings.add(`removed <${child.nodeName}> element(s)`)
      node.removeChild(child)
      continue
    }

    // <style>: sanitize its CSS text rather than dropping it.
    if (local === 'style' && typeof child.textContent === 'string') {
      const cleaned = sanitizeCss(child.textContent)
      if (cleaned !== child.textContent) {
        warnings.add('sanitized <style> CSS')
        child.textContent = cleaned
      }
    }

    scrubAttributes(child, warnings)
    scrub(child, warnings)
  }
}

function scrubAttributes(el: XmlNode, warnings: Set<string>): void {
  const attrs = el.attributes
  if (!attrs) return
  const toRemove: string[] = []
  const toSet: Array<[string, string]> = []
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs.item(i)
    if (!a) continue
    const name = a.name
    const lower = name.toLowerCase()
    const value = a.value

    if (lower.startsWith('on')) {
      toRemove.push(name)
      warnings.add('removed inline event handler attribute(s)')
      continue
    }
    if (URL_ATTRS.has(lower)) {
      if (!SAFE_URL_RE.test(value.trim())) {
        toRemove.push(name)
        warnings.add('removed external network reference(s)')
        continue
      }
    }
    if (/javascript:/i.test(value)) {
      toRemove.push(name)
      warnings.add('removed javascript: reference(s)')
      continue
    }
    if (value.includes('url(')) {
      const next = stripExternalUrlRefs(value)
      if (next !== value) {
        toSet.push([name, next])
        warnings.add('removed external network reference(s)')
      }
    }
  }
  for (const n of toRemove) el.removeAttribute(n)
  for (const [n, v] of toSet) el.setAttribute(n, v)
}

export function sanitizeSvg(
  input: string,
  opts: SanitizeOptions
): SanitizeResult {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new ValidationError('svg content is required')
  }
  const byteLength = Buffer.byteLength(input, 'utf8')
  if (byteLength > opts.maxBytes) {
    throw new ValidationError(
      `svg exceeds size limit (${byteLength} > ${opts.maxBytes} bytes)`,
      413
    )
  }
  // Reject internal entity definitions outright (billion-laughs / XXE guard).
  if (/<!ENTITY/i.test(input)) {
    throw new ValidationError('SVG entity definitions are not allowed')
  }

  const warnings = new Set<string>()

  let doc
  try {
    doc = new DOMParser({
      onError: (level: string, msg: string) => {
        if (level === 'fatalError') {
          throw new ValidationError(`invalid SVG: ${msg}`)
        }
      }
    } as unknown as ConstructorParameters<typeof DOMParser>[0]).parseFromString(
      input,
      'image/svg+xml'
    )
  } catch (e) {
    if (e instanceof ValidationError) throw e
    throw new ValidationError(`invalid SVG: ${(e as Error).message}`)
  }

  const root = (doc as unknown as { documentElement: XmlNode | null })
    .documentElement
  if (!root || root.nodeName.toLowerCase().replace(/^.*:/, '') !== 'svg') {
    throw new ValidationError('input did not contain a valid <svg> root')
  }

  // Scrub the root's own attributes, then walk the subtree.
  scrubAttributes(root, warnings)
  scrub(root, warnings)

  // Ensure the SVG namespace is present so the asset renders standalone.
  if (!root.getAttribute('xmlns')) {
    root.setAttribute('xmlns', SVG_NS)
  }

  const width = parseLength(root.getAttribute('width'))
  const height = parseLength(root.getAttribute('height'))
  const viewBox = parseViewBox(root.getAttribute('viewBox'))

  const serializer = new XMLSerializer()
  const serialized = serializer.serializeToString(
    root as unknown as Parameters<typeof serializer.serializeToString>[0]
  )
  const out = `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}\n`

  return {
    svg: out,
    width,
    height,
    viewBox,
    warnings: Array.from(warnings)
  }
}

// Nominal pixel dimensions, preferring explicit width/height and falling back
// to the viewBox extent.
export function nominalSize(result: {
  width: number | null
  height: number | null
  viewBox: [number, number, number, number] | null
}): { width: number; height: number } | null {
  if (result.width && result.height) {
    return { width: result.width, height: result.height }
  }
  if (result.viewBox) {
    return { width: result.viewBox[2], height: result.viewBox[3] }
  }
  return null
}

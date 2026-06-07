// Business logic for the symbol library: validates input, enforces map-marker
// metadata rules, sanitizes SVG, persists through the store, and renders the
// public `SymbolResource` shape (with `$source` / `timestamp`) for the
// resources API.

import {
  Anchor,
  DEFAULT_NAMESPACE,
  MAP_MARKER_ROLES,
  PROVIDER_ID,
  SymbolDefinition,
  SymbolInput,
  SymbolRecord,
  SymbolResource,
  SymbolRole
} from './types'
import {
  ValidationError,
  canonicalKey,
  parseReference,
  validateLocalId,
  validateNamespace
} from './symbolKey'
import { SymbolStore } from './store'
import { sanitizeSvg, nominalSize } from './sanitize'

// Public asset path. Served on the main app OUTSIDE `/plugins`, because the
// Signal K server gates every `/plugins/*` route behind admin auth (ignoring
// `allow_readonly`). Keeping assets here lets read-only consumers load symbol
// SVGs, mirroring how chart-tile plugins serve public assets under `/signalk`.
export const ASSET_BASE = `/signalk/symbol-manager/symbols`

export interface ServiceOptions {
  defaultNamespace: string
  maxSvgBytes: number
}

function asStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ValidationError(`${field} must be an array of strings`)
  }
  // De-duplicate while preserving entry order (tags) / first-seen order (roles).
  return Array.from(new Set(value as string[]))
}

function isMapMarker(roles: SymbolRole[]): boolean {
  return roles.some((r) => (MAP_MARKER_ROLES as readonly string[]).includes(r))
}

function validateScale(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'string' ? parseFloat(value) : (value as number)
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    throw new ValidationError('scale must be a positive number')
  }
  return n
}

function validateAnchor(value: unknown): Anchor | null {
  if (value === undefined || value === null) return null
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((n) => typeof n !== 'number' || !Number.isFinite(n))
  ) {
    throw new ValidationError('anchor must be a [x, y] pair of finite numbers')
  }
  return [value[0], value[1]]
}

export class SymbolService {
  constructor(
    private readonly store: SymbolStore,
    private readonly opts: ServiceOptions
  ) {}

  // --- shaping ------------------------------------------------------------

  // The asset URL uses the short unqualified id when that id is unique across
  // the whole library; otherwise it falls back to the canonical `ns:id` form
  // so the route can always resolve it unambiguously.
  assetUrl(record: SymbolRecord): string {
    const unique = this.store.localIdCount(record.id) === 1
    const ref = unique ? record.id : canonicalKey(record.namespace, record.id)
    return `${ASSET_BASE}/${encodeURIComponent(ref)}.svg`
  }

  toDefinition(record: SymbolRecord): SymbolDefinition {
    const def: SymbolDefinition = {
      id: record.id,
      namespace: record.namespace,
      name: record.name,
      mediaType: 'image/svg+xml',
      url: this.assetUrl(record)
    }
    if (record.description) def.description = record.description
    if (record.roles.length) def.roles = record.roles
    if (record.tags.length) def.tags = record.tags
    if (record.scale !== null) def.scale = record.scale
    if (record.anchor !== null) def.anchor = record.anchor
    return def
  }

  toResource(record: SymbolRecord): SymbolResource {
    return {
      ...this.toDefinition(record),
      $source: PROVIDER_ID,
      timestamp: record.updatedAt
    }
  }

  // Full record plus computed url, for the manager UI.
  toManagerView(record: SymbolRecord): SymbolRecord & { url: string } {
    return { ...record, url: this.assetUrl(record) }
  }

  // --- reads --------------------------------------------------------------

  list(): SymbolRecord[] {
    return this.store.list()
  }

  listResources(): Record<string, SymbolResource> {
    const out: Record<string, SymbolResource> = {}
    for (const record of this.store.list()) {
      out[canonicalKey(record.namespace, record.id)] = this.toResource(record)
    }
    return out
  }

  // Resolve a canonical `ns:id` or an unqualified local id. Throws
  // ValidationError(404) when missing and ValidationError(409) when ambiguous.
  resolve(reference: string): SymbolRecord {
    const { namespace, id } = parseReference(reference)
    const record =
      namespace !== undefined
        ? this.store.get(namespace, id)
        : this.store.getByLocalId(id)
    if (!record) {
      throw new ValidationError(`symbol "${reference}" not found`, 404)
    }
    return record
  }

  readSvg(record: SymbolRecord): string {
    return this.store.readAsset(record)
  }

  // --- writes -------------------------------------------------------------

  private normalizeMetadata(input: SymbolInput, requireSvg: boolean) {
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw new ValidationError('name is required')
    }
    const roles = asStringArray(input.roles, 'roles')
    const tags = asStringArray(input.tags, 'tags')
    const scale = validateScale(input.scale)
    const anchor = validateAnchor(input.anchor)

    if (isMapMarker(roles)) {
      if (scale === null) {
        throw new ValidationError(
          'scale is required for symbols with a note/waypoint/map-marker role'
        )
      }
      if (anchor === null) {
        throw new ValidationError(
          'anchor is required for symbols with a note/waypoint/map-marker role'
        )
      }
    }

    let svg: string | undefined
    let width: number | null = null
    let height: number | null = null
    if (typeof input.svg === 'string') {
      const result = sanitizeSvg(input.svg, { maxBytes: this.opts.maxSvgBytes })
      svg = result.svg
      const size = nominalSize(result)
      width = size ? size.width : null
      height = size ? size.height : null
    } else if (requireSvg) {
      throw new ValidationError('svg content is required')
    }

    return {
      name: input.name.trim(),
      description:
        typeof input.description === 'string' ? input.description.trim() : '',
      roles,
      tags,
      scale,
      anchor,
      svg,
      width,
      height
    }
  }

  create(input: SymbolInput): SymbolRecord {
    const namespace = validateNamespace(
      input.namespace || this.opts.defaultNamespace
    )
    const id = validateLocalId(input.id)
    const meta = this.normalizeMetadata(input, true)
    return this.store.create({
      id,
      namespace,
      name: meta.name,
      description: meta.description,
      roles: meta.roles,
      tags: meta.tags,
      scale: meta.scale,
      anchor: meta.anchor,
      width: meta.width,
      height: meta.height,
      svg: meta.svg!
    })
  }

  update(reference: string, input: SymbolInput): SymbolRecord {
    const target = this.resolve(reference)
    const meta = this.normalizeMetadata(input, false)
    return this.store.update(target.namespace, target.id, {
      name: meta.name,
      description: meta.description,
      roles: meta.roles,
      tags: meta.tags,
      scale: meta.scale,
      anchor: meta.anchor,
      svg: meta.svg,
      width: meta.width,
      height: meta.height
    })
  }

  duplicate(reference: string, newId: string, newName?: string): SymbolRecord {
    const source = this.resolve(reference)
    const id = validateLocalId(newId)
    const svg = this.store.readAsset(source)
    return this.store.create({
      id,
      namespace: source.namespace,
      name: newName?.trim() || `${source.name} (copy)`,
      description: source.description,
      roles: source.roles,
      tags: source.tags,
      scale: source.scale,
      anchor: source.anchor,
      width: source.width,
      height: source.height,
      svg
    })
  }

  delete(reference: string): boolean {
    const target = this.resolve(reference)
    return this.store.delete(target.namespace, target.id)
  }

  // Sanitize-only helper for the upload preview flow.
  sanitize(svg: string) {
    return sanitizeSvg(svg, { maxBytes: this.opts.maxSvgBytes })
  }

  get defaultNamespace(): string {
    return this.opts.defaultNamespace || DEFAULT_NAMESPACE
  }
}

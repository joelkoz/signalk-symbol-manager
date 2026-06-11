// Business logic for the symbol library: validates input, enforces map-marker
// metadata rules, sanitizes SVG, persists through the store, and renders the
// public `SymbolResource` shape (with `$source` / `timestamp`) for the
// resources API.
//
// A symbol is identified by an immutable `uuid` and referenced by one or more
// `<namespace>:<id>` aliases. New symbols default to a `custom:symbolNNN` alias.

import {
  Anchor,
  DEFAULT_NAMESPACE,
  MAP_MARKER_ROLES,
  PROVIDER_ID,
  SymbolAlias,
  SymbolDefinition,
  SymbolInput,
  SymbolRecord,
  SymbolResource,
  SymbolRole
} from './types'
import {
  ValidationError,
  canonicalKey,
  isUuid,
  parseAlias,
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

  // Assets are addressed by the immutable uuid, so the URL never changes when a
  // symbol's aliases are edited.
  assetUrl(record: SymbolRecord): string {
    return `${ASSET_BASE}/${encodeURIComponent(record.uuid)}.svg`
  }

  private aliasStrings(record: SymbolRecord): string[] {
    return record.alias.map((a) => canonicalKey(a.namespace, a.id))
  }

  toDefinition(record: SymbolRecord): SymbolDefinition {
    const def: SymbolDefinition = {
      uuid: record.uuid,
      alias: this.aliasStrings(record),
      name: record.name,
      mediaType: 'image/svg+xml',
      url: this.assetUrl(record)
    }
    if (record.description) def.description = record.description
    if (record.roles.length) def.roles = record.roles
    if (record.tags.length) def.tags = record.tags
    if (record.scale !== null) def.scale = record.scale
    if (record.anchor !== null) def.anchor = record.anchor
    if (record.gpxType) def.gpxType = record.gpxType
    if (record.gpxSym) def.gpxSym = record.gpxSym
    return def
  }

  toResource(record: SymbolRecord): SymbolResource {
    return {
      ...this.toDefinition(record),
      $source: PROVIDER_ID,
      timestamp: record.updatedAt
    }
  }

  // Full record plus computed url, for the manager UI. `alias` is emitted as
  // canonical "namespace:id" strings (overriding the record's object form) so
  // the manager UI and the resources API agree on the alias shape.
  toManagerView(record: SymbolRecord) {
    return {
      ...record,
      alias: this.aliasStrings(record),
      url: this.assetUrl(record)
    }
  }

  // --- reads --------------------------------------------------------------

  list(): SymbolRecord[] {
    return this.store.list()
  }

  // The resources collection is keyed by the immutable uuid.
  listResources(): Record<string, SymbolResource> {
    const out: Record<string, SymbolResource> = {}
    for (const record of this.store.list()) {
      out[record.uuid] = this.toResource(record)
    }
    return out
  }

  // Resolve a uuid, a qualified alias `ns:id`, or an unqualified local id.
  // Throws ValidationError(404) when missing and (409) when ambiguous.
  resolve(reference: string): SymbolRecord {
    let record: SymbolRecord | undefined
    if (isUuid(reference)) {
      record = this.store.getByUuid(reference)
    } else {
      const { namespace, id } = parseReference(reference)
      record =
        namespace !== undefined
          ? this.store.getByAlias(namespace, id)
          : this.store.getByLocalId(id)
    }
    if (!record) {
      throw new ValidationError(`symbol "${reference}" not found`, 404)
    }
    return record
  }

  readSvg(record: SymbolRecord): string {
    return this.store.readAsset(record)
  }

  // --- alias helpers ------------------------------------------------------

  // Parse and validate the input alias strings into alias pairs. When none are
  // supplied, default to a single unique `custom:symbolNNN` alias.
  private resolveInputAliases(value: unknown): SymbolAlias[] {
    if (value === undefined || value === null) {
      return [this.nextDefaultAlias()]
    }
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new ValidationError('alias must be an array of strings')
    }
    const strings = value as string[]
    if (strings.length === 0) {
      return [this.nextDefaultAlias()]
    }
    const seen = new Set<string>()
    const aliases: SymbolAlias[] = []
    for (const s of strings) {
      const { namespace, id } = parseAlias(s)
      validateNamespace(namespace)
      validateLocalId(id)
      const key = canonicalKey(namespace, id)
      if (seen.has(key)) continue
      seen.add(key)
      aliases.push({ namespace, id })
    }
    if (aliases.length === 0) {
      throw new ValidationError('at least one alias is required')
    }
    return aliases
  }

  // First `${DEFAULT_NAMESPACE}:symbolNNN` alias not already in use.
  private nextDefaultAlias(): SymbolAlias {
    for (let n = 1; ; n++) {
      const id = `symbol${n}`
      if (!this.store.getByAlias(DEFAULT_NAMESPACE, id)) {
        return { namespace: DEFAULT_NAMESPACE, id }
      }
    }
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
      gpxType: typeof input.gpxType === 'string' ? input.gpxType.trim() : '',
      gpxSym: typeof input.gpxSym === 'string' ? input.gpxSym.trim() : '',
      svg,
      width,
      height
    }
  }

  create(input: SymbolInput): SymbolRecord {
    const alias = this.resolveInputAliases(input.alias)
    const meta = this.normalizeMetadata(input, true)
    return this.store.create({
      alias,
      name: meta.name,
      description: meta.description,
      roles: meta.roles,
      tags: meta.tags,
      scale: meta.scale,
      anchor: meta.anchor,
      gpxType: meta.gpxType,
      gpxSym: meta.gpxSym,
      width: meta.width,
      height: meta.height,
      svg: meta.svg!
    })
  }

  update(reference: string, input: SymbolInput): SymbolRecord {
    const target = this.resolve(reference)
    const meta = this.normalizeMetadata(input, false)
    // Aliases are replaced wholesale; absent means "keep current".
    const alias =
      input.alias === undefined
        ? target.alias
        : this.resolveInputAliases(input.alias)
    return this.store.update(target.uuid, {
      alias,
      name: meta.name,
      description: meta.description,
      roles: meta.roles,
      tags: meta.tags,
      scale: meta.scale,
      anchor: meta.anchor,
      gpxType: meta.gpxType,
      gpxSym: meta.gpxSym,
      svg: meta.svg,
      width: meta.width,
      height: meta.height
    })
  }

  duplicate(reference: string, alias?: string[], newName?: string): SymbolRecord {
    const source = this.resolve(reference)
    const aliases = this.resolveInputAliases(alias)
    const svg = this.store.readAsset(source)
    return this.store.create({
      alias: aliases,
      name: newName?.trim() || `${source.name} (copy)`,
      description: source.description,
      roles: source.roles,
      tags: source.tags,
      scale: source.scale,
      anchor: source.anchor,
      gpxType: source.gpxType,
      gpxSym: source.gpxSym,
      width: source.width,
      height: source.height,
      svg
    })
  }

  delete(reference: string): boolean {
    const target = this.resolve(reference)
    return this.store.delete(target.uuid)
  }

  // Sanitize-only helper for the upload preview flow.
  sanitize(svg: string) {
    return sanitizeSvg(svg, { maxBytes: this.opts.maxSvgBytes })
  }

  get defaultNamespace(): string {
    return this.opts.defaultNamespace || DEFAULT_NAMESPACE
  }
}

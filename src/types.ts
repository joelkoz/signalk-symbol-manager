// Shared backend types for the Signal K Symbol Manager plugin.
//
// A symbol is identified by an immutable `uuid`. Consumer-facing references use
// one or more `alias` entries, each a `<namespace>:<id>` pair. A single symbol
// may carry several aliases so it can be matched by different chartplotters
// (e.g. `custom:dive-flag`, `fsk:dive-site`, `garmin:Diver Down Flag 1`).

export const PROVIDER_ID = 'signalk-symbol-manager'
export const SYMBOL_RESOURCE_TYPE = 'symbols' as const
// User-created symbols default to the `custom` vendor namespace.
export const DEFAULT_NAMESPACE = 'custom'

// Controlled advisory role vocabulary presented to the user as checkboxes.
export const SYMBOL_ROLES = [
  'note',
  'waypoint',
  'region',
  'button',
  'alert',
  'logbook',
  'map-marker',
  'vector-style-icon'
] as const

export type SymbolRole = (typeof SYMBOL_ROLES)[number] | string

// Roles for which `scale` and `anchor` are mandatory (map-marker capable).
export const MAP_MARKER_ROLES = ['note', 'waypoint', 'map-marker'] as const

export type Anchor = [number, number]

// A single `<namespace>:<id>` alias for a symbol.
export interface SymbolAlias {
  namespace: string
  id: string
}

// The consumer-facing payload returned by the resources API.
export interface SymbolDefinition {
  uuid: string
  // One or more canonical `<namespace>:<id>` references. At least one required.
  alias: string[]
  name: string
  description?: string
  mediaType: 'image/svg+xml'
  url: string
  roles?: SymbolRole[]
  tags?: string[]
  scale?: number
  anchor?: Anchor
  // Free-form mappings to GPX `<type>` and `<sym>` for waypoint import/export.
  gpxType?: string
  gpxSym?: string
}

export interface SymbolResource extends SymbolDefinition {
  $source: string
  timestamp: string
}

// A fully materialised symbol as stored by the plugin. The SVG markup lives on
// disk (keyed by uuid); everything else is persisted in SQLite.
export interface SymbolRecord {
  uuid: string
  alias: SymbolAlias[]
  name: string
  description: string
  mediaType: 'image/svg+xml'
  roles: SymbolRole[]
  tags: string[]
  scale: number | null
  anchor: Anchor | null
  // Free-form mappings to GPX `<type>` and `<sym>` for waypoint import/export.
  gpxType: string
  gpxSym: string
  // Nominal source dimensions (px), from the SVG width/height or viewBox. Used
  // by consumers/previews to compute display size = width * scale.
  width: number | null
  height: number | null
  svgFile: string
  createdAt: string
  updatedAt: string
}

// Input accepted by create/update operations from the manager API.
export interface SymbolInput {
  // Aliases as `<namespace>:<id>` strings (at least one required on create).
  alias?: string[]
  name?: string
  description?: string
  roles?: SymbolRole[]
  tags?: string[]
  scale?: number | null
  anchor?: Anchor | null
  gpxType?: string
  gpxSym?: string
  svg?: string
}

export interface PluginConfig {
  defaultNamespace: string
  maxSvgBytes: number
}

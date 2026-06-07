// Shared backend types for the Signal K Symbol Manager plugin.
//
// `SymbolDefinition` mirrors the provider-owned payload described in the
// symbol resource RFC. `SymbolResource` is what the resources API returns:
// the definition plus Signal K `Resource<T>` response metadata (`$source`,
// `timestamp`).

export const PROVIDER_ID = 'signalk-symbol-manager'
export const SYMBOL_RESOURCE_TYPE = 'symbols' as const
export const DEFAULT_NAMESPACE = 'user'

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

export interface SymbolDefinition {
  id: string
  namespace: string
  name: string
  description?: string
  mediaType: 'image/svg+xml'
  url: string
  roles?: SymbolRole[]
  tags?: string[]
  scale?: number
  anchor?: Anchor
}

export interface SymbolResource extends SymbolDefinition {
  $source: string
  timestamp: string
}

// A fully materialised symbol as stored by the plugin. The SVG markup lives
// on disk; everything else is persisted in SQLite.
export interface SymbolRecord {
  id: string
  namespace: string
  name: string
  description: string
  mediaType: 'image/svg+xml'
  roles: SymbolRole[]
  tags: string[]
  scale: number | null
  anchor: Anchor | null
  // Nominal source dimensions (px), from the SVG width/height or viewBox. Used
  // by consumers/previews to compute Freeboard display size = width * scale.
  width: number | null
  height: number | null
  svgFile: string
  createdAt: string
  updatedAt: string
}

// Input accepted by create/update operations from the manager API.
export interface SymbolInput {
  id?: string
  namespace?: string
  name?: string
  description?: string
  roles?: SymbolRole[]
  tags?: string[]
  scale?: number | null
  anchor?: Anchor | null
  svg?: string
}

export interface PluginConfig {
  defaultNamespace: string
  maxSvgBytes: number
}

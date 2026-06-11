// Shapes mirrored from the plugin API responses.

export type Anchor = [number, number]

// A single `<namespace>:<id>` alias, edited as separate fields in the UI.
export interface AliasRow {
  namespace: string
  id: string
}

export interface SymbolView {
  key: string // immutable uuid (resource id)
  uuid: string
  alias: string[] // canonical "namespace:id" strings
  name: string
  description: string
  mediaType: string
  roles: string[]
  tags: string[]
  scale: number | null
  anchor: Anchor | null
  gpxType: string
  gpxSym: string
  width: number | null
  height: number | null
  url: string
  createdAt: string
  updatedAt: string
}

export interface AppConfig {
  defaultNamespace: string
  roles: string[]
  mapMarkerRoles: string[]
}

export interface TemplateDefaults {
  roles: string[]
  tags: string[]
  scale?: number
  anchor?: Anchor
}

export interface SymbolTemplate {
  key: string
  name: string
  description: string
  svg: string
  defaults: TemplateDefaults
  editor: {
    fillTarget?: string
    bodyBox?: { x1: number; y1: number; x2: number; y2: number }
  }
}

export interface SanitizeResult {
  svg: string
  width: number | null
  height: number | null
  viewBox: [number, number, number, number] | null
  warnings: string[]
}

// Symbol-wide metadata edited in both the upload form and the visual editor.
// Numeric fields are kept as strings for controlled inputs; aliases are edited
// as a variable-length list of namespace/id rows.
export interface SymbolMeta {
  alias: AliasRow[]
  name: string
  description: string
  roles: string[]
  tags: string[]
  scale: string
  anchorX: string
  anchorY: string
  gpxType: string
  gpxSym: string
}

// Working draft used by the symbol form before it is persisted.
export interface SymbolDraft {
  mode: 'create' | 'edit'
  uuid?: string // present when editing (immutable identity)
  alias: AliasRow[]
  name: string
  description: string
  roles: string[]
  tags: string[]
  scale: string
  anchor: { x: string; y: string }
  gpxType: string
  gpxSym: string
  svg: string
  width: number | null
  height: number | null
  fillTarget?: string
  // POI body-area box (viewBox units) for import-shape placement in the editor.
  bodyBox?: { x1: number; y1: number; x2: number; y2: number }
}

// Parse a canonical "namespace:id" alias string into a row.
export function parseAliasRow(s: string): AliasRow {
  const idx = s.indexOf(':')
  if (idx === -1) return { namespace: '', id: s }
  return { namespace: s.slice(0, idx), id: s.slice(idx + 1) }
}

// Shapes mirrored from the plugin API responses.

export type Anchor = [number, number]

export interface SymbolView {
  key: string
  id: string
  namespace: string
  name: string
  description: string
  mediaType: string
  roles: string[]
  tags: string[]
  scale: number | null
  anchor: Anchor | null
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

// Working draft used by the symbol form before it is persisted.
export interface SymbolDraft {
  mode: 'create' | 'edit'
  id: string
  namespace: string
  name: string
  description: string
  roles: string[]
  tags: string[]
  scale: string
  anchor: { x: string; y: string }
  svg: string
  width: number | null
  height: number | null
  fillTarget?: string
}

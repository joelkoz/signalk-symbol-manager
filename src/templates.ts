// Loads the extensible starter-template catalog (templates/templates.json) and
// inlines each template's SVG markup so the manager UI gets everything in one
// fetch. Templates live in the source tree (shipped in the npm package), not in
// the per-user data directory.

import fs from 'node:fs'
import path from 'node:path'
import { Anchor, SymbolRole } from './types'

export interface TemplateDefaults {
  roles: SymbolRole[]
  tags: string[]
  scale?: number
  anchor?: Anchor
}

export interface TemplateEditorInfo {
  fillTarget?: string
  bodyBox?: { x1: number; y1: number; x2: number; y2: number }
}

export interface SymbolTemplate {
  key: string
  name: string
  description: string
  svg: string
  defaults: TemplateDefaults
  editor: TemplateEditorInfo
}

interface RawTemplate {
  key: string
  name: string
  description: string
  svgFile: string
  defaults: TemplateDefaults
  editor?: TemplateEditorInfo
}

// __dirname is the compiled `plugin/` directory at runtime; the templates
// folder sits beside it at the package root.
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates')

export function loadTemplates(): SymbolTemplate[] {
  const jsonPath = path.join(TEMPLATES_DIR, 'templates.json')
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
    templates: RawTemplate[]
  }
  return raw.templates.map((t) => {
    const svg = fs.readFileSync(path.join(TEMPLATES_DIR, t.svgFile), 'utf8')
    return {
      key: t.key,
      name: t.name,
      description: t.description,
      svg,
      defaults: {
        roles: t.defaults.roles ?? [],
        tags: t.defaults.tags ?? [],
        scale: t.defaults.scale,
        anchor: t.defaults.anchor
      },
      editor: t.editor ?? {}
    }
  })
}

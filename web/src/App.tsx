// Root view-state machine: list -> (template picker | upload) -> form.
// The SVG editor/form only appears after the user explicitly chooses New,
// Upload, or Edit, per the spec.

import { useEffect, useRef, useState } from 'react'
import { api, fetchSvgText } from './api'
import {
  AliasRow,
  AppConfig,
  SymbolDraft,
  SymbolTemplate,
  SymbolView,
  parseAliasRow
} from './types'
import { nominalSize } from './svg'
import { SymbolList } from './components/SymbolList'
import { TemplatePicker } from './components/TemplatePicker'
import { SymbolForm } from './components/SymbolForm'
import { FabricEditor } from './components/FabricEditor'
import { DuplicateDialog } from './components/DuplicateDialog'

type View =
  | { kind: 'list' }
  | { kind: 'pick-template' }
  | { kind: 'editor'; draft: SymbolDraft } // visual Fabric editor (New / Edit)
  | { kind: 'form'; draft: SymbolDraft } // metadata-only form (Upload)

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [symbols, setSymbols] = useState<SymbolView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'list' })
  // Symbol awaiting the Duplicate dialog (null = dialog closed), plus its own
  // error/busy state so a collision shows inline without closing the dialog.
  const [duplicating, setDuplicating] = useState<SymbolView | null>(null)
  const [dupError, setDupError] = useState<string | null>(null)
  const [dupBusy, setDupBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.list()
      setSymbols(list)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch((e) => setError((e as Error).message))
    refresh()
  }, [])

  const anchorStr = (a: [number, number] | null | undefined) =>
    a ? { x: String(a[0]), y: String(a[1]) } : { x: '', y: '' }

  // Slugify a template/type name into a valid local id base, e.g.
  // "Dive Site" -> "dive-site". Falls back to "symbol".
  const slugify = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'symbol'

  // First `<defaultNamespace>:<base><N>` alias not already used by any symbol
  // (e.g. base "flag" -> "flag1"). Defaults the base to "symbol".
  const nextDefaultAlias = (base = 'symbol'): AliasRow => {
    const ns = config?.defaultNamespace || 'custom'
    const used = new Set<string>()
    for (const s of symbols) for (const a of s.alias) used.add(a)
    for (let n = 1; ; n++) {
      const id = `${base}${n}`
      if (!used.has(`${ns}:${id}`)) return { namespace: ns, id }
    }
  }

  // --- New from template --------------------------------------------------
  const pickTemplate = (t: SymbolTemplate) => {
    const n = nominalSize(t.svg)
    const draft: SymbolDraft = {
      mode: 'create',
      alias: [nextDefaultAlias(slugify(t.name))],
      name: t.name,
      description: '',
      roles: t.defaults.roles ?? [],
      tags: t.defaults.tags ?? [],
      scale: t.defaults.scale != null ? String(t.defaults.scale) : '',
      anchor: anchorStr(t.defaults.anchor),
      gpxType: '',
      gpxSym: '',
      svg: t.svg,
      width: n?.width ?? null,
      height: n?.height ?? null,
      fillTarget: t.editor.fillTarget,
      bodyBox: t.editor.bodyBox
    }
    setView({ kind: 'editor', draft })
  }

  // --- Upload -------------------------------------------------------------
  const onUploadClick = () => fileInput.current?.click()

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      const result = await api.sanitize(text)
      const n = nominalSize(result.svg)
      const baseId = file.name
        .replace(/\.svg$/i, '')
        .replace(/[^A-Za-z0-9_-]/g, '-')
        .replace(/^[^A-Za-z0-9]+/, '')
      const draft: SymbolDraft = {
        mode: 'create',
        alias: [
          baseId
            ? { namespace: config?.defaultNamespace || 'custom', id: baseId }
            : nextDefaultAlias()
        ],
        name: file.name.replace(/\.svg$/i, ''),
        description: '',
        roles: [],
        tags: [],
        scale: '',
        anchor: { x: '', y: '' },
        gpxType: '',
        gpxSym: '',
        svg: result.svg,
        width: n?.width ?? null,
        height: n?.height ?? null
      }
      if (result.warnings.length) {
        setError(`Uploaded SVG sanitized: ${result.warnings.join('; ')}`)
      }
      setView({ kind: 'form', draft })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // --- Edit ---------------------------------------------------------------
  const onEdit = async (s: SymbolView) => {
    setError(null)
    try {
      const svgText = await fetchSvgText(s.url)
      const draft: SymbolDraft = {
        mode: 'edit',
        uuid: s.uuid,
        alias: s.alias.length ? s.alias.map(parseAliasRow) : [nextDefaultAlias()],
        name: s.name,
        description: s.description,
        roles: s.roles,
        tags: s.tags,
        scale: s.scale != null ? String(s.scale) : '',
        anchor: anchorStr(s.anchor),
        // Default to '' so a symbol from an older server build (no GPX fields)
        // doesn't yield undefined and crash the save-time trim().
        gpxType: s.gpxType ?? '',
        gpxSym: s.gpxSym ?? '',
        svg: svgText,
        width: s.width,
        height: s.height
      }
      setView({ kind: 'editor', draft })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // --- Duplicate / Delete -------------------------------------------------
  const onDuplicate = (s: SymbolView) => {
    setDupError(null)
    setDuplicating(s)
  }

  const doDuplicate = async (alias: string, newName?: string) => {
    if (!duplicating) return
    setDupError(null)
    setDupBusy(true)
    try {
      const created = await api.duplicate(
        duplicating.uuid,
        alias ? [alias] : undefined,
        newName
      )
      setDuplicating(null)
      // Refresh so a later Cancel returns to a list that includes the copy,
      // then open the editor directly on the new symbol.
      await refresh()
      await onEdit(created)
    } catch (e) {
      setDupError((e as Error).message)
    } finally {
      setDupBusy(false)
    }
  }

  const onDelete = async (s: SymbolView) => {
    if (!window.confirm(`Delete symbol "${s.name}"? This cannot be undone.`)) return
    setError(null)
    try {
      await api.remove(s.uuid)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const onSaved = async () => {
    setView({ kind: 'list' })
    await refresh()
  }

  const authError =
    error && (error.includes('authorized') || error.includes('administrator'))

  return (
    <div className="app">
      <input
        ref={fileInput}
        type="file"
        accept=".svg,image/svg+xml"
        style={{ display: 'none' }}
        onChange={onFileChosen}
      />

      {error ? (
        <div className={authError ? 'error banner auth' : 'error banner'}>
          {error}
          <button className="link" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      ) : null}

      {view.kind === 'list' ? (
        <SymbolList
          symbols={symbols}
          loading={loading}
          onNew={() => setView({ kind: 'pick-template' })}
          onUpload={onUploadClick}
          onRefresh={refresh}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ) : null}

      {view.kind === 'pick-template' ? (
        <TemplatePicker onPick={pickTemplate} onCancel={() => setView({ kind: 'list' })} />
      ) : null}

      {duplicating ? (
        <DuplicateDialog
          source={duplicating}
          error={dupError}
          busy={dupBusy}
          onSubmit={doDuplicate}
          onCancel={() => setDuplicating(null)}
        />
      ) : null}

      {view.kind === 'editor' && config ? (
        <FabricEditor
          draft={view.draft}
          config={config}
          onSaved={onSaved}
          onCancel={() => setView({ kind: 'list' })}
        />
      ) : null}

      {view.kind === 'form' && config ? (
        <SymbolForm
          draft={view.draft}
          config={config}
          onSaved={onSaved}
          onCancel={() => setView({ kind: 'list' })}
        />
      ) : null}
    </div>
  )
}

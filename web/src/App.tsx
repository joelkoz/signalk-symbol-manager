// Root view-state machine: list -> (template picker | upload) -> form.
// The SVG editor/form only appears after the user explicitly chooses New,
// Upload, or Edit, per the spec.

import { useEffect, useRef, useState } from 'react'
import { api, fetchSvgText } from './api'
import { AppConfig, SymbolDraft, SymbolTemplate, SymbolView } from './types'
import { nominalSize } from './svg'
import { SymbolList } from './components/SymbolList'
import { TemplatePicker } from './components/TemplatePicker'
import { SymbolForm } from './components/SymbolForm'

type View =
  | { kind: 'list' }
  | { kind: 'pick-template' }
  | { kind: 'form'; draft: SymbolDraft }

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [symbols, setSymbols] = useState<SymbolView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'list' })
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

  // --- New from template --------------------------------------------------
  const pickTemplate = (t: SymbolTemplate) => {
    const n = nominalSize(t.svg)
    const draft: SymbolDraft = {
      mode: 'create',
      id: '',
      namespace: config?.defaultNamespace || 'user',
      name: t.name,
      description: '',
      roles: t.defaults.roles ?? [],
      tags: t.defaults.tags ?? [],
      scale: t.defaults.scale != null ? String(t.defaults.scale) : '',
      anchor: anchorStr(t.defaults.anchor),
      svg: t.svg,
      width: n?.width ?? null,
      height: n?.height ?? null,
      fillTarget: t.editor.fillTarget
    }
    setView({ kind: 'form', draft })
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
      const baseId = file.name.replace(/\.svg$/i, '').replace(/[^A-Za-z0-9_-]/g, '-')
      const draft: SymbolDraft = {
        mode: 'create',
        id: baseId,
        namespace: config?.defaultNamespace || 'user',
        name: file.name.replace(/\.svg$/i, ''),
        description: '',
        roles: [],
        tags: [],
        scale: '',
        anchor: { x: '', y: '' },
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
        id: s.id,
        namespace: s.namespace,
        name: s.name,
        description: s.description,
        roles: s.roles,
        tags: s.tags,
        scale: s.scale != null ? String(s.scale) : '',
        anchor: anchorStr(s.anchor),
        svg: svgText,
        width: s.width,
        height: s.height
      }
      setView({ kind: 'form', draft })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // --- Duplicate / Delete -------------------------------------------------
  const onDuplicate = async (s: SymbolView) => {
    const newId = window.prompt(`Duplicate "${s.id}" as new id:`, `${s.id}-copy`)
    if (!newId) return
    setError(null)
    try {
      await api.duplicate(s.key, newId)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const onDelete = async (s: SymbolView) => {
    if (!window.confirm(`Delete symbol "${s.key}"? This cannot be undone.`)) return
    setError(null)
    try {
      await api.remove(s.key)
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

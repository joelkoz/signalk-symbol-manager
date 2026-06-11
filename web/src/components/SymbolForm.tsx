// Metadata-only form used for the direct-upload path (which intentionally
// bypasses the visual editor for complex SVGs). Shows the shared metadata
// fields, a Freeboard-size preview, an optional fill-color control, and a
// raw-SVG source fallback (sanitized on apply). New/Edit use FabricEditor.

import { useMemo, useState } from 'react'
import { AppConfig, SymbolDraft, SymbolMeta } from '../types'
import { api } from '../api'
import { Preview } from './Preview'
import { MetadataFields, buildPayload } from './MetadataFields'
import { applyFill, currentFill, nominalSize } from '../svg'

interface Props {
  draft: SymbolDraft
  config: AppConfig
  onSaved: () => void
  onCancel: () => void
}

function draftToMeta(draft: SymbolDraft): SymbolMeta {
  return {
    alias: draft.alias,
    name: draft.name,
    description: draft.description,
    roles: draft.roles,
    tags: draft.tags,
    scale: draft.scale,
    anchorX: draft.anchor.x,
    anchorY: draft.anchor.y,
    gpxType: draft.gpxType,
    gpxSym: draft.gpxSym
  }
}

export function SymbolForm({ draft, config, onSaved, onCancel }: Props) {
  const [meta, setMeta] = useState<SymbolMeta>(draftToMeta(draft))
  const [svg, setSvg] = useState(draft.svg)
  const [dims, setDims] = useState<{ width: number | null; height: number | null }>({
    width: draft.width,
    height: draft.height
  })
  const [showSource, setShowSource] = useState(false)
  const [sourceText, setSourceText] = useState(draft.svg)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (patch: Partial<SymbolMeta>) => setMeta((m) => ({ ...m, ...patch }))

  const fillTarget = draft.fillTarget || '[data-fill="body"]'
  const fillColor = useMemo(() => currentFill(svg, fillTarget) || '#d71920', [svg, fillTarget])
  const hasFillTarget = useMemo(() => {
    try {
      return !!new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector(fillTarget)
    } catch {
      return false
    }
  }, [svg, fillTarget])

  const setFill = (color: string) => setSvg((prev) => applyFill(prev, fillTarget, color))

  const applySource = async () => {
    setError(null)
    setBusy(true)
    try {
      const result = await api.sanitize(sourceText)
      setSvg(result.svg)
      const n = nominalSize(result.svg)
      setDims({ width: n?.width ?? null, height: n?.height ?? null })
      if (result.warnings.length) setError(`Sanitized: ${result.warnings.join('; ')}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const payload = buildPayload(meta, svg, config)
    if (typeof payload === 'string') {
      setError(payload)
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (draft.mode === 'create') await api.create(payload)
      else await api.update(draft.uuid!, payload)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <h2>{draft.mode === 'create' ? 'New symbol (upload)' : `Edit ${draft.name}`}</h2>
        <div className="spacer" />
        <button onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="editor-body">
        <div className="editor-preview">
          <h3>Preview</h3>
          <Preview
            svgText={svg}
            nominalWidth={dims.width}
            nominalHeight={dims.height}
            scale={meta.scale.trim() === '' ? null : Number(meta.scale)}
            onScaleChange={(s) => update({ scale: String(s) })}
          />
          <button className="link" onClick={() => setShowSource((s) => !s)}>
            {showSource ? 'Hide' : 'View / edit'} SVG source
          </button>
          {showSource ? (
            <div className="source-edit">
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                spellCheck={false}
                rows={10}
              />
              <button onClick={applySource} disabled={busy}>
                Sanitize &amp; apply
              </button>
            </div>
          ) : null}
        </div>

        <div className="editor-props">
          <h3>Properties</h3>
          <MetadataFields meta={meta} onChange={update} config={config} />
          {hasFillTarget ? (
            <label className="fill-field">
              Fill color
              <input type="color" value={toHexColor(fillColor)} onChange={(e) => setFill(e.target.value)} />
              <span className="hint">recolors the marker body</span>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function toHexColor(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [, r, g, b] = value
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#d71920'
}

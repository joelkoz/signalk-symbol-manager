// Phase 1 symbol form: metadata editing (roles checkboxes, tag editor,
// scale/anchor), a fill-color control for templates/symbols that expose a fill
// target, a raw-SVG source fallback (sanitized on apply), and a Freeboard-size
// live preview. The rich Fabric.js visual editor arrives in Phase 2.

import { useMemo, useState } from 'react'
import { TagsInput } from 'react-tag-input-component'
import { AppConfig, SymbolDraft } from '../types'
import { api } from '../api'
import { Preview } from './Preview'
import { applyFill, currentFill, nominalSize } from '../svg'

interface Props {
  draft: SymbolDraft
  config: AppConfig
  onSaved: () => void
  onCancel: () => void
}

interface SavePayload {
  id: string
  namespace: string
  name: string
  description: string
  roles: string[]
  tags: string[]
  scale: number | null
  anchor: [number, number] | null
  svg: string
}

export function SymbolForm({ draft, config, onSaved, onCancel }: Props) {
  const [id, setId] = useState(draft.id)
  const [namespace, setNamespace] = useState(draft.namespace || config.defaultNamespace)
  const [name, setName] = useState(draft.name)
  const [description, setDescription] = useState(draft.description)
  const [roles, setRoles] = useState<string[]>(draft.roles)
  const [tags, setTags] = useState<string[]>(draft.tags)
  const [scale, setScale] = useState(draft.scale)
  const [anchorX, setAnchorX] = useState(draft.anchor.x)
  const [anchorY, setAnchorY] = useState(draft.anchor.y)
  const [svg, setSvg] = useState(draft.svg)
  const [dims, setDims] = useState<{ width: number | null; height: number | null }>({
    width: draft.width,
    height: draft.height
  })
  const [showSource, setShowSource] = useState(false)
  const [sourceText, setSourceText] = useState(draft.svg)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fillTarget = draft.fillTarget || '[data-fill="body"]'
  const fillColor = useMemo(() => currentFill(svg, fillTarget) || '#d71920', [svg, fillTarget])
  const hasFillTarget = useMemo(() => {
    try {
      return !!new DOMParser()
        .parseFromString(svg, 'image/svg+xml')
        .querySelector(fillTarget)
    } catch {
      return false
    }
  }, [svg, fillTarget])

  const isMapMarker = roles.some((r) => config.mapMarkerRoles.includes(r))

  const setFill = (color: string) => {
    setSvg((prev) => applyFill(prev, fillTarget, color))
  }

  const toggleRole = (role: string) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
  }

  const applySource = async () => {
    setError(null)
    setBusy(true)
    try {
      const result = await api.sanitize(sourceText)
      setSvg(result.svg)
      const n = nominalSize(result.svg)
      setDims({ width: n?.width ?? null, height: n?.height ?? null })
      if (result.warnings.length) {
        setError(`Sanitized: ${result.warnings.join('; ')}`)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const validate = (): SavePayload | string => {
    if (!id.trim()) return 'id is required'
    if (!name.trim()) return 'name is required'
    let scaleNum: number | null = null
    let anchor: [number, number] | null = null
    if (scale.trim() !== '') {
      const n = Number(scale)
      if (!Number.isFinite(n) || n <= 0) return 'scale must be a positive number'
      scaleNum = n
    }
    if (anchorX.trim() !== '' || anchorY.trim() !== '') {
      const ax = Number(anchorX)
      const ay = Number(anchorY)
      if (!Number.isFinite(ax) || !Number.isFinite(ay))
        return 'anchor x and y must be numbers'
      anchor = [ax, ay]
    }
    if (isMapMarker && scaleNum === null)
      return 'scale is required for note / waypoint / map-marker symbols'
    if (isMapMarker && anchor === null)
      return 'anchor is required for note / waypoint / map-marker symbols'
    return {
      id: id.trim(),
      namespace: namespace.trim() || config.defaultNamespace,
      name: name.trim(),
      description: description.trim(),
      roles,
      tags,
      scale: scaleNum,
      anchor,
      svg
    }
  }

  const save = async () => {
    const result = validate()
    if (typeof result === 'string') {
      setError(result)
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (draft.mode === 'create') {
        await api.create(result)
      } else {
        await api.update(`${draft.namespace}:${draft.id}`, result)
      }
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
        <h2>{draft.mode === 'create' ? 'New symbol' : `Edit ${draft.namespace}:${draft.id}`}</h2>
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
            scale={scale.trim() === '' ? null : Number(scale)}
            anchor={
              anchorX.trim() === '' || anchorY.trim() === ''
                ? null
                : [Number(anchorX), Number(anchorY)]
            }
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
          <label>
            Id
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={draft.mode === 'edit'}
              placeholder="dive-site"
            />
          </label>
          <label>
            Namespace
            <input value={namespace} onChange={(e) => setNamespace(e.target.value)} disabled={draft.mode === 'edit'} />
          </label>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dive Site" />
          </label>
          <label>
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <fieldset>
            <legend>Roles</legend>
            <div className="roles">
              {config.roles.map((role) => (
                <label key={role} className="checkbox">
                  <input
                    type="checkbox"
                    checked={roles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {role}
                  {config.mapMarkerRoles.includes(role) ? <span className="badge">map</span> : null}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <span className="field-label">Tags</span>
            <TagsInput value={tags} onChange={setTags} name="tags" placeHolder="add tag + Enter" />
          </div>

          <fieldset className={isMapMarker ? 'required' : ''}>
            <legend>Map-marker metadata {isMapMarker ? '(required)' : '(optional)'}</legend>
            <label>
              Scale
              <input value={scale} onChange={(e) => setScale(e.target.value)} placeholder="0.65" />
            </label>
            <div className="anchor-fields">
              <label>
                Anchor X
                <input value={anchorX} onChange={(e) => setAnchorX(e.target.value)} placeholder="1" />
              </label>
              <label>
                Anchor Y
                <input value={anchorY} onChange={(e) => setAnchorY(e.target.value)} placeholder="37" />
              </label>
            </div>
          </fieldset>

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

// <input type="color"> needs a #rrggbb value; pass named/hex colors through best-effort.
function toHexColor(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value[1]
    const g = value[2]
    const b = value[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#d71920'
}

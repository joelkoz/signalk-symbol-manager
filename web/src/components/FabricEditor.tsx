// The Fabric.js visual symbol editor, shown for New (after template pick) and
// Edit. Left: a zoomable editing canvas with a draggable anchor-point overlay.
// Right: contextual properties — symbol-wide metadata when nothing is selected,
// shape properties when an object is selected — plus a Freeboard-size preview.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as fabric from 'fabric'
import { AppConfig, SymbolDraft, SymbolMeta } from '../types'
import { api } from '../api'
import { svgSize } from '../svg'
import { MetadataFields, buildPayload } from './MetadataFields'
import { ShapeProperties, ShapeSnapshot } from './ShapeProperties'
import { Preview } from './Preview'
import {
  ShapeKind,
  createAnchorMarker,
  isAnchor,
  makeShape,
  objectsAtPoint,
  snapshot
} from '../fabric/helpers'

const VIEW_W = 460
const VIEW_H = 380
const round = (n: number) => Math.round(n * 100) / 100

interface Props {
  draft: SymbolDraft
  config: AppConfig
  onSaved: () => void
  onCancel: () => void
}

function draftToMeta(draft: SymbolDraft): SymbolMeta {
  return {
    id: draft.id,
    namespace: draft.namespace,
    name: draft.name,
    description: draft.description,
    roles: draft.roles,
    tags: draft.tags,
    scale: draft.scale,
    anchorX: draft.anchor.x,
    anchorY: draft.anchor.y
  }
}

export function FabricEditor({ draft, config, onSaved, onCancel }: Props) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fcRef = useRef<fabric.Canvas | null>(null)
  const anchorRef = useRef<fabric.FabricObject | null>(null)
  const idMap = useRef(new WeakMap<object, number>())
  const idSeq = useRef(0)
  const dims = useRef({ W: 100, H: 100, vbW: 100, vbH: 100 })
  const cycle = useRef({ key: '', idx: 0 })
  const down = useRef<{ x: number; y: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Undo history: JSON snapshots of the canvas (the anchor is excluded from
  // toJSON via excludeFromExport, so it is preserved across restores).
  const historyRef = useRef<string[]>([])
  const histIdxRef = useRef(-1)
  const restoringRef = useRef(false)
  const recordTimerRef = useRef<number | null>(null)

  const [meta, setMeta] = useState<SymbolMeta>(draftToMeta(draft))
  const [selected, setSelected] = useState<ShapeSnapshot | null>(null)
  const [zoom, setZoom] = useState(1)
  const [ready, setReady] = useState(false)
  const [previewSvg, setPreviewSvg] = useState(draft.svg)
  const [showSource, setShowSource] = useState(false)
  const [sourceText, setSourceText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  const metaRef = useRef(meta)
  metaRef.current = meta
  const updateMeta = (patch: Partial<SymbolMeta>) => setMeta((m) => ({ ...m, ...patch }))

  const oid = (o: object) => {
    let v = idMap.current.get(o)
    if (v === undefined) {
      v = ++idSeq.current
      idMap.current.set(o, v)
    }
    return v
  }

  const fitZoom = () =>
    Math.min(VIEW_W / dims.current.W, VIEW_H / dims.current.H) * 0.85

  const applyView = (userZoom: number) => {
    const fc = fcRef.current
    if (!fc) return
    const z = fitZoom() * userZoom
    fc.setZoom(z)
    const vpt = fc.viewportTransform.slice() as typeof fc.viewportTransform
    vpt[4] = (VIEW_W - dims.current.W * z) / 2
    vpt[5] = (VIEW_H - dims.current.H * z) / 2
    fc.setViewportTransform(vpt)
    fc.requestRenderAll()
  }

  // Generate the current symbol SVG (without the anchor overlay).
  const exportSvg = (): string => {
    const fc = fcRef.current
    if (!fc) return previewSvg
    const { W, H } = dims.current
    const anchor = anchorRef.current
    if (anchor) fc.remove(anchor)
    const svg = fc.toSVG({
      width: `${W}`,
      height: `${H}`,
      viewBox: { x: 0, y: 0, width: W, height: H }
    })
    if (anchor) {
      fc.add(anchor)
      fc.requestRenderAll()
    }
    return svg
  }

  const refreshPreview = () => setPreviewSvg(exportSvg())

  // --- undo history -------------------------------------------------------
  // Push the current canvas state. Deduped against the top of the stack and
  // capped in depth. No-ops while a restore is in progress.
  const recordHistory = () => {
    if (restoringRef.current) return
    const fc = fcRef.current
    if (!fc) return
    const json = JSON.stringify(fc.toJSON())
    const h = historyRef.current
    if (histIdxRef.current >= 0 && h[histIdxRef.current] === json) return
    h.length = histIdxRef.current + 1 // drop any forward states
    h.push(json)
    const MAX = 60
    if (h.length > MAX) h.splice(0, h.length - MAX)
    histIdxRef.current = h.length - 1
    setCanUndo(histIdxRef.current > 0)
  }

  // Debounced record, for rapid streams of changes (e.g. dragging a slider).
  const scheduleRecord = () => {
    if (restoringRef.current) return
    if (recordTimerRef.current) window.clearTimeout(recordTimerRef.current)
    recordTimerRef.current = window.setTimeout(() => {
      recordTimerRef.current = null
      recordHistory()
    }, 300)
  }

  const restoreFromJson = async (json: string) => {
    const fc = fcRef.current
    if (!fc) return
    restoringRef.current = true
    const anchor = anchorRef.current
    try {
      await fc.loadFromJSON(json)
      // loadFromJSON clears the canvas (anchor too); re-add the preserved anchor.
      if (anchor) {
        fc.add(anchor)
        fc.bringObjectToFront(anchor)
      }
      for (const o of fc.getObjects()) {
        if (!isAnchor(o)) o.set({ selectable: true })
      }
      fc.discardActiveObject()
      applyView(zoom)
      fc.requestRenderAll()
    } finally {
      restoringRef.current = false
    }
    setSelected(null)
    refreshPreview()
  }

  const undo = async () => {
    // Flush any pending debounced record so the latest edit is undoable.
    if (recordTimerRef.current) {
      window.clearTimeout(recordTimerRef.current)
      recordTimerRef.current = null
      recordHistory()
    }
    if (histIdxRef.current <= 0) return
    histIdxRef.current -= 1
    await restoreFromJson(historyRef.current[histIdxRef.current])
    setCanUndo(histIdxRef.current > 0)
  }
  const undoRef = useRef(undo)
  undoRef.current = undo

  // --- init / teardown ----------------------------------------------------
  useEffect(() => {
    let disposed = false
    const el = canvasElRef.current
    if (!el) return
    const fc = new fabric.Canvas(el, {
      width: VIEW_W,
      height: VIEW_H,
      preserveObjectStacking: true,
      selection: true
    })
    fcRef.current = fc

    const size = svgSize(draft.svg)
    const W = draft.width ?? (size.viewBox ? size.viewBox[2] : 100)
    const H = draft.height ?? (size.viewBox ? size.viewBox[3] : 100)
    dims.current = {
      W,
      H,
      vbW: size.viewBox ? size.viewBox[2] : W,
      vbH: size.viewBox ? size.viewBox[3] : H
    }

    const onSelect = () => {
      const o = fc.getActiveObject()
      if (!o || isAnchor(o)) {
        setSelected(null)
        return
      }
      setSelected(snapshot(o))
    }
    const onMoving = (e: { target?: fabric.FabricObject }) => {
      if (e.target && isAnchor(e.target)) {
        setMeta((m) => ({
          ...m,
          anchorX: String(round(e.target!.left ?? 0)),
          anchorY: String(round(e.target!.top ?? 0))
        }))
      } else {
        setSelected(fc.getActiveObject() ? snapshot(fc.getActiveObject()!) : null)
      }
    }
    type PtArg = Parameters<typeof fc.getScenePoint>[0]
    const onDown = (opt: { e: Event }) => {
      const p = fc.getScenePoint(opt.e as PtArg)
      down.current = { x: p.x, y: p.y }
    }
    const onUp = (opt: { e: Event }) => {
      const p = fc.getScenePoint(opt.e as PtArg)
      const d = down.current
      down.current = null
      if (!d) return
      const moved = Math.hypot(p.x - d.x, p.y - d.y)
      if (moved > 3 / fc.getZoom()) return // a drag, not a click
      const hits = objectsAtPoint(fc, p)
      if (hits.length === 0) return
      const key = hits.map(oid).join(',')
      if (key === cycle.current.key) {
        cycle.current.idx = (cycle.current.idx + 1) % hits.length
      } else {
        cycle.current = { key, idx: 0 }
      }
      const pick = hits[cycle.current.idx]
      if (pick && pick !== fc.getActiveObject()) {
        fc.setActiveObject(pick)
        fc.requestRenderAll()
        setSelected(snapshot(pick))
      }
    }

    fc.on('selection:created', onSelect)
    fc.on('selection:updated', onSelect)
    fc.on('selection:cleared', () => setSelected(null))
    fc.on('object:moving', onMoving)
    fc.on('object:modified', (e: { target?: fabric.FabricObject }) => {
      const a = fc.getActiveObject()
      if (a && !isAnchor(a)) setSelected(snapshot(a))
      refreshPreview()
      // Record handle-driven transforms (drag/scale/rotate); anchor moves are
      // not part of symbol history.
      if (!(e.target && isAnchor(e.target))) recordHistory()
    })
    fc.on('mouse:down', onDown)
    fc.on('mouse:up', onUp)
    ;(async () => {
      try {
        const parsed = await fabric.loadSVGFromString(draft.svg)
        if (disposed) return
        const objs = parsed.objects.filter(Boolean) as fabric.FabricObject[]
        for (const o of objs) {
          o.set({ selectable: true })
          fc.add(o)
        }
        const aScale = Math.max(0.4, Math.max(W, H) / 60)
        const marker = createAnchorMarker(aScale)
        const ax = metaRef.current.anchorX !== '' ? Number(metaRef.current.anchorX) : W / 2
        const ay = metaRef.current.anchorY !== '' ? Number(metaRef.current.anchorY) : H / 2
        marker.set({ left: ax, top: ay })
        marker.setCoords()
        fc.add(marker)
        anchorRef.current = marker
        applyView(1)
        setReady(true)
        refreshPreview()
        recordHistory() // baseline state
      } catch (e) {
        setError(`Could not load SVG into the editor: ${(e as Error).message}`)
      }
    })()

    return () => {
      disposed = true
      fc.off()
      fc.dispose()
      fcRef.current = null
      anchorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-apply zoom when the slider changes.
  useEffect(() => {
    if (ready) applyView(zoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, ready])

  // Sync metadata anchor edits back to the marker position.
  useEffect(() => {
    const marker = anchorRef.current
    const fc = fcRef.current
    if (!marker || !fc || !ready) return
    if (meta.anchorX === '' || meta.anchorY === '') return
    const ax = Number(meta.anchorX)
    const ay = Number(meta.anchorY)
    if (!Number.isFinite(ax) || !Number.isFinite(ay)) return
    if (Math.abs((marker.left ?? 0) - ax) > 0.01 || Math.abs((marker.top ?? 0) - ay) > 0.01) {
      marker.set({ left: ax, top: ay })
      marker.setCoords()
      fc.requestRenderAll()
    }
  }, [meta.anchorX, meta.anchorY, ready])

  // Backspace / Delete removes the selected shape(s) — unless the user is typing
  // in a form field or editing text on the canvas (Fabric uses a hidden
  // textarea while editing IText, which the tag check below catches).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || !!t?.isContentEditable
      // Undo: Cmd/Ctrl-Z (let the browser handle it while typing in a field).
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (inField) return
        e.preventDefault()
        void undoRef.current()
        return
      }
      if (e.key !== 'Backspace' && e.key !== 'Delete') return
      if (inField) return
      const fc = fcRef.current
      const active = fc?.getActiveObject()
      if (!active || isAnchor(active)) return
      if ((active as unknown as { isEditing?: boolean }).isEditing) return
      e.preventDefault()
      deleteSelectedRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // --- toolbar actions ----------------------------------------------------
  const addShape = (kind: ShapeKind) => {
    const fc = fcRef.current
    if (!fc) return
    const { W, H } = dims.current
    const o = makeShape(kind, W / 2, H / 2, Math.max(12, Math.min(W, H) * 0.5))
    fc.add(o)
    fc.setActiveObject(o)
    fc.requestRenderAll()
    setSelected(snapshot(o))
    refreshPreview()
    recordHistory()
  }

  const applyShape = (patch: Partial<ShapeSnapshot>) => {
    const fc = fcRef.current
    const o = fc?.getActiveObject()
    if (!fc || !o) return
    if ('text' in patch && patch.text !== undefined) o.set('text', patch.text)
    if ('left' in patch && patch.left !== undefined) o.set('left', patch.left)
    if ('top' in patch && patch.top !== undefined) o.set('top', patch.top)
    // Scale by the ratio of desired-to-current *scaled* size so the result is
    // exact even when the stroke contributes to the bounding box.
    if ('width' in patch && patch.width !== undefined && patch.width > 0) {
      const cur = o.getScaledWidth()
      if (cur > 0) o.set('scaleX', (o.scaleX ?? 1) * (patch.width / cur))
    }
    if ('height' in patch && patch.height !== undefined && patch.height > 0) {
      const cur = o.getScaledHeight()
      if (cur > 0) o.set('scaleY', (o.scaleY ?? 1) * (patch.height / cur))
    }
    if ('fill' in patch && patch.fill !== undefined) o.set('fill', patch.fill)
    if ('stroke' in patch && patch.stroke !== undefined) o.set('stroke', patch.stroke)
    if ('strokeWidth' in patch && patch.strokeWidth !== undefined) {
      o.set('strokeWidth', patch.strokeWidth)
    }
    if ('opacity' in patch && patch.opacity !== undefined) {
      o.set('opacity', patch.opacity)
    }
    o.setCoords()
    fc.requestRenderAll()
    setSelected(snapshot(o))
    refreshPreview()
    scheduleRecord()
  }

  const deleteSelected = () => {
    const fc = fcRef.current
    const active = fc?.getActiveObject()
    if (!fc || !active || isAnchor(active)) return
    // A multi-selection is an ActiveSelection wrapping several objects.
    const targets =
      active.type === 'activeselection'
        ? (active as fabric.ActiveSelection).getObjects().slice()
        : [active]
    fc.discardActiveObject()
    for (const o of targets) {
      if (!isAnchor(o)) fc.remove(o)
    }
    fc.requestRenderAll()
    setSelected(null)
    refreshPreview()
    recordHistory()
  }
  // Keep a ref to the latest deleteSelected so the once-registered key handler
  // always calls the current version.
  const deleteSelectedRef = useRef(deleteSelected)
  deleteSelectedRef.current = deleteSelected

  const reorder = (dir: 'forward' | 'backward') => {
    const fc = fcRef.current
    const o = fc?.getActiveObject()
    if (!fc || !o) return
    if (dir === 'forward') fc.bringObjectForward(o)
    else fc.sendObjectBackwards(o)
    // keep the anchor marker on top
    if (anchorRef.current) fc.bringObjectToFront(anchorRef.current)
    fc.requestRenderAll()
    refreshPreview()
  }

  const onImportClick = () => fileRef.current?.click()

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const fc = fcRef.current
    if (!file || !fc) return
    setError(null)
    try {
      const text = await file.text()
      const clean = await api.sanitize(text)
      const parsed = await fabric.loadSVGFromString(clean.svg)
      const objs = parsed.objects.filter(Boolean) as fabric.FabricObject[]
      if (objs.length === 0) {
        setError('Imported SVG had no drawable shapes.')
        return
      }
      const group = fabric.util.groupSVGElements(objs, parsed.options)
      const { W, H } = dims.current
      // Scale the import to about half the symbol and centre it.
      const target = Math.min(W, H) * 0.5
      const gw = group.getScaledWidth() || target
      const f = target / gw
      group.scale((group.scaleX ?? 1) * f)
      group.set({ left: W / 2, top: H / 2, originX: 'center', originY: 'center' })
      group.setCoords()
      fc.add(group)
      if (anchorRef.current) fc.bringObjectToFront(anchorRef.current)
      fc.setActiveObject(group)
      fc.requestRenderAll()
      setSelected(snapshot(group))
      refreshPreview()
      recordHistory()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Scale & position the selected object into the POI body box (from the
  // template, in viewBox units → converted to source pixels).
  const fitPoi = () => {
    const fc = fcRef.current
    const o = fc?.getActiveObject()
    const box = draft.bodyBox
    if (!fc || !o || !box) return
    const { W, vbW, H, vbH } = dims.current
    const sx = W / vbW
    const sy = H / vbH
    const x1 = box.x1 * sx
    const y1 = box.y1 * sy
    const x2 = box.x2 * sx
    const y2 = box.y2 * sy
    const bw = Math.abs(x2 - x1)
    const bh = Math.abs(y2 - y1)
    const ow = (o.width ?? 1) * 1
    const oh = (o.height ?? 1) * 1
    const f = Math.min(bw / ow, bh / oh)
    o.set({
      scaleX: f,
      scaleY: f,
      originX: 'center',
      originY: 'center',
      left: (x1 + x2) / 2,
      top: (y1 + y2) / 2
    })
    o.setCoords()
    fc.requestRenderAll()
    setSelected(snapshot(o))
    refreshPreview()
    recordHistory()
  }

  const openSource = () => {
    setSourceText(exportSvg())
    setShowSource(true)
  }

  const applySource = async () => {
    const fc = fcRef.current
    if (!fc) return
    setBusy(true)
    setError(null)
    try {
      const clean = await api.sanitize(sourceText)
      // Replace canvas content with the edited source.
      const anchor = anchorRef.current
      for (const o of fc.getObjects().slice()) {
        if (!isAnchor(o)) fc.remove(o)
      }
      const parsed = await fabric.loadSVGFromString(clean.svg)
      const objs = parsed.objects.filter(Boolean) as fabric.FabricObject[]
      for (const o of objs) {
        o.set({ selectable: true })
        fc.add(o)
      }
      if (anchor) fc.bringObjectToFront(anchor)
      const sz = svgSize(clean.svg)
      if (sz.viewBox) dims.current.vbW = sz.viewBox[2]
      fc.requestRenderAll()
      applyView(zoom)
      refreshPreview()
      recordHistory()
      setShowSource(false)
      if (clean.warnings.length) setError(`Sanitized: ${clean.warnings.join('; ')}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const svg = exportSvg()
    const payload = buildPayload(meta, svg, config)
    if (typeof payload === 'string') {
      setError(payload)
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (draft.mode === 'create') await api.create(payload)
      else await api.update(`${draft.namespace}:${draft.id}`, payload)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const previewDims = useMemo(() => svgSize(previewSvg), [previewSvg])

  return (
    <div className="editor">
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        style={{ display: 'none' }}
        onChange={onImportFile}
      />
      <div className="editor-header">
        <h2>
          {draft.mode === 'create' ? 'New symbol' : `Edit ${draft.namespace}:${draft.id}`}
        </h2>
        <div className="spacer" />
        <button onClick={onCancel} disabled={busy} className="tip" aria-label="Discard changes and return to the list">
          Cancel
        </button>
        <button
          className="primary tip"
          onClick={save}
          disabled={busy}
          aria-label="Sanitize and save the symbol to the library"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="editor-body">
        <div className="editor-canvas-col">
          <div className="tool-bar">
            <button onClick={() => addShape('rect')} className="tip" aria-label="Add a rectangle">▭</button>
            <button onClick={() => addShape('circle')} className="tip" aria-label="Add a circle">◯</button>
            <button onClick={() => addShape('line')} className="tip" aria-label="Add a line">╱</button>
            <button onClick={() => addShape('arrow')} className="tip" aria-label="Add an arrow">→</button>
            <button onClick={() => addShape('text')} className="tip" aria-label="Add a text label">T</button>
            <button onClick={onImportClick} className="tip" aria-label="Import an external SVG file as a shape">
              Import
            </button>
            <span className="tool-sep" />
            <button
              onClick={() => void undo()}
              disabled={!canUndo}
              className="tip"
              aria-label="Undo the last change (Cmd/Ctrl-Z)"
            >
              ↶ Undo
            </button>
            <span className="tool-sep" />
            <label
              className="zoom-slider tip"
              aria-label="Zoom the editor view in/out — visual only; does not change the symbol"
            >
              Zoom
              <input
                type="range"
                min={1}
                max={12}
                step={0.5}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
              <span className="zoom-label">{Math.round(fitZoom() * zoom * 100)}%</span>
            </label>
          </div>
          <div className="canvas-frame">
            <canvas ref={canvasElRef} width={VIEW_W} height={VIEW_H} />
          </div>
          <div className="editor-hint">
            Click a shape to select; click again to cycle through overlapping
            shapes. Drag the blue ⊕ to set the anchor point.
          </div>
          <button
            className="link tip"
            onClick={showSource ? () => setShowSource(false) : openSource}
            aria-label="View or edit the raw SVG markup (sanitized when applied)"
          >
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
                Sanitize &amp; apply to canvas
              </button>
            </div>
          ) : null}
        </div>

        <div className="editor-props">
          {selected ? (
            <>
              <h3>Shape</h3>
              <ShapeProperties
                shape={selected}
                canFitPoi={!!draft.bodyBox && selected.type === 'group'}
                onChange={applyShape}
                onDelete={deleteSelected}
                onFitPoi={fitPoi}
                onBringForward={() => reorder('forward')}
                onSendBackward={() => reorder('backward')}
              />
            </>
          ) : (
            <>
              <h3>Symbol properties</h3>
              <MetadataFields
                meta={meta}
                onChange={updateMeta}
                config={config}
                idLocked={draft.mode === 'edit'}
              />
            </>
          )}

          <div className="mini-preview">
            <h3>Preview</h3>
            <Preview
              svgText={previewSvg}
              nominalWidth={previewDims.width ?? dims.current.W}
              nominalHeight={previewDims.height ?? dims.current.H}
              scale={meta.scale.trim() === '' ? null : Number(meta.scale)}
              onScaleChange={(s) => updateMeta({ scale: String(s) })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

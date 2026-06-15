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

// Transient state while drawing a multi-point polygon/polyline. The committed
// edges are individual dashed Line segments; `rubber` tracks the cursor; the
// `startMarker` shows where to click to close the shape.
interface DrawState {
  points: { x: number; y: number }[]
  segments: fabric.Line[]
  rubber: fabric.Line
  startMarker: fabric.Circle
}

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
  const drawRef = useRef<DrawState | null>(null)
  const panRef = useRef({ active: false, startX: 0, startY: 0, startVpt: [1, 0, 0, 1, 0, 0] as number[] })
  // syncScroll is defined after applyView; this ref lets applyView and event
  // handlers (captured at mount time) always call the latest version.
  const syncScrollRef = useRef<() => void>(() => {})

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
  const [drawing, setDrawing] = useState(false)
  const [scroll, setScroll] = useState({ x: 0, y: 0, tw: 1, th: 1, showX: false, showY: false })

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
    syncScrollRef.current()
  }

  // Recompute scrollbar visibility / thumb positions from Fabric's actual
  // viewportTransform. Uses fc.getZoom() so it is safe to call from stale
  // closures inside useEffect([]) handlers.
  const syncScroll = () => {
    const fc = fcRef.current
    if (!fc) return
    const tz = fc.getZoom()
    const cw = dims.current.W * tz
    const ch = dims.current.H * tz
    const vpt = fc.viewportTransform
    const showX = cw > VIEW_W + 1
    const showY = ch > VIEW_H + 1
    const sx = showX ? Math.max(0, Math.min(1, -vpt[4] / (cw - VIEW_W))) : 0
    const sy = showY ? Math.max(0, Math.min(1, -vpt[5] / (ch - VIEW_H))) : 0
    const tw = showX ? Math.max(0.08, VIEW_W / cw) : 1
    const th = showY ? Math.max(0.08, VIEW_H / ch) : 1
    setScroll({ x: sx, y: sy, tw, th, showX, showY })
  }
  // Always keep the ref pointing at the latest closure.
  syncScrollRef.current = syncScroll

  // Begin a scrollbar-thumb drag. Called from onMouseDown on the thumb divs.
  const startScrollDrag = (axis: 'x' | 'y', e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const fc = fcRef.current
    if (!fc) return
    const startPos = axis === 'x' ? e.clientX : e.clientY
    const startVpt = [...fc.viewportTransform]
    const tz = fc.getZoom()
    const cw = dims.current.W * tz
    const ch = dims.current.H * tz
    // Capture thumb fraction at drag start so it stays stable for the whole drag.
    const thumbFrac = axis === 'x' ? Math.max(0.08, VIEW_W / cw) : Math.max(0.08, VIEW_H / ch)
    const onMove = (me: MouseEvent) => {
      const delta = (axis === 'x' ? me.clientX : me.clientY) - startPos
      const vpt = [...startVpt] as typeof fc.viewportTransform
      if (axis === 'x' && cw > VIEW_W) {
        const maxScroll = cw - VIEW_W
        const scrollable = VIEW_W * (1 - thumbFrac)
        const scrollDelta = scrollable > 0 ? (delta / scrollable) * maxScroll : 0
        vpt[4] = Math.max(VIEW_W - cw, Math.min(0, startVpt[4] - scrollDelta))
      } else if (axis === 'y' && ch > VIEW_H) {
        const maxScroll = ch - VIEW_H
        const scrollable = VIEW_H * (1 - thumbFrac)
        const scrollDelta = scrollable > 0 ? (delta / scrollable) * maxScroll : 0
        vpt[5] = Math.max(VIEW_H - ch, Math.min(0, startVpt[5] - scrollDelta))
      }
      fc.setViewportTransform(vpt)
      fc.requestRenderAll()
      syncScrollRef.current()
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
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
    // The anchor is excluded from canvas toJSON, so capture its position too,
    // making anchor moves undoable.
    const m = anchorRef.current
    const entry = JSON.stringify({
      c: fc.toJSON(),
      ax: m ? m.left ?? 0 : 0,
      ay: m ? m.top ?? 0 : 0
    })
    const h = historyRef.current
    if (histIdxRef.current >= 0 && h[histIdxRef.current] === entry) return
    h.length = histIdxRef.current + 1 // drop any forward states
    h.push(entry)
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

  const restoreFromJson = async (entryStr: string) => {
    const fc = fcRef.current
    if (!fc) return
    const entry = JSON.parse(entryStr) as { c: object; ax: number; ay: number }
    restoringRef.current = true
    const anchor = anchorRef.current
    try {
      await fc.loadFromJSON(entry.c)
      // loadFromJSON clears the canvas (anchor too); re-add the preserved anchor
      // at its recorded position.
      if (anchor) {
        anchor.set({ left: entry.ax, top: entry.ay })
        anchor.setCoords()
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
    // Sync the Anchor X/Y fields to the restored position. The marker is already
    // there, so the anchor-sync effect won't move it (and won't re-record).
    setMeta((prev) => ({
      ...prev,
      anchorX: String(round(entry.ax)),
      anchorY: String(round(entry.ay))
    }))
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

  // --- polygon / polyline drawing -----------------------------------------
  const TEMP_STROKE = '#1f6feb'

  const cleanupDraw = () => {
    const fc = fcRef.current
    const st = drawRef.current
    if (fc && st) {
      for (const s of st.segments) fc.remove(s)
      fc.remove(st.rubber)
      fc.remove(st.startMarker)
      fc.selection = true
      fc.skipTargetFind = false
      fc.defaultCursor = 'default'
      fc.requestRenderAll()
    }
    drawRef.current = null
    setDrawing(false)
  }

  const cancelPolygon = () => cleanupDraw()

  const finishPolygon = (closed: boolean) => {
    const fc = fcRef.current
    const st = drawRef.current
    if (!fc || !st) return
    // De-duplicate consecutive points (handles the double-click finish, whose
    // two underlying clicks land on the same spot).
    const tol = 1.5 / fc.getZoom()
    const pts: { x: number; y: number }[] = []
    for (const p of st.points) {
      const last = pts[pts.length - 1]
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > tol) pts.push(p)
    }
    cleanupDraw()
    const enough = closed ? pts.length >= 3 : pts.length >= 2
    if (!enough) {
      fc.requestRenderAll()
      return
    }
    const shape = closed
      ? new fabric.Polygon(pts, { fill: '#cccccc', stroke: '#000000', strokeWidth: 1 })
      : new fabric.Polyline(pts, { fill: '', stroke: '#000000', strokeWidth: 2 })
    shape.set({ selectable: true })
    fc.add(shape)
    if (anchorRef.current) fc.bringObjectToFront(anchorRef.current)
    fc.setActiveObject(shape)
    fc.requestRenderAll()
    setSelected(snapshot(shape))
    refreshPreview()
    recordHistory()
  }

  // A click while drawing: close on the start point (>=3 pts) or add a vertex.
  const handleDrawClick = (p: { x: number; y: number }) => {
    const fc = fcRef.current
    const st = drawRef.current
    if (!fc || !st) return
    const tol = 10 / fc.getZoom() // ~10 screen px tolerance around the start
    if (st.points.length >= 3) {
      const a = st.points[0]
      if (Math.hypot(p.x - a.x, p.y - a.y) <= tol) {
        finishPolygon(true)
        return
      }
    }
    if (st.points.length === 0) {
      st.startMarker.set({ left: p.x, top: p.y, visible: true })
      st.startMarker.setCoords()
      fc.bringObjectToFront(st.startMarker)
    } else {
      const prev = st.points[st.points.length - 1]
      const seg = new fabric.Line([prev.x, prev.y, p.x, p.y], {
        stroke: TEMP_STROKE,
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        strokeDashArray: [4, 3]
      })
      fc.add(seg)
      st.segments.push(seg)
      fc.bringObjectToFront(st.startMarker)
      if (anchorRef.current) fc.bringObjectToFront(anchorRef.current)
    }
    st.points.push(p)
    fc.requestRenderAll()
  }

  const moveRubber = (p: { x: number; y: number }) => {
    const fc = fcRef.current
    const st = drawRef.current
    if (!fc || !st || st.points.length === 0) return
    const last = st.points[st.points.length - 1]
    st.rubber.set({ x1: last.x, y1: last.y, x2: p.x, y2: p.y, visible: true })
    st.rubber.setCoords()
    fc.requestRenderAll()
  }

  const beginPolygon = () => {
    const fc = fcRef.current
    if (!fc) return
    if (drawRef.current) cleanupDraw()
    fc.discardActiveObject()
    setSelected(null)
    fc.selection = false
    fc.skipTargetFind = true
    fc.defaultCursor = 'crosshair'
    const rubber = new fabric.Line([0, 0, 0, 0], {
      stroke: TEMP_STROKE,
      strokeWidth: 1,
      selectable: false,
      evented: false,
      excludeFromExport: true,
      strokeDashArray: [4, 3],
      visible: false
    })
    const r = Math.max(2, Math.max(dims.current.W, dims.current.H) / 50)
    const startMarker = new fabric.Circle({
      radius: r,
      fill: '',
      stroke: TEMP_STROKE,
      strokeWidth: 1,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      excludeFromExport: true,
      visible: false
    })
    fc.add(rubber)
    fc.add(startMarker)
    drawRef.current = { points: [], segments: [], rubber, startMarker }
    setDrawing(true)
  }
  const beginPolygonRef = useRef(beginPolygon)
  beginPolygonRef.current = beginPolygon
  const cancelPolygonRef = useRef(cancelPolygon)
  cancelPolygonRef.current = cancelPolygon

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
    if (import.meta.env.DEV) {
      ;(window as unknown as { __fc?: unknown }).__fc = fc
    }

    // Make the selected object "sticky" for dragging. With preserveObjectStacking
    // (needed so click-cycling doesn't reorder z), Fabric's default findTarget
    // returns the TOP-most object under the pointer on mouse-down, which steals
    // the drag from a shape you cycled to underneath. Here, if a single object is
    // selected and you press inside its bounding box, keep it as the target so it
    // can be dragged. Selection changes still happen via the click-cycle on
    // mouse-up (a click without a drag). Controls (resize/rotate handles) and the
    // anchor fall through to the default behaviour.
    const baseFindTarget = fc.findTarget.bind(fc)
    type FT = typeof baseFindTarget
    const stickyFindTarget: FT = (e) => {
      // Pan mode (Shift held): don't pick any object so Fabric won't try to drag it.
      if ((e as MouseEvent).shiftKey) return undefined as ReturnType<FT>
      const active = fc.getActiveObject()
      if (
        active &&
        !isAnchor(active) &&
        !drawRef.current &&
        fc.getActiveObjects().length === 1 &&
        !active.findControl(
          fc.getViewportPoint(e as Parameters<typeof fc.getViewportPoint>[0]),
          false
        )
      ) {
        const sp = fc.getScenePoint(e as Parameters<typeof fc.getScenePoint>[0])
        if (active.containsPoint(sp)) return active
      }
      return baseFindTarget(e)
    }
    ;(fc as unknown as { findTarget: FT }).findTarget = stickyFindTarget

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
      const me = opt.e as MouseEvent
      if (me.shiftKey && !drawRef.current) {
        panRef.current.active = true
        panRef.current.startX = me.clientX
        panRef.current.startY = me.clientY
        panRef.current.startVpt = [...fc.viewportTransform]
        fc.selection = false
        fc.defaultCursor = 'grabbing'
        return
      }
      const p = fc.getScenePoint(opt.e as PtArg)
      if (drawRef.current) {
        handleDrawClick({ x: p.x, y: p.y })
        return
      }
      down.current = { x: p.x, y: p.y }
    }
    const onMove = (opt: { e: Event }) => {
      const me = opt.e as MouseEvent
      if (panRef.current.active) {
        const dx = me.clientX - panRef.current.startX
        const dy = me.clientY - panRef.current.startY
        const vpt = [...panRef.current.startVpt] as typeof fc.viewportTransform
        const tz = fc.getZoom()
        const cw = dims.current.W * tz
        const ch = dims.current.H * tz
        vpt[4] = cw > VIEW_W
          ? Math.max(VIEW_W - cw, Math.min(0, panRef.current.startVpt[4] + dx))
          : panRef.current.startVpt[4]
        vpt[5] = ch > VIEW_H
          ? Math.max(VIEW_H - ch, Math.min(0, panRef.current.startVpt[5] + dy))
          : panRef.current.startVpt[5]
        fc.setViewportTransform(vpt)
        fc.requestRenderAll()
        syncScrollRef.current()
        return
      }
      if (!drawRef.current) return
      const p = fc.getScenePoint(opt.e as PtArg)
      moveRubber({ x: p.x, y: p.y })
    }
    const onDblClick = () => {
      if (drawRef.current) finishPolygon(false)
    }
    // Wheel / trackpad scroll pans the view (rather than zooming). Two-finger
    // trackpad gestures supply deltaX/deltaY directly; a plain mouse wheel pans
    // vertically, and Shift+wheel pans horizontally. Only consumes the event
    // when there is something to pan, so the page can still scroll otherwise.
    const onWheel = (opt: { e: Event }) => {
      const e = opt.e as WheelEvent
      const tz = fc.getZoom()
      const cw = dims.current.W * tz
      const ch = dims.current.H * tz
      const canX = cw > VIEW_W + 1
      const canY = ch > VIEW_H + 1
      if (!canX && !canY) return
      let dx = e.deltaX
      let dy = e.deltaY
      if (e.shiftKey && dx === 0) {
        dx = dy
        dy = 0
      }
      e.preventDefault()
      e.stopPropagation()
      const vpt = fc.viewportTransform.slice() as typeof fc.viewportTransform
      if (canX) vpt[4] = Math.max(VIEW_W - cw, Math.min(0, vpt[4] - dx))
      if (canY) vpt[5] = Math.max(VIEW_H - ch, Math.min(0, vpt[5] - dy))
      fc.setViewportTransform(vpt)
      fc.requestRenderAll()
      syncScrollRef.current()
    }
    const onUp = (opt: { e: Event }) => {
      if (panRef.current.active) {
        panRef.current.active = false
        fc.selection = true
        fc.defaultCursor = (opt.e as MouseEvent).shiftKey ? 'grab' : 'default'
        return
      }
      if (drawRef.current) return
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
    fc.on('object:modified', () => {
      const a = fc.getActiveObject()
      if (a && !isAnchor(a)) setSelected(snapshot(a))
      refreshPreview()
      // Record handle-driven transforms (drag/scale/rotate). The anchor's
      // position is part of each snapshot, so dragging it is recorded here too.
      recordHistory()
    })
    fc.on('mouse:down', onDown)
    fc.on('mouse:move', onMove)
    fc.on('mouse:wheel', onWheel)
    fc.on('mouse:dblclick', onDblClick)
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
        // The marker is always drawn (defaulting to centre when the symbol has
        // no stored anchor). Reflect that position into the metadata right away
        // so the anchor is "set" to what the user sees — otherwise a symbol that
        // later gains a map-marker role fails the save-time anchor check until
        // the marker is nudged.
        setMeta((m) => ({
          ...m,
          anchorX: m.anchorX === '' ? String(round(ax)) : m.anchorX,
          anchorY: m.anchorY === '' ? String(round(ay)) : m.anchorY
        }))
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
      // The marker moved because the X/Y fields were edited (a drag would have
      // already matched). Record it (debounced); a no-op during restore.
      scheduleRecord()
    }
  }, [meta.anchorX, meta.anchorY, ready])

  // Backspace / Delete removes the selected shape(s) — unless the user is typing
  // in a form field or editing text on the canvas (Fabric uses a hidden
  // textarea while editing IText, which the tag check below catches).
  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        const fc = fcRef.current
        if (fc && !panRef.current.active) {
          fc.defaultCursor = drawRef.current ? 'crosshair' : 'default'
        }
      }
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || !!t?.isContentEditable
      // Shift held: hint the grab cursor over the canvas.
      if (e.key === 'Shift') {
        const fc = fcRef.current
        if (fc && !panRef.current.active && !drawRef.current) {
          fc.defaultCursor = 'grab'
        }
      }
      // Esc cancels an in-progress polygon.
      if (e.key === 'Escape' && drawRef.current) {
        e.preventDefault()
        cancelPolygonRef.current()
        return
      }
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
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // --- toolbar actions ----------------------------------------------------
  const addShape = (kind: ShapeKind) => {
    const fc = fcRef.current
    if (!fc) return
    if (drawRef.current) cleanupDraw()
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
    if ('fontFamily' in patch && patch.fontFamily !== undefined) {
      o.set('fontFamily', patch.fontFamily)
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
    recordHistory()
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
      // For a POI, fit the import into the note's body box (per the spec).
      // Otherwise scale to about half the symbol and centre it.
      if (!placeInPoiBody(group)) {
        const target = Math.min(W, H) * 0.5
        const gw = group.getScaledWidth() || target
        const f = target / gw
        group.scale((group.scaleX ?? 1) * f)
        group.set({ left: W / 2, top: H / 2, originX: 'center', originY: 'center' })
        group.setCoords()
      }
      fc.add(group)
      if (anchorRef.current) fc.bringObjectToFront(anchorRef.current)
      fc.requestRenderAll()
      refreshPreview()
      recordHistory()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Scale & centre an object inside the POI body box (from the template, in
  // viewBox units → converted to source pixels), preserving aspect ratio.
  // Returns false when there is no body box (i.e. not a POI template).
  const placeInPoiBody = (o: fabric.FabricObject): boolean => {
    const box = draft.bodyBox
    if (!box) return false
    const { W, vbW, H, vbH } = dims.current
    const sx = W / vbW
    const sy = H / vbH
    const x1 = box.x1 * sx
    const y1 = box.y1 * sy
    const x2 = box.x2 * sx
    const y2 = box.y2 * sy
    const bw = Math.abs(x2 - x1)
    const bh = Math.abs(y2 - y1)
    const ow = o.width || 1
    const oh = o.height || 1
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
    return true
  }

  // "Fit into POI body" button: re-apply the body-box fit to the selection.
  const fitPoi = () => {
    const fc = fcRef.current
    const o = fc?.getActiveObject()
    if (!fc || !o || !placeInPoiBody(o)) return
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
      else await api.update(draft.uuid!, payload)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const previewDims = useMemo(() => svgSize(previewSvg), [previewSvg])

  // Zoom slider works in displayed-percentage units: min = the fit zoom (the
  // whole symbol visible), max = 3000%, stepping 50 percentage points. The
  // internal `zoom` state is a multiplier on top of fitZoom(), so convert.
  const fz = fitZoom()
  const zoomMaxPct = 3000
  const zoomMinPct = Math.round(fz * 100)
  const zoomCurPct = Math.round(fz * zoom * 100)

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
          {draft.mode === 'create' ? 'New symbol' : `Edit ${draft.name}`}
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

      {/* Layout: in two-column mode the left column is the editor + Symbol
          Properties (identity); the right column is the Preview + Roles/Tags/
          Map-marker. In one-column mode the four blocks reflow to editor →
          preview → symbol properties → roles/tags/map-marker (the columns go
          `display: contents` and the blocks are ordered via CSS — see
          styles.css). The `eb-*` classes are the ordering hooks. */}
      <div className="editor-body">
        <div className="editor-canvas-col">
          <div className="eb-editor">
            <div className="tool-bar">
              <button onClick={() => addShape('rect')} className="tip" aria-label="Add a rectangle">▭</button>
              <button onClick={() => addShape('circle')} className="tip" aria-label="Add a circle">◯</button>
              <button onClick={() => addShape('line')} className="tip" aria-label="Add a line">╱</button>
              <button onClick={() => addShape('arrow')} className="tip" aria-label="Add an arrow">→</button>
              <button onClick={() => addShape('text')} className="tip" aria-label="Add a text label">T</button>
              <button
                onClick={() => (drawing ? cancelPolygon() : beginPolygon())}
                className={drawing ? 'tip active' : 'tip'}
                aria-label="Draw a polygon / polyline: click each point; double-click to finish as a line, or click the start point to close the shape"
              >
                ⬠
              </button>
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
                  min={zoomMinPct}
                  max={zoomMaxPct}
                  step={50}
                  value={Math.min(zoomMaxPct, Math.max(zoomMinPct, zoomCurPct))}
                  onChange={(e) => setZoom(Number(e.target.value) / 100 / fz)}
                />
                <span className="zoom-label">{zoomCurPct}%</span>
              </label>
            </div>
            <div className="canvas-frame">
              <canvas ref={canvasElRef} width={VIEW_W} height={VIEW_H} />
              {scroll.showX && (
                <div className="scroll-bar scroll-bar-x">
                  <div
                    className="scroll-thumb"
                    style={{
                      width: `${scroll.tw * 100}%`,
                      left: `${scroll.x * (1 - scroll.tw) * 100}%`
                    }}
                    onMouseDown={(e) => startScrollDrag('x', e)}
                  />
                </div>
              )}
              {scroll.showY && (
                <div className="scroll-bar scroll-bar-y">
                  <div
                    className="scroll-thumb"
                    style={{
                      height: `${scroll.th * 100}%`,
                      top: `${scroll.y * (1 - scroll.th) * 100}%`
                    }}
                    onMouseDown={(e) => startScrollDrag('y', e)}
                  />
                </div>
              )}
            </div>
            <div className="editor-hint">
              {drawing ? (
                <strong>
                  Polygon: click each point. Double-click to finish as a line, or
                  click the start point to close the shape. Esc cancels.
                </strong>
              ) : (
                <>
                  Click a shape to select; click again to cycle through overlapping
                  shapes. Drag the blue ⊕ to set the anchor point.{' '}
                  <strong>Shift+drag</strong> to pan when zoomed in.
                </>
              )}
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

          {/* Symbol Properties (id/namespace/name/description/GPX) sit directly
              under the editor. Hidden while a shape is selected. */}
          {!selected ? (
            <div className="props-block eb-symbol-props">
              <h3>Symbol properties</h3>
              <MetadataFields
                meta={meta}
                onChange={updateMeta}
                config={config}
                sections="identity"
              />
            </div>
          ) : null}
        </div>

        <div className="editor-props">
          <div className="preview-block eb-preview">
            <h3>Preview</h3>
            <Preview
              svgText={previewSvg}
              nominalWidth={previewDims.width ?? dims.current.W}
              nominalHeight={previewDims.height ?? dims.current.H}
              scale={meta.scale.trim() === '' ? null : Number(meta.scale)}
              onScaleChange={(s) => updateMeta({ scale: String(s) })}
            />
          </div>

          {/* Under the preview: the selected shape's properties, or — with
              nothing selected — the Roles/Tags/Map-marker metadata. */}
          <div className="props-block eb-side-props">
            {selected ? (
              <>
                <h3>Shape</h3>
                <ShapeProperties
                  shape={selected}
                  canFitPoi={!!draft.bodyBox}
                  onChange={applyShape}
                  onDelete={deleteSelected}
                  onFitPoi={fitPoi}
                  onBringForward={() => reorder('forward')}
                  onSendBackward={() => reorder('backward')}
                />
              </>
            ) : (
              <>
                <h3>Roles, tags &amp; map-marker</h3>
                <MetadataFields
                  meta={meta}
                  onChange={updateMeta}
                  config={config}
                  sections="classification"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

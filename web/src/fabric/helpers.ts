// Fabric.js v6 helpers for the symbol editor: shape factory, the editor-only
// anchor-point marker, a serializable snapshot of a selected object, and
// z-order hit testing for click-cycling.

import * as fabric from 'fabric'
import { ShapeSnapshot } from '../components/ShapeProperties'

export type ShapeKind = 'rect' | 'circle' | 'line' | 'arrow' | 'text'

const round = (n: number) => Math.round(n * 100) / 100

// A draggable, editor-only marker representing the symbol's anchor point. It is
// excluded from SVG export and can only be moved (no scale/rotate). Its center
// (left/top with center origin) is the anchor position in source pixels.
export function createAnchorMarker(scale: number): fabric.FabricObject {
  const r = 6 * scale
  const ring = new fabric.Circle({
    left: 0,
    top: 0,
    originX: 'center',
    originY: 'center',
    radius: r,
    fill: 'rgba(31,111,235,0.18)',
    stroke: '#1f6feb',
    strokeWidth: 1.5 * scale
  })
  const hLine = new fabric.Line([-r * 1.4, 0, r * 1.4, 0], {
    stroke: '#1f6feb',
    strokeWidth: 1 * scale
  })
  const vLine = new fabric.Line([0, -r * 1.4, 0, r * 1.4], {
    stroke: '#1f6feb',
    strokeWidth: 1 * scale
  })
  const marker = new fabric.Group([ring, hLine, vLine], {
    originX: 'center',
    originY: 'center',
    selectable: true,
    hasControls: false,
    hasBorders: false,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    excludeFromExport: true,
    hoverCursor: 'move',
    objectCaching: false
  })
  // Tag for identification.
  ;(marker as unknown as { isAnchor: boolean }).isAnchor = true
  return marker
}

export function isAnchor(obj: fabric.FabricObject | null | undefined): boolean {
  return !!obj && (obj as unknown as { isAnchor?: boolean }).isAnchor === true
}

export function makeShape(
  kind: ShapeKind,
  cx: number,
  cy: number,
  size: number
): fabric.FabricObject {
  const common = { left: cx, top: cy, originX: 'center' as const, originY: 'center' as const }
  switch (kind) {
    case 'rect':
      return new fabric.Rect({
        ...common,
        width: size,
        height: size * 0.7,
        fill: '#cccccc',
        stroke: '#000000',
        strokeWidth: 1
      })
    case 'circle':
      return new fabric.Circle({
        ...common,
        radius: size / 2,
        fill: '#cccccc',
        stroke: '#000000',
        strokeWidth: 1
      })
    case 'line':
      return new fabric.Line([cx - size / 2, cy, cx + size / 2, cy], {
        stroke: '#000000',
        strokeWidth: 2
      })
    case 'arrow':
      return new fabric.Path(
        `M 0 0 L ${size} 0 M ${size - 8} -6 L ${size} 0 L ${size - 8} 6`,
        {
          ...common,
          stroke: '#000000',
          strokeWidth: 2,
          fill: 'transparent'
        }
      )
    case 'text':
      return new fabric.IText('Text', {
        ...common,
        fontSize: Math.max(12, size * 0.5),
        fontFamily: 'sans-serif',
        fill: '#000000'
      })
  }
}

export function snapshot(o: fabric.FabricObject): ShapeSnapshot {
  const type = o.type
  const isText = type === 'i-text' || type === 'text' || type === 'textbox'
  return {
    type,
    isText,
    text: (o as unknown as { text?: string }).text ?? '',
    left: round(o.left ?? 0),
    top: round(o.top ?? 0),
    width: round(o.getScaledWidth()),
    height: round(o.getScaledHeight()),
    fill: typeof o.fill === 'string' ? o.fill : '',
    stroke: typeof o.stroke === 'string' ? o.stroke : '',
    strokeWidth: o.strokeWidth ?? 0,
    opacity: o.opacity ?? 1,
    fontFamily: (o as unknown as { fontFamily?: string }).fontFamily ?? 'sans-serif'
  }
}

// Objects (excluding the anchor) whose bounding contains the scene point,
// returned top-of-stack first.
export function objectsAtPoint(
  canvas: fabric.Canvas,
  point: fabric.Point
): fabric.FabricObject[] {
  const hits: fabric.FabricObject[] = []
  for (const o of canvas.getObjects()) {
    if (isAnchor(o)) continue
    if (o.containsPoint(point)) hits.push(o)
  }
  return hits.reverse() // top-of-stack first
}

// Shape/text-specific properties shown in the editor when an object is selected.

export interface ShapeSnapshot {
  type: string
  isText: boolean
  text: string
  left: number
  top: number
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
  fontFamily: string
}

// Common SVG-safe font families. Listed by generic CSS family first so they
// render predictably on any platform that displays the exported symbol.
const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: 'Sans-serif (default)', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Impact', value: 'Impact, sans-serif' }
]

const TYPE_LABELS: Record<string, string> = {
  rect: 'Rectangle',
  circle: 'Circle',
  ellipse: 'Ellipse',
  line: 'Line',
  'i-text': 'Text',
  text: 'Text',
  textbox: 'Text',
  path: 'Path / Arrow',
  polygon: 'Polygon',
  polyline: 'Polyline',
  triangle: 'Triangle',
  group: 'Imported group',
  image: 'Image',
  activeselection: 'Multiple shapes'
}

function colorOrHex(v: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000'
}

interface Props {
  shape: ShapeSnapshot
  canFitPoi: boolean
  onChange: (patch: Partial<ShapeSnapshot>) => void
  onDelete: () => void
  onFitPoi: () => void
  onBringForward: () => void
  onSendBackward: () => void
}

export function ShapeProperties({
  shape,
  canFitPoi,
  onChange,
  onDelete,
  onFitPoi,
  onBringForward,
  onSendBackward
}: Props) {
  return (
    <div className="shape-props">
      <div className="shape-type">{TYPE_LABELS[shape.type] || shape.type}</div>

      {shape.isText ? (
        <>
          <label>
            Text
            <input
              value={shape.text}
              onChange={(e) => onChange({ text: e.target.value })}
            />
          </label>
          <label>
            Font
            <select
              value={shape.fontFamily}
              onChange={(e) => onChange({ fontFamily: e.target.value })}
            >
              {/* If the shape carries an unknown family (e.g. an imported SVG),
                  surface it so the user can see what's in use. */}
              {FONT_FAMILIES.find((f) => f.value === shape.fontFamily) ? null : (
                <option value={shape.fontFamily}>{shape.fontFamily} (custom)</option>
              )}
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      <div className="xywh">
        <label>
          X
          <input
            type="number"
            value={shape.left}
            onChange={(e) => onChange({ left: Number(e.target.value) })}
          />
        </label>
        <label>
          Y
          <input
            type="number"
            value={shape.top}
            onChange={(e) => onChange({ top: Number(e.target.value) })}
          />
        </label>
        <label>
          W
          <input
            type="number"
            value={shape.width}
            onChange={(e) => onChange({ width: Number(e.target.value) })}
          />
        </label>
        <label>
          H
          <input
            type="number"
            value={shape.height}
            onChange={(e) => onChange({ height: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="color-row">
        <label className="color-field">
          Fill
          <input
            type="color"
            value={colorOrHex(shape.fill)}
            onChange={(e) => onChange({ fill: e.target.value })}
          />
        </label>
        <button
          className="link tip"
          onClick={() => onChange({ fill: 'transparent' })}
          aria-label="Remove the fill (transparent)"
        >
          none
        </button>
        <label className="color-field">
          Outline
          <input
            type="color"
            value={colorOrHex(shape.stroke)}
            onChange={(e) => onChange({ stroke: e.target.value })}
          />
        </label>
      </div>

      <label>
        Outline width
        <input
          type="number"
          min={0}
          step={0.05}
          value={shape.strokeWidth}
          onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
        />
      </label>

      <label>
        Opacity {Math.round(shape.opacity * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={shape.opacity}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
        />
      </label>

      <div className="shape-actions">
        <button className="tip" aria-label="Move this shape up one in stacking order" onClick={onBringForward}>
          Bring forward
        </button>
        <button className="tip" aria-label="Move this shape down one in stacking order" onClick={onSendBackward}>
          Send backward
        </button>
      </div>
      {canFitPoi ? (
        <button className="tip" onClick={onFitPoi} aria-label="Scale and position this shape into the POI body area">
          Fit into POI body
        </button>
      ) : null}
      <button className="danger tip" onClick={onDelete} aria-label="Delete this shape">
        Delete shape
      </button>
    </div>
  )
}

// Preview of the symbol over a sample nautical-chart background, rendered at its
// displayed size (source dimensions * scale) — matching the OpenLayers Icon
// model Freeboard uses. The slider controls the symbol's `scale` metadata
// directly (it edits the Scale field), so you can dial in how the marker looks
// on the chart. The anchor point is an editor-canvas concern and isn't drawn.

import previewBackground from '../assets/preview-background.png'
import { svgToDataUrl } from '../svg'

interface Props {
  svgText: string
  nominalWidth: number | null
  nominalHeight: number | null
  scale: number | null
  // When provided, the Scale slider is shown and updates the scale metadata.
  onScaleChange?: (scale: number) => void
}

const SCALE_MIN = 0.4
const SCALE_MAX = 1.5
const DEFAULT_SCALE = 0.65
const round2 = (n: number) => Math.round(n * 100) / 100

export function Preview({
  svgText,
  nominalWidth,
  nominalHeight,
  scale,
  onScaleChange
}: Props) {
  const sw = nominalWidth ?? 0
  const sh = nominalHeight ?? 0
  const effScale = scale ?? 1
  const dispW = Math.max(sw * effScale, 1)
  const dispH = Math.max(sh * effScale, 1)

  return (
    <div className="preview">
      <div
        className="preview-stage"
        style={{ backgroundImage: `url(${previewBackground})` }}
      >
        <div className="preview-frame" style={{ width: `${dispW}px`, height: `${dispH}px` }}>
          {svgText ? (
            <img
              src={svgToDataUrl(svgText)}
              alt="symbol preview"
              style={{ width: `${dispW}px`, height: `${dispH}px` }}
            />
          ) : null}
        </div>
      </div>
      <div className="preview-meta">
        <div>
          Source: {sw || '?'}&times;{sh || '?'} px
        </div>
        <div>
          Display: {dispW ? dispW.toFixed(1) : '?'}&times;{dispH ? dispH.toFixed(1) : '?'} px
        </div>
        {onScaleChange ? (
          <label className="zoom">
            Scale {effScale}
            <input
              type="range"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={0.05}
              value={Math.min(SCALE_MAX, Math.max(SCALE_MIN, effScale))}
              onChange={(e) => onScaleChange(round2(Number(e.target.value)))}
            />
            <button
              type="button"
              className="link tip"
              aria-label={`Reset scale to the default (${DEFAULT_SCALE})`}
              onClick={() => onScaleChange(DEFAULT_SCALE)}
            >
              reset
            </button>
          </label>
        ) : null}
      </div>
    </div>
  )
}

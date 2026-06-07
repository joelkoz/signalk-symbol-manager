// Freeboard-accurate preview. Renders the symbol at displayed size
// (source dimensions * scale) and overlays the anchor point at anchor*scale
// from the rendered top-left, matching the OpenLayers Icon model Freeboard uses.
// A magnification slider enlarges the whole preview for visibility without
// changing the underlying scale/anchor metadata.

import { useState } from 'react'
import { svgToDataUrl } from '../svg'

interface Props {
  svgText: string
  nominalWidth: number | null
  nominalHeight: number | null
  scale: number | null
  anchor: [number, number] | null
}

export function Preview({ svgText, nominalWidth, nominalHeight, scale, anchor }: Props) {
  const [zoom, setZoom] = useState(4)
  const sw = nominalWidth ?? 0
  const sh = nominalHeight ?? 0
  const effScale = scale ?? 1
  const dispW = sw * effScale
  const dispH = sh * effScale
  const showAnchor = anchor !== null && sw > 0 && sh > 0

  const previewW = Math.max(dispW * zoom, 1)
  const previewH = Math.max(dispH * zoom, 1)
  const anchorLeft = anchor ? anchor[0] * effScale * zoom : 0
  const anchorTop = anchor ? anchor[1] * effScale * zoom : 0

  return (
    <div className="preview">
      <div className="preview-stage">
        <div
          className="preview-frame"
          style={{ width: `${previewW}px`, height: `${previewH}px` }}
        >
          {svgText ? (
            <img
              src={svgToDataUrl(svgText)}
              alt="symbol preview"
              style={{ width: `${previewW}px`, height: `${previewH}px` }}
            />
          ) : null}
          {showAnchor ? (
            <div
              className="anchor-dot"
              style={{ left: `${anchorLeft}px`, top: `${anchorTop}px` }}
              title={`anchor [${anchor![0]}, ${anchor![1]}]`}
            />
          ) : null}
        </div>
      </div>
      <div className="preview-meta">
        <div>
          Source: {sw || '?'}&times;{sh || '?'} px
        </div>
        <div>
          Freeboard display: {dispW ? dispW.toFixed(1) : '?'}&times;
          {dispH ? dispH.toFixed(1) : '?'} px (scale {effScale})
        </div>
        <label className="zoom">
          Magnify {zoom}&times;
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  )
}

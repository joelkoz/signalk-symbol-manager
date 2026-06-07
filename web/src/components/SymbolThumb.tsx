// List thumbnail. Renders the symbol at its Freeboard display size
// (source * scale) within a fixed cell, so the list column reflects how big the
// marker appears on the chart. Symbols without a scale render at natural size.

import { SymbolView } from '../types'

const CELL = 56

export function SymbolThumb({ symbol }: { symbol: SymbolView }) {
  const scale = symbol.scale ?? 1
  const w = symbol.width ? symbol.width * scale : null
  const h = symbol.height ? symbol.height * scale : null
  const style: React.CSSProperties =
    w && h
      ? { width: `${w}px`, height: `${h}px`, maxWidth: `${CELL}px`, maxHeight: `${CELL}px` }
      : { maxWidth: `${CELL}px`, maxHeight: `${CELL}px` }
  return (
    <div className="thumb-cell">
      <img src={symbol.url} alt={symbol.name} style={style} />
    </div>
  )
}

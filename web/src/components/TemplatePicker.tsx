// Step shown after "New": the user must pick a starter template before the
// editor/form appears. Templates come from the server (templates/templates.json).

import { useEffect, useState } from 'react'
import { api } from '../api'
import { SymbolTemplate } from '../types'
import { svgToDataUrl } from '../svg'

interface Props {
  onPick: (template: SymbolTemplate) => void
  onCancel: () => void
}

export function TemplatePicker({ onPick, onCancel }: Props) {
  const [templates, setTemplates] = useState<SymbolTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .templates()
      .then(setTemplates)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Choose a starter template</h2>
        {error ? <div className="error">{error}</div> : null}
        {!templates ? (
          <div>Loading templates&hellip;</div>
        ) : (
          <div className="template-grid">
            {templates.map((t) => (
              <button
                key={t.key}
                className="template-card"
                onClick={() => onPick(t)}
              >
                <img className="template-thumb" src={svgToDataUrl(t.svg)} alt={t.name} />
                <div className="template-name">{t.name}</div>
                <div className="template-desc">{t.description}</div>
              </button>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

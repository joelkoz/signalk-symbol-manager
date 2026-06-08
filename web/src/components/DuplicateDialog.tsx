// Modal shown by the "Duplicate" action. Collects a new id and namespace in a
// single dialog so a copy can reuse the same id under a different namespace
// (which makes it an alternate of the original). Stays open on error so the
// user can resolve a collision without re-opening.

import { useState } from 'react'
import { SymbolView } from '../types'

interface Props {
  source: SymbolView
  error?: string | null
  busy?: boolean
  onSubmit: (newId: string, newNamespace: string) => void
  onCancel: () => void
}

export function DuplicateDialog({ source, error, busy, onSubmit, onCancel }: Props) {
  const [id, setId] = useState(`${source.id}-copy`)
  const [namespace, setNamespace] = useState(source.namespace)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!id.trim()) return
    onSubmit(id.trim(), namespace.trim())
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>Duplicate &ldquo;{source.key}&rdquo;</h2>
        {error ? <div className="error">{error}</div> : null}
        <div className="metadata-fields">
          <label>
            New id
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="dive-site"
              autoFocus
            />
          </label>
          <label>
            Namespace
            <input
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="user"
            />
          </label>
          <p className="field-hint">
            Keep the same id but change the namespace to make this copy an
            alternate of the original under <code>namespace:id</code>.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !id.trim()}>
            Duplicate
          </button>
        </div>
      </form>
    </div>
  )
}

// Modal shown by the "Duplicate" action. Collects the first alias for the copy
// (namespace + id). The copy is a new symbol with its own immutable uuid; it
// reuses the source's SVG and metadata. Stays open on error so the user can
// resolve a collision without re-opening.

import { useState } from 'react'
import { SymbolView, parseAliasRow } from '../types'

interface Props {
  source: SymbolView
  error?: string | null
  busy?: boolean
  onSubmit: (alias: string, newName?: string) => void
  onCancel: () => void
}

export function DuplicateDialog({ source, error, busy, onSubmit, onCancel }: Props) {
  const first = source.alias.length
    ? parseAliasRow(source.alias[0])
    : { namespace: 'custom', id: source.name }
  const [id, setId] = useState(`${first.id}-copy`)
  const [namespace, setNamespace] = useState(first.namespace)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!id.trim() || !namespace.trim()) return
    onSubmit(`${namespace.trim()}:${id.trim()}`)
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>Duplicate &ldquo;{source.name}&rdquo;</h2>
        {error ? <div className="error">{error}</div> : null}
        <div className="metadata-fields">
          <label>
            New namespace
            <input
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="custom"
            />
          </label>
          <label>
            New id
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="dive-site-copy"
              autoFocus
            />
          </label>
          <p className="field-hint">
            The copy starts with this single <code>namespace:id</code> alias; add
            more in the editor. It gets its own identity and can be edited freely.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !id.trim() || !namespace.trim()}
          >
            Duplicate
          </button>
        </div>
      </form>
    </div>
  )
}

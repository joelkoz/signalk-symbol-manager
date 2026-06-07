// Main CRUD list view: a row per managed symbol with its Freeboard-size
// rendering, name, description, roles/tags, and Edit / Duplicate / Delete
// actions. Shows an empty state when the library has no symbols.

import { SymbolView } from '../types'
import { SymbolThumb } from './SymbolThumb'

interface Props {
  symbols: SymbolView[]
  loading: boolean
  onNew: () => void
  onUpload: () => void
  onRefresh: () => void
  onEdit: (s: SymbolView) => void
  onDuplicate: (s: SymbolView) => void
  onDelete: (s: SymbolView) => void
}

export function SymbolList({
  symbols,
  loading,
  onNew,
  onUpload,
  onRefresh,
  onEdit,
  onDuplicate,
  onDelete
}: Props) {
  return (
    <div className="list-view">
      <div className="toolbar">
        <h1>Symbol Manager</h1>
        <div className="spacer" />
        <button onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button onClick={onUpload}>Upload SVG</button>
        <button className="primary" onClick={onNew}>
          New
        </button>
      </div>

      {symbols.length === 0 && !loading ? (
        <div className="empty">
          <p>No symbols yet.</p>
          <p>
            Create one with <strong>New</strong> (from a template) or{' '}
            <strong>Upload SVG</strong> to import an existing file.
          </p>
        </div>
      ) : (
        <table className="symbol-table">
          <thead>
            <tr>
              <th className="col-symbol">Symbol</th>
              <th>Name</th>
              <th>Description</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map((s) => (
              <tr key={s.key}>
                <td className="col-symbol">
                  <SymbolThumb symbol={s} />
                </td>
                <td>
                  <div className="sym-name">{s.name}</div>
                  <div className="sym-key">{s.key}</div>
                  {s.roles.length ? (
                    <div className="sym-roles">
                      {s.roles.map((r) => (
                        <span key={r} className="role-chip">
                          {r}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {s.tags.length ? (
                    <div className="sym-tags">
                      {s.tags.map((t) => (
                        <span key={t} className="tag-chip">
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="sym-desc">{s.description}</td>
                <td className="col-actions">
                  <button onClick={() => onEdit(s)}>Edit</button>
                  <button onClick={() => onDuplicate(s)}>Duplicate</button>
                  <button className="danger" onClick={() => onDelete(s)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

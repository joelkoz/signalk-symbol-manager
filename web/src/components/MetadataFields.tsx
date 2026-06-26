// Symbol-wide property fields shared by the upload form and the visual editor:
// id, namespace, name, description, roles (checkboxes), tags (tag editor), and
// map-marker scale / anchor. Controlled via a `meta` object + `onChange` patch.

import { Fragment, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { TagsInput } from 'react-tag-input-component'
import { matchingKnownAliases } from '../knownAliases'
import type { AliasAutocompleteField, KnownAlias } from '../knownAliases'
import { AliasRow, AppConfig, SymbolMeta } from '../types'

// Which groups of fields to render. The visual editor splits the panel:
// `identity` (id/namespace/name/description/GPX) on the right next to the
// preview, and `classification` (roles/tags/map-marker) under the canvas. The
// upload form renders `all` in a single column.
export type MetaSection = 'all' | 'identity' | 'classification'

interface Props {
  meta: SymbolMeta
  onChange: (patch: Partial<SymbolMeta>) => void
  config: AppConfig
  sections?: MetaSection
}

export function isMapMarker(roles: string[], config: AppConfig): boolean {
  return roles.some((r) => config.mapMarkerRoles.includes(r))
}

// Variable-length editor for a symbol's `<namespace>:<id>` aliases. A symbol may
// carry several so it can be matched by different chartplotters (e.g.
// `custom:dive-flag`, `fsk:dive-site`, `garmin:Diver Down Flag 1`). At least one
// alias is required; the immutable uuid identifies the symbol, so editing
// aliases never renames anything on disk.
function AliasEditor({
  alias,
  defaultNamespace,
  onChange
}: {
  alias: AliasRow[]
  defaultNamespace: string
  onChange: (alias: AliasRow[]) => void
}) {
  const listboxBaseId = useId()
  const [activeInput, setActiveInput] = useState<{
    row: number
    field: AliasAutocompleteField
  } | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const rows = alias.length ? alias : [{ namespace: defaultNamespace, id: '' }]
  const setRow = (i: number, patch: Partial<AliasRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () =>
    onChange([...rows, { namespace: defaultNamespace, id: '' }])
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  const selectSuggestion = (i: number, suggestion: KnownAlias) => {
    setRow(i, { namespace: suggestion.namespace, id: suggestion.id })
    setHighlightedIndex(0)
    setActiveInput(null)
  }
  const activateInput = (row: number, field: AliasAutocompleteField) => {
    setActiveInput({ row, field })
    setHighlightedIndex(0)
  }
  const onComboKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    i: number,
    field: AliasAutocompleteField,
    suggestions: KnownAlias[]
  ) => {
    if (!suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveInput({ row: i, field })
      setHighlightedIndex((n) => (n + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveInput({ row: i, field })
      setHighlightedIndex((n) => (n - 1 + suggestions.length) % suggestions.length)
    } else if (
      e.key === 'Enter' &&
      activeInput?.row === i &&
      activeInput.field === field
    ) {
      e.preventDefault()
      selectSuggestion(i, suggestions[highlightedIndex] ?? suggestions[0])
    } else if (e.key === 'Escape') {
      setActiveInput(null)
      setHighlightedIndex(0)
    }
  }
  const renderCombobox = (
    i: number,
    field: AliasAutocompleteField,
    suggestions: KnownAlias[],
    listboxId: string
  ) =>
    activeInput?.row === i && activeInput.field === field && suggestions.length ? (
      <div
        id={listboxId}
        role="listbox"
        className="alias-combobox"
        aria-label={`Known aliases matching row ${i + 1}`}
      >
        {suggestions.map((suggestion, idx) => (
          <div
            id={`${listboxId}-option-${idx}`}
            key={suggestion.label}
            role="option"
            aria-selected={idx === highlightedIndex}
            className={
              idx === highlightedIndex
                ? 'alias-combobox-option active'
                : 'alias-combobox-option'
            }
            onMouseEnter={() => setHighlightedIndex(idx)}
            onMouseDown={(e) => {
              e.preventDefault()
              selectSuggestion(i, suggestion)
            }}
          >
            <span>{suggestion.namespace}</span>
            <strong>{suggestion.id}</strong>
          </div>
        ))}
      </div>
    ) : null

  return (
    <fieldset className="alias-editor required">
      <legend>Aliases (at least one)</legend>
      <table className="alias-table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Id</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const activeField =
              activeInput?.row === i ? activeInput.field : undefined
            const suggestions = activeField
              ? matchingKnownAliases(r, undefined, activeField)
              : []
            const namespaceListboxId = `${listboxBaseId}-alias-${i}-namespace`
            const idListboxId = `${listboxBaseId}-alias-${i}-id`
            const open = activeInput?.row === i && suggestions.length > 0
            return (
              <Fragment key={i}>
                <tr>
                  <td className="alias-combo-cell">
                    <input
                      value={r.namespace}
                      onChange={(e) => {
                        setRow(i, { namespace: e.target.value })
                        activateInput(i, 'namespace')
                      }}
                      onFocus={() => activateInput(i, 'namespace')}
                      onBlur={() => window.setTimeout(() => setActiveInput(null), 120)}
                      onKeyDown={(e) =>
                        onComboKeyDown(e, i, 'namespace', suggestions)
                      }
                      placeholder="custom"
                      role="combobox"
                      aria-label={`Alias ${i + 1} namespace`}
                      aria-autocomplete="list"
                      aria-controls={namespaceListboxId}
                      aria-expanded={open && activeField === 'namespace'}
                      aria-haspopup="listbox"
                      aria-activedescendant={
                        open && activeField === 'namespace'
                          ? `${namespaceListboxId}-option-${highlightedIndex}`
                          : undefined
                      }
                    />
                    {renderCombobox(i, 'namespace', suggestions, namespaceListboxId)}
                  </td>
                  <td className="alias-combo-cell">
                    <input
                      value={r.id}
                      onChange={(e) => {
                        setRow(i, { id: e.target.value })
                        activateInput(i, 'id')
                      }}
                      onFocus={() => activateInput(i, 'id')}
                      onBlur={() => window.setTimeout(() => setActiveInput(null), 120)}
                      onKeyDown={(e) => onComboKeyDown(e, i, 'id', suggestions)}
                      placeholder="dive-site"
                      role="combobox"
                      aria-label={`Alias ${i + 1} id`}
                      aria-autocomplete="list"
                      aria-controls={idListboxId}
                      aria-expanded={open && activeField === 'id'}
                      aria-activedescendant={
                        open && activeField === 'id'
                          ? `${idListboxId}-option-${highlightedIndex}`
                          : undefined
                      }
                    />
                    {renderCombobox(i, 'id', suggestions, idListboxId)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link danger"
                      disabled={rows.length <= 1}
                      title={
                        rows.length <= 1
                          ? 'At least one alias is required'
                          : 'Remove alias'
                      }
                      onClick={() => removeRow(i)}
                    >
                      remove
                    </button>
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
      <button type="button" className="link" onClick={addRow}>
        + add alias
      </button>
      <p className="field-hint">
        Vendor namespaces let other apps match this symbol — e.g. <code>fsk:</code>{' '}
        for Freeboard built-ins, <code>custom:</code> for your own symbols. The
        symbol's identity (uuid) and file never change when aliases are edited.
      </p>
    </fieldset>
  )
}

export function MetadataFields({
  meta,
  onChange,
  config,
  sections = 'all'
}: Props) {
  const mapMarker = isMapMarker(meta.roles, config)
  const showIdentity = sections === 'all' || sections === 'identity'
  const showClassification = sections === 'all' || sections === 'classification'

  const toggleRole = (role: string) => {
    const roles = meta.roles.includes(role)
      ? meta.roles.filter((r) => r !== role)
      : [...meta.roles, role]
    onChange({ roles })
  }

  return (
    <div className="metadata-fields">
      {showIdentity ? (
        <>
          <AliasEditor
            alias={meta.alias}
            defaultNamespace={config.defaultNamespace}
            onChange={(alias) => onChange({ alias })}
          />
          <label>
            Name
            <input
              value={meta.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Dive Site"
            />
          </label>
          <label>
            Description
            <input
              value={meta.description}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </label>

          <fieldset>
            <legend>GPX mapping (optional)</legend>
            <label>
              GPX Type
              <input
                value={meta.gpxType}
                onChange={(e) => onChange({ gpxType: e.target.value })}
                placeholder="e.g. Dive Site"
              />
            </label>
            <label>
              GPX Sym
              <input
                value={meta.gpxSym}
                onChange={(e) => onChange({ gpxSym: e.target.value })}
                placeholder="e.g. Scuba Flag"
              />
            </label>
          </fieldset>
        </>
      ) : null}

      {showClassification ? (
        <>
          <fieldset>
            <legend>Roles</legend>
            <div className="roles">
              {config.roles.map((role) => (
                <label key={role} className="checkbox">
                  <input
                    type="checkbox"
                    checked={meta.roles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {role}
                  {config.mapMarkerRoles.includes(role) ? (
                    <span className="badge">chart</span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <span className="field-label">Tags</span>
            <TagsInput
              value={meta.tags}
              onChange={(tags) => onChange({ tags })}
              name="tags"
              placeHolder="add tag + Enter"
            />
          </div>

          <fieldset className={mapMarker ? 'required' : ''}>
            <legend>
              Map-marker metadata {mapMarker ? '(required)' : '(optional)'}
            </legend>
            <label>
              Scale
              <input
                value={meta.scale}
                onChange={(e) => onChange({ scale: e.target.value })}
                placeholder="0.65"
              />
            </label>
            <div className="anchor-fields">
              <label>
                Anchor X
                <input
                  value={meta.anchorX}
                  onChange={(e) => onChange({ anchorX: e.target.value })}
                  placeholder="1"
                />
              </label>
              <label>
                Anchor Y
                <input
                  value={meta.anchorY}
                  onChange={(e) => onChange({ anchorY: e.target.value })}
                  placeholder="37"
                />
              </label>
            </div>
          </fieldset>
        </>
      ) : null}
    </div>
  )
}

const NS_RE = /^[A-Za-z0-9_-]+$/
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

// Validate metadata + svg into a save payload, or return an error string.
export function buildPayload(
  meta: SymbolMeta,
  svg: string,
  config: AppConfig
): string | Record<string, unknown> {
  // Aliases: keep non-empty rows, validate each, de-duplicate.
  const aliasStrings: string[] = []
  const seen = new Set<string>()
  for (const r of meta.alias) {
    const ns = r.namespace.trim()
    const id = r.id.trim()
    if (ns === '' && id === '') continue
    if (!NS_RE.test(ns)) return `alias namespace "${ns}" must match [A-Za-z0-9_-]+`
    if (ns === 'default') return 'alias namespace "default" is reserved'
    if (!ID_RE.test(id))
      return `alias id "${id}" must start with a letter/digit and use letters, digits, "-" or "_"`
    const key = `${ns}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    aliasStrings.push(key)
  }
  if (aliasStrings.length === 0) return 'at least one alias is required'
  if (!meta.name.trim()) return 'name is required'
  let scale: number | null = null
  let anchor: [number, number] | null = null
  if (meta.scale.trim() !== '') {
    const n = Number(meta.scale)
    if (!Number.isFinite(n) || n <= 0) return 'scale must be a positive number'
    scale = n
  }
  if (meta.anchorX.trim() !== '' || meta.anchorY.trim() !== '') {
    const ax = Number(meta.anchorX)
    const ay = Number(meta.anchorY)
    if (!Number.isFinite(ax) || !Number.isFinite(ay))
      return 'anchor x and y must be numbers'
    anchor = [ax, ay]
  }
  if (isMapMarker(meta.roles, config) && scale === null)
    return 'scale is required for note / waypoint / map-marker symbols'
  if (isMapMarker(meta.roles, config) && anchor === null)
    return 'anchor is required for note / waypoint / map-marker symbols'
  return {
    alias: aliasStrings,
    name: meta.name.trim(),
    description: meta.description.trim(),
    roles: meta.roles,
    tags: meta.tags,
    scale,
    anchor,
    gpxType: (meta.gpxType ?? '').trim(),
    gpxSym: (meta.gpxSym ?? '').trim(),
    svg
  }
}

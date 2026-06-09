// Symbol-wide property fields shared by the upload form and the visual editor:
// id, namespace, name, description, roles (checkboxes), tags (tag editor), and
// map-marker scale / anchor. Controlled via a `meta` object + `onChange` patch.

import { TagsInput } from 'react-tag-input-component'
import { AppConfig, SymbolMeta } from '../types'

// Which groups of fields to render. The visual editor splits the panel:
// `identity` (id/namespace/name/description/GPX) on the right next to the
// preview, and `classification` (roles/tags/map-marker) under the canvas. The
// upload form renders `all` in a single column.
export type MetaSection = 'all' | 'identity' | 'classification'

interface Props {
  meta: SymbolMeta
  onChange: (patch: Partial<SymbolMeta>) => void
  config: AppConfig
  // True when editing an existing symbol. Id/namespace stay editable (changing
  // them renames the symbol), but we surface a hint so it isn't a surprise.
  editing: boolean
  sections?: MetaSection
}

export function isMapMarker(roles: string[], config: AppConfig): boolean {
  return roles.some((r) => config.mapMarkerRoles.includes(r))
}

export function MetadataFields({
  meta,
  onChange,
  config,
  editing,
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
          <label>
            Id
            <input
              value={meta.id}
              onChange={(e) => onChange({ id: e.target.value })}
              placeholder="dive-site"
            />
          </label>
          <label>
            Namespace
            <input
              value={meta.namespace}
              onChange={(e) => onChange({ namespace: e.target.value })}
            />
          </label>
          {editing ? (
            <p className="field-hint">
              Changing the id or namespace renames this symbol (and the SVG file
              on disk). Apps referencing the old id will need updating.
            </p>
          ) : null}
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

// Validate metadata + svg into a save payload, or return an error string.
export function buildPayload(
  meta: SymbolMeta,
  svg: string,
  config: AppConfig
): string | Record<string, unknown> {
  if (!meta.id.trim()) return 'id is required'
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
    id: meta.id.trim(),
    namespace: meta.namespace.trim() || config.defaultNamespace,
    name: meta.name.trim(),
    description: meta.description.trim(),
    roles: meta.roles,
    tags: meta.tags,
    scale,
    anchor,
    gpxType: meta.gpxType.trim(),
    gpxSym: meta.gpxSym.trim(),
    svg
  }
}

import type { AliasRow } from './types'

export interface KnownAlias {
  namespace: string
  id: string
  label: string
}

const KNOWN_ALIAS_PAIRS: Array<[namespace: string, id: string]> = [
  ['fsk', 'anchorage'],
  ['fsk', 'boatramp'],
  ['fsk', 'bridge'],
  ['fsk', 'business'],
  ['fsk', 'dam'],
  ['fsk', 'dive-site'],
  ['fsk', 'ferry'],
  ['fsk', 'hazard'],
  ['fsk', 'inlet'],
  ['fsk', 'lock'],
  ['fsk', 'marina'],
  ['fsk', 'dock'],
  ['fsk', 'turning-basin'],
  ['fsk', 'radio-call-point'],
  ['fsk', 'transhipment-dock'],
  ['fsk', 'notice-to-mariners'],
  ['fsk', 'diver-down'],
  ['fsk', 'navigation-structure'],
  ['fsk', 'fuel'],
  ['fsk', 'tunnel'],
  ['fsk', 'waterway-guage'],
  ['fsk', 'waypoint'],
  ['fsk', 'vessel-self'],
  ['fsk', 'ais_active'],
  ['fsk', 'ais_highspeed'],
  ['fsk', 'ais_special'],
  ['fsk', 'ais_passenger'],
  ['fsk', 'ais_cargo'],
  ['fsk', 'ais_tanker'],
  ['fsk', 'ais_other'],
  ['fsk', 'ais_inactive'],
  ['fsk', 'ais_buddy'],
  ['fsk', 'ais_self'],
  ['fsk', 'real-north'],
  ['fsk', 'virtual-north'],
  ['fsk', 'real-east'],
  ['fsk', 'virtual-east'],
  ['fsk', 'real-south'],
  ['fsk', 'virtual-south'],
  ['fsk', 'real-west'],
  ['fsk', 'virtual-west'],
  ['fsk', 'real-port'],
  ['fsk', 'virtual-port'],
  ['fsk', 'real-starboard'],
  ['fsk', 'virtual-starboard'],
  ['fsk', 'real-danger'],
  ['fsk', 'virtual-danger'],
  ['fsk', 'real-safe'],
  ['fsk', 'virtual-safe'],
  ['fsk', 'real-special'],
  ['fsk', 'virtual-special'],
  ['fsk', 'real-basestation'],
  ['fsk', 'virtual-basestation'],
  ['fsk', 'real-weatherStation'],
  ['fsk', 'virtual-weatherStation'],
  ['fsk', 'real-aton'],
  ['fsk', 'virtual-aton'],
  ['fsk', 'route-start'],
  ['fsk', 'route-waypoint'],
  ['fsk', 'route-end'],
  ['binnacle', 'anchorage'],
  ['binnacle', 'boatramp'],
  ['binnacle', 'bridge'],
  ['binnacle', 'business'],
  ['binnacle', 'dam'],
  ['binnacle', 'dive-site'],
  ['binnacle', 'ferry'],
  ['binnacle', 'hazard'],
  ['binnacle', 'inlet'],
  ['binnacle', 'lock'],
  ['binnacle', 'marina'],
  ['binnacle', 'dock'],
  ['binnacle', 'turning-basin'],
  ['binnacle', 'radio-call-point'],
  ['binnacle', 'transhipment-dock'],
  ['binnacle', 'notice-to-mariners'],
  ['binnacle', 'diver-down'],
  ['binnacle', 'navigation-structure'],
  ['binnacle', 'fuel'],
  ['binnacle', 'tunnel'],
  ['binnacle', 'waterway-guage']
]

export const KNOWN_ALIASES: KnownAlias[] = KNOWN_ALIAS_PAIRS.map(
  ([namespace, id]) => ({
    namespace,
    id,
    label: `${namespace}:${id}`
  })
)

const KNOWN_NAMESPACES = Array.from(new Set(KNOWN_ALIASES.map((a) => a.namespace)))

export type AliasAutocompleteField = 'namespace' | 'id'

export function matchingKnownAliases(
  row: AliasRow,
  limit?: number,
  field: AliasAutocompleteField = 'id'
): KnownAlias[] {
  const namespace = row.namespace.trim().toLowerCase()
  const id = row.id.trim().toLowerCase()

  if (!namespace && !id) return []
  const namespaceMatchesKnown =
    namespace === '' || KNOWN_NAMESPACES.some((ns) => ns.startsWith(namespace))
  if (!namespaceMatchesKnown && field === 'namespace') return []
  if (!namespaceMatchesKnown && !id) return []

  const matches = KNOWN_ALIASES.filter((alias) => {
    const nsMatches =
      namespaceMatchesKnown && namespace ? alias.namespace.startsWith(namespace) : true
    const idMatches = field === 'namespace' || !id ? true : alias.id.includes(id)
    return nsMatches && idMatches
  })
  return limit === undefined ? matches : matches.slice(0, limit)
}

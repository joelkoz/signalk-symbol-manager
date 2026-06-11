// Namespace / local-id validation, `<namespace>:<id>` alias handling, and uuid
// helpers.
//
// A symbol is identified by an immutable `uuid`. Consumers reference it through
// one or more aliases, each a canonical `<namespace>:<id>` pair. A query may be
// a uuid, a qualified alias, or an unqualified local id (matched against any
// alias's id when unique across the library).

import { randomUUID } from 'node:crypto'

export const NAMESPACE_RE = /^[A-Za-z0-9_-]+$/
// Local ids may not contain ':' (the namespace separator) or '/' (path
// separator for asset routes). We allow a friendly slug character set.
export const LOCAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
// RFC-4122 style uuid (the immutable symbol identifier).
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// `default` is reserved for a consumer's built-in symbols and must never be
// used as an alias namespace by a provider.
export const RESERVED_NAMESPACES = new Set(['default'])

export class ValidationError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ValidationError'
    this.status = status
  }
}

export interface QualifiedId {
  namespace: string
  id: string
}

export function newUuid(): string {
  return randomUUID()
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function validateNamespace(namespace: unknown): string {
  if (typeof namespace !== 'string' || namespace.length === 0) {
    throw new ValidationError('namespace is required')
  }
  if (namespace.includes(':')) {
    throw new ValidationError('namespace must not contain ":"')
  }
  if (!NAMESPACE_RE.test(namespace)) {
    throw new ValidationError('namespace must match [A-Za-z0-9_-]+')
  }
  if (RESERVED_NAMESPACES.has(namespace)) {
    throw new ValidationError(`namespace "${namespace}" is reserved`)
  }
  return namespace
}

export function validateLocalId(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0) {
    throw new ValidationError('id is required')
  }
  if (id.includes(':')) {
    throw new ValidationError('id must not contain ":"')
  }
  if (!LOCAL_ID_RE.test(id)) {
    throw new ValidationError(
      'id must start with a letter or digit and contain only letters, digits, "-" or "_"'
    )
  }
  return id
}

export function canonicalKey(namespace: string, id: string): string {
  return `${namespace}:${id}`
}

// Parse a single `<namespace>:<id>` alias string into its parts. Throws when the
// string is not a valid qualified alias.
export function parseAlias(ref: string): QualifiedId {
  const idx = ref.indexOf(':')
  if (idx === -1) {
    throw new ValidationError(`alias "${ref}" must be in <namespace>:<id> form`)
  }
  const namespace = ref.slice(0, idx)
  const id = ref.slice(idx + 1)
  if (id.includes(':')) {
    throw new ValidationError(`invalid alias "${ref}"`)
  }
  return { namespace, id }
}

// Validate a `<namespace>:<id>` alias string and return its canonical form.
export function validateAlias(ref: unknown): string {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new ValidationError('alias is required')
  }
  const { namespace, id } = parseAlias(ref)
  validateNamespace(namespace)
  validateLocalId(id)
  return canonicalKey(namespace, id)
}

// Parse a query reference that may be qualified (`ns:id`) or an unqualified
// local id. Anything with a ':' is treated as qualified.
export function parseReference(ref: string): { namespace?: string; id: string } {
  const idx = ref.indexOf(':')
  if (idx === -1) {
    return { id: ref }
  }
  const namespace = ref.slice(0, idx)
  const id = ref.slice(idx + 1)
  if (id.includes(':')) {
    throw new ValidationError(`invalid symbol reference "${ref}"`)
  }
  return { namespace, id }
}

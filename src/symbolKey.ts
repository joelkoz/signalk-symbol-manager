// Namespace / local-id validation and canonical `namespace:id` key handling.
//
// The canonical consumer reference for a symbol is `<namespace>:<id>`. The
// provider keys its collection by that reference and also supports a
// convenience lookup by unqualified local id when that id is unique across
// every namespace in the library.

import { DEFAULT_NAMESPACE } from './types'

export const NAMESPACE_RE = /^[A-Za-z0-9_]+$/
// Local ids may not contain ':' (the namespace separator) or '/' (path
// separator for asset routes). We allow a friendly slug character set.
export const LOCAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

// `default` is reserved by the RFC for a consumer's built-in symbols and must
// never be used by an external provider.
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

export function validateNamespace(namespace: unknown): string {
  if (typeof namespace !== 'string' || namespace.length === 0) {
    throw new ValidationError('namespace is required')
  }
  if (namespace.includes(':')) {
    throw new ValidationError('namespace must not contain ":"')
  }
  if (!NAMESPACE_RE.test(namespace)) {
    throw new ValidationError('namespace must match [A-Za-z0-9_]+')
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

// Parse a reference that is either canonical (`ns:id`) or an unqualified local
// id. Anything with a single ':' is treated as qualified.
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

export function isDefaultNamespace(namespace: string): boolean {
  return namespace === DEFAULT_NAMESPACE
}

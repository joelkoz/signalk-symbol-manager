// Thin client for the Symbol Manager plugin API. All calls are same-origin and
// rely on the server's session cookie for admin auth (the server gates
// /plugins/* behind admin access).

import { AppConfig, SanitizeResult, SymbolTemplate, SymbolView } from './types'

const BASE = '/plugins/signalk-symbol-manager/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    const message =
      (body && body.error) ||
      (res.status === 401 || res.status === 403
        ? 'Not authorized. Log in to the Signal K admin UI as an administrator.'
        : `Request failed (${res.status})`)
    throw new ApiError(res.status, message)
  }
  return body as T
}

// Tolerate either alias shape from the server: canonical "namespace:id" strings
// (current) or `{namespace, id}` objects, normalising to strings so the UI never
// tries to render an object as a React child.
function normalizeView(s: SymbolView): SymbolView {
  const raw = (s as unknown as { alias?: unknown }).alias
  const alias = Array.isArray(raw)
    ? raw.map((a) =>
        typeof a === 'string'
          ? a
          : `${(a as { namespace: string }).namespace}:${(a as { id: string }).id}`
      )
    : []
  return { ...s, alias }
}

export const api = {
  config: () => request<AppConfig>('/config'),
  templates: () => request<SymbolTemplate[]>('/templates'),
  list: async () => (await request<SymbolView[]>('/symbols')).map(normalizeView),
  get: async (ref: string) =>
    normalizeView(await request<SymbolView>(`/symbols/${encodeURIComponent(ref)}`)),
  create: async (body: unknown) =>
    normalizeView(
      await request<SymbolView>('/symbols', {
        method: 'POST',
        body: JSON.stringify(body)
      })
    ),
  update: async (ref: string, body: unknown) =>
    normalizeView(
      await request<SymbolView>(`/symbols/${encodeURIComponent(ref)}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      })
    ),
  duplicate: async (ref: string, alias?: string[], newName?: string) =>
    normalizeView(
      await request<SymbolView>(`/symbols/${encodeURIComponent(ref)}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ alias, newName })
      })
    ),
  remove: (ref: string) =>
    request<{ deleted: string }>(`/symbols/${encodeURIComponent(ref)}`, {
      method: 'DELETE'
    }),
  sanitize: (svg: string) =>
    request<SanitizeResult>('/sanitize', {
      method: 'POST',
      body: JSON.stringify({ svg })
    })
}

// The sanitized SVG asset text for an existing symbol (public route).
export async function fetchSvgText(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new ApiError(res.status, `Failed to load SVG (${res.status})`)
  return res.text()
}

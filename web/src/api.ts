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

export const api = {
  config: () => request<AppConfig>('/config'),
  templates: () => request<SymbolTemplate[]>('/templates'),
  list: () => request<SymbolView[]>('/symbols'),
  get: (ref: string) => request<SymbolView>(`/symbols/${encodeURIComponent(ref)}`),
  create: (body: unknown) =>
    request<SymbolView>('/symbols', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  update: (ref: string, body: unknown) =>
    request<SymbolView>(`/symbols/${encodeURIComponent(ref)}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    }),
  duplicate: (
    ref: string,
    newId: string,
    newNamespace?: string,
    newName?: string
  ) =>
    request<SymbolView>(`/symbols/${encodeURIComponent(ref)}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ newId, newNamespace, newName })
    }),
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

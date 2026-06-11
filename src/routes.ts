// Plugin HTTP routes, split by trust boundary:
//
//   Public asset route (registered on the main app, OUTSIDE /plugins):
//     GET /signalk/symbol-manager/symbols/:ref.svg   -> sanitized SVG (public)
//
//   Manager API (registered via registerWithRouter at /plugins/<id>, which the
//   Signal K server already gates behind admin auth):
//     GET    /api/config                  -> UI bootstrap (namespace, roles)
//     GET    /api/templates               -> starter templates with inlined SVG
//     POST   /api/sanitize                -> sanitize-only preview for uploads
//     GET    /api/symbols                 -> list managed symbols
//     GET    /api/symbols/:ref            -> one managed symbol
//     POST   /api/symbols                 -> create
//     PUT    /api/symbols/:ref            -> update
//     POST   /api/symbols/:ref/duplicate  -> duplicate
//     DELETE /api/symbols/:ref            -> delete

import express, { IRouter, Request, Response, Application } from 'express'
import { SymbolService } from './service'
import { loadTemplates } from './templates'
import { ValidationError } from './symbolKey'
import {
  SYMBOL_ROLES,
  MAP_MARKER_ROLES,
  DEFAULT_NAMESPACE,
  SymbolRecord
} from './types'

type Logger = (msg: string) => void
type GetService = () => SymbolService

export const PUBLIC_ASSET_PATH = '/signalk/symbol-manager/symbols/:file'

function statusFor(e: unknown): number {
  if (e instanceof ValidationError) return e.status
  return 500
}

function send(res: Response, log: Logger, fn: () => unknown): void {
  Promise.resolve()
    .then(fn)
    .then((body) => {
      if (body !== undefined && !res.headersSent) res.json(body)
    })
    .catch((e) => {
      const status = statusFor(e)
      if (status >= 500) log(`error: ${(e as Error).stack || e}`)
      if (!res.headersSent) res.status(status).json({ error: (e as Error).message })
    })
}

// Public, read-only SVG asset endpoint. `getService` lets the handler pick up
// the current service instance even though this is registered once on the app.
export function registerPublicAssetRoute(
  app: Application,
  getService: GetService,
  log: Logger
): void {
  app.get(PUBLIC_ASSET_PATH, (req: Request, res: Response) => {
    try {
      const file = req.params.file
      if (!file.toLowerCase().endsWith('.svg')) {
        res.sendStatus(404)
        return
      }
      const ref = file.slice(0, -4)
      const service = getService()
      const record = service.resolve(ref)
      const svg = service.readSvg(record)
      res.set('Content-Type', 'image/svg+xml; charset=utf-8')
      res.set('X-Content-Type-Options', 'nosniff')
      res.set('Cache-Control', 'no-cache')
      res.send(svg)
    } catch (e) {
      const status = statusFor(e)
      if (status >= 500) log(`asset error: ${(e as Error).stack || e}`)
      res.sendStatus(status >= 500 ? 500 : 404)
    }
  })
}

// Manager CRUD API. Mounted under /plugins/<id>; the server enforces admin auth
// on that prefix, so this router adds no auth of its own.
export function registerManagerApi(
  router: IRouter,
  getService: GetService,
  log: Logger
): void {
  const managerView = (record: SymbolRecord) => ({
    key: record.uuid,
    ...getService().toManagerView(record)
  })
  const ref = (req: Request) => req.params.ref

  const api = express.Router()
  api.use(express.json({ limit: '4mb' }))

  api.get('/config', (_req, res) =>
    send(res, log, () => ({
      defaultNamespace: getService().defaultNamespace || DEFAULT_NAMESPACE,
      roles: SYMBOL_ROLES,
      mapMarkerRoles: MAP_MARKER_ROLES
    }))
  )

  api.get('/templates', (_req, res) => send(res, log, () => loadTemplates()))

  api.post('/sanitize', (req, res) =>
    send(res, log, () => getService().sanitize(req.body?.svg))
  )

  api.get('/symbols', (_req, res) =>
    send(res, log, () => getService().list().map(managerView))
  )

  api.get('/symbols/:ref', (req, res) =>
    send(res, log, () => managerView(getService().resolve(ref(req))))
  )

  api.post('/symbols', (req, res) =>
    send(res, log, () => {
      res.status(201)
      return managerView(getService().create(req.body))
    })
  )

  api.put('/symbols/:ref', (req, res) =>
    send(res, log, () => managerView(getService().update(ref(req), req.body)))
  )

  api.post('/symbols/:ref/duplicate', (req, res) =>
    send(res, log, () => {
      res.status(201)
      return managerView(
        getService().duplicate(ref(req), req.body?.alias, req.body?.newName)
      )
    })
  )

  api.delete('/symbols/:ref', (req, res) =>
    send(res, log, () => {
      getService().delete(ref(req))
      return { deleted: ref(req) }
    })
  )

  router.use('/api', api)
}

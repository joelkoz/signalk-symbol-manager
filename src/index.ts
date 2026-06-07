// Signal K Symbol Manager plugin entry point.
//
// Responsibilities:
//   - register a read-only `symbols` resource provider
//   - expose a public SVG asset route (outside /plugins) for consumers
//   - expose the manager CRUD API under /plugins/<id>/api (admin-gated by the
//     server) for the Symbol Manager web app
//
// The compiled web app is shipped in public/ and served by Signal K Server at
// /signalk-symbol-manager/ via the `signalk-webapp` package keyword. This
// plugin never serves the UI through registerWithRouter().

import path from 'node:path'
import { Application } from 'express'
import {
  Plugin,
  ServerAPI,
  ResourceProviderRegistry
} from '@signalk/server-api'

import { PROVIDER_ID, PluginConfig } from './types'
import { SymbolStore } from './store'
import { SymbolService } from './service'
import { ValidationError } from './symbolKey'
import { createSymbolProviderMethods } from './provider'
import { registerManagerApi, registerPublicAssetRoute } from './routes'

interface SymbolManagerApp
  extends ServerAPI,
    ResourceProviderRegistry,
    Application {
  getDataDirPath: () => string
  config: {
    configPath: string
  }
}

const DEFAULT_MAX_SVG_BYTES = 256 * 1024

module.exports = (app: SymbolManagerApp): Plugin => {
  let store: SymbolStore | null = null
  let service: SymbolService | null = null
  let providerRegistered = false
  let assetRouteRegistered = false

  const log = (msg: string) => app.error(`${PROVIDER_ID}: ${msg}`)

  const dataDir =
    typeof app.getDataDirPath === 'function'
      ? app.getDataDirPath()
      : path.join(app.config.configPath, 'plugin-config-data', PROVIDER_ID)

  // The provider methods and the public asset route are registered once and
  // resolve the live service lazily, so they survive plugin restarts.
  const getService = (): SymbolService => {
    if (!service) {
      throw new ValidationError('Symbol Manager is not running', 503)
    }
    return service
  }

  const registerProvider = () => {
    if (providerRegistered) return
    if (typeof app.registerResourceProvider !== 'function') {
      log('server has no resource provider registry; skipping registration')
      return
    }
    try {
      app.registerResourceProvider({
        type: 'symbols',
        methods: createSymbolProviderMethods(getService)
      })
      providerRegistered = true
    } catch (e) {
      log(`resource provider registration failed: ${(e as Error).message}`)
    }
  }

  const plugin: Plugin = {
    id: PROVIDER_ID,
    name: 'Symbol Manager',
    description:
      'Manage a custom library of SVG symbols and expose them as a read-only Signal K `symbols` resource provider.',

    schema: () => ({
      type: 'object',
      properties: {
        defaultNamespace: {
          type: 'string',
          title: 'Default symbol namespace',
          description:
            'Namespace assigned to new symbols when none is given. Must match [A-Za-z0-9_]+ and may not be "default".',
          default: 'user'
        },
        maxSvgKb: {
          type: 'number',
          title: 'Maximum SVG size (KB)',
          description: 'Reject SVG uploads/edits larger than this size.',
          default: 256
        }
      }
    }),

    start(options: object) {
      const opts = (options || {}) as {
        defaultNamespace?: string
        maxSvgKb?: number
      }
      const config: PluginConfig = {
        defaultNamespace: opts.defaultNamespace || 'user',
        maxSvgBytes: Math.max(1, Math.round((opts.maxSvgKb || 256) * 1024)) ||
          DEFAULT_MAX_SVG_BYTES
      }

      store = new SymbolStore(dataDir)
      service = new SymbolService(store, config)

      registerProvider()

      if (!assetRouteRegistered) {
        registerPublicAssetRoute(app as Application, getService, log)
        assetRouteRegistered = true
      }

      const count = service.list().length
      app.setPluginStatus(
        `Serving ${count} symbol${count === 1 ? '' : 's'} (namespace "${config.defaultNamespace}")`
      )
    },

    stop() {
      if (store) {
        store.close()
        store = null
      }
      service = null
    },

    registerWithRouter(router) {
      registerManagerApi(router, getService, log)
    }
  }

  return plugin
}

// Signal K `symbols` resource provider. Read-only for this MVP: listResources
// and getResource return managed symbols; setResource and deleteResource always
// reject without mutating the library. Symbol writes go through the manager API
// (see routes.ts), never through the resources API.

import { ValidationError } from './symbolKey'
import { SymbolService } from './service'

interface ResourceProviderMethods {
  listResources: (query: Record<string, unknown>) => Promise<Record<string, unknown>>
  getResource: (id: string, property?: string) => Promise<object>
  setResource: (id: string, value: Record<string, unknown>) => Promise<void>
  deleteResource: (id: string) => Promise<void>
}

const READ_ONLY_MESSAGE =
  'The symbols resource provider is read-only. Manage symbols via the Symbol Manager web app / plugin API.'

// `getService` resolves the live service lazily so the provider keeps working
// across plugin restarts (the methods are registered with the server once).
export function createSymbolProviderMethods(
  getService: () => SymbolService
): ResourceProviderMethods {
  return {
    listResources: async () => getService().listResources(),

    getResource: async (id: string) => {
      try {
        const service = getService()
        return service.toResource(service.resolve(id))
      } catch (e) {
        // Resource providers signal "not found" / errors via a rejected promise.
        if (e instanceof ValidationError) {
          throw new Error(e.message)
        }
        throw e
      }
    },

    setResource: async () => {
      throw new Error(READ_ONLY_MESSAGE)
    },

    deleteResource: async () => {
      throw new Error(READ_ONLY_MESSAGE)
    }
  }
}

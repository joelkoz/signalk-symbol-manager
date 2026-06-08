// Persistence layer: symbol metadata in Node's integrated SQLite database and
// sanitized SVG assets as files. Both live under the plugin data directory and
// are never committed to git.

import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import {
  Anchor,
  SymbolRecord,
  SymbolRole
} from './types'
import {
  ValidationError,
  canonicalKey,
  validateLocalId,
  validateNamespace
} from './symbolKey'

interface Row {
  id: string
  namespace: string
  name: string
  description: string
  mediaType: string
  roles: string
  tags: string
  scale: number | null
  anchorX: number | null
  anchorY: number | null
  width: number | null
  height: number | null
  svgFile: string
  createdAt: string
  updatedAt: string
}

export interface NewSymbol {
  id: string
  namespace: string
  name: string
  description: string
  roles: SymbolRole[]
  tags: string[]
  scale: number | null
  anchor: Anchor | null
  width: number | null
  height: number | null
  svg: string
}

function rowToRecord(row: Row): SymbolRecord {
  return {
    id: row.id,
    namespace: row.namespace,
    name: row.name,
    description: row.description ?? '',
    mediaType: 'image/svg+xml',
    roles: JSON.parse(row.roles || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    scale: row.scale,
    anchor:
      row.anchorX === null || row.anchorY === null
        ? null
        : [row.anchorX, row.anchorY],
    width: row.width,
    height: row.height,
    svgFile: row.svgFile,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export class SymbolStore {
  private db: DatabaseSync
  private readonly assetsDir: string

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true })
    this.assetsDir = path.join(dataDir, 'assets')
    fs.mkdirSync(this.assetsDir, { recursive: true })
    this.db = new DatabaseSync(path.join(dataDir, 'symbols.sqlite'))
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS symbols (
        namespace   TEXT NOT NULL,
        id          TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        mediaType   TEXT NOT NULL DEFAULT 'image/svg+xml',
        roles       TEXT NOT NULL DEFAULT '[]',
        tags        TEXT NOT NULL DEFAULT '[]',
        scale       REAL,
        anchorX     REAL,
        anchorY     REAL,
        width       REAL,
        height      REAL,
        svgFile     TEXT NOT NULL,
        createdAt   TEXT NOT NULL,
        updatedAt   TEXT NOT NULL,
        PRIMARY KEY (namespace, id)
      );
    `)
  }

  close(): void {
    try {
      this.db.close()
    } catch {
      /* ignore */
    }
  }

  // --- asset file helpers -------------------------------------------------

  private assetRelPath(namespace: string, id: string): string {
    return path.join(namespace, `${id}.svg`)
  }

  private assetAbsPath(relPath: string): string {
    return path.join(this.assetsDir, relPath)
  }

  private writeAsset(namespace: string, id: string, svg: string): string {
    const rel = this.assetRelPath(namespace, id)
    const abs = this.assetAbsPath(rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, svg, 'utf8')
    return rel
  }

  readAsset(record: SymbolRecord): string {
    return fs.readFileSync(this.assetAbsPath(record.svgFile), 'utf8')
  }

  // --- queries ------------------------------------------------------------

  list(): SymbolRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM symbols ORDER BY namespace, id')
      .all() as unknown as Row[]
    return rows.map(rowToRecord)
  }

  get(namespace: string, id: string): SymbolRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM symbols WHERE namespace = ? AND id = ?')
      .get(namespace, id) as unknown as Row | undefined
    return row ? rowToRecord(row) : undefined
  }

  // Resolve an unqualified local id. Returns the single match, or throws if the
  // id is ambiguous across namespaces. Returns undefined when nothing matches.
  getByLocalId(id: string): SymbolRecord | undefined {
    const rows = this.db
      .prepare('SELECT * FROM symbols WHERE id = ?')
      .all(id) as unknown as Row[]
    if (rows.length === 0) return undefined
    if (rows.length > 1) {
      const namespaces = rows.map((r) => r.namespace).join(', ')
      throw new ValidationError(
        `symbol id "${id}" is ambiguous; exists in namespaces: ${namespaces}. Use a namespace-qualified id.`,
        409
      )
    }
    return rowToRecord(rows[0])
  }

  // How many symbols share this local id (used to decide if the asset URL can
  // be the short unqualified form).
  localIdCount(id: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM symbols WHERE id = ?')
      .get(id) as unknown as { n: number }
    return row.n
  }

  exists(namespace: string, id: string): boolean {
    return this.get(namespace, id) !== undefined
  }

  // --- mutations ----------------------------------------------------------

  create(input: NewSymbol): SymbolRecord {
    validateNamespace(input.namespace)
    validateLocalId(input.id)
    if (this.exists(input.namespace, input.id)) {
      throw new ValidationError(
        `symbol ${canonicalKey(input.namespace, input.id)} already exists`,
        409
      )
    }
    const now = new Date().toISOString()
    const svgFile = this.writeAsset(input.namespace, input.id, input.svg)
    this.db
      .prepare(
        `INSERT INTO symbols
          (namespace, id, name, description, mediaType, roles, tags, scale, anchorX, anchorY, width, height, svgFile, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'image/svg+xml', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.namespace,
        input.id,
        input.name,
        input.description,
        JSON.stringify(input.roles),
        JSON.stringify(input.tags),
        input.scale,
        input.anchor ? input.anchor[0] : null,
        input.anchor ? input.anchor[1] : null,
        input.width,
        input.height,
        svgFile,
        now,
        now
      )
    return this.get(input.namespace, input.id)!
  }

  // Update an existing symbol's metadata/SVG. `namespace`/`id` identify the
  // target; to change the identity itself, call `rename` first (the service
  // does this automatically when a save carries a new id/namespace).
  update(
    namespace: string,
    id: string,
    patch: {
      name: string
      description: string
      roles: SymbolRole[]
      tags: string[]
      scale: number | null
      anchor: Anchor | null
      svg?: string
      width?: number | null
      height?: number | null
    }
  ): SymbolRecord {
    const existing = this.get(namespace, id)
    if (!existing) {
      throw new ValidationError(
        `symbol ${canonicalKey(namespace, id)} not found`,
        404
      )
    }
    const now = new Date().toISOString()
    // Only overwrite stored dimensions when a new SVG was supplied.
    const width = typeof patch.svg === 'string' ? patch.width ?? null : existing.width
    const height = typeof patch.svg === 'string' ? patch.height ?? null : existing.height
    if (typeof patch.svg === 'string') {
      this.writeAsset(namespace, id, patch.svg)
    }
    this.db
      .prepare(
        `UPDATE symbols
            SET name = ?, description = ?, roles = ?, tags = ?, scale = ?, anchorX = ?, anchorY = ?, width = ?, height = ?, updatedAt = ?
          WHERE namespace = ? AND id = ?`
      )
      .run(
        patch.name,
        patch.description,
        JSON.stringify(patch.roles),
        JSON.stringify(patch.tags),
        patch.scale,
        patch.anchor ? patch.anchor[0] : null,
        patch.anchor ? patch.anchor[1] : null,
        width,
        height,
        now,
        namespace,
        id
      )
    return this.get(namespace, id)!
  }

  // Rename a symbol's identity (namespace and/or id). Moves the SVG asset on
  // disk and rewrites the primary key. Rejects (409) if the new identity is
  // already taken. A no-op when the identity is unchanged.
  rename(
    oldNamespace: string,
    oldId: string,
    newNamespace: string,
    newId: string
  ): void {
    const existing = this.get(oldNamespace, oldId)
    if (!existing) {
      throw new ValidationError(
        `symbol ${canonicalKey(oldNamespace, oldId)} not found`,
        404
      )
    }
    validateNamespace(newNamespace)
    validateLocalId(newId)
    if (oldNamespace === newNamespace && oldId === newId) return
    if (this.exists(newNamespace, newId)) {
      throw new ValidationError(
        `symbol ${canonicalKey(newNamespace, newId)} already exists`,
        409
      )
    }
    const newRel = this.assetRelPath(newNamespace, newId)
    const newAbs = this.assetAbsPath(newRel)
    fs.mkdirSync(path.dirname(newAbs), { recursive: true })
    const oldAbs = this.assetAbsPath(existing.svgFile)
    if (fs.existsSync(oldAbs)) {
      fs.renameSync(oldAbs, newAbs)
    }
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE symbols
            SET namespace = ?, id = ?, svgFile = ?, updatedAt = ?
          WHERE namespace = ? AND id = ?`
      )
      .run(newNamespace, newId, newRel, now, oldNamespace, oldId)
  }

  delete(namespace: string, id: string): boolean {
    const existing = this.get(namespace, id)
    if (!existing) return false
    this.db
      .prepare('DELETE FROM symbols WHERE namespace = ? AND id = ?')
      .run(namespace, id)
    try {
      fs.rmSync(this.assetAbsPath(existing.svgFile), { force: true })
    } catch {
      /* ignore missing asset */
    }
    return true
  }
}

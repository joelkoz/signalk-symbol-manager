// Persistence layer: symbol metadata in Node's integrated SQLite database and
// sanitized SVG assets as files. Both live under the plugin data directory and
// are never committed to git.
//
// A symbol is identified by an immutable `uuid` (the `symbols` table primary
// key). Its consumer-facing `<namespace>:<id>` aliases live in `symbol_aliases`,
// one row per alias, globally unique. SVG assets are stored by uuid.

import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { Anchor, SymbolAlias, SymbolRecord, SymbolRole } from './types'
import {
  ValidationError,
  canonicalKey,
  newUuid,
  validateLocalId,
  validateNamespace
} from './symbolKey'

interface SymbolRow {
  uuid: string
  name: string
  description: string
  mediaType: string
  roles: string
  tags: string
  scale: number | null
  anchorX: number | null
  anchorY: number | null
  gpxType: string
  gpxSym: string
  width: number | null
  height: number | null
  svgFile: string
  createdAt: string
  updatedAt: string
}

interface AliasRow {
  namespace: string
  id: string
  uuid: string
  position: number
}

export interface NewSymbol {
  alias: SymbolAlias[]
  name: string
  description: string
  roles: SymbolRole[]
  tags: string[]
  scale: number | null
  anchor: Anchor | null
  gpxType: string
  gpxSym: string
  width: number | null
  height: number | null
  svg: string
}

export class SymbolStore {
  // Current on-disk schema version (PRAGMA user_version). Bump when adding a
  // migration step. A released 0.5 database reports 0 and upgrades on restart.
  private static readonly SCHEMA_VERSION = 1

  private db: DatabaseSync
  private readonly assetsDir: string

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true })
    this.assetsDir = path.join(dataDir, 'assets')
    fs.mkdirSync(this.assetsDir, { recursive: true })
    this.db = new DatabaseSync(path.join(dataDir, 'symbols.sqlite'))
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  close(): void {
    try {
      this.db.close()
    } catch {
      /* ignore */
    }
  }

  // --- schema / migration -------------------------------------------------

  private tableExists(name: string): boolean {
    const row = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(name)
    return !!row
  }

  private columns(table: string): string[] {
    if (!this.tableExists(table)) return []
    const rows = this.db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as unknown as Array<{ name: string }>
    return rows.map((r) => r.name)
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS symbols (
        uuid        TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        mediaType   TEXT NOT NULL DEFAULT 'image/svg+xml',
        roles       TEXT NOT NULL DEFAULT '[]',
        tags        TEXT NOT NULL DEFAULT '[]',
        scale       REAL,
        anchorX     REAL,
        anchorY     REAL,
        gpxType     TEXT NOT NULL DEFAULT '',
        gpxSym      TEXT NOT NULL DEFAULT '',
        width       REAL,
        height      REAL,
        svgFile     TEXT NOT NULL,
        createdAt   TEXT NOT NULL,
        updatedAt   TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS symbol_aliases (
        namespace TEXT NOT NULL,
        id        TEXT NOT NULL,
        uuid      TEXT NOT NULL,
        position  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (namespace, id),
        FOREIGN KEY (uuid) REFERENCES symbols(uuid) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_alias_uuid ON symbol_aliases(uuid);
      CREATE INDEX IF NOT EXISTS idx_alias_id ON symbol_aliases(id);
    `)
  }

  // Migrate the legacy schema (a `symbols` table keyed by `namespace`+`id`,
  // assets under `<namespace>/<id>.svg`) to the uuid + alias model. The legacy
  // table is preserved as `symbols_legacy` and legacy assets are copied (not
  // moved) so the migration is reversible.

  private userVersion(): number {
    const row = this.db.prepare('PRAGMA user_version').get() as unknown as {
      user_version: number
    }
    return row?.user_version ?? 0
  }

  // Run any migration steps newer than the database's recorded schema version,
  // then stamp the current version. Runs on every plugin start and only applies
  // pending steps, so a released database auto-upgrades on restart. To add a
  // future change: bump SCHEMA_VERSION, add a migrateToN(), and call it here.
  private migrate(): void {
    let version = this.userVersion()
    if (version >= SymbolStore.SCHEMA_VERSION) {
      this.createSchema() // already current; ensure tables exist
      return
    }
    if (version < 1) {
      this.migrateTo1()
      version = 1
    }
    // Future: if (version < 2) { this.migrateTo2(); version = 2 }
    this.db.exec(`PRAGMA user_version = ${SymbolStore.SCHEMA_VERSION};`)
  }

  // v0 -> v1: introduce the uuid + alias model. A released 0.5 database has the
  // legacy `symbols` table keyed by (namespace, id) and assets under
  // `<namespace>/<id>.svg`; a fresh install has no tables. The legacy table is
  // preserved as `symbols_legacy` and assets are copied (not moved), so the
  // migration is reversible.
  private migrateTo1(): void {
    const legacyCols = this.columns('symbols')
    const isLegacy =
      !this.tableExists('symbol_aliases') &&
      legacyCols.includes('namespace') &&
      legacyCols.includes('id')
    if (!isLegacy) {
      this.createSchema() // fresh install (or already on the new schema)
      return
    }

    this.db.exec('ALTER TABLE symbols RENAME TO symbols_legacy;')
    this.createSchema()

    const rows = this.db
      .prepare('SELECT * FROM symbols_legacy')
      .all() as unknown as Array<Record<string, unknown>>
    const now = new Date().toISOString()
    for (const row of rows) {
      const uuid = newUuid()
      const namespace = String(row.namespace)
      const id = String(row.id)
      const legacyRel = String(row.svgFile ?? path.join(namespace, `${id}.svg`))
      const newRel = `${uuid}.svg`
      try {
        const legacyAbs = this.assetAbsPath(legacyRel)
        if (fs.existsSync(legacyAbs)) {
          fs.copyFileSync(legacyAbs, this.assetAbsPath(newRel))
        }
      } catch {
        /* keep going; a missing asset is non-fatal for metadata migration */
      }
      this.db
        .prepare(
          `INSERT INTO symbols
            (uuid, name, description, mediaType, roles, tags, scale, anchorX, anchorY, gpxType, gpxSym, width, height, svgFile, createdAt, updatedAt)
           VALUES (?, ?, ?, 'image/svg+xml', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          uuid,
          String(row.name ?? ''),
          String(row.description ?? ''),
          String(row.roles ?? '[]'),
          String(row.tags ?? '[]'),
          (row.scale as number | null) ?? null,
          (row.anchorX as number | null) ?? null,
          (row.anchorY as number | null) ?? null,
          String(row.gpxType ?? ''),
          String(row.gpxSym ?? ''),
          (row.width as number | null) ?? null,
          (row.height as number | null) ?? null,
          newRel,
          String(row.createdAt ?? now),
          String(row.updatedAt ?? now)
        )
      this.db
        .prepare(
          `INSERT INTO symbol_aliases (namespace, id, uuid, position) VALUES (?, ?, ?, 0)`
        )
        .run(namespace, id, uuid)
    }
  }

  // --- asset file helpers -------------------------------------------------

  private assetRelPath(uuid: string): string {
    return `${uuid}.svg`
  }

  private assetAbsPath(relPath: string): string {
    return path.join(this.assetsDir, relPath)
  }

  private writeAsset(uuid: string, svg: string): string {
    const rel = this.assetRelPath(uuid)
    fs.writeFileSync(this.assetAbsPath(rel), svg, 'utf8')
    return rel
  }

  readAsset(record: SymbolRecord): string {
    return fs.readFileSync(this.assetAbsPath(record.svgFile), 'utf8')
  }

  // --- row shaping --------------------------------------------------------

  private aliasesFor(uuid: string): SymbolAlias[] {
    const rows = this.db
      .prepare(
        'SELECT namespace, id, uuid, position FROM symbol_aliases WHERE uuid = ? ORDER BY position'
      )
      .all(uuid) as unknown as AliasRow[]
    return rows.map((r) => ({ namespace: r.namespace, id: r.id }))
  }

  private rowToRecord(row: SymbolRow): SymbolRecord {
    return {
      uuid: row.uuid,
      alias: this.aliasesFor(row.uuid),
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
      gpxType: row.gpxType ?? '',
      gpxSym: row.gpxSym ?? '',
      width: row.width,
      height: row.height,
      svgFile: row.svgFile,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }

  // --- queries ------------------------------------------------------------

  list(): SymbolRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM symbols ORDER BY name, uuid')
      .all() as unknown as SymbolRow[]
    return rows.map((r) => this.rowToRecord(r))
  }

  getByUuid(uuid: string): SymbolRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM symbols WHERE uuid = ?')
      .get(uuid) as unknown as SymbolRow | undefined
    return row ? this.rowToRecord(row) : undefined
  }

  // Resolve a qualified alias `<namespace>:<id>`.
  getByAlias(namespace: string, id: string): SymbolRecord | undefined {
    const row = this.db
      .prepare('SELECT uuid FROM symbol_aliases WHERE namespace = ? AND id = ?')
      .get(namespace, id) as unknown as { uuid: string } | undefined
    return row ? this.getByUuid(row.uuid) : undefined
  }

  // Resolve an unqualified local id against any alias. Throws (409) when the id
  // matches aliases on more than one symbol; undefined when nothing matches.
  getByLocalId(id: string): SymbolRecord | undefined {
    const rows = this.db
      .prepare('SELECT DISTINCT uuid, namespace FROM symbol_aliases WHERE id = ?')
      .all(id) as unknown as Array<{ uuid: string; namespace: string }>
    if (rows.length === 0) return undefined
    const uuids = Array.from(new Set(rows.map((r) => r.uuid)))
    if (uuids.length > 1) {
      const namespaces = rows.map((r) => r.namespace).join(', ')
      throw new ValidationError(
        `symbol id "${id}" is ambiguous; exists in namespaces: ${namespaces}. Use a namespace-qualified alias.`,
        409
      )
    }
    return this.getByUuid(uuids[0])
  }

  // How many distinct symbols carry an alias with this local id.
  localIdCount(id: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(DISTINCT uuid) AS n FROM symbol_aliases WHERE id = ?'
      )
      .get(id) as unknown as { n: number }
    return row.n
  }

  // --- mutations ----------------------------------------------------------

  private insertAliases(uuid: string, aliases: SymbolAlias[]): void {
    aliases.forEach((a, position) => {
      validateNamespace(a.namespace)
      validateLocalId(a.id)
      try {
        this.db
          .prepare(
            'INSERT INTO symbol_aliases (namespace, id, uuid, position) VALUES (?, ?, ?, ?)'
          )
          .run(a.namespace, a.id, uuid, position)
      } catch (e) {
        throw new ValidationError(
          `alias ${canonicalKey(a.namespace, a.id)} is already used by another symbol`,
          409
        )
      }
    })
  }

  create(input: NewSymbol): SymbolRecord {
    if (!input.alias || input.alias.length === 0) {
      throw new ValidationError('at least one alias is required')
    }
    const uuid = newUuid()
    const now = new Date().toISOString()
    const svgFile = this.writeAsset(uuid, input.svg)
    this.db
      .prepare(
        `INSERT INTO symbols
          (uuid, name, description, mediaType, roles, tags, scale, anchorX, anchorY, gpxType, gpxSym, width, height, svgFile, createdAt, updatedAt)
         VALUES (?, ?, ?, 'image/svg+xml', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uuid,
        input.name,
        input.description,
        JSON.stringify(input.roles),
        JSON.stringify(input.tags),
        input.scale,
        input.anchor ? input.anchor[0] : null,
        input.anchor ? input.anchor[1] : null,
        input.gpxType,
        input.gpxSym,
        input.width,
        input.height,
        svgFile,
        now,
        now
      )
    this.insertAliases(uuid, input.alias)
    return this.getByUuid(uuid)!
  }

  // Update an existing symbol's metadata, aliases, and (optionally) SVG. The
  // uuid is immutable. Aliases are replaced wholesale with the supplied set.
  update(
    uuid: string,
    patch: {
      alias: SymbolAlias[]
      name: string
      description: string
      roles: SymbolRole[]
      tags: string[]
      scale: number | null
      anchor: Anchor | null
      gpxType: string
      gpxSym: string
      svg?: string
      width?: number | null
      height?: number | null
    }
  ): SymbolRecord {
    const existing = this.getByUuid(uuid)
    if (!existing) {
      throw new ValidationError(`symbol ${uuid} not found`, 404)
    }
    if (!patch.alias || patch.alias.length === 0) {
      throw new ValidationError('at least one alias is required')
    }
    const now = new Date().toISOString()
    const width =
      typeof patch.svg === 'string' ? patch.width ?? null : existing.width
    const height =
      typeof patch.svg === 'string' ? patch.height ?? null : existing.height
    if (typeof patch.svg === 'string') {
      this.writeAsset(uuid, patch.svg)
    }
    this.db
      .prepare(
        `UPDATE symbols
            SET name = ?, description = ?, roles = ?, tags = ?, scale = ?, anchorX = ?, anchorY = ?, gpxType = ?, gpxSym = ?, width = ?, height = ?, updatedAt = ?
          WHERE uuid = ?`
      )
      .run(
        patch.name,
        patch.description,
        JSON.stringify(patch.roles),
        JSON.stringify(patch.tags),
        patch.scale,
        patch.anchor ? patch.anchor[0] : null,
        patch.anchor ? patch.anchor[1] : null,
        patch.gpxType,
        patch.gpxSym,
        width,
        height,
        now,
        uuid
      )
    this.db.prepare('DELETE FROM symbol_aliases WHERE uuid = ?').run(uuid)
    this.insertAliases(uuid, patch.alias)
    return this.getByUuid(uuid)!
  }

  delete(uuid: string): boolean {
    const existing = this.getByUuid(uuid)
    if (!existing) return false
    this.db.prepare('DELETE FROM symbols WHERE uuid = ?').run(uuid)
    try {
      fs.rmSync(this.assetAbsPath(existing.svgFile), { force: true })
    } catch {
      /* ignore missing asset */
    }
    return true
  }
}

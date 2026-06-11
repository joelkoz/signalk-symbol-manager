'use strict'
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { SymbolStore } = require('../plugin/store')
const { SymbolService, ASSET_BASE } = require('../plugin/service')
const { ValidationError } = require('../plugin/symbolKey')

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="37" height="37" viewBox="0 0 37 37"><rect width="37" height="37" fill="#d71920"/></svg>'

// Alias pairs of a record as canonical "namespace:id" strings, for assertions.
const aliasStrings = (rec) => rec.alias.map((a) => `${a.namespace}:${a.id}`)

let dir
let store
let service

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symmgr-'))
  store = new SymbolStore(dir)
  service = new SymbolService(store, { defaultNamespace: 'custom', maxSvgBytes: 256 * 1024 })
})

afterEach(() => {
  store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('create assigns a uuid, defaults the alias to custom:symbolN, and sanitizes svg', () => {
  const rec = service.create({ name: 'Dive Site', svg: SVG })
  assert.match(rec.uuid, /^[0-9a-f-]{36}$/)
  assert.deepEqual(aliasStrings(rec), ['custom:symbol1'])
  const svg = service.readSvg(rec)
  assert.ok(/<svg/.test(svg))
})

test('explicit aliases are validated and de-duplicated', () => {
  const rec = service.create({
    alias: ['custom:dive-flag', 'fsk:dive-site', 'custom:dive-flag'],
    name: 'Dive Flag',
    svg: SVG
  })
  assert.deepEqual(aliasStrings(rec), ['custom:dive-flag', 'fsk:dive-site'])
})

test('map-marker role requires scale and anchor', () => {
  assert.throws(
    () => service.create({ alias: ['custom:m1'], name: 'M', roles: ['note'], svg: SVG }),
    ValidationError
  )
  const ok = service.create({
    alias: ['custom:m1'],
    name: 'M',
    roles: ['note', 'waypoint'],
    scale: 0.65,
    anchor: [1, 37],
    svg: SVG
  })
  assert.equal(ok.scale, 0.65)
  assert.deepEqual(ok.anchor, [1, 37])
})

test('non-map-marker symbol may omit scale/anchor', () => {
  const rec = service.create({ alias: ['custom:btn'], name: 'Button', roles: ['button'], svg: SVG })
  assert.equal(rec.scale, null)
  assert.equal(rec.anchor, null)
})

test('listResources is keyed by uuid with alias[], $source and timestamp', () => {
  const rec = service.create({ alias: ['user:dive-site'], name: 'Dive Site', svg: SVG })
  const all = service.listResources()
  const r = all[rec.uuid]
  assert.ok(r)
  assert.equal(r.uuid, rec.uuid)
  assert.deepEqual(r.alias, ['user:dive-site'])
  assert.equal(r.$source, 'signalk-symbol-manager')
  assert.equal(typeof r.timestamp, 'string')
  assert.equal(r.mediaType, 'image/svg+xml')
  assert.equal(r.url, `${ASSET_BASE}/${encodeURIComponent(rec.uuid)}.svg`)
})

test('resolve works by uuid, qualified alias, and unique local id; ambiguous local id throws 409', () => {
  const a = service.create({ alias: ['user:dive-site'], name: 'A', svg: SVG })
  assert.equal(service.resolve(a.uuid).uuid, a.uuid)
  assert.equal(service.resolve('user:dive-site').uuid, a.uuid)
  assert.equal(service.resolve('dive-site').uuid, a.uuid)

  service.create({ alias: ['fleet:dive-site'], name: 'B', svg: SVG })
  assert.throws(
    () => service.resolve('dive-site'),
    (e) => {
      assert.ok(e instanceof ValidationError)
      assert.equal(e.status, 409)
      return true
    }
  )
  // Qualified aliases still resolve unambiguously.
  assert.equal(service.resolve('fleet:dive-site').name, 'B')
})

test('the asset url is uuid-based and stable across alias edits', () => {
  const rec = service.create({ alias: ['user:x'], name: 'A', svg: SVG })
  const url1 = service.listResources()[rec.uuid].url
  assert.equal(url1, `${ASSET_BASE}/${encodeURIComponent(rec.uuid)}.svg`)

  const upd = service.update(rec.uuid, { name: 'A', alias: ['user:x', 'garmin:Anchor'] })
  assert.equal(upd.uuid, rec.uuid)
  const url2 = service.listResources()[rec.uuid].url
  assert.equal(url2, url1)
})

test('duplicate creates an independent copy with a new uuid', () => {
  const a = service.create({ alias: ['user:a'], name: 'A', svg: SVG })
  const copy = service.duplicate(a.uuid, ['user:b'], 'B')
  assert.notEqual(copy.uuid, a.uuid)
  assert.deepEqual(aliasStrings(copy), ['user:b'])
  assert.equal(copy.name, 'B')
  assert.equal(service.list().length, 2)
})

test('duplicate can reuse the same local id under a different namespace', () => {
  const a = service.create({ alias: ['user:a'], name: 'A', svg: SVG })
  const copy = service.duplicate('user:a', ['mine:a'])
  assert.deepEqual(aliasStrings(copy), ['mine:a'])
  assert.equal(service.list().length, 2)
  assert.equal(service.resolve('user:a').uuid, a.uuid)
  assert.equal(service.resolve('mine:a').uuid, copy.uuid)
})

test('duplicate onto an existing alias is rejected and leaves no orphan', () => {
  service.create({ alias: ['user:a'], name: 'A', svg: SVG })
  assert.throws(
    () => service.duplicate('user:a', ['user:a']),
    (e) => {
      assert.equal(e.status, 409)
      return true
    }
  )
  assert.equal(service.list().length, 1)
})

test('gpxType/gpxSym round-trip through create, resource, update, duplicate', () => {
  const rec = service.create({
    alias: ['user:dive-site'],
    name: 'Dive Site',
    gpxType: 'Dive Site',
    gpxSym: 'Scuba Flag',
    svg: SVG
  })
  assert.equal(rec.gpxType, 'Dive Site')
  assert.equal(rec.gpxSym, 'Scuba Flag')

  // Exposed on the public resource shape (only when non-empty).
  const res = service.listResources()[rec.uuid]
  assert.equal(res.gpxType, 'Dive Site')
  assert.equal(res.gpxSym, 'Scuba Flag')

  // Empty values are omitted from the public resource shape.
  const plain = service.create({ alias: ['user:plain'], name: 'Plain', svg: SVG })
  assert.equal(plain.gpxType, '')
  const plainRes = service.listResources()[plain.uuid]
  assert.equal('gpxType' in plainRes, false)
  assert.equal('gpxSym' in plainRes, false)

  // Update edits the mappings (aliases kept when omitted).
  const upd = service.update('user:dive-site', {
    name: 'Dive Site',
    gpxType: 'Wreck',
    gpxSym: 'Anchor'
  })
  assert.equal(upd.gpxType, 'Wreck')
  assert.equal(upd.gpxSym, 'Anchor')

  // Duplicate copies the mappings.
  const copy = service.duplicate('user:dive-site', ['user:dive-site-2'])
  assert.equal(copy.gpxType, 'Wreck')
  assert.equal(copy.gpxSym, 'Anchor')
})

test('update edits metadata and delete removes symbol + asset', () => {
  const rec = service.create({ alias: ['user:a'], name: 'A', svg: SVG })
  const assetPath = path.join(dir, 'assets', rec.svgFile)
  assert.ok(fs.existsSync(assetPath))

  const upd = service.update('user:a', { name: 'A2', roles: ['button'], tags: ['x', 'y'] })
  assert.equal(upd.uuid, rec.uuid)
  assert.equal(upd.name, 'A2')
  assert.deepEqual(upd.tags, ['x', 'y'])

  assert.equal(service.delete('user:a'), true)
  assert.equal(service.list().length, 0)
  assert.ok(!fs.existsSync(assetPath))
})

test('update replaces aliases while keeping the immutable uuid and asset', () => {
  const rec = service.create({ alias: ['user:old-id'], name: 'Old', svg: SVG })
  const asset = path.join(dir, 'assets', rec.svgFile)
  assert.ok(fs.existsSync(asset))

  const upd = service.update('user:old-id', {
    name: 'New',
    alias: ['mine:new-id'],
    svg: SVG
  })
  assert.equal(upd.uuid, rec.uuid)
  assert.deepEqual(aliasStrings(upd), ['mine:new-id'])

  // The old alias no longer resolves; the new alias does; the asset is the same
  // uuid-keyed file (never moved).
  assert.throws(() => service.resolve('user:old-id'), (e) => e.status === 404)
  assert.equal(service.resolve('mine:new-id').name, 'New')
  assert.equal(upd.svgFile, rec.svgFile)
  assert.ok(fs.existsSync(asset))
})

test('reassigning an alias already owned by another symbol is rejected, leaving the original untouched', () => {
  service.create({ alias: ['user:a'], name: 'A', svg: SVG })
  service.create({ alias: ['user:b'], name: 'B', svg: SVG })
  assert.throws(
    () => service.update('user:a', { name: 'A', alias: ['user:b'], svg: SVG }),
    (e) => {
      assert.equal(e.status, 409)
      return true
    }
  )
  // The failed reassignment rolled back: the original keeps its identity.
  const a = service.resolve('user:a')
  assert.equal(a.name, 'A')
  assert.deepEqual(aliasStrings(a), ['user:a'])
})

test('update without an alias keeps the current aliases', () => {
  const a = service.create({ alias: ['user:a'], name: 'A', svg: SVG })
  const upd = service.update('user:a', { name: 'A2' })
  assert.equal(upd.uuid, a.uuid)
  assert.deepEqual(aliasStrings(upd), ['user:a'])
  assert.equal(upd.name, 'A2')
})

test('creating a symbol with an already-used alias is rejected and leaves no orphan', () => {
  service.create({ alias: ['user:a'], name: 'A', svg: SVG })
  assert.throws(
    () => service.create({ alias: ['user:a'], name: 'A2', svg: SVG }),
    (e) => {
      assert.equal(e.status, 409)
      return true
    }
  )
  assert.equal(service.list().length, 1)
})

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

let dir
let store
let service

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symmgr-'))
  store = new SymbolStore(dir)
  service = new SymbolService(store, { defaultNamespace: 'user', maxSvgBytes: 256 * 1024 })
})

afterEach(() => {
  store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('create defaults namespace to "user" and sanitizes svg', () => {
  const rec = service.create({ id: 'dive-site', name: 'Dive Site', svg: SVG })
  assert.equal(rec.namespace, 'user')
  assert.equal(rec.id, 'dive-site')
  const svg = service.readSvg(rec)
  assert.ok(/<svg/.test(svg))
})

test('map-marker role requires scale and anchor', () => {
  assert.throws(
    () => service.create({ id: 'm1', name: 'M', roles: ['note'], svg: SVG }),
    ValidationError
  )
  const ok = service.create({
    id: 'm1',
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
  const rec = service.create({ id: 'btn', name: 'Button', roles: ['button'], svg: SVG })
  assert.equal(rec.scale, null)
  assert.equal(rec.anchor, null)
})

test('listResources is keyed by namespace:id with $source and timestamp', () => {
  service.create({ id: 'dive-site', name: 'Dive Site', svg: SVG })
  const all = service.listResources()
  assert.ok(all['user:dive-site'])
  const r = all['user:dive-site']
  assert.equal(r.namespace, 'user')
  assert.equal(r.id, 'dive-site')
  assert.equal(r.$source, 'signalk-symbol-manager')
  assert.ok(typeof r.timestamp === 'string')
  assert.equal(r.mediaType, 'image/svg+xml')
  assert.equal(r.url, `${ASSET_BASE}/dive-site.svg`)
})

test('unqualified resolve works when unique, throws when ambiguous', () => {
  service.create({ id: 'dive-site', namespace: 'user', name: 'A', svg: SVG })
  assert.equal(service.resolve('dive-site').namespace, 'user')
  assert.equal(service.resolve('user:dive-site').namespace, 'user')

  service.create({ id: 'dive-site', namespace: 'fleet', name: 'B', svg: SVG })
  assert.throws(() => service.resolve('dive-site'), (e) => {
    assert.ok(e instanceof ValidationError)
    assert.equal(e.status, 409)
    return true
  })
  // qualified still resolves
  assert.equal(service.resolve('fleet:dive-site').name, 'B')
})

test('asset url switches to qualified form when local id is ambiguous', () => {
  service.create({ id: 'x', namespace: 'user', name: 'A', svg: SVG })
  let res = service.listResources()
  assert.equal(res['user:x'].url, `${ASSET_BASE}/x.svg`)

  service.create({ id: 'x', namespace: 'other', name: 'B', svg: SVG })
  res = service.listResources()
  assert.equal(res['user:x'].url, `${ASSET_BASE}/${encodeURIComponent('user:x')}.svg`)
  assert.equal(res['other:x'].url, `${ASSET_BASE}/${encodeURIComponent('other:x')}.svg`)
})

test('duplicate creates an independent copy', () => {
  service.create({ id: 'a', name: 'A', svg: SVG })
  const copy = service.duplicate('user:a', 'b', undefined, 'B')
  assert.equal(copy.id, 'b')
  assert.equal(copy.namespace, 'user')
  assert.equal(copy.name, 'B')
  assert.equal(service.list().length, 2)
})

test('duplicate can reuse the same id under a different namespace', () => {
  service.create({ id: 'a', name: 'A', svg: SVG })
  const copy = service.duplicate('user:a', 'a', 'mine')
  assert.equal(copy.id, 'a')
  assert.equal(copy.namespace, 'mine')
  // Same id + different namespace coexist.
  assert.equal(service.list().length, 2)
  assert.equal(service.resolve('user:a').namespace, 'user')
  assert.equal(service.resolve('mine:a').namespace, 'mine')
})

test('duplicate into the same namespace+id is rejected', () => {
  service.create({ id: 'a', name: 'A', svg: SVG })
  assert.throws(
    () => service.duplicate('user:a', 'a', 'user'),
    (e) => {
      assert.equal(e.status, 409)
      return true
    }
  )
})

test('update edits metadata and delete removes symbol + asset', () => {
  const rec = service.create({ id: 'a', name: 'A', svg: SVG })
  const assetPath = path.join(dir, 'assets', rec.svgFile)
  assert.ok(fs.existsSync(assetPath))

  const upd = service.update('user:a', { name: 'A2', roles: ['button'], tags: ['x', 'y'] })
  assert.equal(upd.name, 'A2')
  assert.deepEqual(upd.tags, ['x', 'y'])

  assert.equal(service.delete('user:a'), true)
  assert.equal(service.list().length, 0)
  assert.ok(!fs.existsSync(assetPath))
})

test('update renames id/namespace, moving the asset and key', () => {
  const rec = service.create({ id: 'old-id', name: 'Old', svg: SVG })
  const oldAsset = path.join(dir, 'assets', rec.svgFile)
  assert.ok(fs.existsSync(oldAsset))

  const upd = service.update('user:old-id', {
    id: 'new-id',
    namespace: 'mine',
    name: 'New',
    svg: SVG
  })
  assert.equal(upd.id, 'new-id')
  assert.equal(upd.namespace, 'mine')

  // Old identity is gone; new identity resolves; old asset file moved.
  assert.throws(() => service.resolve('user:old-id'), (e) => e.status === 404)
  assert.equal(service.resolve('mine:new-id').name, 'New')
  assert.ok(!fs.existsSync(oldAsset))
  assert.ok(fs.existsSync(path.join(dir, 'assets', upd.svgFile)))
})

test('rename onto an existing identity is rejected', () => {
  service.create({ id: 'a', name: 'A', svg: SVG })
  service.create({ id: 'b', name: 'B', svg: SVG })
  assert.throws(
    () => service.update('user:a', { id: 'b', name: 'A', svg: SVG }),
    (e) => {
      assert.equal(e.status, 409)
      return true
    }
  )
  // The failed rename left the original untouched.
  assert.equal(service.resolve('user:a').name, 'A')
})

test('update without id/namespace keeps the current identity', () => {
  service.create({ id: 'a', name: 'A', svg: SVG })
  const upd = service.update('user:a', { name: 'A2' })
  assert.equal(upd.id, 'a')
  assert.equal(upd.namespace, 'user')
  assert.equal(upd.name, 'A2')
})

test('duplicate id within same namespace is rejected', () => {
  service.create({ id: 'a', name: 'A', svg: SVG })
  assert.throws(() => service.create({ id: 'a', name: 'A2', svg: SVG }), (e) => {
    assert.equal(e.status, 409)
    return true
  })
})

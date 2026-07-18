const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function loadKnownAliases() {
  const sourcePath = path.join(__dirname, '..', 'web', 'src', 'knownAliases.ts')
  const source = fs.readFileSync(sourcePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText
  const module = { exports: {} }
  const fn = new Function('module', 'exports', compiled)
  fn(module, module.exports)
  return module.exports
}

test('known alias matcher filters by namespace prefix', () => {
  const { matchingKnownAliases } = loadKnownAliases()

  const matches = matchingKnownAliases({ namespace: 'bin', id: '' })

  assert.ok(matches.length > 0)
  assert.ok(matches.every((m) => m.namespace === 'binnacle'))
})

test('known alias matcher offers fsk aliases when custom is replaced in namespace', () => {
  const { matchingKnownAliases } = loadKnownAliases()

  const matches = matchingKnownAliases({ namespace: 'fsk', id: '' }, 8, 'namespace')

  assert.ok(matches.length > 0)
  assert.ok(matches.every((m) => m.namespace === 'fsk'))
  assert.equal(matches[0].label, 'fsk:anchorage')
})

test('known alias matcher returns all namespace matches when no limit is supplied', () => {
  const { matchingKnownAliases } = loadKnownAliases()

  const matches = matchingKnownAliases({ namespace: 'fsk', id: '' }, undefined, 'namespace')

  assert.ok(matches.length > 8)
  assert.ok(matches.some((m) => m.label === 'fsk:route-waypoint'))
  assert.ok(matches.every((m) => m.namespace === 'fsk'))
})

test('namespace autocomplete ignores an existing generated id in the row', () => {
  const { matchingKnownAliases } = loadKnownAliases()

  const matches = matchingKnownAliases(
    { namespace: 'fsk', id: 'circle1' },
    8,
    'namespace'
  )

  assert.ok(matches.length > 0)
  assert.equal(matches[0].label, 'fsk:anchorage')
})

test('id autocomplete respects a known namespace when filtering ids', () => {
  const { matchingKnownAliases } = loadKnownAliases()

  const matches = matchingKnownAliases({ namespace: 'fsk', id: 'dive' }, 8, 'id')

  assert.deepEqual(
    matches.map((m) => m.label),
    ['fsk:dive-site', 'fsk:diver-down']
  )
})

test('known alias matcher offers vendor aliases when only the id is typed', () => {
  const { matchingKnownAliases } = loadKnownAliases()

  const matches = matchingKnownAliases({ namespace: 'user', id: 'dive' }, 8, 'id')

  assert.deepEqual(
    matches.map((m) => m.label),
    ['fsk:dive-site', 'fsk:diver-down', 'binnacle:dive-site', 'binnacle:diver-down']
  )
})

test('known alias catalog includes Freeboard-only replaceable ids', () => {
  const { matchingKnownAliases } = loadKnownAliases()

  assert.deepEqual(
    matchingKnownAliases({ namespace: 'fsk', id: 'route' }, 8, 'id').map(
      (m) => m.label
    ),
    ['fsk:route-start', 'fsk:route-waypoint', 'fsk:route-end']
  )
  assert.deepEqual(
    matchingKnownAliases({ namespace: 'fsk', id: 'vessel' }, 8, 'id').map(
      (m) => m.label
    ),
    ['fsk:vessel-self']
  )
  // The catalog also carries a per-speed wind-barb glyph for every barb step
  // (`-5` … `-75`), so this match is truncated by the limit. Assert the base
  // windsock pair leads the list rather than pinning the truncated tail.
  const weather = matchingKnownAliases(
    { namespace: 'fsk', id: 'weather' },
    8,
    'id'
  ).map((m) => m.label)
  assert.deepEqual(weather.slice(0, 2), [
    'fsk:real-weatherStation',
    'fsk:virtual-weatherStation'
  ])
  assert.ok(weather.every((label) => /^fsk:(real|virtual)-weatherStation/.test(label)))
})

test('known alias catalog does not leak Freeboard-only ids into Binnacle', () => {
  const { matchingKnownAliases } = loadKnownAliases()

  assert.deepEqual(
    matchingKnownAliases({ namespace: 'binnacle', id: 'route' }, 8, 'id').map(
      (m) => m.label
    ),
    []
  )
  assert.deepEqual(
    matchingKnownAliases({ namespace: 'binnacle', id: 'dive' }, 8, 'id').map(
      (m) => m.label
    ),
    ['binnacle:dive-site', 'binnacle:diver-down']
  )
})

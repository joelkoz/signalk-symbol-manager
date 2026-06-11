'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  validateNamespace,
  validateLocalId,
  canonicalKey,
  parseReference,
  ValidationError
} = require('../plugin/symbolKey')

test('validateNamespace accepts [A-Za-z0-9_-]+', () => {
  assert.equal(validateNamespace('user'), 'user')
  assert.equal(validateNamespace('my_custom1'), 'my_custom1')
  assert.equal(validateNamespace('signalk-symbol-manager'), 'signalk-symbol-manager')
})

test('validateNamespace rejects blank, ":", bad chars, and reserved', () => {
  assert.throws(() => validateNamespace(''), ValidationError)
  assert.throws(() => validateNamespace('a:b'), ValidationError)
  assert.throws(() => validateNamespace('bad space'), ValidationError)
  assert.throws(() => validateNamespace('default'), ValidationError)
})

test('validateLocalId rejects ":" and leading symbols', () => {
  assert.equal(validateLocalId('dive-site'), 'dive-site')
  assert.equal(validateLocalId('a_b-1'), 'a_b-1')
  assert.throws(() => validateLocalId('a:b'), ValidationError)
  assert.throws(() => validateLocalId('-leading'), ValidationError)
  assert.throws(() => validateLocalId(''), ValidationError)
})

test('canonicalKey builds namespace:id', () => {
  assert.equal(canonicalKey('user', 'dive-site'), 'user:dive-site')
})

test('parseReference splits qualified and passes through local', () => {
  assert.deepEqual(parseReference('user:dive-site'), {
    namespace: 'user',
    id: 'dive-site'
  })
  assert.deepEqual(parseReference('dive-site'), { id: 'dive-site' })
  assert.throws(() => parseReference('a:b:c'), ValidationError)
})

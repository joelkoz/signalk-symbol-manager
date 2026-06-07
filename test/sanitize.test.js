'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { sanitizeSvg, nominalSize } = require('../plugin/sanitize')
const { ValidationError } = require('../plugin/symbolKey')

const OPTS = { maxBytes: 256 * 1024 }

test('strips <script> elements', () => {
  const out = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
    OPTS
  )
  assert.ok(!/script/i.test(out.svg))
  assert.ok(out.warnings.some((w) => /script/.test(w)))
})

test('strips inline event handlers', () => {
  const out = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" onclick="evil()"/></svg>',
    OPTS
  )
  assert.ok(!/onclick/i.test(out.svg))
})

test('removes <foreignObject>', () => {
  const out = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><foreignObject><div>x</div></foreignObject></svg>',
    OPTS
  )
  assert.ok(!/foreignObject/i.test(out.svg))
})

test('removes external href references', () => {
  const out = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="http://evil.example/x.png"/><rect width="10" height="10"/></svg>',
    OPTS
  )
  assert.ok(!/evil\.example/.test(out.svg))
  // The element survives but its external reference is stripped.
  assert.ok(!/href=/.test(out.svg) || !/http/.test(out.svg))
})

test('drops external url() in fill, keeps fragment url()', () => {
  const out = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="url(http://evil/x)"/><rect width="5" height="5" fill="url(#grad)"/></svg>',
    OPTS
  )
  assert.ok(!/evil/.test(out.svg))
  assert.ok(/url\(#grad\)/.test(out.svg))
})

test('enforces size limit', () => {
  const big = '<svg xmlns="http://www.w3.org/2000/svg">' + 'x'.repeat(50) + '</svg>'
  assert.throws(() => sanitizeSvg(big, { maxBytes: 10 }), ValidationError)
})

test('rejects empty/non-svg input', () => {
  assert.throws(() => sanitizeSvg('', OPTS), ValidationError)
  assert.throws(() => sanitizeSvg('<div>not svg</div>', OPTS), ValidationError)
})

test('extracts dimensions and viewBox', () => {
  const out = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="37" height="37" viewBox="0 0 9.79 9.79"><rect width="1" height="1"/></svg>',
    OPTS
  )
  assert.equal(out.width, 37)
  assert.equal(out.height, 37)
  assert.deepEqual(out.viewBox, [0, 0, 9.79, 9.79])
  assert.deepEqual(nominalSize(out), { width: 37, height: 37 })
})

test('nominalSize falls back to viewBox extent', () => {
  assert.deepEqual(
    nominalSize({ width: null, height: null, viewBox: [0, 0, 48, 24] }),
    { width: 48, height: 24 }
  )
})

test('rejects internal entity definitions (XXE / billion-laughs guard)', () => {
  const bomb =
    '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "AAAA">]>' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
  assert.throws(() => sanitizeSvg(bomb, OPTS), ValidationError)
})

test('removes disallowed elements not on the allowlist', () => {
  const out = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><iframe src="http://x"></iframe><rect width="10" height="10"/></svg>',
    OPTS
  )
  assert.ok(!/iframe/i.test(out.svg))
  assert.ok(/<rect/i.test(out.svg))
})

test('keeps allowlisted elements and local fragment refs', () => {
  const out = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><use href="#g"/><rect width="10" height="10" fill="url(#g)"/></svg>',
    OPTS
  )
  assert.ok(/linearGradient/.test(out.svg))
  assert.ok(/<use/.test(out.svg) && /#g/.test(out.svg))
  assert.ok(/url\(#g\)/.test(out.svg))
})

test('sanitizes <style> CSS (@import, external url, expression)', () => {
  const out = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><style>@import url(http://evil/x.css); .a{fill:url(http://evil/y)} .b{width:expression(alert(1))}</style><rect class="a" width="10" height="10"/></svg>',
    OPTS
  )
  assert.ok(!/@import/i.test(out.svg))
  assert.ok(!/evil/.test(out.svg))
  assert.ok(!/expression\s*\(/i.test(out.svg))
})

test('preserves data-* attributes (template fill target)', () => {
  const out = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path data-fill="body" d="M0 0" fill="#d71920"/></svg>',
    OPTS
  )
  assert.ok(/data-fill="body"/.test(out.svg))
})

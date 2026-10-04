// Enforces that every numeric constant exported by references.js has a
// citation. This is the mechanism, not discipline: a new magic number
// with no matching entry in REFERENCES fails this test.
//
// Ported from tests/domain/test_references.py. The JS equivalent of
// Python's `name.isupper()` + `vars(module)` introspection is a regex
// over SCREAMING_SNAKE_CASE export names plus Object.entries() on the
// module namespace object.

import { expect, it } from 'vitest'
import * as ref from '../../lib/domain/references.js'

const CONSTANT_NAME_RE = /^[A-Z][A-Z0-9_]*$/

function exportedNumericNames () {
  const names = new Set()
  for (const [name, value] of Object.entries(ref)) {
    if (!CONSTANT_NAME_RE.test(name)) continue
    if (name === 'REFERENCES') continue
    if (typeof value === 'number') {
      names.add(name)
    } else if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'number' || typeof v === 'string')) {
      // tuple of enum values or numbers, e.g. DEFICIT_RELAXATION_STEPS / CONDITION_SCREEN_KEYWORDS
      names.add(name)
    } else if (
      value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length > 0 && Object.values(value).every((v) => typeof v === 'number')
    ) {
      // object of enum -> number, e.g. ACTIVITY_MULTIPLIERS
      names.add(name)
    }
  }
  return names
}

it('every numeric constant has a source', () => {
  const numericNames = exportedNumericNames()
  const missing = [...numericNames].filter((n) => !(n in ref.REFERENCES)).sort()
  expect(missing, `Numeric constants missing a REFERENCES entry: ${missing}`).toEqual([])
})

it('there are no stale reference entries', () => {
  const numericNames = exportedNumericNames()
  const stale = Object.keys(ref.REFERENCES).filter((n) => !numericNames.has(n)).sort()
  expect(stale, `REFERENCES entries for names that no longer exist: ${stale}`).toEqual([])
})

it('every reference has a citation string', () => {
  for (const [name, reference] of Object.entries(ref.REFERENCES)) {
    expect(reference.citation, `${name} has an empty citation`).toBeTruthy()
  }
})

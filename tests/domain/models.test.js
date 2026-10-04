import { expect, it } from 'vitest'
import { TargetsResult } from '../../lib/domain/models.js'

// Ported from tests/domain/test_models.py.

it('targets result refused property', () => {
  const result = new TargetsResult(null, [])
  expect(result.refused).toBe(true)
  expect(result.planAllowed).toBe(false)
})

it('targets result plan allowed when targets present', () => {
  // A minimal stand-in is enough; planAllowed only checks refused.
  const result = new TargetsResult({}, [])
  expect(result.refused).toBe(false)
  expect(result.planAllowed).toBe(true)
})

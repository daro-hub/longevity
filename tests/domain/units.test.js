import { describe, expect, it } from 'vitest'
import { clamp, roundGrams, roundHalfToEven, roundKcal, roundMl } from '../../lib/domain/units.js'

// No Python equivalent file exists (units.py has no dedicated test --
// it's exercised indirectly through macros.py etc). This file exists
// specifically to pin the round-half-to-even behavior deliberately
// chosen for this port (see units.js's module comment) against JS's
// native Math.round (round-half-up), so a future refactor can't
// silently flip it on a .5 tie.

describe('roundHalfToEven', () => {
  it('rounds a tie to the even neighbor, not always up', () => {
    expect(roundHalfToEven(0.5)).toBe(0)
    expect(roundHalfToEven(1.5)).toBe(2)
    expect(roundHalfToEven(2.5)).toBe(2)
    expect(roundHalfToEven(3.5)).toBe(4)
  })

  it('rounds a non-tie normally', () => {
    expect(roundHalfToEven(2.4)).toBe(2)
    expect(roundHalfToEven(2.6)).toBe(3)
  })

  it('supports a decimals argument for display rounding (e.g. BMI to 1 decimal)', () => {
    expect(roundHalfToEven(22.456, 1)).toBeCloseTo(22.5, 5)
    expect(roundHalfToEven(22.449, 1)).toBeCloseTo(22.4, 5)
  })
})

describe('roundGrams / roundKcal / roundMl', () => {
  it('all delegate to roundHalfToEven at zero decimals', () => {
    expect(roundGrams(2.5)).toBe(2)
    expect(roundKcal(2.5)).toBe(2)
    expect(roundMl(2.5)).toBe(2)
  })
})

describe('clamp', () => {
  it('returns the value when within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('clamps to the low bound', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })

  it('clamps to the high bound', () => {
    expect(clamp(50, 0, 10)).toBe(10)
  })
})

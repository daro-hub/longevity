import { describe, expect, it } from 'vitest'
import {
  adjustedBodyWeightKg,
  bmi,
  bmiCategory,
  idealBodyWeightKg
} from '../../lib/domain/anthropometry.js'
import { BmiCategory, Sex } from '../../lib/domain/enums.js'

// Ported from tests/domain/test_anthropometry.py.

it('computes bmi', () => {
  // 70kg, 175cm -> 70 / 1.75^2 = 22.857...
  expect(bmi(70, 175)).toBeCloseTo(22.857, 2)
})

describe('bmiCategory boundaries', () => {
  const cases = [
    [16.9, BmiCategory.SEVERE_UNDERWEIGHT],
    [17.0, BmiCategory.UNDERWEIGHT],
    [18.4, BmiCategory.UNDERWEIGHT],
    [18.5, BmiCategory.NORMAL],
    [24.9, BmiCategory.NORMAL],
    [25.0, BmiCategory.OVERWEIGHT],
    [29.9, BmiCategory.OVERWEIGHT],
    [30.0, BmiCategory.OBESE_I],
    [34.9, BmiCategory.OBESE_I],
    [35.0, BmiCategory.OBESE_II],
    [39.9, BmiCategory.OBESE_II],
    [40.0, BmiCategory.OBESE_III],
    [50.0, BmiCategory.OBESE_III]
  ]

  it.each(cases)('bmi %s -> %s', (bmiValue, expected) => {
    expect(bmiCategory(bmiValue)).toBe(expected)
  })
})

it('ideal body weight male at base height', () => {
  expect(idealBodyWeightKg(152.4, Sex.MALE)).toBeCloseTo(50.0, 2)
})

it('ideal body weight female at base height', () => {
  expect(idealBodyWeightKg(152.4, Sex.FEMALE)).toBeCloseTo(45.5, 2)
})

it('ideal body weight below base height does not go negative', () => {
  // Shorter than the 5ft base: no inches "over", so IBW == base, never negative.
  const ibw = idealBodyWeightKg(140.0, Sex.FEMALE)
  expect(ibw).toBeCloseTo(45.5, 2)
})

it('ideal body weight scales with height', () => {
  const ibwTall = idealBodyWeightKg(180.0, Sex.MALE)
  const ibwBase = idealBodyWeightKg(152.4, Sex.MALE)
  expect(ibwTall).toBeGreaterThan(ibwBase)
})

it('adjusted body weight sits between ibw and actual for obese', () => {
  // 120kg at 170cm is obese; ABW should sit between IBW and actual weight.
  const ibw = idealBodyWeightKg(170.0, Sex.MALE)
  const abw = adjustedBodyWeightKg(120.0, 170.0, Sex.MALE)
  expect(abw).toBeGreaterThan(ibw)
  expect(abw).toBeLessThan(120.0)
})

it('adjusted body weight equals actual when at ibw', () => {
  const ibw = idealBodyWeightKg(170.0, Sex.MALE)
  const abw = adjustedBodyWeightKg(ibw, 170.0, Sex.MALE)
  expect(abw).toBeCloseTo(ibw, 2)
})

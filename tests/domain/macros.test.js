import { describe, expect, it } from 'vitest'
import * as ref from '../../lib/domain/references.js'
import { ActivityLevel, Goal, Sex } from '../../lib/domain/enums.js'
import {
  fatFloorG,
  fiberTargetG,
  hydrationTargetMl,
  isFeasible,
  macroTargets,
  proteinTargetG
} from '../../lib/domain/macros.js'

// Ported from tests/domain/test_macros.py.

it('protein target uses actual weight below overweight bmi', () => {
  // BMI < 25 (overweight threshold): reference weight == actual weight.
  const g = proteinTargetG(70, 175, Sex.MALE, 30, Goal.MAINTAIN, 22.0)
  expect(g).toBeCloseTo(70 * 1.2, 5)
})

it('protein target uses adjusted weight when obese', () => {
  // BMI 35: reference weight should be adjusted body weight, not actual.
  const actualWeight = 110.0
  const g = proteinTargetG(actualWeight, 170, Sex.MALE, 30, Goal.MAINTAIN, 35.0)
  const naive = actualWeight * ref.PROTEIN_G_PER_KG[Goal.MAINTAIN]
  expect(g).toBeLessThan(naive) // adjusted weight is lower than actual for obese
})

it('protein target elderly floor', () => {
  // age >= 65 forces at least 1.2 g/kg even for a goal with a lower rate.
  const gYoung = proteinTargetG(70, 175, Sex.MALE, 30, Goal.MAINTAIN, 22.0)
  const gElderly = proteinTargetG(70, 175, Sex.MALE, 70, Goal.MAINTAIN, 22.0)
  expect(gElderly).toBeGreaterThanOrEqual(gYoung)
})

it('protein target capped at max', () => {
  const g = proteinTargetG(70, 175, Sex.MALE, 30, Goal.GAIN_MUSCLE, 22.0)
  expect(g).toBeLessThanOrEqual(70 * ref.PROTEIN_G_PER_KG_MAX)
})

it('fat floor is the higher of two methods', () => {
  // weight=100kg -> by_weight = 80g; kcal=1500 -> by_pct = 0.20*1500/9=33.3g
  expect(fatFloorG(1500, 100)).toBeCloseTo(80.0, 1)
  // weight=50kg -> by_weight=40g; kcal=3000 -> by_pct=0.20*3000/9=66.7g
  expect(fatFloorG(3000, 50)).toBeCloseTo(66.67, 1)
})

it('fiber target floor for low calorie', () => {
  // 1200 kcal * 14/1000 = 16.8, below the 25g floor
  expect(fiberTargetG(1200)).toBeCloseTo(25.0, 5)
})

it('fiber target scales above floor', () => {
  // 3000 kcal * 14/1000 = 42
  expect(fiberTargetG(3000)).toBeCloseTo(42.0, 5)
})

it('hydration is clamped and gets a bonus for very active', () => {
  // 40kg * 35 = 1400 -> clamped to 1500 min
  expect(hydrationTargetMl(40, ActivityLevel.SEDENTARY)).toBe(1500)
  // 100kg * 35 = 3500, + 500 very_active bonus = 4000 (== max, not clamped further)
  expect(hydrationTargetMl(100, ActivityLevel.VERY_ACTIVE)).toBe(4000)
  // 150kg * 35 = 5250 -> clamped to 4000 max
  expect(hydrationTargetMl(150, ActivityLevel.SEDENTARY)).toBe(4000)
})

it('is feasible is true when floors fit', () => {
  // protein 100g (400kcal) + fat 50g (450kcal) = 850kcal <= 2000
  expect(isFeasible(2000, 100, 50)).toBe(true)
})

it('is feasible is false when floors exceed kcal', () => {
  // protein 200g (800kcal) + fat 100g (900kcal) = 1700kcal > 1200
  expect(isFeasible(1200, 200, 100)).toBe(false)
})

describe('macroTargets rounding identity', () => {
  // The most important invariant in the whole engine: kcalFromMacros must
  // exactly equal 4*protein + 4*carb + 9*fat using the ROUNDED grams,
  // because that's what the plan validator will check a real meal plan
  // against. If this drifts, the validator chases an unreachable target.

  it('atwater identity holds exactly', () => {
    const cases = [
      [2000, 70, 175, Sex.MALE, 30, Goal.MAINTAIN, 22.0],
      [1800, 60, 165, Sex.FEMALE, 45, Goal.LOSE_WEIGHT, 26.0],
      [2800, 90, 185, Sex.MALE, 25, Goal.GAIN_MUSCLE, 24.0],
      [1500, 55, 160, Sex.FEMALE, 70, Goal.MAINTAIN, 21.0]
    ]
    for (const [kcal, weight, height, sex, age, goal, bmiValue] of cases) {
      const m = macroTargets(kcal, weight, height, sex, age, goal, bmiValue)
      const recomputed = 4 * m.proteinG + 4 * m.carbG + 9 * m.fatG
      expect(recomputed).toBeCloseTo(m.kcalFromMacros, 1)
    }
  })

  it('grams are whole numbers', () => {
    const m = macroTargets(2137, 73.4, 176.2, Sex.MALE, 33, Goal.MAINTAIN, 23.6)
    expect(m.proteinG).toBe(Math.trunc(m.proteinG))
    expect(m.carbG).toBe(Math.trunc(m.carbG))
    expect(m.fatG).toBe(Math.trunc(m.fatG))
    expect(m.fiberG).toBe(Math.trunc(m.fiberG))
  })

  it('carbs are never negative', () => {
    // Even in a contrived very-low-kcal scenario, carbs must clamp to 0
    // rather than go negative (engine.js's relaxation search should
    // prevent this from being reached in practice; this is the last
    // line of defense).
    const m = macroTargets(900, 120, 170, Sex.MALE, 30, Goal.LOSE_WEIGHT, 38.0)
    expect(m.carbG).toBeGreaterThanOrEqual(0)
  })
})

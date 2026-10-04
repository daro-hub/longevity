import { afterEach, expect, it, vi } from 'vitest'
import * as macrosModule from '../../lib/domain/macros.js'
import { computeTargets } from '../../lib/domain/engine.js'
import { ActivityLevel, BmiCategory, Goal, Sex, ViolationCode } from '../../lib/domain/enums.js'
import { createProfile } from '../../lib/domain/models.js'

// Ported from tests/domain/test_engine.py.

function makeProfile (overrides = {}) {
  return createProfile({
    ageYears: 30,
    sex: Sex.MALE,
    heightCm: 175.0,
    weightKg: 75.0,
    activityLevel: ActivityLevel.MODERATE,
    goal: Goal.MAINTAIN,
    healthNotes: '',
    ...overrides
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

it('a normal profile produces targets', () => {
  const result = computeTargets(makeProfile())
  expect(result.refused).toBe(false)
  expect(result.targets).not.toBeNull()
  expect(result.targets.bmi).toBeGreaterThan(0)
  expect(result.targets.calories.kcal).toBeGreaterThan(0)
  expect(result.targets.macros.proteinG).toBeGreaterThan(0)
})

it('a refused profile has no targets', () => {
  const result = computeTargets(makeProfile({ ageYears: 10 }))
  expect(result.refused).toBe(true)
  expect(result.targets).toBeNull()
  expect(result.violations.some((v) => v.code === ViolationCode.AGE_CHILD)).toBe(true)
})

it('atwater identity holds on final targets', () => {
  const result = computeTargets(makeProfile({ goal: Goal.LOSE_WEIGHT }))
  const m = result.targets.macros
  const recomputed = 4 * m.proteinG + 4 * m.carbG + 9 * m.fatG
  expect(recomputed).toBeCloseTo(m.kcalFromMacros, 1)
  // The calorie target exposed to callers must match the macro-derived kcal.
  expect(result.targets.calories.kcal).toBeCloseTo(m.kcalFromMacros, 1)
})

it('the engine version is stamped', () => {
  const result = computeTargets(makeProfile())
  expect(result.targets.engineVersion).toBeTruthy()
})

it('final targets are always feasible across a wide scan', () => {
  // With the current reference constants, protein/fat floors are
  // generous enough relative to TDEE that infeasibility is rare in
  // practice for realistic adult bodies -- but the invariant must hold
  // everywhere it's reachable, not just in a hand-picked example.
  for (let weight = 50; weight < 180; weight += 15) {
    for (let height = 150; height < 195; height += 15) {
      const profile = makeProfile({
        heightCm: Number(height),
        weightKg: Number(weight),
        activityLevel: ActivityLevel.SEDENTARY,
        goal: Goal.LOSE_WEIGHT
      })
      const result = computeTargets(profile)
      if (result.refused) continue
      const m = result.targets.macros
      const consumed = m.proteinG * 4 + m.fatG * 9
      expect(consumed, `${weight},${height}`).toBeLessThanOrEqual(result.targets.calories.kcal + 1)
      expect(m.carbG, `${weight},${height}`).toBeGreaterThanOrEqual(0)
    }
  }
})

it('the deficit relaxation mechanism engages when floors do not fit', () => {
  // The realistic scan above shows infeasibility essentially never
  // happens with today's constants -- which is exactly why this
  // mechanism needs its own direct test rather than relying on finding
  // a naturally-occurring example. Force the first candidate to be
  // infeasible and confirm the engine relaxes to the next one instead of
  // returning negative carbs or silently keeping the aggressive deficit.
  const realIsFeasible = macrosModule.isFeasible
  let calls = 0
  vi.spyOn(macrosModule, 'isFeasible').mockImplementation((kcal, proteinG, fatG) => {
    calls += 1
    if (calls === 1) return false // force the base -20% deficit to be rejected
    return realIsFeasible(kcal, proteinG, fatG)
  })

  const profile = makeProfile({ goal: Goal.LOSE_WEIGHT })
  const result = computeTargets(profile)

  expect(result.refused).toBe(false)
  expect(result.violations.some((v) => v.code === ViolationCode.DEFICIT_RELAXED_FOR_FLOORS)).toBe(true)
  // Relaxed adjustment must be less aggressive (closer to zero) than -20%.
  expect(result.targets.calories.appliedAdjustmentPct).toBeGreaterThan(-0.20)
})

it('bmi class III caps the deficit at 15 percent', () => {
  const profile = makeProfile({ weightKg: 125.0, goal: Goal.LOSE_WEIGHT }) // BMI ~41
  const result = computeTargets(profile)
  expect(result.targets.bmiCategory).toBe(BmiCategory.OBESE_III)
  expect(result.targets.calories.appliedAdjustmentPct).toBeGreaterThanOrEqual(-0.15 - 1e-9)
})

it('an underweight goal conflict forces maintain / zero adjustment', () => {
  const profile = makeProfile({ weightKg: 54.5, goal: Goal.LOSE_WEIGHT }) // BMI ~17.8
  const result = computeTargets(profile)
  expect(result.targets.calories.appliedAdjustmentPct).toBeCloseTo(0.0, 5)
})

it('severe underweight refuses the plan', () => {
  const profile = makeProfile({ weightKg: 49.0 }) // BMI ~16
  const result = computeTargets(profile)
  expect(result.refused).toBe(true)
})

it('a minor refuses targets', () => {
  const profile = makeProfile({ ageYears: 15 })
  const result = computeTargets(profile)
  expect(result.refused).toBe(true)
})

it('a screened condition refuses targets', () => {
  const profile = makeProfile({ healthNotes: 'sono in dialisi da un anno' })
  const result = computeTargets(profile)
  expect(result.refused).toBe(true)
  expect(result.violations.some((v) => v.code === ViolationCode.CONDITION_SCREEN)).toBe(true)
})

it('relaxation exhausted still returns best-effort targets', () => {
  // If even a zero-adjustment (maintenance) target can't fit the floors,
  // the engine must still return its best-effort last attempt rather
  // than throwing or returning nothing -- macroTargets' own carb-clamp
  // is the true last line of defense at that point.
  vi.spyOn(macrosModule, 'isFeasible').mockReturnValue(false)

  const profile = makeProfile({ goal: Goal.LOSE_WEIGHT })
  const result = computeTargets(profile)

  expect(result.refused).toBe(false)
  expect(result.targets).not.toBeNull()
  expect(result.violations.some((v) => v.code === ViolationCode.DEFICIT_RELAXED_FOR_FLOORS)).toBe(true)
  expect(result.targets.calories.appliedAdjustmentPct).toBeCloseTo(0.0, 5)
})

it('an elderly warning still produces targets', () => {
  const profile = makeProfile({ ageYears: 92 })
  const result = computeTargets(profile)
  expect(result.refused).toBe(false)
  expect(result.violations.some((v) => v.code === ViolationCode.AGE_ELDERLY)).toBe(true)
})

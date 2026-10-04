// Snapshot tests over tests/fixtures/golden_profiles.json.
//
// These pin the exact numeric output of the engine for ~17 profiles
// covering every guardrail branch and several BMI/goal combinations.
// Changing a constant in references.js (say, the protein g/kg for
// lose_weight) will show up here as a concrete, reviewable diff instead
// of silently changing behavior -- that's the point: it's a diff to look
// at and approve, not a failure to "fix" by updating the fixture without
// reading it.
//
// Ported from tests/domain/test_golden_vectors.py.

import { expect, it } from 'vitest'
import cases from '../fixtures/golden_profiles.json'
import { computeTargets } from '../../lib/domain/engine.js'
import { ViolationCode } from '../../lib/domain/enums.js'
import { createProfile } from '../../lib/domain/models.js'

it.each(cases.map((c) => [c.name, c]))('golden profile: %s', (_name, testCase) => {
  const inp = testCase.input
  const profile = createProfile({
    ageYears: inp.age_years,
    sex: inp.sex,
    heightCm: inp.height_cm,
    weightKg: inp.weight_kg,
    activityLevel: inp.activity_level,
    goal: inp.goal,
    healthNotes: inp.health_notes
  })
  const result = computeTargets(profile)
  const expected = testCase.expected

  expect(result.refused).toBe(expected.refused)

  if (expected.refused) {
    const actualCodes = [...result.violations].map((v) => v.code).sort()
    expect(actualCodes).toEqual(expected.violation_codes)
    return
  }

  const t = result.targets
  expect(t.bmi).toBeCloseTo(expected.bmi, 1)
  expect(t.bmiCategory).toBe(expected.bmi_category)
  expect(t.calories.kcal).toBeCloseTo(expected.kcal, 0)
  expect(t.calories.appliedAdjustmentPct).toBeCloseTo(expected.applied_adjustment_pct, 5)
  expect(t.calories.floorApplied).toBe(expected.floor_applied)
  expect(t.macros.proteinG).toBeCloseTo(expected.protein_g, 0)
  expect(t.macros.carbG).toBeCloseTo(expected.carb_g, 0)
  expect(t.macros.fatG).toBeCloseTo(expected.fat_g, 0)
  expect(t.macros.fiberG).toBeCloseTo(expected.fiber_g, 0)
  expect(t.hydrationMl).toBeCloseTo(expected.hydration_ml, 0)
  expect([...t.warnings].map((v) => v.code).sort()).toEqual(expected.warning_codes)
})

it('the fixture covers every refuse violation code', () => {
  const refuseCodes = new Set([
    ViolationCode.AGE_CHILD,
    ViolationCode.AGE_MINOR,
    ViolationCode.AGE_IMPLAUSIBLE,
    ViolationCode.HEIGHT_RANGE,
    ViolationCode.WEIGHT_RANGE,
    ViolationCode.BMI_SEVERE_UNDERWEIGHT,
    ViolationCode.CONDITION_SCREEN
  ])
  const covered = new Set()
  for (const testCase of cases) {
    if (testCase.expected.refused) {
      for (const code of testCase.expected.violation_codes) covered.add(code)
    }
  }
  const missing = [...refuseCodes].filter((c) => !covered.has(c))
  expect(missing, `No golden fixture exercises: ${missing}`).toEqual([])
})

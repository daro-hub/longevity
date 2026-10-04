import { describe, expect, it } from 'vitest'
import { ActivityLevel, Goal, Severity, Sex, ViolationCode } from '../../lib/domain/enums.js'
import { effectiveGoal, hasRefusal, validateProfile } from '../../lib/domain/guardrails.js'
import { createProfile } from '../../lib/domain/models.js'

// Ported from tests/domain/test_guardrails.py.

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

describe('guardrail branches', () => {
  const cases = [
    [{ ageYears: 10 }, ViolationCode.AGE_CHILD, Severity.REFUSE],
    [{ ageYears: 15 }, ViolationCode.AGE_MINOR, Severity.REFUSE],
    [{ ageYears: 101 }, ViolationCode.AGE_IMPLAUSIBLE, Severity.REFUSE],
    [{ ageYears: 92 }, ViolationCode.AGE_ELDERLY, Severity.WARN],
    [{ heightCm: 50.0 }, ViolationCode.HEIGHT_RANGE, Severity.REFUSE],
    [{ heightCm: 300.0 }, ViolationCode.HEIGHT_RANGE, Severity.REFUSE],
    [{ weightKg: 10.0 }, ViolationCode.WEIGHT_RANGE, Severity.REFUSE],
    [{ weightKg: 400.0 }, ViolationCode.WEIGHT_RANGE, Severity.REFUSE],
    // BMI 16.0 at 175cm -> weight ~49kg
    [{ weightKg: 49.0 }, ViolationCode.BMI_SEVERE_UNDERWEIGHT, Severity.REFUSE],
    // BMI ~17.8 at 175cm -> weight ~54.5kg
    [{ weightKg: 54.5 }, ViolationCode.BMI_UNDERWEIGHT, Severity.WARN],
    // BMI ~41 at 175cm -> weight ~125kg
    [{ weightKg: 125.0 }, ViolationCode.BMI_CLASS_III, Severity.WARN],
    [{ weightKg: 54.5, goal: Goal.LOSE_WEIGHT }, ViolationCode.GOAL_CONFLICT_DEFICIT, Severity.WARN],
    [{ healthNotes: 'Sono incinta di 6 mesi' }, ViolationCode.CONDITION_SCREEN, Severity.REFUSE],
    [{ healthNotes: 'I have type 2 diabetes' }, ViolationCode.CONDITION_SCREEN, Severity.REFUSE]
  ]

  it.each(cases)('%o -> %s/%s', (overrides, expectedCode, expectedSeverity) => {
    const profile = makeProfile(overrides)
    const violations = validateProfile(profile)
    const matching = violations.filter((v) => v.code === expectedCode)
    expect(matching.length, `expected ${expectedCode} in ${violations.map((v) => v.code)}`).toBeGreaterThan(0)
    expect(matching[0].severity).toBe(expectedSeverity)
  })
})

it('a normal profile has no violations', () => {
  const violations = validateProfile(makeProfile())
  expect(violations).toEqual([])
  expect(hasRefusal(violations)).toBe(false)
})

it('hasRefusal is true when any refuse is present', () => {
  const violations = validateProfile(makeProfile({ ageYears: 10 }))
  expect(hasRefusal(violations)).toBe(true)
})

it('hasRefusal is false for warn-only violations', () => {
  const violations = validateProfile(makeProfile({ weightKg: 125.0 })) // BMI_CLASS_III, warn only
  expect(hasRefusal(violations)).toBe(false)
})

it('effectiveGoal is overridden on conflict', () => {
  const profile = makeProfile({ weightKg: 54.5, goal: Goal.LOSE_WEIGHT })
  const violations = validateProfile(profile)
  expect(effectiveGoal(profile, violations)).toBe(Goal.MAINTAIN)
})

it('effectiveGoal is unchanged without conflict', () => {
  const profile = makeProfile({ goal: Goal.LOSE_WEIGHT })
  const violations = validateProfile(profile)
  expect(effectiveGoal(profile, violations)).toBe(Goal.LOSE_WEIGHT)
})

it('condition screen is case-insensitive', () => {
  const violations = validateProfile(makeProfile({ healthNotes: 'STO ALLATTAMENTO' }))
  expect(violations.some((v) => v.code === ViolationCode.CONDITION_SCREEN)).toBe(true)
})

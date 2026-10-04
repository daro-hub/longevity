// Safety guardrails, evaluated against a Profile before the engine
// computes anything. Every row here is one test case in
// tests/domain/guardrails.test.js, named after its ViolationCode.
//
// The keyword screen in CONDITION_SCREEN is a best-effort fallback, not a
// guarantee -- it will miss conditions not phrased with a listed keyword.
// The disclaimer is never delegated to this screen; it is attached
// unconditionally by the API layer regardless of what guardrails find.
//
// Ported from app/domain/guardrails.py.

import * as ref from './references.js'
import { bmi, bmiCategory } from './anthropometry.js'
import { BmiCategory, Goal, Severity, ViolationCode } from './enums.js'
import { createViolation } from './models.js'
import { roundHalfToEven } from './units.js'

export function validateProfile (profile) {
  const violations = []

  // --- Age ---
  if (profile.ageYears < ref.AGE_CHILD_MAX) {
    violations.push(createViolation(ViolationCode.AGE_CHILD, Severity.REFUSE, 'guardrail.age_child'))
  } else if (profile.ageYears < ref.AGE_MINOR_MAX) {
    violations.push(createViolation(ViolationCode.AGE_MINOR, Severity.REFUSE, 'guardrail.age_minor'))
  } else if (profile.ageYears > ref.AGE_IMPLAUSIBLE_MIN) {
    violations.push(createViolation(ViolationCode.AGE_IMPLAUSIBLE, Severity.REFUSE, 'guardrail.age_implausible'))
  } else if (profile.ageYears >= ref.AGE_ELDERLY_MIN) {
    violations.push(createViolation(ViolationCode.AGE_ELDERLY, Severity.WARN, 'guardrail.age_elderly'))
  }

  // --- Height / weight plausibility ---
  if (!(profile.heightCm >= ref.HEIGHT_CM_MIN && profile.heightCm <= ref.HEIGHT_CM_MAX)) {
    violations.push(createViolation(
      ViolationCode.HEIGHT_RANGE, Severity.REFUSE, 'guardrail.height_range',
      { min: ref.HEIGHT_CM_MIN, max: ref.HEIGHT_CM_MAX }
    ))
  }
  if (!(profile.weightKg >= ref.WEIGHT_KG_MIN && profile.weightKg <= ref.WEIGHT_KG_MAX)) {
    violations.push(createViolation(
      ViolationCode.WEIGHT_RANGE, Severity.REFUSE, 'guardrail.weight_range',
      { min: ref.WEIGHT_KG_MIN, max: ref.WEIGHT_KG_MAX }
    ))
  }

  // BMI-dependent checks only make sense with plausible height/weight.
  const heightOk = profile.heightCm >= ref.HEIGHT_CM_MIN && profile.heightCm <= ref.HEIGHT_CM_MAX
  const weightOk = profile.weightKg >= ref.WEIGHT_KG_MIN && profile.weightKg <= ref.WEIGHT_KG_MAX
  if (heightOk && weightOk) {
    const bmiValue = bmi(profile.weightKg, profile.heightCm)
    const category = bmiCategory(bmiValue)

    if (category === BmiCategory.SEVERE_UNDERWEIGHT) {
      violations.push(createViolation(
        ViolationCode.BMI_SEVERE_UNDERWEIGHT, Severity.REFUSE, 'guardrail.bmi_severe_underweight',
        { bmi: roundHalfToEven(bmiValue, 1) }
      ))
    } else if (category === BmiCategory.UNDERWEIGHT) {
      violations.push(createViolation(
        ViolationCode.BMI_UNDERWEIGHT, Severity.WARN, 'guardrail.bmi_underweight',
        { bmi: roundHalfToEven(bmiValue, 1) }
      ))
    } else if (category === BmiCategory.OBESE_III) {
      violations.push(createViolation(
        ViolationCode.BMI_CLASS_III, Severity.WARN, 'guardrail.bmi_class_iii',
        { bmi: roundHalfToEven(bmiValue, 1) }
      ))
    }

    if (profile.goal === Goal.LOSE_WEIGHT && bmiValue < ref.BMI_UNDERWEIGHT_DEFICIT_BLOCK_MAX) {
      violations.push(createViolation(
        ViolationCode.GOAL_CONFLICT_DEFICIT, Severity.WARN, 'guardrail.goal_conflict_deficit',
        { bmi: roundHalfToEven(bmiValue, 1) }
      ))
    }
  }

  // --- Condition screen (free-text health_notes) ---
  const notes = profile.healthNotes.toLowerCase()
  if (ref.CONDITION_SCREEN_KEYWORDS.some((keyword) => notes.includes(keyword))) {
    violations.push(createViolation(ViolationCode.CONDITION_SCREEN, Severity.REFUSE, 'guardrail.condition_screen'))
  }

  return violations
}

export function hasRefusal (violations) {
  return violations.some((v) => v.severity === Severity.REFUSE)
}

/**
 * GOAL_CONFLICT_DEFICIT overrides lose_weight to maintain -- a deficit is
 * not offered to someone already below a healthy BMI, regardless of what
 * they asked for.
 */
export function effectiveGoal (profile, violations) {
  if (violations.some((v) => v.code === ViolationCode.GOAL_CONFLICT_DEFICIT)) {
    return Goal.MAINTAIN
  }
  return profile.goal
}

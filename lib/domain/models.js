// Data shapes for the domain engine. Plain objects/factory functions --
// no validation framework here, so this module has zero framework
// dependency and can be imported by tests, API routes, and the LLM layer
// alike.
//
// Ported from app/domain/models.py.

/**
 * @typedef {{
 *   ageYears: number, sex: string, heightCm: number, weightKg: number,
 *   activityLevel: string, goal: string, healthNotes: string
 * }} Profile
 */

export function createProfile ({
  ageYears, sex, heightCm, weightKg, activityLevel, goal, healthNotes = ''
}) {
  return Object.freeze({ ageYears, sex, heightCm, weightKg, activityLevel, goal, healthNotes })
}

/**
 * @typedef {{ code: string, severity: string, messageKey: string, params: object }} Violation
 */

export function createViolation (code, severity, messageKey, params = {}) {
  return Object.freeze({ code, severity, messageKey, params })
}

export function createCalorieTarget ({
  kcal, tdeeKcal, bmrKcal, appliedAdjustmentPct, floorApplied, rationaleCode = null
}) {
  return Object.freeze({ kcal, tdeeKcal, bmrKcal, appliedAdjustmentPct, floorApplied, rationaleCode })
}

export function createMacroTargets ({ proteinG, carbG, fatG, fiberG, kcalFromMacros }) {
  // kcalFromMacros is the authoritative calorie target, recomputed from rounded grams.
  return Object.freeze({ proteinG, carbG, fatG, fiberG, kcalFromMacros })
}

export function createTargets ({
  bmi, bmiCategory, calories, macros, hydrationMl, engineVersion, warnings = []
}) {
  return Object.freeze({ bmi, bmiCategory, calories, macros, hydrationMl, engineVersion, warnings })
}

/**
 * Result of computeTargets: either usable targets with warnings, or a
 * refusal with no targets at all. `refused`/`planAllowed` are computed
 * properties (Python used @property) -- a class, not a plain object, so
 * they stay in sync with `targets` instead of needing to be recomputed by
 * every caller.
 */
export class TargetsResult {
  constructor (targets, violations) {
    this.targets = targets
    this.violations = violations
    Object.freeze(this)
  }

  get refused () {
    return this.targets === null
  }

  /**
   * Whether a computed meal plan may be generated at all (distinct from
   * whether *targets* were computed -- AGE_MINOR blocks the plan even
   * though it also blocks targets; some warn-level violations allow
   * targets but should still be surfaced to the caller).
   */
  get planAllowed () {
    return !this.refused
  }
}

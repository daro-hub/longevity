// The single public entrypoint of the deterministic domain engine.
//
// computeTargets(profile) orchestrates guardrails, energy, and macros
// into one result. This is the only function the API layer (or a script,
// or a test) should call to get real numbers for a user profile --
// everything else in this package is a building block for this function.
//
// Ported from app/domain/engine.py.

import * as energy from './energy.js'
import * as guardrails from './guardrails.js'
import * as macros from './macros.js'
import * as ref from './references.js'
import { bmi, bmiCategory } from './anthropometry.js'
import { BmiCategory, Severity, ViolationCode } from './enums.js'
import { createTargets, createViolation, TargetsResult } from './models.js'
import { roundHalfToEven } from './units.js'

export const ENGINE_VERSION = '1.0.0'

export function computeTargets (profile) {
  const violations = guardrails.validateProfile(profile)

  if (guardrails.hasRefusal(violations)) {
    return new TargetsResult(null, violations)
  }

  const goal = guardrails.effectiveGoal(profile, violations)

  const bmiValue = bmi(profile.weightKg, profile.heightCm)
  const category = bmiCategory(bmiValue)

  const bmr = energy.bmrMifflinStJeor(profile.weightKg, profile.heightCm, profile.ageYears, profile.sex)
  const tdeeKcal = energy.tdee(bmr, profile.activityLevel)

  let baseAdjustment = ref.GOAL_TDEE_ADJUSTMENT[goal]
  if (category === BmiCategory.OBESE_III && baseAdjustment < 0) {
    baseAdjustment = Math.max(baseAdjustment, -ref.BMI_CLASS_III_MAX_DEFICIT_PCT)
  }

  const { calorieTarget, macroResult, relaxed } = findFeasibleTargets(
    tdeeKcal, bmr, profile, goal, bmiValue, baseAdjustment
  )

  const extraViolations = []
  if (relaxed) {
    extraViolations.push(createViolation(
      ViolationCode.DEFICIT_RELAXED_FOR_FLOORS, Severity.WARN, 'guardrail.deficit_relaxed_for_floors'
    ))
  }

  const allViolations = [...violations, ...extraViolations]
  const warnings = allViolations.filter((v) => v.severity === Severity.WARN)

  const hydration = macros.hydrationTargetMl(profile.weightKg, profile.activityLevel)

  const targets = createTargets({
    bmi: roundHalfToEven(bmiValue, 1),
    bmiCategory: category,
    calories: calorieTarget,
    macros: macroResult,
    hydrationMl: hydration,
    engineVersion: ENGINE_VERSION,
    warnings
  })

  return new TargetsResult(targets, allViolations)
}

/**
 * Try baseAdjustment first; if it's a deficit and the protein/fat floors
 * don't fit inside the resulting calorie target, relax the deficit (never
 * the floors) through DEFICIT_RELAXATION_STEPS until it fits.
 */
function findFeasibleTargets (tdeeKcal, bmr, profile, goal, bmiValue, baseAdjustment) {
  const candidates = [baseAdjustment]
  if (baseAdjustment < 0) {
    for (const step of ref.DEFICIT_RELAXATION_STEPS) {
      const magnitude = -step
      if (magnitude > baseAdjustment) { // less aggressive than what we already tried
        candidates.push(magnitude)
      }
    }
  }

  let lastCalorieTarget = null
  let lastMacroResult = null

  for (let i = 0; i < candidates.length; i++) {
    const adjustmentPct = candidates[i]
    const rationale = i > 0 ? ViolationCode.DEFICIT_RELAXED_FOR_FLOORS : null
    const calorieTarget = energy.calorieTargetForAdjustment(
      tdeeKcal, bmr, profile.sex, adjustmentPct, rationale
    )
    const proteinG = macros.proteinTargetG(
      profile.weightKg, profile.heightCm, profile.sex, profile.ageYears, goal, bmiValue
    )
    const fatG = macros.fatFloorG(calorieTarget.kcal, profile.weightKg)

    lastCalorieTarget = calorieTarget
    lastMacroResult = macros.macroTargets(
      calorieTarget.kcal, profile.weightKg, profile.heightCm, profile.sex, profile.ageYears, goal, bmiValue
    )

    if (macros.isFeasible(calorieTarget.kcal, proteinG, fatG)) {
      const finalCalorieTarget = { ...calorieTarget, kcal: lastMacroResult.kcalFromMacros }
      return { calorieTarget: finalCalorieTarget, macroResult: lastMacroResult, relaxed: i > 0 }
    }
  }

  // Nothing was feasible even at zero adjustment -- use the last attempt;
  // macroTargets already clamps carbs to zero defensively in this case.
  const finalCalorieTarget = { ...lastCalorieTarget, kcal: lastMacroResult.kcalFromMacros }
  return { calorieTarget: finalCalorieTarget, macroResult: lastMacroResult, relaxed: candidates.length > 1 }
}

// Energy expenditure and calorie target calculations.
//
// Note on the search for a feasible calorie target: this module
// deliberately does NOT decide whether a given adjustmentPct is feasible
// against the protein/fat floors -- that would create a circular
// dependency with macros.js (which needs a kcal figure to compute macro
// grams). The infeasibility search (DEFICIT_RELAXED_FOR_FLOORS) lives in
// engine.js, which calls both this module and macros.js and can see both
// sides.
//
// Ported from app/domain/energy.py.

import { Sex } from './enums.js'
import * as ref from './references.js'
import { createCalorieTarget } from './models.js'
import { roundKcal } from './units.js'

export function bmrMifflinStJeor (weightKg, heightCm, ageYears, sex) {
  const sexConst = sex === Sex.MALE ? ref.MSJ_SEX_CONST_MALE : ref.MSJ_SEX_CONST_FEMALE
  return (
    ref.MSJ_WEIGHT_COEF * weightKg +
    ref.MSJ_HEIGHT_COEF * heightCm -
    ref.MSJ_AGE_COEF * ageYears +
    sexConst
  )
}

export function tdee (bmrKcal, activity) {
  return bmrKcal * ref.ACTIVITY_MULTIPLIERS[activity]
}

/**
 * Apply a +/- adjustment to TDEE, then clamp to the higher of the two
 * safety floors: 1.1x BMR, or the sex-specific absolute floor.
 */
export function calorieTargetForAdjustment (
  tdeeKcal, bmrKcal, sex, adjustmentPct, rationaleCode = null
) {
  const raw = tdeeKcal * (1.0 + adjustmentPct)
  const bmrFloor = ref.BMR_RELATIVE_FLOOR_FACTOR * bmrKcal
  const absFloor = ref.ABSOLUTE_CALORIE_FLOOR[sex]
  const floor = Math.max(bmrFloor, absFloor)

  const floorApplied = raw < floor
  const kcal = Math.max(raw, floor)

  return createCalorieTarget({
    kcal: roundKcal(kcal),
    tdeeKcal,
    bmrKcal,
    appliedAdjustmentPct: adjustmentPct,
    floorApplied,
    rationaleCode
  })
}

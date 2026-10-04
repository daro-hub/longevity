// Macro-nutrient targets.
//
// Rounding order matters here (see units.js): protein and fat are
// computed first in grams, carbs are the residual, and only after all
// three are rounded to whole grams is kcal recomputed from those rounded
// grams (4*P + 4*C + 9*F). That recomputed value -- not the pre-rounding
// kcal target -- is the authoritative calorie figure the plan validator
// checks against. Returning the pre-rounding figure would hand the
// validator a target that no integer-gram plan could ever hit exactly.
//
// Fiber is deliberately excluded from the kcal identity (see
// ATWATER_FACTORS in references.js): it's tracked as a target but not
// assigned its own ~2 kcal/g, so 4P+4C+9F == kcal holds exactly.
//
// Ported from app/domain/macros.py.

import * as ref from './references.js'
import { ActivityLevel } from './enums.js'
import { adjustedBodyWeightKg } from './anthropometry.js'
import { createMacroTargets } from './models.js'
import { clamp, roundGrams, roundKcal, roundMl } from './units.js'

/**
 * Actual weight, unless BMI >= 30 (obese_I and above), in which case
 * adjusted body weight -- otherwise protein/fat grams computed per
 * kilogram of actual weight explode for high-BMI users and become
 * unreachable inside the calorie target.
 */
function referenceWeightKg (weightKg, heightCm, sex, bmiValue) {
  if (bmiValue >= ref.BMI_OVERWEIGHT_MAX) {
    return adjustedBodyWeightKg(weightKg, heightCm, sex)
  }
  return weightKg
}

export function proteinTargetG (weightKg, heightCm, sex, ageYears, goal, bmiValue) {
  const refWeight = referenceWeightKg(weightKg, heightCm, sex, bmiValue)
  let gPerKg = ref.PROTEIN_G_PER_KG[goal]
  if (ageYears >= ref.PROTEIN_ELDERLY_AGE_THRESHOLD) {
    gPerKg = Math.max(gPerKg, ref.PROTEIN_G_PER_KG_ELDERLY_MIN)
  }
  gPerKg = Math.min(gPerKg, ref.PROTEIN_G_PER_KG_MAX)
  return refWeight * gPerKg
}

export function fatFloorG (kcal, weightKg) {
  const byWeight = ref.FAT_G_PER_KG_MIN * weightKg
  const byKcalPct = (ref.FAT_KCAL_PCT_MIN * kcal) / ref.KCAL_PER_G_FAT
  return Math.max(byWeight, byKcalPct)
}

export function fatCeilingG (kcal) {
  return (ref.FAT_KCAL_PCT_MAX * kcal) / ref.KCAL_PER_G_FAT
}

/**
 * Whether the protein + fat floors leave any room for carbs (>= 0) within
 * the given calorie target.
 */
export function isFeasible (kcal, proteinG, fatG) {
  const consumed = proteinG * ref.KCAL_PER_G_PROTEIN + fatG * ref.KCAL_PER_G_FAT
  return consumed <= kcal
}

export function fiberTargetG (kcal) {
  return Math.max(ref.FIBER_G_PER_1000KCAL * (kcal / 1000.0), ref.FIBER_G_MIN)
}

export function hydrationTargetMl (weightKg, activity) {
  let ml = ref.HYDRATION_ML_PER_KG * weightKg
  if (activity === ActivityLevel.VERY_ACTIVE) {
    ml += ref.HYDRATION_ML_VERY_ACTIVE_BONUS
  }
  return roundMl(clamp(ml, ref.HYDRATION_ML_MIN, ref.HYDRATION_ML_MAX))
}

/**
 * Compute protein and fat first, carbs as the residual, round all three
 * to whole grams, then recompute kcal from those rounded grams.
 *
 * Caller (engine.js) is responsible for ensuring feasibility via
 * isFeasible() before calling this -- carbs are clamped to zero here as a
 * last-resort defensive measure, but that should never trigger once the
 * engine's relaxation search has run.
 */
export function macroTargets (kcal, weightKg, heightCm, sex, ageYears, goal, bmiValue) {
  const proteinGRaw = proteinTargetG(weightKg, heightCm, sex, ageYears, goal, bmiValue)
  let fatGRaw = Math.max(fatFloorG(kcal, weightKg), 0.0)
  fatGRaw = fatCeilingG(kcal) >= fatFloorG(kcal, weightKg) ? Math.min(fatGRaw, fatCeilingG(kcal)) : fatGRaw

  const proteinKcal = proteinGRaw * ref.KCAL_PER_G_PROTEIN
  const fatKcal = fatGRaw * ref.KCAL_PER_G_FAT
  const carbKcalRaw = Math.max(0.0, kcal - proteinKcal - fatKcal)
  const carbGRaw = carbKcalRaw / ref.KCAL_PER_G_CARB

  const proteinG = roundGrams(proteinGRaw)
  const fatG = roundGrams(fatGRaw)
  const carbG = roundGrams(carbGRaw)

  const kcalFromMacros = (
    proteinG * ref.KCAL_PER_G_PROTEIN +
    carbG * ref.KCAL_PER_G_CARB +
    fatG * ref.KCAL_PER_G_FAT
  )

  return createMacroTargets({
    proteinG,
    carbG,
    fatG,
    fiberG: roundGrams(fiberTargetG(kcal)),
    kcalFromMacros: roundKcal(kcalFromMacros)
  })
}

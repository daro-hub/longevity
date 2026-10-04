// BMI and body-weight reference calculations. See references.js for the
// citation behind every constant used here.
//
// Ported from app/domain/anthropometry.py.

import { BmiCategory, Sex } from './enums.js'
import * as ref from './references.js'

export function bmi (weightKg, heightCm) {
  const heightM = heightCm / 100.0
  return weightKg / (heightM * heightM)
}

export function bmiCategory (bmiValue) {
  if (bmiValue < ref.BMI_SEVERE_UNDERWEIGHT_MAX) return BmiCategory.SEVERE_UNDERWEIGHT
  if (bmiValue < ref.BMI_UNDERWEIGHT_MAX) return BmiCategory.UNDERWEIGHT
  if (bmiValue < ref.BMI_NORMAL_MAX) return BmiCategory.NORMAL
  if (bmiValue < ref.BMI_OVERWEIGHT_MAX) return BmiCategory.OVERWEIGHT
  if (bmiValue < ref.BMI_OBESE_I_MAX) return BmiCategory.OBESE_I
  if (bmiValue < ref.BMI_OBESE_II_MAX) return BmiCategory.OBESE_II
  return BmiCategory.OBESE_III
}

/**
 * Devine formula. Height below the 5ft (152.4cm) base returns the base
 * weight for that sex rather than going negative.
 */
export function idealBodyWeightKg (heightCm, sex) {
  const inchesOverBase = Math.max(0.0, (heightCm - ref.IBW_HEIGHT_THRESHOLD_CM) / ref.CM_PER_INCH)
  const base = sex === Sex.MALE ? ref.IBW_BASE_KG_MALE : ref.IBW_BASE_KG_FEMALE
  return base + ref.IBW_PER_INCH_OVER_KG * inchesOverBase
}

/**
 * ABW = IBW + 0.25 * (actual - IBW). Used as the reference weight for
 * protein dosing when BMI >= 30, so protein grams don't explode for
 * high-BMI users and become unreachable inside the calorie target.
 */
export function adjustedBodyWeightKg (weightKg, heightCm, sex) {
  const ibw = idealBodyWeightKg(heightCm, sex)
  return ibw + ref.ADJUSTED_BW_FACTOR * (weightKg - ibw)
}

// Enums shared across the domain engine and the API schema.
//
// Keeping these as plain string constants (not free text) is what makes
// the engine possible in the first place: activity_level and goal must be
// one of these exact values, not free Italian text, so they can map to a
// PAL multiplier.
//
// Ported from app/domain/enums.py.

export const Sex = Object.freeze({
  MALE: 'male',
  FEMALE: 'female'
})

export const ActivityLevel = Object.freeze({
  SEDENTARY: 'sedentary',
  LIGHT: 'light',
  MODERATE: 'moderate',
  ACTIVE: 'active',
  VERY_ACTIVE: 'very_active'
})

export const Goal = Object.freeze({
  LOSE_WEIGHT: 'lose_weight',
  MAINTAIN: 'maintain',
  GAIN_MUSCLE: 'gain_muscle'
})

export const BmiCategory = Object.freeze({
  SEVERE_UNDERWEIGHT: 'severe_underweight',
  UNDERWEIGHT: 'underweight',
  NORMAL: 'normal',
  OVERWEIGHT: 'overweight',
  OBESE_I: 'obese_class_1',
  OBESE_II: 'obese_class_2',
  OBESE_III: 'obese_class_3'
})

export const Severity = Object.freeze({
  REFUSE: 'refuse',
  WARN: 'warn'
})

export const ViolationCode = Object.freeze({
  AGE_CHILD: 'AGE_CHILD',
  AGE_MINOR: 'AGE_MINOR',
  AGE_ELDERLY: 'AGE_ELDERLY',
  AGE_IMPLAUSIBLE: 'AGE_IMPLAUSIBLE',
  HEIGHT_RANGE: 'HEIGHT_RANGE',
  WEIGHT_RANGE: 'WEIGHT_RANGE',
  BMI_SEVERE_UNDERWEIGHT: 'BMI_SEVERE_UNDERWEIGHT',
  BMI_UNDERWEIGHT: 'BMI_UNDERWEIGHT',
  BMI_CLASS_III: 'BMI_CLASS_III',
  GOAL_CONFLICT_DEFICIT: 'GOAL_CONFLICT_DEFICIT',
  CONDITION_SCREEN: 'CONDITION_SCREEN',
  DEFICIT_RELAXED_FOR_FLOORS: 'DEFICIT_RELAXED_FOR_FLOORS'
})

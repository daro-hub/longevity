// Every numeric constant used by the domain engine, plus its citation.
//
// This module exists so the engine is auditable rather than "trust me":
// every constant exported here must have a matching entry in REFERENCES,
// and tests/domain/references.test.js enforces that mechanically -- a new
// magic number with no citation fails CI.
//
// Two explicit conventions used everywhere else in the domain package
// (macros, food DB, validator) are recorded here so there is exactly one
// place to look:
//
// 1. Atwater identity. Fiber's ~2 kcal/g is deliberately ignored; fiber is
//    treated as a subset of carbohydrates. This keeps 4*P + 4*C + 9*F ==
//    kcal exactly true everywhere -- targets, food DB rows, and the plan
//    validator.
// 2. Activity multipliers are the Harris-Benedict-era 5-band convention,
//    NOT the FAO/WHO/UNU 2004 PAL bands (which are 1.40-1.69 / 1.70-1.99 /
//    2.00-2.40 and use a 3-band scale). Do not cite FAO for these numbers.
//    TDEE from any such multiplier is an estimate, typically accurate to
//    roughly +/-10-15% for an individual.
//
// Ported from app/domain/references.py. The RETRIEVAL_* constants (RAG
// relevance threshold) are deliberately NOT ported here -- they belong to
// the /v1/ask endpoint, which stays on the Python backend for now.

import { ActivityLevel, Goal, Sex } from './enums.js'

export function createReference (citation, url = null, note = '') {
  return Object.freeze({ citation, url, note })
}

// ---------------------------------------------------------------------------
// Anthropometry
// ---------------------------------------------------------------------------

export const IBW_HEIGHT_THRESHOLD_CM = 152.4 // 5 ft; Devine formula base height
export const IBW_BASE_KG_MALE = 50.0
export const IBW_BASE_KG_FEMALE = 45.5
export const IBW_PER_INCH_OVER_KG = 2.3
export const CM_PER_INCH = 2.54

export const ADJUSTED_BW_FACTOR = 0.25 // ABW = IBW + factor * (actual - IBW), used when BMI >= 30

export const BMI_SEVERE_UNDERWEIGHT_MAX = 17.0
export const BMI_UNDERWEIGHT_MAX = 18.5
export const BMI_NORMAL_MAX = 25.0
export const BMI_OVERWEIGHT_MAX = 30.0
export const BMI_OBESE_I_MAX = 35.0
export const BMI_OBESE_II_MAX = 40.0
// >= BMI_OBESE_II_MAX is class III

// ---------------------------------------------------------------------------
// Energy -- Mifflin-St Jeor BMR
// ---------------------------------------------------------------------------

export const MSJ_WEIGHT_COEF = 10.0
export const MSJ_HEIGHT_COEF = 6.25
export const MSJ_AGE_COEF = 5.0
export const MSJ_SEX_CONST_MALE = 5.0
export const MSJ_SEX_CONST_FEMALE = -161.0

export const ACTIVITY_MULTIPLIERS = Object.freeze({
  [ActivityLevel.SEDENTARY]: 1.2,
  [ActivityLevel.LIGHT]: 1.375,
  [ActivityLevel.MODERATE]: 1.55,
  [ActivityLevel.ACTIVE]: 1.725,
  [ActivityLevel.VERY_ACTIVE]: 1.9
})

export const GOAL_TDEE_ADJUSTMENT = Object.freeze({
  [Goal.LOSE_WEIGHT]: -0.20,
  [Goal.MAINTAIN]: 0.0,
  [Goal.GAIN_MUSCLE]: 0.10
})

// Calorie floors: the higher of the two applies.
export const BMR_RELATIVE_FLOOR_FACTOR = 1.1 // never go below 1.1x BMR
export const ABSOLUTE_CALORIE_FLOOR = Object.freeze({
  [Sex.FEMALE]: 1200.0,
  [Sex.MALE]: 1500.0
})

// When protein/fat floors make the calorie target infeasible, relax the
// deficit in these steps (toward 0) before giving up.
export const DEFICIT_RELAXATION_STEPS = Object.freeze([0.20, 0.15, 0.10, 0.05, 0.0])

export const TDEE_UNCERTAINTY_PCT = 0.125 // midpoint of the commonly cited +/-10-15% band

// ---------------------------------------------------------------------------
// Macros
// ---------------------------------------------------------------------------

export const PROTEIN_G_PER_KG = Object.freeze({
  [Goal.MAINTAIN]: 1.2,
  [Goal.LOSE_WEIGHT]: 1.6,
  [Goal.GAIN_MUSCLE]: 1.8
})
export const PROTEIN_G_PER_KG_ELDERLY_MIN = 1.2 // floor applied when age >= 65
export const PROTEIN_ELDERLY_AGE_THRESHOLD = 65
export const PROTEIN_G_PER_KG_MAX = 2.2 // hard cap regardless of goal

export const FAT_G_PER_KG_MIN = 0.8
export const FAT_KCAL_PCT_MIN = 0.20
export const FAT_KCAL_PCT_MAX = 0.35

export const KCAL_PER_G_PROTEIN = 4.0
export const KCAL_PER_G_CARB = 4.0
export const KCAL_PER_G_FAT = 9.0

export const FIBER_G_PER_1000KCAL = 14.0
export const FIBER_G_MIN = 25.0

export const HYDRATION_ML_PER_KG = 35.0
export const HYDRATION_ML_MIN = 1500.0
export const HYDRATION_ML_MAX = 4000.0
export const HYDRATION_ML_VERY_ACTIVE_BONUS = 500.0

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

export const AGE_CHILD_MAX = 13 // < 13 refused entirely
export const AGE_MINOR_MAX = 18 // 13 <= age < 18: Q&A only, no computed plan
export const AGE_ELDERLY_MIN = 90 // 90 <= age <= AGE_IMPLAUSIBLE_MIN: warn
export const AGE_IMPLAUSIBLE_MIN = 100 // > 100 refused

export const HEIGHT_CM_MIN = 100.0
export const HEIGHT_CM_MAX = 250.0
export const WEIGHT_KG_MIN = 30.0
export const WEIGHT_KG_MAX = 300.0

export const BMI_UNDERWEIGHT_DEFICIT_BLOCK_MAX = 20.0 // lose_weight forced to maintain below this BMI
export const BMI_CLASS_III_MAX_DEFICIT_PCT = 0.15 // deficit capped at 15% for BMI >= 40

export const CONDITION_SCREEN_KEYWORDS = Object.freeze([
  'incinta',
  'pregnant',
  'gravidanza',
  'allattamento',
  'breastfeeding',
  'diabet',
  'renale',
  'kidney',
  'dialisi',
  'dialysis',
  'anoress',
  'anorex',
  'bulim',
  'eating disorder',
  'oncolog',
  'chemio',
  'chemo',
  'bariatric',
  'warfarin'
])

// ---------------------------------------------------------------------------
// Plan validation tolerances
// ---------------------------------------------------------------------------

export const KCAL_TOLERANCE_PCT = 0.05
export const KCAL_TOLERANCE_MIN_ABS = 75.0
export const PROTEIN_TOLERANCE_UNDER_PCT = 0.05
export const PROTEIN_TOLERANCE_OVER_PCT = 0.25
export const FAT_TOLERANCE_PCT = 0.15
export const CARB_TOLERANCE_PCT = 0.15
export const FIBER_TOLERANCE_MIN_FRACTION = 0.90 // fiber must reach >= 90% of target, no ceiling

export const PLAN_ITEM_GRAMS_MIN = 1.0
export const PLAN_ITEM_GRAMS_MAX = 1000.0
export const PLAN_MEAL_GRAMS_MAX = 2000.0

export const FIT_SCALE_MIN = 0.75
export const FIT_SCALE_MAX = 1.25
export const FIT_MAX_GREEDY_ITERATIONS = 10

export const FOOD_DB_ATWATER_TOLERANCE_PCT = 0.10

// ---------------------------------------------------------------------------
// Reference registry
// ---------------------------------------------------------------------------

const MIFFLIN = createReference(
  'Mifflin MD, St Jeor ST, Hill LA, et al. A new predictive equation ' +
  'for resting energy expenditure in healthy individuals. ' +
  'Am J Clin Nutr. 1990;51(2):241-247.',
  null,
  'BMR formula. Validated in healthy adults; not validated for ' +
  'pediatric/adolescent growth, hence AGE_MINOR routes around it.'
)

const HARRIS_BENEDICT_ACTIVITY = createReference(
  'Commonly used activity-multiplier convention popularized ' +
  'alongside Harris-Benedict/Mifflin-St Jeor equations ' +
  '(sedentary 1.2 .. very active 1.9).',
  null,
  'NOT the FAO/WHO/UNU 2004 PAL bands (1.40-1.69 / 1.70-1.99 / ' +
  '2.00-2.40, 3-band scale). Do not attribute these five numbers to FAO. ' +
  'TDEE derived from any such multiplier is an estimate, commonly cited ' +
  'as accurate to roughly +/-10-15% for a given individual.'
)

const GOAL_ADJUSTMENT = createReference(
  'Conventional deficit/surplus sizing: ~20% deficit for weight ' +
  'loss, ~10% surplus for lean gain, commonly recommended to balance ' +
  'rate of change against muscle/metabolic preservation.',
  null,
  'No single RCT source; this is a widely used practical convention, ' +
  'not a specific trial result.'
)

const CALORIE_FLOORS = createReference(
  'Conventional safe-minimum-intake floors used in clinical ' +
  'weight-management guidance (commonly ~1200 kcal/day for women, ' +
  '~1500 kcal/day for men) to avoid severe underfeeding.',
  null,
  'Practical floor, not itself the primary limiter -- the ' +
  'BMR_RELATIVE_FLOOR_FACTOR (1.1x BMR) is the mechanism engaged first.'
)

const DEVINE_IBW = createReference(
  'Devine BJ. Gentamicin therapy. Drug Intell Clin Pharm. ' +
  '1974;8:650-655.',
  null,
  'Ideal body weight formula; widely reused for adjusted body weight ' +
  'in obesity-related dosing/nutrition calculations.'
)

const ADJUSTED_BW = createReference(
  'Adjusted body weight = IBW + 0.25 * (actual weight - IBW), ' +
  'a common convention for protein/energy dosing in individuals with ' +
  'obesity, avoiding both underestimation (using IBW alone) and ' +
  'overestimation (using actual weight alone).'
)

const WHO_BMI_CATEGORIES = createReference(
  'World Health Organization. Body mass index (BMI) classification.',
  'https://www.who.int/europe/news-room/fact-sheets/item/a-healthy-lifestyle---who-recommendations',
  'Standard adult BMI cut-points: <18.5 underweight, 18.5-24.9 ' +
  'normal, 25-29.9 overweight, 30-34.9 obese I, 35-39.9 obese II, ' +
  '>=40 obese III. The severe-underweight sub-band (<17.0) is this ' +
  "engine's own safety threshold, not a WHO category."
)

const PROTEIN_TARGETS = createReference(
  'Common sports-nutrition/clinical protein intake ranges: ' +
  '~1.2 g/kg maintenance, ~1.6 g/kg for weight loss (to preserve lean ' +
  'mass in a deficit), ~1.8 g/kg for muscle gain, with an elderly floor ' +
  'around 1.2 g/kg/day reflecting reduced anabolic sensitivity ' +
  '(cf. PROT-AGE study group recommendations), capped at 2.2 g/kg.',
  null,
  'Ranges synthesized from commonly cited sports-nutrition and ' +
  'geriatric-nutrition guidance, not a single primary source.'
)

const FAT_TARGETS = createReference(
  'Common minimum fat intake guidance: >= 0.8 g/kg/day or ' +
  '20-35% of total energy, to support hormone production and ' +
  'fat-soluble vitamin absorption.'
)

const FIBER_DRI = createReference(
  'Institute of Medicine (US). Dietary Reference Intakes for ' +
  'Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, ' +
  'and Amino Acids. 2005. (14 g fiber per 1000 kcal).',
  null,
  'A 25 g/day floor is applied for low-calorie targets where the ' +
  'per-1000kcal formula would otherwise fall below what is considered ' +
  'a reasonable minimum.'
)

const HYDRATION_GUIDANCE = createReference(
  'Common hydration guidance of ~35 mL/kg/day for adults, with ' +
  'an additional allowance for high activity levels.'
)

const ATWATER_FACTORS = createReference(
  'Atwater WO. General principles governing composition and ' +
  'nutritive value of food. USDA, 1902 (values still in standard use: ' +
  'protein 4 kcal/g, carbohydrate 4 kcal/g, fat 9 kcal/g).',
  null,
  'This engine deliberately omits fiber\'s ~2 kcal/g and treats ' +
  'fiber as a carbohydrate subset so 4P+4C+9F == kcal holds exactly ' +
  'everywhere (targets, food DB, validator).'
)

const GUARDRAIL_AGE_RANGES = createReference(
  'Mifflin-St Jeor and this engine\'s macro targets are derived ' +
  'for healthy, non-pregnant adults; pediatric/adolescent energy needs ' +
  'require growth-adjusted equations (e.g. Schofield, DRI-EER) this ' +
  'engine does not implement, hence the hard age gates.'
)

const CONDITION_SCREEN_REF = createReference(
  'Internal safety policy: keyword screen for conditions where ' +
  'automated calorie/macro targets are inappropriate without clinical ' +
  'supervision (pregnancy, lactation, diabetes, renal disease/dialysis, ' +
  'eating disorders, active cancer treatment, post-bariatric surgery, ' +
  'warfarin therapy).',
  null,
  'This is a best-effort keyword fallback, not a guarantee -- it can ' +
  'miss conditions not phrased with a listed keyword. It never replaces ' +
  'the server-injected disclaimer, which is unconditional.'
)

const PLAN_TOLERANCES_RATIONALE = createReference(
  'Internal design decision, not an external nutrition ' +
  'reference: tolerances balance realism (integer-gram food plans ' +
  'rarely hit a calorie target exactly) against the clinical floors ' +
  'that must not be crossed (fat and protein have asymmetric bands).'
)

export const REFERENCES = Object.freeze({
  IBW_HEIGHT_THRESHOLD_CM: DEVINE_IBW,
  IBW_BASE_KG_MALE: DEVINE_IBW,
  IBW_BASE_KG_FEMALE: DEVINE_IBW,
  IBW_PER_INCH_OVER_KG: DEVINE_IBW,
  CM_PER_INCH: createReference('Unit conversion constant (exact).'),
  ADJUSTED_BW_FACTOR: ADJUSTED_BW,
  BMI_SEVERE_UNDERWEIGHT_MAX: WHO_BMI_CATEGORIES,
  BMI_UNDERWEIGHT_MAX: WHO_BMI_CATEGORIES,
  BMI_NORMAL_MAX: WHO_BMI_CATEGORIES,
  BMI_OVERWEIGHT_MAX: WHO_BMI_CATEGORIES,
  BMI_OBESE_I_MAX: WHO_BMI_CATEGORIES,
  BMI_OBESE_II_MAX: WHO_BMI_CATEGORIES,
  MSJ_WEIGHT_COEF: MIFFLIN,
  MSJ_HEIGHT_COEF: MIFFLIN,
  MSJ_AGE_COEF: MIFFLIN,
  MSJ_SEX_CONST_MALE: MIFFLIN,
  MSJ_SEX_CONST_FEMALE: MIFFLIN,
  ACTIVITY_MULTIPLIERS: HARRIS_BENEDICT_ACTIVITY,
  GOAL_TDEE_ADJUSTMENT: GOAL_ADJUSTMENT,
  BMR_RELATIVE_FLOOR_FACTOR: CALORIE_FLOORS,
  ABSOLUTE_CALORIE_FLOOR: CALORIE_FLOORS,
  DEFICIT_RELAXATION_STEPS: GOAL_ADJUSTMENT,
  TDEE_UNCERTAINTY_PCT: HARRIS_BENEDICT_ACTIVITY,
  PROTEIN_G_PER_KG: PROTEIN_TARGETS,
  PROTEIN_G_PER_KG_ELDERLY_MIN: PROTEIN_TARGETS,
  PROTEIN_ELDERLY_AGE_THRESHOLD: PROTEIN_TARGETS,
  PROTEIN_G_PER_KG_MAX: PROTEIN_TARGETS,
  FAT_G_PER_KG_MIN: FAT_TARGETS,
  FAT_KCAL_PCT_MIN: FAT_TARGETS,
  FAT_KCAL_PCT_MAX: FAT_TARGETS,
  KCAL_PER_G_PROTEIN: ATWATER_FACTORS,
  KCAL_PER_G_CARB: ATWATER_FACTORS,
  KCAL_PER_G_FAT: ATWATER_FACTORS,
  FIBER_G_PER_1000KCAL: FIBER_DRI,
  FIBER_G_MIN: FIBER_DRI,
  HYDRATION_ML_PER_KG: HYDRATION_GUIDANCE,
  HYDRATION_ML_MIN: HYDRATION_GUIDANCE,
  HYDRATION_ML_MAX: HYDRATION_GUIDANCE,
  HYDRATION_ML_VERY_ACTIVE_BONUS: HYDRATION_GUIDANCE,
  AGE_CHILD_MAX: GUARDRAIL_AGE_RANGES,
  AGE_MINOR_MAX: GUARDRAIL_AGE_RANGES,
  AGE_ELDERLY_MIN: GUARDRAIL_AGE_RANGES,
  AGE_IMPLAUSIBLE_MIN: GUARDRAIL_AGE_RANGES,
  HEIGHT_CM_MIN: GUARDRAIL_AGE_RANGES,
  HEIGHT_CM_MAX: GUARDRAIL_AGE_RANGES,
  WEIGHT_KG_MIN: GUARDRAIL_AGE_RANGES,
  WEIGHT_KG_MAX: GUARDRAIL_AGE_RANGES,
  BMI_UNDERWEIGHT_DEFICIT_BLOCK_MAX: WHO_BMI_CATEGORIES,
  BMI_CLASS_III_MAX_DEFICIT_PCT: WHO_BMI_CATEGORIES,
  CONDITION_SCREEN_KEYWORDS: CONDITION_SCREEN_REF,
  KCAL_TOLERANCE_PCT: PLAN_TOLERANCES_RATIONALE,
  KCAL_TOLERANCE_MIN_ABS: PLAN_TOLERANCES_RATIONALE,
  PROTEIN_TOLERANCE_UNDER_PCT: PLAN_TOLERANCES_RATIONALE,
  PROTEIN_TOLERANCE_OVER_PCT: PLAN_TOLERANCES_RATIONALE,
  FAT_TOLERANCE_PCT: PLAN_TOLERANCES_RATIONALE,
  CARB_TOLERANCE_PCT: PLAN_TOLERANCES_RATIONALE,
  FIBER_TOLERANCE_MIN_FRACTION: PLAN_TOLERANCES_RATIONALE,
  PLAN_ITEM_GRAMS_MIN: PLAN_TOLERANCES_RATIONALE,
  PLAN_ITEM_GRAMS_MAX: PLAN_TOLERANCES_RATIONALE,
  PLAN_MEAL_GRAMS_MAX: PLAN_TOLERANCES_RATIONALE,
  FIT_SCALE_MIN: PLAN_TOLERANCES_RATIONALE,
  FIT_SCALE_MAX: PLAN_TOLERANCES_RATIONALE,
  FIT_MAX_GREEDY_ITERATIONS: PLAN_TOLERANCES_RATIONALE,
  FOOD_DB_ATWATER_TOLERANCE_PCT: ATWATER_FACTORS
})

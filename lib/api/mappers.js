// Conversions between the API's snake_case JSON contract and the domain
// engine's camelCase objects. Kept separate from both so neither layer
// needs to know about the other's shape.
//
// Ported from app/api/mappers.py.

import * as ref from '../domain/references.js'
import { DISCLAIMER, guardrailMessage } from '../domain/messages.js'
import { createProfile } from '../domain/models.js'

/**
 * Adds a human-readable `name` to every item, resolved from the food
 * database by locale. The LLM schema itself never carries a name field
 * (or any other field beyond food_key/grams/note) -- this is a display
 * enrichment applied server-side after generation, not something the
 * model produces.
 *
 * Ported from app/api/routes/plan.py::_enrich_plan_with_names.
 */
export function enrichPlanWithNames (planDict, foodDb, locale) {
  if (planDict === null) return null
  const enriched = structuredClone(planDict)
  for (const day of enriched.days || []) {
    for (const meal of day.meals || []) {
      for (const item of meal.items || []) {
        const food = foodDb[item.food_key]
        item.name = food ? food.name(locale) : item.food_key
      }
    }
  }
  return enriched
}

export function substituteToAlternativeOut (substitute, locale) {
  return { food_key: substitute.food.key, name: substitute.food.name(locale), tags: [...substitute.food.tags] }
}

const STATUS_REPLY_EN = {
  ok: 'Done -- the change fits your targets.',
  repaired: 'Done -- I had to adjust the portions slightly to stay within your targets.',
  targets_only: (
    "I couldn't make this change while still hitting your targets with enough " +
    'precision, so I left the plan as it was.'
  )
}

const STATUS_REPLY_IT = {
  ok: 'Fatto — la modifica rispetta i tuoi target.',
  repaired: 'Fatto — ho dovuto aggiustare leggermente le porzioni per restare nei tuoi target.',
  targets_only: (
    'Non sono riuscito a fare questa modifica rispettando i target con sufficiente ' +
    "precisione, quindi ho lasciato il piano com'era."
  )
}

export function statusReply (planStatus, locale) {
  const table = locale === 'en' ? STATUS_REPLY_EN : STATUS_REPLY_IT
  return table[planStatus] ?? (locale === 'en' ? 'Done.' : 'Fatto.')
}

export function profileInToDomain (profileIn) {
  return createProfile({
    ageYears: profileIn.age_years,
    sex: profileIn.sex,
    heightCm: profileIn.height_cm,
    weightKg: profileIn.weight_kg,
    activityLevel: profileIn.activity_level,
    goal: profileIn.goal,
    healthNotes: profileIn.health_notes
  })
}

function violationToOut (violation, locale) {
  return {
    code: violation.code,
    severity: violation.severity,
    message: guardrailMessage(violation.messageKey, locale)
  }
}

export function targetsResultToResponse (result, locale) {
  const violationsOut = result.violations.map((v) => violationToOut(v, locale))
  const disclaimer = DISCLAIMER[locale] ?? DISCLAIMER.it

  if (result.refused || result.targets === null) {
    return { refused: true, targets: null, violations: violationsOut, disclaimer }
  }

  const t = result.targets
  const targetsOut = {
    bmi: t.bmi,
    bmi_category: t.bmiCategory,
    calories: {
      kcal: t.calories.kcal,
      tdee_kcal: t.calories.tdeeKcal,
      bmr_kcal: t.calories.bmrKcal,
      applied_adjustment_pct: t.calories.appliedAdjustmentPct,
      floor_applied: t.calories.floorApplied,
      uncertainty_pct: ref.TDEE_UNCERTAINTY_PCT
    },
    macros: {
      protein_g: t.macros.proteinG,
      carb_g: t.macros.carbG,
      fat_g: t.macros.fatG,
      fiber_g: t.macros.fiberG,
      kcal_from_macros: t.macros.kcalFromMacros
    },
    hydration_ml: t.hydrationMl,
    engine_version: t.engineVersion,
    warnings: t.warnings.map((w) => violationToOut(w, locale))
  }

  return { refused: false, targets: targetsOut, violations: violationsOut, disclaimer }
}

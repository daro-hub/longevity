// Validates a MealPlanDraft against targets and the food database.
//
// Two tiers, checked in order:
//   1. Hard failures -- unknown food_key, a banned (allergen) tag
//      present, or implausible grams. Allergens never get a "close
//      enough": a banned tag is always a hard fail, never a tolerance
//      question.
//   2. Tolerance -- once the plan is structurally valid, its
//      (server-summed) totals are compared against the targets via
//      lib/domain/plan_tolerance.checkTolerance.
//
// Nothing here trusts any number the model wrote -- totalMacros always
// re-derives kcal/protein/carb/fat/fiber from food_key + grams against
// the food database.
//
// Ported from app/llm/validator.py.

import * as ref from '../domain/references.js'
import { flattenPlanItems, totalMacros } from '../domain/nutrition.js'
import { checkTolerance } from '../domain/plan_tolerance.js'

export function createValidationResult (fields) {
  const result = { ...fields }
  Object.defineProperty(result, 'hardFailed', {
    enumerable: true,
    get () {
      return result.hardFailReasons.length > 0
    }
  })
  return Object.freeze(result)
}

export function validate (planDict, targetKcal, macros, foodDb, excludedTags = []) {
  const items = flattenPlanItems(planDict)
  const hardFails = []

  if (items.length === 0) {
    hardFails.push('EMPTY_PLAN')
    return createValidationResult({ ok: false, hardFailReasons: hardFails, items: [], totals: null, tolerance: null })
  }

  for (const item of items) {
    const food = foodDb[item.foodKey]
    if (!food) {
      hardFails.push(`UNKNOWN_FOOD_KEY:${item.foodKey}`)
      continue
    }
    if (excludedTags.some((tag) => food.tags.includes(tag))) {
      hardFails.push(`BANNED_TAG_PRESENT:${item.foodKey}`)
    }
    if (!(item.grams >= ref.PLAN_ITEM_GRAMS_MIN && item.grams <= ref.PLAN_ITEM_GRAMS_MAX)) {
      hardFails.push(`GRAMS_OUT_OF_RANGE:${item.foodKey}:${item.grams}`)
    }
  }

  for (const day of planDict.days || []) {
    for (const meal of day.meals || []) {
      const mealGrams = (meal.items || []).reduce((sum, i) => sum + i.grams, 0)
      if (mealGrams > ref.PLAN_MEAL_GRAMS_MAX) {
        hardFails.push(`MEAL_GRAMS_EXCEEDED:${meal.slot}:${mealGrams}`)
      }
    }
  }

  if (hardFails.length > 0) {
    return createValidationResult({ ok: false, hardFailReasons: hardFails, items, totals: null, tolerance: null })
  }

  const totals = totalMacros(items, foodDb)
  const tolerance = checkTolerance(totals, targetKcal, macros)

  return createValidationResult({ ok: tolerance.allOk, hardFailReasons: [], items, totals, tolerance })
}

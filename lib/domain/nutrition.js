// Sums macro totals for a meal plan's items against the food database.
//
// This is the module that makes the whole "the LLM never invents a
// number" design work: the model's output schema (lib/llm/schemas.js)
// carries only {food_key, grams} per item -- no calorie or macro field
// anywhere. Every total in the system is computed HERE, from the food
// database. The validator (lib/llm/validator.js) is what checks a
// food_key exists before calling this -- totalMacros itself assumes
// valid keys and throws on a bad one, deliberately, since that check
// belongs upstream.
//
// Ported from app/domain/nutrition.py.

export function createPlanItem (foodKey, grams) {
  return Object.freeze({ foodKey, grams })
}

export function createPlanTotals ({ kcal, proteinG, carbG, fatG, fiberG }) {
  return Object.freeze({ kcal, proteinG, carbG, fatG, fiberG })
}

export function itemMacros (item, foodDb) {
  const food = foodDb[item.foodKey] // undefined access is deliberate -- see module docstring
  if (!food) throw new Error(`unknown food_key: ${item.foodKey}`)
  const factor = item.grams / 100.0
  return createPlanTotals({
    kcal: food.kcal * factor,
    proteinG: food.proteinG * factor,
    carbG: food.carbG * factor,
    fatG: food.fatG * factor,
    fiberG: food.fiberG * factor
  })
}

export function totalMacros (items, foodDb) {
  let kcal = 0.0
  let protein = 0.0
  let carb = 0.0
  let fat = 0.0
  let fiber = 0.0
  for (const item of items) {
    const m = itemMacros(item, foodDb)
    kcal += m.kcal
    protein += m.proteinG
    carb += m.carbG
    fat += m.fatG
    fiber += m.fiberG
  }
  return createPlanTotals({ kcal, proteinG: protein, carbG: carb, fatG: fat, fiberG: fiber })
}

/**
 * Flattens the nested MealPlanDraft JSON shape
 * ({days: [{meals: [{items: [{food_key, grams}]}]}]}) into a flat list.
 * Takes a plain object (not a schema instance) so this stays usable from
 * both the API layer and tests without importing lib/llm here.
 */
export function flattenPlanItems (planDict) {
  const items = []
  for (const day of planDict.days || []) {
    for (const meal of day.meals || []) {
      for (const rawItem of meal.items || []) {
        items.push(createPlanItem(rawItem.food_key, rawItem.grams))
      }
    }
  }
  return items
}

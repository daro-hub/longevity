// Food composition database loader.
//
// Validates every row against the Atwater identity at module-load time:
// if a row's stored kcal doesn't match 4*protein + 4*carb + 9*fat within
// FOOD_DB_ATWATER_TOLERANCE_PCT, it is rejected rather than silently
// trusted. Skipping this check is how a couple of bad rows make the plan
// validator (lib/llm/validator.js) permanently unsatisfiable for reasons
// that look like a prompt problem but are actually a data problem.
//
// Ported from app/domain/food_db.py. The JSON itself is imported
// statically (lib/data/foods.it.json) rather than read via fs at request
// time -- a dynamic fs read relative to the module's own path is the
// "works locally, breaks on Vercel" trap for serverless bundling.

import rawFoods from '../data/foods.it.json'
import * as ref from './references.js'

export class FoodDbError extends Error {}

function validateRow (row) {
  const macros = row.per_100g || {}
  const required = ['kcal', 'protein_g', 'carb_g', 'fat_g', 'fiber_g']
  const missing = required.filter((f) => !(f in macros))
  if (missing.length > 0) {
    throw new FoodDbError(`food '${row.key}' missing fields: ${missing.join(', ')}`)
  }

  const recomputed = (
    ref.KCAL_PER_G_PROTEIN * macros.protein_g +
    ref.KCAL_PER_G_CARB * macros.carb_g +
    ref.KCAL_PER_G_FAT * macros.fat_g
  )
  const stated = macros.kcal
  if (stated <= 0) {
    throw new FoodDbError(`food '${row.key}' has non-positive kcal`)
  }

  const deviation = Math.abs(recomputed - stated) / stated
  if (deviation > ref.FOOD_DB_ATWATER_TOLERANCE_PCT) {
    throw new FoodDbError(
      `food '${row.key}' fails Atwater check: stated kcal=${stated}, ` +
      `recomputed from macros=${recomputed.toFixed(1)} (${(deviation * 100).toFixed(1)}% deviation, ` +
      `tolerance=${(ref.FOOD_DB_ATWATER_TOLERANCE_PCT * 100).toFixed(0)}%)`
    )
  }
}

/**
 * Returns an object keyed by food `key`. Throws FoodDbError on any row
 * that fails validation -- the whole load fails loudly rather than
 * silently dropping a bad row and going on.
 */
export function loadFoodDb (rows = rawFoods) {
  const items = {}
  for (const row of rows) {
    validateRow(row)
    const key = row.key
    if (key in items) {
      throw new FoodDbError(`duplicate food key: ${key}`)
    }
    const macros = row.per_100g
    items[key] = Object.freeze({
      key,
      nameIt: row.name_it,
      nameEn: row.name_en,
      kcal: macros.kcal,
      proteinG: macros.protein_g,
      carbG: macros.carb_g,
      fatG: macros.fat_g,
      fiberG: macros.fiber_g,
      tags: Object.freeze([...(row.tags || [])]),
      name (locale) {
        return locale === 'en' ? this.nameEn : this.nameIt
      }
    })
  }
  return items
}

/**
 * excludeTags: allergens the food must NOT have (e.g. "nuts", "fish").
 * requireTags: diet constraints the food MUST have (e.g. "vegan",
 * "gluten_free") -- a food needs ALL of these tags to pass.
 *
 * Filtering server-side, before the catalogue ever reaches the LLM, is
 * deliberate: an excluded food should not even be offerable, rather than
 * relying on a prompt instruction the model might not follow.
 */
export function filterFoods (foods, excludeTags = [], requireTags = []) {
  const result = {}
  for (const [key, item] of Object.entries(foods)) {
    if (excludeTags.some((tag) => item.tags.includes(tag))) continue
    if (!requireTags.every((tag) => item.tags.includes(tag))) continue
    result[key] = item
  }
  return result
}

// The default, module-scope-loaded DB -- loaded (and therefore validated)
// once per cold start, matching the Python "fail loudly on bad data"
// guarantee without re-validating on every request.
export const DEFAULT_FOOD_DB = loadFoodDb()

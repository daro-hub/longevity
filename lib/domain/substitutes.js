// Food substitution suggestions. Deliberately has NO LLM involved: an
// alternative is found by nearest-neighbor distance in macro-density
// space (per 100g protein/carb/fat) over the food database, filtered by
// the same exclude/require tags used everywhere else. This is instant,
// free, and fully deterministic -- the same "don't trust the model with
// arithmetic" principle extended to "don't even ask the model for this
// at all when a simple distance calculation answers it better".
//
// Ported from app/domain/substitutes.py.

import { filterFoods } from './food_db.js'

export function createSubstitute (food, distance) {
  return Object.freeze({ food, distance })
}

function macroDistance (a, b) {
  return Math.sqrt(
    (a.proteinG - b.proteinG) ** 2 + (a.carbG - b.carbG) ** 2 + (a.fatG - b.fatG) ** 2
  )
}

export function findSubstitutes (foodKey, foodDb, excludeTags = [], requireTags = [], n = 3) {
  const target = foodDb[foodKey]
  if (!target) return []

  const candidates = { ...filterFoods(foodDb, excludeTags, requireTags) }
  delete candidates[foodKey]

  const ranked = Object.values(candidates)
    .map((item) => createSubstitute(item, macroDistance(target, item)))
    .sort((a, b) => a.distance - b.distance)

  return ranked.slice(0, n)
}

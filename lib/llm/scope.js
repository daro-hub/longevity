// Identifies which items in an existing plan are open to change vs
// locked, for a scoped edit (swap one ingredient, regenerate one meal,
// one day, or an arbitrary multi-select of the above). Every scope kind
// reduces to the same thing: a set of (dayIndex, mealIndex, itemIndex)
// positions.
//
// Ported from app/llm/scope.py.

export class ScopeError extends Error {}

export function createEditScope ({
  kind, dayIndex = null, mealIndex = null, itemIndex = null, positions = []
}) {
  return Object.freeze({ kind, dayIndex, mealIndex, itemIndex, positions })
}

function positionKey ([d, m, i]) {
  return `${d}:${m}:${i}`
}

export function allPositions (planDict) {
  const positions = []
  const days = planDict.days || []
  for (let dIdx = 0; dIdx < days.length; dIdx++) {
    const meals = days[dIdx].meals || []
    for (let mIdx = 0; mIdx < meals.length; mIdx++) {
      const items = meals[mIdx].items || []
      for (let iIdx = 0; iIdx < items.length; iIdx++) {
        positions.push([dIdx, mIdx, iIdx])
      }
    }
  }
  return positions
}

export function openPositions (planDict, scope) {
  const everything = allPositions(planDict)

  if (scope.kind === 'plan') {
    return everything
  }
  if (scope.kind === 'day') {
    return everything.filter((p) => p[0] === scope.dayIndex)
  }
  if (scope.kind === 'meal') {
    return everything.filter((p) => p[0] === scope.dayIndex && p[1] === scope.mealIndex)
  }
  if (scope.kind === 'item') {
    const pos = [scope.dayIndex, scope.mealIndex, scope.itemIndex]
    const everythingKeys = new Set(everything.map(positionKey))
    if (!everythingKeys.has(positionKey(pos))) {
      throw new ScopeError(`item position ${JSON.stringify(pos)} does not exist in this plan`)
    }
    return [pos]
  }
  if (scope.kind === 'selection') {
    const everythingKeys = new Set(everything.map(positionKey))
    const unknown = scope.positions.filter((p) => !everythingKeys.has(positionKey(p)))
    if (unknown.length > 0) {
      throw new ScopeError(`selection includes positions not in this plan: ${JSON.stringify(unknown)}`)
    }
    // Python's open_positions returns set(scope.positions) here -- dedupe
    // the same way, in case the caller passed the same position twice.
    const seen = new Set()
    const deduped = []
    for (const p of scope.positions) {
      const key = positionKey(p)
      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(p)
      }
    }
    return deduped
  }

  throw new ScopeError(`unknown scope kind: ${JSON.stringify(scope.kind)}`)
}

/**
 * Maps each (day, meal, item) position (as its string key) to its index
 * in the flat list lib/domain/nutrition.js's flattenPlanItems would
 * produce -- same traversal order (days -> meals -> items), so locked
 * indices computed here line up exactly with the list fitToTargets
 * operates on.
 */
export function flatIndexMap (planDict) {
  const map = new Map()
  allPositions(planDict).forEach((pos, idx) => {
    map.set(positionKey(pos), idx)
  })
  return map
}

export function describeItem (planDict, position) {
  const [dIdx, mIdx, iIdx] = position
  const meal = planDict.days[dIdx].meals[mIdx]
  const item = meal.items[iIdx]
  return { slot: meal.slot, foodKey: item.food_key, grams: item.grams }
}

/**
 * Returns a deep copy of planDict with the items at `positions` replaced
 * by `newItems`, matched 1:1 in the same (sorted) order.
 */
export function applyPartial (planDict, positions, newItems) {
  if (positions.length !== newItems.length) {
    throw new ScopeError(
      `expected ${positions.length} replacement item(s), model returned ${newItems.length}`
    )
  }

  const merged = structuredClone(planDict)
  positions.forEach(([dIdx, mIdx, iIdx], i) => {
    merged.days[dIdx].meals[mIdx].items[iIdx] = { ...newItems[i] }
  })
  return merged
}

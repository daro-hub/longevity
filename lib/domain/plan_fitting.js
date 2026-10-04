// Pure, no-LLM repair pass. Runs BEFORE any LLM retry in the plan
// pipeline (lib/llm/planner.js) because it's free and rescues most
// near-misses -- its real job is to reduce the model's task to "pick
// sensible foods for these meals", leaving arithmetic entirely to this
// code.
//
// Two passes, in order:
//   1. proportional scaling of every item's grams toward the calorie
//      target, clamped so it can't overcorrect a wildly wrong draft into
//      something unrecognizable.
//   2. a bounded greedy nudge: if protein is short, scale up the item
//      with the highest protein density; if fat is over, scale down the
//      item with the highest fat density. Repeated up to
//      FIT_MAX_GREEDY_ITERATIONS times, stopping as soon as tolerance is
//      met.
//
// lockedIndices lets a caller mark some items as untouchable -- used by
// scoped plan edits (lib/llm/planner.js regenerateScope): if the user
// asked to swap one ingredient, every OTHER item must come out of this
// function bit-for-bit identical to how it went in. Locked items still
// count toward the totals the open items are fit against; they're just
// never scaled or nudged themselves.
//
// Ported from app/domain/plan_fitting.py.

import * as ref from './references.js'
import { createPlanItem, totalMacros } from './nutrition.js'
import { checkTolerance } from './plan_tolerance.js'
import { clamp } from './units.js'

export function createFitResult (items, success, iterations) {
  return Object.freeze({ items, success, iterations })
}

function clampGrams (grams) {
  return clamp(grams, ref.PLAN_ITEM_GRAMS_MIN, ref.PLAN_ITEM_GRAMS_MAX)
}

function scaleItems (items, factor, lockedIndices = new Set()) {
  return items.map((item, idx) => (
    lockedIndices.has(idx)
      ? item
      : createPlanItem(item.foodKey, clampGrams(item.grams * factor))
  ))
}

export function fitToTargets (items, targetKcal, macros, foodDb, lockedIndices = new Set()) {
  if (items.length === 0) {
    return createFitResult(items, false, 0)
  }

  const openItemsExist = items.some((_, idx) => !lockedIndices.has(idx))
  if (!openItemsExist) {
    // Nothing is adjustable (e.g. a single-item scope that's itself
    // locked, which shouldn't happen in practice but must not crash).
    const totals = totalMacros(items, foodDb)
    const check = checkTolerance(totals, targetKcal, macros)
    return createFitResult(items, check.allOk, 0)
  }

  // Pass 1: proportional scaling toward the calorie target, applied only
  // to open items. Locked items' contribution is subtracted from the
  // target first, so the open items are scaled to make up the REMAINDER
  // rather than the whole target.
  let totals = totalMacros(items, foodDb)
  const lockedTotals = totalMacros(items.filter((_, i) => lockedIndices.has(i)), foodDb)
  const openKcal = totals.kcal - lockedTotals.kcal
  const targetOpenKcal = targetKcal - lockedTotals.kcal
  if (openKcal > 0) {
    const scale = clamp(targetOpenKcal / openKcal, ref.FIT_SCALE_MIN, ref.FIT_SCALE_MAX)
    items = scaleItems(items, scale, lockedIndices)
  }

  totals = totalMacros(items, foodDb)
  let check = checkTolerance(totals, targetKcal, macros)
  if (check.allOk) {
    return createFitResult(items, true, 1)
  }

  // Pass 2: bounded greedy nudge on protein/fat, in the direction that
  // doesn't fight pass 1's calorie scaling too much.
  for (let iteration = 2; iteration <= ref.FIT_MAX_GREEDY_ITERATIONS; iteration++) {
    totals = totalMacros(items, foodDb)
    check = checkTolerance(totals, targetKcal, macros)
    if (check.allOk) {
      return createFitResult(items, true, iteration)
    }

    // At most ONE nudge per iteration. Applying both a protein-up and a
    // fat-down nudge in the same pass caused them to fight each other
    // whenever the same item happened to be the extremum for both (very
    // common: many protein-dense foods are also fat-dense) -- the two
    // adjustments partially cancelled out and the loop oscillated
    // without making progress. Protein goes first: its tolerance band is
    // asymmetric because undershooting it violates a clinical floor,
    // whereas the fat band is "clinically soft" above its own floor.
    let adjusted = false

    if (!check.proteinOk && check.proteinDelta < 0) {
      const idx = highestDensityIndex(items, foodDb, 'proteinG', lockedIndices)
      if (idx !== null) {
        items = nudge(items, idx, 1.10)
        adjusted = true
      }
    } else if (!check.fatOk && check.fatDelta > 0) {
      const idx = highestDensityIndex(items, foodDb, 'fatG', lockedIndices)
      if (idx !== null) {
        items = nudge(items, idx, 0.90)
        adjusted = true
      }
    }

    if (!adjusted) break
  }

  totals = totalMacros(items, foodDb)
  check = checkTolerance(totals, targetKcal, macros)
  return createFitResult(items, check.allOk, ref.FIT_MAX_GREEDY_ITERATIONS)
}

// Exported (unlike the private _highest_density_index in the Python
// source) only because the test suite needs to probe its unknown-food-key
// skip branch directly, mirroring the Python test's own direct import.
export function highestDensityIndex (items, foodDb, attr, lockedIndices = new Set()) {
  let bestIdx = null
  let bestDensity = -1.0
  for (let idx = 0; idx < items.length; idx++) {
    if (lockedIndices.has(idx)) continue
    const food = foodDb[items[idx].foodKey]
    if (!food) continue
    const density = food[attr] / 100.0 // per gram
    if (density > bestDensity) {
      bestDensity = density
      bestIdx = idx
    }
  }
  return bestIdx
}

function nudge (items, idx, factor) {
  const newItems = [...items]
  const target = newItems[idx]
  newItems[idx] = createPlanItem(target.foodKey, clampGrams(target.grams * factor))
  return newItems
}

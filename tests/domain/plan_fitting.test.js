import { describe, expect, it } from 'vitest'
import * as ref from '../../lib/domain/references.js'
import { DEFAULT_FOOD_DB as DB } from '../../lib/domain/food_db.js'
import { createMacroTargets } from '../../lib/domain/models.js'
import { createPlanItem, totalMacros } from '../../lib/domain/nutrition.js'
import { checkTolerance } from '../../lib/domain/plan_tolerance.js'
import { fitToTargets, highestDensityIndex } from '../../lib/domain/plan_fitting.js'

// Ported from tests/domain/test_plan_fitting.py.

function makeMacros (kcal, protein, carb, fat, fiber) {
  return createMacroTargets({ proteinG: protein, carbG: carb, fatG: fat, fiberG: fiber, kcalFromMacros: kcal })
}

it('empty items fails cleanly', () => {
  const result = fitToTargets([], 2000.0, makeMacros(2000, 120, 220, 60, 30), DB)
  expect(result.success).toBe(false)
  expect(result.items).toEqual([])
})

describe('locked indices', () => {
  // A scoped edit (swap one ingredient, regenerate one meal) must leave
  // every OTHER item bit-for-bit identical to how it went in -- these
  // tests are the contract that makes that promise checkable.

  it('locked item grams are never changed by scaling', () => {
    const items = [
      createPlanItem('riso_bianco_cotto', 200), // locked
      createPlanItem('petto_di_pollo_cotto', 50) // open
    ]
    const macros = makeMacros(3000, 200, 300, 100, 30) // far off -> forces scaling
    const result = fitToTargets(items, 3000.0, macros, DB, new Set([0]))
    expect(result.items[0].grams).toBe(200)
    expect(result.items[0].foodKey).toBe('riso_bianco_cotto')
  })

  it('locked item is never chosen for the greedy nudge', () => {
    const items = [
      createPlanItem('riso_bianco_cotto', 200),
      createPlanItem('petto_di_pollo_cotto', 50)
    ]
    const totals = totalMacros(items, DB)
    const macros = makeMacros(totals.kcal, totals.proteinG + 20, totals.carbG, totals.fatG, totals.fiberG)
    const result = fitToTargets(items, totals.kcal, macros, DB, new Set([0]))
    expect(result.items[0].grams).toBe(200) // rice untouched
    expect(result.items[1].grams).not.toBe(50) // chicken is what moved
  })

  it('open items absorb the full remainder when locked is off target', () => {
    const items = [
      createPlanItem('olio_oliva', 100), // locked, ~900kcal alone
      createPlanItem('insalata_verde', 50) // open
    ]
    const macros = makeMacros(1000, 10, 20, 90, 5)
    const result = fitToTargets(items, 1000.0, macros, DB, new Set([0]))
    expect(result.items[0].grams).toBe(100)
    expect(result.items[1].grams).toBeGreaterThanOrEqual(ref.PLAN_ITEM_GRAMS_MIN)
  })

  it('all items locked returns as-is without crashing', () => {
    const items = [createPlanItem('riso_bianco_cotto', 200)]
    const macros = makeMacros(3000, 200, 300, 100, 30)
    const result = fitToTargets(items, 3000.0, macros, DB, new Set([0]))
    expect(result.items[0].grams).toBe(200)
    expect(result.iterations).toBe(0)
  })

  it('no locked indices behaves exactly as before', () => {
    const items = [
      createPlanItem('riso_bianco_cotto', 300),
      createPlanItem('petto_di_pollo_cotto', 250),
      createPlanItem('olio_oliva', 20)
    ]
    const totals = totalMacros(items, DB)
    const macros = makeMacros(totals.kcal, totals.proteinG, totals.carbG, totals.fatG, totals.fiberG)
    const result = fitToTargets(items, totals.kcal, macros, DB)
    expect(result.success).toBe(true)
    expect(result.iterations).toBe(1)
  })
})

it('already within tolerance returns unchanged', () => {
  const items = [
    createPlanItem('riso_bianco_cotto', 300),
    createPlanItem('petto_di_pollo_cotto', 250),
    createPlanItem('olio_oliva', 20)
  ]
  const totals = totalMacros(items, DB)
  const macros = makeMacros(totals.kcal, totals.proteinG, totals.carbG, totals.fatG, totals.fiberG)
  const result = fitToTargets(items, totals.kcal, macros, DB)
  expect(result.success).toBe(true)
  expect(result.iterations).toBe(1)
})

it('proportional scaling fixes a uniform undersize', () => {
  // A plan that's exactly half the target, scaled uniformly -> scaling
  // alone (pass 1) should fix it since ratios stay identical.
  const items = [
    createPlanItem('riso_bianco_cotto', 100),
    createPlanItem('petto_di_pollo_cotto', 100)
  ]
  const totals = totalMacros(items, DB)
  // Target within the FIT_SCALE_MAX (1.25) clamp range so one pass can reach it.
  const targetKcal = totals.kcal * 1.2
  const macros = makeMacros(
    targetKcal, totals.proteinG * 1.2, totals.carbG * 1.2, totals.fatG * 1.2, totals.fiberG * 1.2
  )
  const result = fitToTargets(items, targetKcal, macros, DB)
  expect(result.success).toBe(true)
})

it('scale is clamped, not unbounded', () => {
  // Wildly undersized plan: pass-1 scaling alone is clamped to 1.25x per
  // call, so a single fitToTargets call can't 10x it. This target is
  // genuinely unreachable with lettuce alone.
  const items = [createPlanItem('insalata_verde', 50)]
  const totals = totalMacros(items, DB)
  const targetKcal = totals.kcal * 10
  const macros = makeMacros(targetKcal, 150, 300, 80, 30)
  const result = fitToTargets(items, targetKcal, macros, DB)
  expect(result.success).toBe(false)
  expect(result.items[0].grams).toBeLessThanOrEqual(1000.0)
})

it('greedy pass raises protein when short', () => {
  const items = [
    createPlanItem('riso_bianco_cotto', 300),
    createPlanItem('petto_di_pollo_cotto', 50)
  ]
  const totals = totalMacros(items, DB)
  const macros = makeMacros(totals.kcal, totals.proteinG + 15, totals.carbG, totals.fatG, 5)
  const result = fitToTargets(items, totals.kcal, macros, DB)
  const chickenBefore = 50
  const chickenAfter = result.items.find((i) => i.foodKey === 'petto_di_pollo_cotto').grams
  expect(chickenAfter).toBeGreaterThan(chickenBefore)
})

it('result items grams stay within bounds', () => {
  const items = [createPlanItem('olio_oliva', 5)]
  const macros = makeMacros(5000, 10, 10, 500, 5)
  const result = fitToTargets(items, 5000.0, macros, DB)
  for (const item of result.items) {
    expect(item.grams).toBeGreaterThanOrEqual(1.0)
    expect(item.grams).toBeLessThanOrEqual(1000.0)
  }
})

it('unreachable target reports failure, not an exception', () => {
  // A single lettuce leaf can never hit a 3000kcal/200g-protein target;
  // must report success=false rather than throwing or looping forever.
  const items = [createPlanItem('insalata_verde', 30)]
  const macros = makeMacros(3000, 200, 300, 100, 30)
  const result = fitToTargets(items, 3000.0, macros, DB)
  expect(result.success).toBe(false)
  expect(result.iterations).toBe(10) // exhausted FIT_MAX_GREEDY_ITERATIONS
})

it('greedy pass lowers fat when over', () => {
  const items = [
    createPlanItem('petto_di_pollo_cotto', 200),
    createPlanItem('olio_oliva', 40)
  ]
  const totals = totalMacros(items, DB)
  const macros = makeMacros(totals.kcal, totals.proteinG, totals.carbG, totals.fatG - 15, 5)
  const result = fitToTargets(items, totals.kcal, macros, DB)
  const oilBefore = 40
  const oilAfter = result.items.find((i) => i.foodKey === 'olio_oliva').grams
  expect(oilAfter).toBeLessThan(oilBefore)
})

it('converges mid-greedy-loop, not just on the first or last iteration', () => {
  const items = [
    createPlanItem('riso_bianco_cotto', 250),
    createPlanItem('petto_di_pollo_cotto', 150),
    createPlanItem('olio_oliva', 10)
  ]
  const totals = totalMacros(items, DB)
  const macros = makeMacros(totals.kcal, totals.proteinG + 3, totals.carbG, totals.fatG, totals.fiberG)
  const result = fitToTargets(items, totals.kcal, macros, DB)
  expect(result.success).toBe(true)
  expect(result.iterations).toBeGreaterThan(1)
  expect(result.iterations).toBeLessThan(10)
})

it('highestDensityIndex skips items with an unknown food key', () => {
  // Defensive branch: fitToTargets is only ever called on items the
  // validator already confirmed exist in foodDb, but this helper doesn't
  // assume that -- an unknown key must be skipped, not crash.
  const items = [
    createPlanItem('does_not_exist', 100),
    createPlanItem('petto_di_pollo_cotto', 100)
  ]
  const idx = highestDensityIndex(items, DB, 'proteinG')
  expect(idx).toBe(1)
})

it('final state matches checkTolerance when successful', () => {
  const items = [
    createPlanItem('riso_bianco_cotto', 250),
    createPlanItem('petto_di_pollo_cotto', 200),
    createPlanItem('olio_oliva', 15),
    createPlanItem('broccoli_cotti', 150)
  ]
  const totals = totalMacros(items, DB)
  const macros = makeMacros(totals.kcal, totals.proteinG, totals.carbG, totals.fatG, totals.fiberG * 0.9)
  const result = fitToTargets(items, totals.kcal, macros, DB)
  const finalTotals = totalMacros(result.items, DB)
  const check = checkTolerance(finalTotals, totals.kcal, macros)
  expect(check.allOk).toBe(result.success)
})

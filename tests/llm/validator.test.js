import { expect, it } from 'vitest'
import { DEFAULT_FOOD_DB as DB } from '../../lib/domain/food_db.js'
import { createMacroTargets } from '../../lib/domain/models.js'
import { flattenPlanItems, totalMacros } from '../../lib/domain/nutrition.js'
import { validate } from '../../lib/llm/validator.js'

// Ported from tests/llm/test_validator.py.

/** mealsItems: list of [slot, [[foodKey, grams], ...]] */
function plan (...mealsItems) {
  return {
    days: [
      {
        meals: mealsItems.map(([slot, items]) => ({
          slot,
          items: items.map(([k, g]) => ({ food_key: k, grams: g, note: '' }))
        }))
      }
    ]
  }
}

function targetMacrosFromPlan (planDict) {
  const items = flattenPlanItems(planDict)
  const totals = totalMacros(items, DB)
  return [totals.kcal, createMacroTargets({
    proteinG: totals.proteinG, carbG: totals.carbG, fatG: totals.fatG, fiberG: totals.fiberG, kcalFromMacros: totals.kcal
  })]
}

it('a passing plan within tolerance validates ok', () => {
  const p = plan(
    ['breakfast', [['avena_fiocchi', 60], ['banana', 100]]],
    ['lunch', [['riso_bianco_cotto', 250], ['petto_di_pollo_cotto', 200], ['olio_oliva', 10]]],
    ['dinner', [['merluzzo_cotto', 180], ['broccoli_cotti', 200]]]
  )
  const [targetKcal, macros] = targetMacrosFromPlan(p)
  const result = validate(p, targetKcal, macros, DB)
  expect(result.ok).toBe(true)
  expect(result.hardFailed).toBe(false)
})

it('kcal too high fails tolerance, not a hard fail', () => {
  const p = plan(['lunch', [['riso_bianco_cotto', 300], ['olio_oliva', 30]]])
  const [targetKcal, macros] = targetMacrosFromPlan(p)
  // Double the actual portions so kcal massively overshoots the target
  // that was derived from the original (smaller) plan.
  const bloated = plan(['lunch', [['riso_bianco_cotto', 600], ['olio_oliva', 60]]])
  const result = validate(bloated, targetKcal, macros, DB)
  expect(result.hardFailed).toBe(false)
  expect(result.ok).toBe(false)
  expect(result.tolerance.kcalOk).toBe(false)
})

it('protein too low fails tolerance', () => {
  const p = plan(['lunch', [['petto_di_pollo_cotto', 200], ['riso_bianco_cotto', 200]]])
  const [targetKcal, macros] = targetMacrosFromPlan(p)
  const lowProtein = plan(['lunch', [['petto_di_pollo_cotto', 50], ['riso_bianco_cotto', 200]]])
  const result = validate(lowProtein, targetKcal, macros, DB)
  expect(result.hardFailed).toBe(false)
  expect(result.tolerance.proteinOk).toBe(false)
})

it('an unknown food key is a hard fail', () => {
  const p = plan(['lunch', [['frittata_di_unicorno', 150]]])
  const macros = createMacroTargets({ proteinG: 120, carbG: 220, fatG: 60, fiberG: 30, kcalFromMacros: 2000 })
  const result = validate(p, 2000.0, macros, DB)
  expect(result.hardFailed).toBe(true)
  expect(result.hardFailReasons.some((r) => r.includes('UNKNOWN_FOOD_KEY'))).toBe(true)
  expect(result.ok).toBe(false)
  expect(result.totals).toBeNull() // never summed once structurally invalid
})

it('a banned tag is a hard fail, never a tolerance question', () => {
  const p = plan(['lunch', [['salmone_cotto', 150], ['riso_bianco_cotto', 150]]])
  const [targetKcal, macros] = targetMacrosFromPlan(p)
  const result = validate(p, targetKcal, macros, DB, ['fish'])
  expect(result.hardFailed).toBe(true)
  expect(result.hardFailReasons.some((r) => r.includes('BANNED_TAG_PRESENT:salmone_cotto'))).toBe(true)
})

it('grams out of range is a hard fail', () => {
  const p = plan(['lunch', [['riso_bianco_cotto', 5000]]])
  const macros = createMacroTargets({ proteinG: 120, carbG: 220, fatG: 60, fiberG: 30, kcalFromMacros: 2000 })
  const result = validate(p, 2000.0, macros, DB)
  expect(result.hardFailed).toBe(true)
  expect(result.hardFailReasons.some((r) => r.includes('GRAMS_OUT_OF_RANGE'))).toBe(true)
})

it('meal grams exceeded is a hard fail', () => {
  const p = plan(['lunch', [['riso_bianco_cotto', 1000], ['petto_di_pollo_cotto', 1000], ['broccoli_cotti', 100]]])
  const macros = createMacroTargets({ proteinG: 120, carbG: 220, fatG: 60, fiberG: 30, kcalFromMacros: 2000 })
  const result = validate(p, 2000.0, macros, DB)
  expect(result.hardFailed).toBe(true)
  expect(result.hardFailReasons.some((r) => r.includes('MEAL_GRAMS_EXCEEDED'))).toBe(true)
})

it('an empty plan is a hard fail', () => {
  const macros = createMacroTargets({ proteinG: 120, carbG: 220, fatG: 60, fiberG: 30, kcalFromMacros: 2000 })
  const result = validate({ days: [] }, 2000.0, macros, DB)
  expect(result.hardFailed).toBe(true)
  expect(result.hardFailReasons).toContain('EMPTY_PLAN')
})

it('multiple hard fails are all reported', () => {
  const p = plan(['lunch', [['frittata_di_unicorno', 150], ['salmone_cotto', 150]]])
  const macros = createMacroTargets({ proteinG: 120, carbG: 220, fatG: 60, fiberG: 30, kcalFromMacros: 2000 })
  const result = validate(p, 2000.0, macros, DB, ['fish'])
  const reasons = result.hardFailReasons.join(' ')
  expect(reasons).toContain('UNKNOWN_FOOD_KEY')
  expect(reasons).toContain('BANNED_TAG_PRESENT')
})

it('items are returned even on hard fail, for debugging', () => {
  const p = plan(['lunch', [['riso_bianco_cotto', 5000]]])
  const macros = createMacroTargets({ proteinG: 120, carbG: 220, fatG: 60, fiberG: 30, kcalFromMacros: 2000 })
  const result = validate(p, 2000.0, macros, DB)
  expect(result.items.length).toBe(1)
  expect(result.items[0].foodKey).toBe('riso_bianco_cotto')
})

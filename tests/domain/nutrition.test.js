import { expect, it } from 'vitest'
import { DEFAULT_FOOD_DB as DB } from '../../lib/domain/food_db.js'
import { createPlanItem, flattenPlanItems, itemMacros, totalMacros } from '../../lib/domain/nutrition.js'

// Ported from tests/domain/test_nutrition.py.

it('item macros scales from 100g', () => {
  const item = createPlanItem('riso_bianco_cotto', 200.0)
  const m = itemMacros(item, DB)
  const food = DB.riso_bianco_cotto
  expect(m.kcal).toBeCloseTo(food.kcal * 2, 5)
  expect(m.proteinG).toBeCloseTo(food.proteinG * 2, 5)
})

it('item macros half portion', () => {
  const item = createPlanItem('petto_di_pollo_cotto', 50.0)
  const m = itemMacros(item, DB)
  const food = DB.petto_di_pollo_cotto
  expect(m.proteinG).toBeCloseTo(food.proteinG * 0.5, 5)
})

it('item macros unknown key throws', () => {
  const item = createPlanItem('does_not_exist', 100.0)
  expect(() => itemMacros(item, DB)).toThrow()
})

it('total macros sums multiple items', () => {
  const items = [
    createPlanItem('riso_bianco_cotto', 100.0),
    createPlanItem('petto_di_pollo_cotto', 150.0)
  ]
  const totals = totalMacros(items, DB)
  const rice = DB.riso_bianco_cotto
  const chicken = DB.petto_di_pollo_cotto
  expect(totals.kcal).toBeCloseTo(rice.kcal + chicken.kcal * 1.5, 5)
  expect(totals.proteinG).toBeCloseTo(rice.proteinG + chicken.proteinG * 1.5, 5)
})

it('total macros empty list', () => {
  const totals = totalMacros([], DB)
  expect(totals.kcal).toBe(0)
  expect(totals.proteinG).toBe(0)
})

it('flatten plan items nested structure', () => {
  const planDict = {
    days: [
      {
        meals: [
          { slot: 'breakfast', items: [{ food_key: 'avena_fiocchi', grams: 50, note: '' }] },
          {
            slot: 'lunch',
            items: [
              { food_key: 'riso_bianco_cotto', grams: 150, note: '' },
              { food_key: 'petto_di_pollo_cotto', grams: 120, note: '' }
            ]
          }
        ]
      }
    ]
  }
  const items = flattenPlanItems(planDict)
  expect(items.length).toBe(3)
  expect(items[0]).toEqual(createPlanItem('avena_fiocchi', 50))
  expect(items[2]).toEqual(createPlanItem('petto_di_pollo_cotto', 120))
})

it('flatten plan items multiple days', () => {
  const planDict = {
    days: [
      { meals: [{ slot: 'breakfast', items: [{ food_key: 'banana', grams: 100, note: '' }] }] },
      { meals: [{ slot: 'breakfast', items: [{ food_key: 'mela', grams: 100, note: '' }] }] }
    ]
  }
  const items = flattenPlanItems(planDict)
  expect(items.length).toBe(2)
})

it('flatten plan items empty plan', () => {
  expect(flattenPlanItems({ days: [] })).toEqual([])
  expect(flattenPlanItems({})).toEqual([])
})

it('flatten plan items tolerates a day with no meals key', () => {
  expect(flattenPlanItems({ days: [{}] })).toEqual([])
})

it('flatten plan items tolerates a meal with no items key', () => {
  expect(flattenPlanItems({ days: [{ meals: [{ slot: 'breakfast' }] }] })).toEqual([])
})

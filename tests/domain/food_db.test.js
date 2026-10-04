import { expect, it } from 'vitest'
import { FoodDbError, filterFoods, loadFoodDb } from '../../lib/domain/food_db.js'
import rawFoods from '../../lib/data/foods.it.json'

// Ported from tests/domain/test_food_db.py.

it('the real food db loads without error', () => {
  const db = loadFoodDb()
  expect(Object.keys(db).length).toBeGreaterThanOrEqual(60)
  expect(db.riso_bianco_cotto).toBeTruthy()
  expect(db.petto_di_pollo_cotto).toBeTruthy()
})

it('every row satisfies the atwater identity', () => {
  const db = loadFoodDb()
  for (const [key, food] of Object.entries(db)) {
    const recomputed = 4 * food.proteinG + 4 * food.carbG + 9 * food.fatG
    const relTolerance = 0.10 * food.kcal
    expect(Math.abs(recomputed - food.kcal), key).toBeLessThanOrEqual(relTolerance)
  }
})

it('there are no duplicate keys in the real db', () => {
  const keys = rawFoods.map((r) => r.key)
  expect(new Set(keys).size).toBe(keys.length)
})

it('rejects a row with bad atwater math', () => {
  const badRows = [{
    key: 'broken', name_it: 'x', name_en: 'x',
    per_100g: { kcal: 999, protein_g: 1, carb_g: 1, fat_g: 1, fiber_g: 0 },
    tags: []
  }]
  expect(() => loadFoodDb(badRows)).toThrow(/Atwater/)
})

it('rejects a duplicate key', () => {
  const row = {
    key: 'dup', name_it: 'x', name_en: 'x',
    per_100g: { kcal: 40, protein_g: 10, carb_g: 0, fat_g: 0, fiber_g: 0 },
    tags: []
  }
  expect(() => loadFoodDb([row, row])).toThrow(/duplicate/)
})

it('rejects a row missing per_100g entirely', () => {
  const badRows = [{ key: 'no_macros', name_it: 'x', name_en: 'x', tags: [] }]
  expect(() => loadFoodDb(badRows)).toThrow(/missing fields/)
})

it('accepts a row with no tags key, defaulting to an empty tags list', () => {
  const rows = [{
    key: 'untagged', name_it: 'x', name_en: 'x',
    per_100g: { kcal: 40, protein_g: 10, carb_g: 0, fat_g: 0, fiber_g: 0 }
  }]
  const db = loadFoodDb(rows)
  expect(db.untagged.tags).toEqual([])
})

it('rejects a missing field', () => {
  const badRows = [{
    key: 'incomplete', name_it: 'x', name_en: 'x',
    per_100g: { kcal: 40, protein_g: 10, carb_g: 0, fat_g: 0 },
    tags: []
  }]
  expect(() => loadFoodDb(badRows)).toThrow(/missing fields/)
})

it('rejects non-positive kcal', () => {
  const badRows = [{
    key: 'zero_kcal', name_it: 'x', name_en: 'x',
    per_100g: { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, fiber_g: 0 },
    tags: []
  }]
  expect(() => loadFoodDb(badRows)).toThrow(/non-positive/)
})

it('FoodDbError is a real Error subclass', () => {
  expect(new FoodDbError('x')).toBeInstanceOf(Error)
})

it('filter excludes allergen tags', () => {
  const db = loadFoodDb()
  const filtered = filterFoods(db, ['fish'])
  expect(filtered.salmone_cotto).toBeUndefined()
  expect(filtered.petto_di_pollo_cotto).toBeTruthy()
})

it('filter requires all diet tags', () => {
  const db = loadFoodDb()
  const vegan = filterFoods(db, [], ['vegan'])
  expect(vegan.tofu).toBeTruthy()
  expect(vegan.petto_di_pollo_cotto).toBeUndefined()
  expect(vegan.mozzarella).toBeUndefined() // vegetarian but not vegan
})

it('filter combines exclude and require', () => {
  const db = loadFoodDb()
  const filtered = filterFoods(db, ['nuts'], ['vegan', 'gluten_free'])
  expect(filtered.mandorle).toBeUndefined() // vegan+gluten_free but has nuts
  expect(filtered.riso_bianco_cotto).toBeTruthy()
})

it('name() selects the right locale', () => {
  const db = loadFoodDb()
  const banana = db.banana
  expect(banana.name('it')).toBe('Banana')
  expect(banana.name('en')).toBe('Banana')
  const pasta = db.pasta_cotta
  expect(pasta.name('it')).toBe('Pasta di semola (cotta)')
  expect(pasta.name('en')).toBe('Pasta (cooked)')
})

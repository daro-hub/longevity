import { expect, it } from 'vitest'
import { DEFAULT_FOOD_DB as DB } from '../../lib/domain/food_db.js'
import { findSubstitutes } from '../../lib/domain/substitutes.js'

// Ported from tests/domain/test_substitutes.py.

it('chicken substitute is another lean protein', () => {
  const results = findSubstitutes('petto_di_pollo_cotto', DB, [], [], 3)
  const keys = results.map((r) => r.food.key)
  // Turkey breast is the closest macro match to chicken breast in this DB.
  expect(keys).toContain('petto_di_tacchino_cotto')
})

it('results are sorted by distance ascending', () => {
  const results = findSubstitutes('petto_di_pollo_cotto', DB, [], [], 5)
  const distances = results.map((r) => r.distance)
  const sorted = [...distances].sort((a, b) => a - b)
  expect(distances).toEqual(sorted)
})

it('target food never appears in its own substitutes', () => {
  const results = findSubstitutes('riso_bianco_cotto', DB, [], [], 10)
  expect(results.every((r) => r.food.key !== 'riso_bianco_cotto')).toBe(true)
})

it('respects the n limit', () => {
  const results = findSubstitutes('banana', DB, [], [], 2)
  expect(results.length).toBe(2)
})

it('excludes allergen tags', () => {
  const results = findSubstitutes('merluzzo_cotto', DB, ['fish'], [], 10)
  expect(results.every((r) => !r.food.tags.includes('fish'))).toBe(true)
})

it('requires diet tags', () => {
  const results = findSubstitutes('petto_di_pollo_cotto', DB, [], ['vegan'], 10)
  expect(results.every((r) => r.food.tags.includes('vegan'))).toBe(true)
})

it('unknown food key returns an empty list', () => {
  expect(findSubstitutes('does_not_exist', DB)).toEqual([])
})

it('rice substitute is a similar starch, not a vegetable', () => {
  const results = findSubstitutes('riso_bianco_cotto', DB, [], [], 3)
  const keys = results.map((r) => r.food.key)
  const starches = new Set([
    'pasta_cotta', 'riso_integrale_cotto', 'couscous_cotto', 'orzo_cotto', 'farro_cotto', 'pane_bianco', 'pane_integrale'
  ])
  expect(keys.some((k) => starches.has(k))).toBe(true)
})

it('vegan requirement excludes dairy and meat from cheese substitutes', () => {
  const results = findSubstitutes('mozzarella', DB, [], ['vegan'], 10)
  expect(results.every((r) => r.food.tags.includes('vegan'))).toBe(true)
  expect(results.map((r) => r.food.key)).not.toContain('petto_di_pollo_cotto')
})

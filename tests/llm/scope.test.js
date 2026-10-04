import { expect, it } from 'vitest'
import {
  allPositions, applyPartial, createEditScope, flatIndexMap, openPositions, ScopeError
} from '../../lib/llm/scope.js'

// Ported from tests/llm/test_scope.py.

function makePlan () {
  return {
    days: [
      {
        meals: [
          { slot: 'breakfast', items: [{ food_key: 'avena_fiocchi', grams: 70 }] },
          {
            slot: 'lunch',
            items: [
              { food_key: 'riso_bianco_cotto', grams: 250 },
              { food_key: 'petto_di_pollo_cotto', grams: 200 }
            ]
          }
        ]
      },
      {
        meals: [
          { slot: 'dinner', items: [{ food_key: 'merluzzo_cotto', grams: 200 }] }
        ]
      }
    ]
  }
}

function sortedPositions (positions) {
  return [...positions].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
}

it('all positions lists every item in order', () => {
  const positions = allPositions(makePlan())
  expect(positions).toEqual([[0, 0, 0], [0, 1, 0], [0, 1, 1], [1, 0, 0]])
})

it('open positions: plan scope is everything', () => {
  const plan = makePlan()
  const result = openPositions(plan, createEditScope({ kind: 'plan' }))
  expect(sortedPositions(result)).toEqual(sortedPositions(allPositions(plan)))
})

it('open positions: day scope', () => {
  const plan = makePlan()
  const result = openPositions(plan, createEditScope({ kind: 'day', dayIndex: 0 }))
  expect(sortedPositions(result)).toEqual([[0, 0, 0], [0, 1, 0], [0, 1, 1]])
})

it('open positions: meal scope', () => {
  const plan = makePlan()
  const result = openPositions(plan, createEditScope({ kind: 'meal', dayIndex: 0, mealIndex: 1 }))
  expect(sortedPositions(result)).toEqual([[0, 1, 0], [0, 1, 1]])
})

it('open positions: item scope', () => {
  const plan = makePlan()
  const result = openPositions(plan, createEditScope({ kind: 'item', dayIndex: 0, mealIndex: 1, itemIndex: 1 }))
  expect(result).toEqual([[0, 1, 1]])
})

it('open positions: item scope with an unknown position throws', () => {
  const plan = makePlan()
  expect(() => openPositions(plan, createEditScope({ kind: 'item', dayIndex: 5, mealIndex: 0, itemIndex: 0 })))
    .toThrow(ScopeError)
})

it('open positions: selection scope', () => {
  const plan = makePlan()
  const result = openPositions(plan, createEditScope({ kind: 'selection', positions: [[0, 0, 0], [1, 0, 0]] }))
  expect(sortedPositions(result)).toEqual([[0, 0, 0], [1, 0, 0]])
})

it('open positions: selection scope with an unknown position throws', () => {
  const plan = makePlan()
  expect(() => openPositions(plan, createEditScope({ kind: 'selection', positions: [[9, 9, 9]] })))
    .toThrow(ScopeError)
})

it('open positions: an unknown kind throws', () => {
  const plan = makePlan()
  expect(() => openPositions(plan, createEditScope({ kind: 'nonsense' }))).toThrow(ScopeError)
})

it('flat index map matches traversal order', () => {
  const plan = makePlan()
  const mapping = flatIndexMap(plan)
  expect(mapping.get('0:0:0')).toBe(0)
  expect(mapping.get('0:1:0')).toBe(1)
  expect(mapping.get('0:1:1')).toBe(2)
  expect(mapping.get('1:0:0')).toBe(3)
})

it('apply partial replaces only the given positions', () => {
  const plan = makePlan()
  const merged = applyPartial(plan, [[0, 1, 1]], [{ food_key: 'merluzzo_cotto', grams: 180, note: '' }])
  expect(merged.days[0].meals[1].items[1].food_key).toBe('merluzzo_cotto')
  // Everything else untouched.
  expect(merged.days[0].meals[1].items[0].food_key).toBe('riso_bianco_cotto')
  expect(merged.days[0].meals[0].items[0].food_key).toBe('avena_fiocchi')
})

it('apply partial does not mutate the original', () => {
  const plan = makePlan()
  applyPartial(plan, [[0, 1, 1]], [{ food_key: 'merluzzo_cotto', grams: 180, note: '' }])
  expect(plan.days[0].meals[1].items[1].food_key).toBe('petto_di_pollo_cotto')
})

it('apply partial with a mismatched count throws', () => {
  const plan = makePlan()
  expect(() => applyPartial(plan, [[0, 1, 1]], [])).toThrow(ScopeError)
})

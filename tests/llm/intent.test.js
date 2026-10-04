import { expect, it } from 'vitest'
import {
  ChatOperation, describePlan, intentToEditScope, resolveIntent
} from '../../lib/llm/intent.js'
import { createEditScope, openPositions, ScopeError } from '../../lib/llm/scope.js'

// Ported from tests/llm/test_intent.py.

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
      }
    ]
  }
}

function makeIntent (overrides = {}) {
  return {
    operation: ChatOperation.CLARIFY,
    scope_kind: 'item',
    day_index: -1,
    meal_index: -1,
    item_index: -1,
    selection: [],
    target_food_key: '',
    instruction: '',
    clarification_question: '',
    ...overrides
  }
}

it('describe plan lists every position (it)', () => {
  const desc = describePlan(makePlan(), 'it')
  expect(desc).toContain('giorno=0 pasto=0 item=0')
  expect(desc).toContain('giorno=0 pasto=1 item=1')
  expect(desc).toContain('petto_di_pollo_cotto')
})

it('describe plan lists every position (en)', () => {
  const desc = describePlan(makePlan(), 'en')
  expect(desc).toContain('day=0 meal=1 item=1')
})

it('intent to edit scope: plan', () => {
  const intent = makeIntent({ scope_kind: 'plan' })
  expect(intentToEditScope(intent)).toEqual(createEditScope({ kind: 'plan' }))
})

it('intent to edit scope: day', () => {
  const intent = makeIntent({ scope_kind: 'day', day_index: 0 })
  expect(intentToEditScope(intent)).toEqual(createEditScope({ kind: 'day', dayIndex: 0 }))
})

it('intent to edit scope: meal', () => {
  const intent = makeIntent({ scope_kind: 'meal', day_index: 0, meal_index: 1 })
  expect(intentToEditScope(intent)).toEqual(createEditScope({ kind: 'meal', dayIndex: 0, mealIndex: 1 }))
})

it('intent to edit scope: item', () => {
  const intent = makeIntent({ scope_kind: 'item', day_index: 0, meal_index: 1, item_index: 1 })
  expect(intentToEditScope(intent)).toEqual(
    createEditScope({ kind: 'item', dayIndex: 0, mealIndex: 1, itemIndex: 1 })
  )
})

it('intent to edit scope: selection', () => {
  const intent = makeIntent({ scope_kind: 'selection', selection: [[0, 0, 0], [0, 1, 1]] })
  const scope = intentToEditScope(intent)
  expect(scope.kind).toBe('selection')
  expect(scope.positions).toEqual([[0, 0, 0], [0, 1, 1]])
})

it('intent to edit scope: an unknown kind throws', () => {
  const intent = makeIntent({ scope_kind: 'nonsense' })
  expect(() => intentToEditScope(intent)).toThrow(ScopeError)
})

it('the scope converted from an intent resolves against the real plan', () => {
  const plan = makePlan()
  const intent = makeIntent({ scope_kind: 'item', day_index: 0, meal_index: 1, item_index: 1 })
  const scope = intentToEditScope(intent)
  expect(openPositions(plan, scope)).toEqual([[0, 1, 1]])
})

class FakeIntentClient {
  constructor (intent) {
    this._intent = intent
    this.lastCall = null
  }

  async parse (systemPrompt, planDescription, message, locale) {
    this.lastCall = [systemPrompt, planDescription, message, locale]
    return this._intent
  }
}

it('resolveIntent passes the plan description and message through', async () => {
  const plan = makePlan()
  const intent = makeIntent({ operation: ChatOperation.GET_ALTERNATIVES, target_food_key: 'petto_di_pollo_cotto' })
  const client = new FakeIntentClient(intent)

  const result = await resolveIntent(client, plan, 'cosa posso usare al posto del pollo?', 'it')

  expect(result.operation).toBe(ChatOperation.GET_ALTERNATIVES)
  expect(result.target_food_key).toBe('petto_di_pollo_cotto')
  const [systemPrompt, planDescription, message, locale] = client.lastCall
  expect(planDescription).toContain('petto_di_pollo_cotto')
  expect(message).toBe('cosa posso usare al posto del pollo?')
  expect(locale).toBe('it')
  expect(systemPrompt).toContain('regenerate_scope')
})

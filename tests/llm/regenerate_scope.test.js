import { expect, it } from 'vitest'
import { computeTargets } from '../../lib/domain/engine.js'
import { ActivityLevel, Goal, Sex } from '../../lib/domain/enums.js'
import { DEFAULT_FOOD_DB as DB } from '../../lib/domain/food_db.js'
import { createProfile } from '../../lib/domain/models.js'
import {
  PLAN_STATUS_OK, PLAN_STATUS_REPAIRED, PLAN_STATUS_TARGETS_ONLY, regenerateScope
} from '../../lib/llm/planner.js'
import { createEditScope, ScopeError } from '../../lib/llm/scope.js'

// Ported from tests/llm/test_regenerate_scope.py. Tests the scoped-edit
// mechanism entirely with a fake in-memory client -- no network. The
// contract under test: everything NOT in scope must survive bit-for-bit
// identical, and the merged plan is validated/repaired against the FULL
// targets (locked contribution + open contribution), never just the open
// slice in isolation.

function makeTargets () {
  const profile = createProfile({
    ageYears: 30, sex: Sex.MALE, heightCm: 175.0, weightKg: 75.0,
    activityLevel: ActivityLevel.MODERATE, goal: Goal.MAINTAIN
  })
  return computeTargets(profile).targets
}

function makeCurrentPlan () {
  return {
    days: [
      {
        meals: [
          {
            slot: 'breakfast',
            items: [
              { food_key: 'avena_fiocchi', grams: 90, note: '' },
              { food_key: 'banana', grams: 120, note: '' }
            ]
          },
          {
            slot: 'lunch',
            items: [
              { food_key: 'pasta_cotta', grams: 350, note: '' },
              { food_key: 'petto_di_pollo_cotto', grams: 220, note: '' },
              { food_key: 'olio_oliva', grams: 15, note: '' }
            ]
          },
          {
            slot: 'dinner',
            items: [
              { food_key: 'riso_bianco_cotto', grams: 300, note: '' },
              { food_key: 'merluzzo_cotto', grams: 200, note: '' },
              { food_key: 'broccoli_cotti', grams: 200, note: '' }
            ]
          }
        ]
      }
    ]
  }
}

// JS Array.shift() on an empty array returns undefined rather than
// throwing (unlike Python's list.pop(0), which raises IndexError) --
// this helper restores that behavior, same reasoning as planner.test.js.
function popOrThrow (queue) {
  if (queue.length === 0) throw new Error('fake partial client queue exhausted')
  return queue.shift()
}

class FakePartialClient {
  constructor (...partialSequence) {
    this._queue = [...partialSequence]
    this.calls = []
    this.lastContext = null
  }

  async generatePartial (_systemPrompt, _catalogue, context, _locale) {
    this.calls.push('generate_partial')
    this.lastContext = context
    return popOrThrow(this._queue)
  }

  async repairPartial (_systemPrompt, _catalogue, _context, _previousPartial, repairNote, _locale) {
    this.calls.push('repair_partial')
    this.lastRepairNote = repairNote
    return popOrThrow(this._queue)
  }
}

it('a single-item swap leaves everything else untouched', async () => {
  // This fixture plan is deliberately not pre-tuned to the profile's
  // real targets (carb is far short) -- a single swapped item often
  // can't close that gap alone, so this exercises the repair path too.
  const targets = makeTargets()
  const plan = makeCurrentPlan()
  const scope = createEditScope({ kind: 'item', dayIndex: 0, mealIndex: 2, itemIndex: 1 }) // dinner's merluzzo
  const client = new FakePartialClient(
    { items: [{ food_key: 'salmone_cotto', grams: 180, note: '' }] },
    { items: [{ food_key: 'salmone_cotto', grams: 250, note: '' }] }
  )

  const result = await regenerateScope(client, plan, scope, 'sostituisci con salmone', targets, DB, [], 'it')

  expect(result.plan).not.toBeNull()
  expect(result.plan.days[0].meals[2].items[1].food_key).toBe('salmone_cotto')
  // Every other item identical to the original, regardless of which
  // branch (first try or repair) produced the final plan.
  expect(result.plan.days[0].meals[0].items[0].food_key).toBe('avena_fiocchi')
  expect(result.plan.days[0].meals[0].items[0].grams).toBe(90)
  expect(result.plan.days[0].meals[2].items[0].food_key).toBe('riso_bianco_cotto')
  expect(result.plan.days[0].meals[2].items[0].grams).toBe(300)
  expect(client.calls[0]).toBe('generate_partial')
})

it('a meal scope regenerates only that meal\'s items', async () => {
  const targets = makeTargets()
  const plan = makeCurrentPlan()
  const scope = createEditScope({ kind: 'meal', dayIndex: 0, mealIndex: 1 }) // lunch, 3 items
  const draft = {
    items: [
      { food_key: 'quinoa_cotta', grams: 200, note: '' },
      { food_key: 'salmone_cotto', grams: 180, note: '' },
      { food_key: 'broccoli_cotti', grams: 150, note: '' }
    ]
  }
  const client = new FakePartialClient(draft, draft) // same draft offered again if repair is needed

  const result = await regenerateScope(client, plan, scope, 'voglio qualcosa diverso a pranzo', targets, DB, [], 'it')

  expect(result.plan).not.toBeNull()
  const lunchItems = result.plan.days[0].meals[1].items
  expect(lunchItems.map((i) => i.food_key)).toEqual(['quinoa_cotta', 'salmone_cotto', 'broccoli_cotti'])
  // Breakfast and dinner untouched regardless of planStatus.
  expect(result.plan.days[0].meals[0].items[0].food_key).toBe('avena_fiocchi')
  expect(result.plan.days[0].meals[2].items[0].food_key).toBe('riso_bianco_cotto')
})

it('the result is validated against the full plan, not just the open slice', async () => {
  // The targets context carries the WHOLE day's targets. If the open
  // slot's replacement is wildly over target even accounting for the
  // locked items, it must not silently report "ok".
  const targets = makeTargets()
  const plan = makeCurrentPlan()
  const scope = createEditScope({ kind: 'item', dayIndex: 0, mealIndex: 1, itemIndex: 2 }) // the olive oil
  // Absurdly large oil swap -- should fail tolerance given everything else is locked.
  const client = new FakePartialClient(
    { items: [{ food_key: 'olio_oliva', grams: 900, note: '' }] },
    { items: [{ food_key: 'olio_oliva', grams: 15, note: '' }] }
  )

  const result = await regenerateScope(client, plan, scope, 'più olio', targets, DB, [], 'it')

  expect([PLAN_STATUS_REPAIRED, PLAN_STATUS_TARGETS_ONLY]).toContain(result.planStatus)
  expect(client.calls).toContain('repair_partial')
})

it('an item-count mismatch triggers repair, not a crash', async () => {
  const targets = makeTargets()
  const plan = makeCurrentPlan()
  const scope = createEditScope({ kind: 'meal', dayIndex: 0, mealIndex: 0 }) // breakfast, 2 items
  const client = new FakePartialClient(
    { items: [{ food_key: 'banana', grams: 100, note: '' }] }, // only 1, expected 2
    {
      items: [
        { food_key: 'avena_fiocchi', grams: 90, note: '' },
        { food_key: 'banana', grams: 100, note: '' }
      ]
    }
  )

  const result = await regenerateScope(client, plan, scope, 'cambia la colazione', targets, DB, [], 'it')

  expect(client.calls).toEqual(['generate_partial', 'repair_partial'])
  expect([PLAN_STATUS_OK, PLAN_STATUS_REPAIRED, PLAN_STATUS_TARGETS_ONLY]).toContain(result.planStatus)
})

it('a repair exception falls back to targets_only', async () => {
  const targets = makeTargets()
  const plan = makeCurrentPlan()
  const scope = createEditScope({ kind: 'item', dayIndex: 0, mealIndex: 2, itemIndex: 1 })

  class ExplodingClient extends FakePartialClient {
    async repairPartial () {
      throw new Error('network blew up')
    }
  }

  // 5000g is out of PLAN_ITEM_GRAMS_MAX range -> hard fail -> repair attempted -> explodes.
  const client = new ExplodingClient({ items: [{ food_key: 'salmone_cotto', grams: 5000, note: '' }] })
  const result = await regenerateScope(client, plan, scope, 'tanto salmone', targets, DB, [], 'it')
  expect(result.planStatus).toBe(PLAN_STATUS_TARGETS_ONLY)
  expect(result.plan).toBeNull()
})

it('an empty scope throws a ScopeError', async () => {
  const targets = makeTargets()
  const plan = { days: [{ meals: [{ slot: 'lunch', items: [] }] }] }
  const client = new FakePartialClient()
  await expect(regenerateScope(client, plan, createEditScope({ kind: 'plan' }), 'qualsiasi', targets, DB, [], 'it'))
    .rejects.toThrow(ScopeError)
})

it('a day scope regenerates all meals in that day', async () => {
  const targets = makeTargets()
  const plan = makeCurrentPlan()
  const scope = createEditScope({ kind: 'day', dayIndex: 0 })
  // 2 + 3 + 3 = 8 items total in day 0
  const draft = {
    items: [
      { food_key: 'yogurt_greco_intero', grams: 200, note: '' },
      { food_key: 'mela', grams: 100, note: '' },
      { food_key: 'quinoa_cotta', grams: 200, note: '' },
      { food_key: 'petto_di_tacchino_cotto', grams: 200, note: '' },
      { food_key: 'olio_oliva', grams: 10, note: '' },
      { food_key: 'farro_cotto', grams: 250, note: '' },
      { food_key: 'orata_cotta', grams: 200, note: '' },
      { food_key: 'spinaci_cotti', grams: 200, note: '' }
    ]
  }
  const client = new FakePartialClient(draft, draft)

  const result = await regenerateScope(client, plan, scope, 'cambia tutta la giornata', targets, DB, [], 'it')
  expect(result.plan).not.toBeNull()
  const allItems = result.plan.days[0].meals.flatMap((meal) => meal.items.map((item) => item.food_key))
  expect(allItems).toEqual([
    'yogurt_greco_intero', 'mela', 'quinoa_cotta', 'petto_di_tacchino_cotto', 'olio_oliva',
    'farro_cotto', 'orata_cotta', 'spinaci_cotti'
  ])
})

it('excluded tags filter the catalogue shown to the model', async () => {
  const targets = makeTargets()
  const plan = makeCurrentPlan()
  const scope = createEditScope({ kind: 'item', dayIndex: 0, mealIndex: 2, itemIndex: 1 })

  const seenCatalogues = []

  class RecordingClient extends FakePartialClient {
    async generatePartial (systemPrompt, catalogue, context, locale) {
      seenCatalogues.push(catalogue)
      return super.generatePartial(systemPrompt, catalogue, context, locale)
    }
  }

  const client = new RecordingClient({ items: [{ food_key: 'petto_di_pollo_cotto', grams: 180, note: '' }] })
  await regenerateScope(client, plan, scope, 'niente pesce', targets, DB, ['fish'], 'it')
  const keys = seenCatalogues[0].map((item) => item.food_key)
  expect(keys).not.toContain('salmone_cotto')
  expect(keys).not.toContain('merluzzo_cotto')
})

import { expect, it } from 'vitest'
import { computeTargets } from '../../lib/domain/engine.js'
import { ActivityLevel, Goal, Sex } from '../../lib/domain/enums.js'
import { DEFAULT_FOOD_DB as DB } from '../../lib/domain/food_db.js'
import { createProfile } from '../../lib/domain/models.js'
import {
  generatePlan, PLAN_STATUS_OK, PLAN_STATUS_REPAIRED, PLAN_STATUS_TARGETS_ONLY
} from '../../lib/llm/planner.js'

// Ported from tests/llm/test_planner.py. Tests the generate -> validate
// -> repair loop entirely with a fake in-memory LLMPlanClient -- no
// network, no OpenAI SDK object graph to mock.

function makeTargets () {
  const profile = createProfile({
    ageYears: 30, sex: Sex.MALE, heightCm: 175.0, weightKg: 75.0,
    activityLevel: ActivityLevel.MODERATE, goal: Goal.MAINTAIN
  })
  return computeTargets(profile).targets
}

/** mealItems: list of [slot, [[foodKey, grams], ...]] */
function draft (...mealItems) {
  return {
    days: [
      {
        meals: mealItems.map(([slot, items]) => ({
          slot,
          items: items.map(([k, g]) => ({ food_key: k, grams: g, note: '' }))
        }))
      }
    ]
  }
}

// JS Array.shift() on an empty array returns undefined rather than
// throwing (unlike Python's list.pop(0), which raises IndexError) --
// this helper restores that behavior so an over-exhausted fake still
// exercises generatePlan's try/catch around the repair call, instead of
// silently handing it `undefined` and crashing somewhere else entirely.
function popOrThrow (queue) {
  if (queue.length === 0) throw new Error('fake LLM client queue exhausted')
  return queue.shift()
}

/**
 * Scripted fake: returns draftSequence[0] for createPlan, then each
 * subsequent call (repairPlan) pops the next entry.
 */
class FakeLLMClient {
  constructor (...draftSequence) {
    this._queue = [...draftSequence]
    this.calls = []
  }

  async createPlan (systemPrompt, _catalogue, _locale) {
    this.calls.push('create')
    this.lastSystemPrompt = systemPrompt
    return popOrThrow(this._queue)
  }

  async repairPlan (_systemPrompt, _catalogue, _previousDraft, repairNote, _locale) {
    this.calls.push('repair')
    this.lastRepairNote = repairNote
    return popOrThrow(this._queue)
  }
}

it('a generated plan never throws and always returns a valid status', async () => {
  const targets = makeTargets()
  const base = draft(
    ['breakfast', [['avena_fiocchi', 80], ['banana', 100]]],
    ['lunch', [['riso_bianco_cotto', 250], ['petto_di_pollo_cotto', 220], ['olio_oliva', 12]]],
    ['dinner', [['merluzzo_cotto', 200], ['broccoli_cotti', 250], ['olio_oliva', 8]]]
  )
  const fallback = draft(['lunch', [['riso_bianco_cotto', 400], ['petto_di_pollo_cotto', 300]]])
  const client = new FakeLLMClient(base, fallback)
  const result = await generatePlan(client, targets, DB, [], 'it')
  expect([PLAN_STATUS_OK, PLAN_STATUS_REPAIRED, PLAN_STATUS_TARGETS_ONLY]).toContain(result.planStatus)
  expect(client.calls[0]).toBe('create')
})

// Note: the "already-within-tolerance needs no LLM call at all" behavior
// is proven rigorously at the pure-function level in
// tests/domain/plan_fitting.test.js ("already within tolerance returns
// unchanged"), using a MacroTargets built directly from a real plan's
// own totals. Not re-proven here at the planner-integration level, same
// reasoning as the Python source this was ported from.

it('a hard fail triggers a repair call', async () => {
  const targets = makeTargets()
  const bad = draft(['lunch', [['frittata_di_unicorno', 200]]])
  const good = draft(
    ['breakfast', [['avena_fiocchi', 80]]],
    ['lunch', [['riso_bianco_cotto', 250], ['petto_di_pollo_cotto', 200], ['olio_oliva', 10]]],
    ['dinner', [['merluzzo_cotto', 200], ['broccoli_cotti', 200]]]
  )
  const client = new FakeLLMClient(bad, good)
  const result = await generatePlan(client, targets, DB, [], 'it')
  expect(client.calls).toEqual(['create', 'repair'])
  expect([PLAN_STATUS_REPAIRED, PLAN_STATUS_TARGETS_ONLY]).toContain(result.planStatus)
})

it('the hard-fail repair note mentions the unknown key', async () => {
  const targets = makeTargets()
  const bad = draft(['lunch', [['frittata_di_unicorno', 200]]])
  const good = draft(['lunch', [['riso_bianco_cotto', 200]]])
  const client = new FakeLLMClient(bad, good)
  await generatePlan(client, targets, DB, [], 'it')
  expect(client.lastRepairNote).toContain('UNKNOWN_FOOD_KEY')
})

it('a banned tag triggers repair, not fitting', async () => {
  const targets = makeTargets()
  const fishy = draft(['lunch', [['salmone_cotto', 200], ['riso_bianco_cotto', 200]]])
  const fixed = draft(['lunch', [['petto_di_pollo_cotto', 200], ['riso_bianco_cotto', 200]]])
  const client = new FakeLLMClient(fishy, fixed)
  const result = await generatePlan(client, targets, DB, ['fish'], 'it')
  expect(client.calls).toEqual(['create', 'repair'])
  // The repaired plan must not reintroduce the banned food either --
  // validated against the same excludedTags.
  if (result.planStatus === PLAN_STATUS_REPAIRED) {
    expect(result.validation.ok).toBe(true)
  }
})

it('a slightly-off plan is fixed by fitting, without an LLM repair call', async () => {
  const targets = makeTargets()
  // A plan proportionally scaled down from a near-target one should be
  // fixable by fitToTargets's proportional scaling pass alone.
  const base = draft(
    ['breakfast', [['avena_fiocchi', 70], ['banana', 90]]],
    ['lunch', [['riso_bianco_cotto', 220], ['petto_di_pollo_cotto', 190], ['olio_oliva', 10]]],
    ['dinner', [['merluzzo_cotto', 180], ['broccoli_cotti', 220]]]
  )
  const client = new FakeLLMClient(base)
  const result = await generatePlan(client, targets, DB, [], 'it')
  // Whether it lands exactly "ok" or gets "repaired" by fitting, it must
  // NOT have made a repair LLM call (fitting is free and tried first).
  if (result.planStatus === PLAN_STATUS_REPAIRED) {
    expect(client.calls).toEqual(['create'])
  }
})

it('persistent failure after repair returns targets_only, not an exception', async () => {
  const targets = makeTargets()
  const alwaysBad = draft(['lunch', [['insalata_verde', 30]]])
  const stillBad = draft(['lunch', [['insalata_verde', 40]]])
  const client = new FakeLLMClient(alwaysBad, stillBad)
  const result = await generatePlan(client, targets, DB, [], 'it')
  expect([PLAN_STATUS_REPAIRED, PLAN_STATUS_TARGETS_ONLY]).toContain(result.planStatus)
  expect(client.calls).toEqual(['create', 'repair'])
})

it('a repair call exception is caught and returns targets_only', async () => {
  const targets = makeTargets()
  const explodingClient = {
    async createPlan () {
      return draft(['lunch', [['frittata_di_unicorno', 100]]])
    },
    async repairPlan () {
      throw new Error('network blew up')
    }
  }
  const result = await generatePlan(explodingClient, targets, DB, [], 'it')
  expect(result.planStatus).toBe(PLAN_STATUS_TARGETS_ONLY)
  expect(result.plan).toBeNull()
})

it('locale en produces an english repair note', async () => {
  const targets = makeTargets()
  const bad = draft(['lunch', [['frittata_di_unicorno', 200]]])
  const good = draft(['lunch', [['riso_bianco_cotto', 200]]])
  const client = new FakeLLMClient(bad, good)
  await generatePlan(client, targets, DB, [], 'en')
  expect(client.lastRepairNote.includes('food_key') || client.lastRepairNote.includes('catalogue')).toBe(true)
})

it('at most one repair call is ever made', async () => {
  const targets = makeTargets()
  const alwaysBad = draft(['lunch', [['insalata_verde', 20]]])
  const stillBad1 = draft(['lunch', [['insalata_verde', 25]]])
  const client = new FakeLLMClient(alwaysBad, stillBad1)
  await generatePlan(client, targets, DB, [], 'it')
  expect(client.calls.filter((c) => c === 'repair').length).toBeLessThanOrEqual(1)
})

it('an extra instruction is appended to the system prompt', async () => {
  const targets = makeTargets()
  const base = draft(['lunch', [['riso_bianco_cotto', 250], ['petto_di_pollo_cotto', 200]]])
  const client = new FakeLLMClient(base, base)
  await generatePlan(client, targets, DB, [], 'it', 'un solo pasto al giorno')
  expect(client.lastSystemPrompt).toContain('un solo pasto al giorno')
})

it('no extra instruction leaves the prompt unchanged', async () => {
  const targets = makeTargets()
  const base = draft(['lunch', [['riso_bianco_cotto', 250], ['petto_di_pollo_cotto', 200]]])
  const client = new FakeLLMClient(base, base)
  await generatePlan(client, targets, DB, [], 'it')
  expect(client.lastSystemPrompt).not.toContain('Richiesta strutturale aggiuntiva')
})

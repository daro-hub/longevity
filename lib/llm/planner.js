// Orchestrates the generate -> validate -> repair loop.
//
//     generate -> totalMacros -> validate
//       |- ok   -> done ("ok")
//       \- fail -> fitToTargets(...)      # PURE, no LLM
//                    |- ok   -> done ("repaired")
//                    \- fail -> ONE LLM repair call -> totalMacros -> validate
//                                 |- ok   -> done ("repaired")
//                                 \- fail -> "targets_only"
//
// Hard failures (unknown food_key, a banned tag, implausible grams) skip
// straight to the LLM repair call rather than through fitToTargets --
// fitting only scales/nudges existing grams, it cannot swap out a food
// the model was never supposed to use in the first place.
//
// At most one LLM repair call is ever made, for both cost and latency
// reasons. When repair still doesn't land within tolerance, the caller
// gets back the computed targets (still correct and useful on their own)
// with planStatus="targets_only" -- never a crash, never a silently-
// broken plan.
//
// Ported from app/llm/planner.py.

import { filterFoods } from '../domain/food_db.js'
import { fitToTargets } from '../domain/plan_fitting.js'
import { checkTolerance } from '../domain/plan_tolerance.js'
import { planPromptEn } from './prompts/plan-en.js'
import { planPromptIt } from './prompts/plan-it.js'
import {
  applyPartial,
  describeItem,
  flatIndexMap,
  openPositions,
  ScopeError
} from './scope.js'
import { validate } from './validator.js'

export const PLAN_STATUS_OK = 'ok'
export const PLAN_STATUS_REPAIRED = 'repaired'
export const PLAN_STATUS_TARGETS_ONLY = 'targets_only'

function loadPrompt (locale, targets, extraInstruction = '') {
  const params = {
    kcal: targets.calories.kcal,
    proteinG: targets.macros.proteinG,
    carbG: targets.macros.carbG,
    fatG: targets.macros.fatG,
    fiberG: targets.macros.fiberG
  }
  const base = locale === 'en' ? planPromptEn(params) : planPromptIt(params)
  if (!extraInstruction) return base
  if (locale === 'en') {
    return `${base}\n\nAdditional structural request from the user: ${extraInstruction}`
  }
  return `${base}\n\nRichiesta strutturale aggiuntiva dell'utente: ${extraInstruction}`
}

export function createPlanResult (planStatus, plan, totals, validation, hardFailReasons = []) {
  return Object.freeze({ planStatus, plan, totals, validation, hardFailReasons })
}

function cataloguePayload (foods, locale) {
  // Deliberately NO macro fields here -- see lib/llm/schemas.js's module comment.
  return Object.entries(foods).map(([key, item]) => ({ food_key: key, name: item.name(locale), tags: [...item.tags] }))
}

/**
 * Writes adjusted (foodKey, grams) back into a deep copy of the original
 * nested plan structure, in the same traversal order
 * nutrition.flattenPlanItems used to produce `items`. Only valid when
 * item count is unchanged (i.e. after plan_fitting, never after dropping
 * hard-fail items).
 */
function rebuildPlanWithItems (planDict, items) {
  const newPlan = structuredClone(planDict)
  let i = 0
  for (const day of newPlan.days || []) {
    for (const meal of day.meals || []) {
      for (const rawItem of meal.items || []) {
        const updated = items[i]
        rawItem.food_key = updated.foodKey
        rawItem.grams = updated.grams
        i += 1
      }
    }
  }
  return newPlan
}

/**
 * The repair prompt's core: server-recomputed totals labeled as computed
 * by the system (not the model), with signed deltas per nutrient. A bare
 * "try again" regresses as often as it improves -- this gives the model
 * something concrete to act on.
 */
function buildRepairNote (validation, targets, locale) {
  if (validation.hardFailed) {
    const reasons = validation.hardFailReasons.join('; ')
    if (locale === 'en') {
      return (
        `Your previous plan had structural problems: ${reasons}. ` +
        'Use only food_key values from the supplied catalogue, respect gram limits ' +
        '(1-1000g per item, max 2000g per meal), and never use an excluded food.'
      )
    }
    return (
      `Il tuo piano precedente aveva problemi strutturali: ${reasons}. ` +
      'Usa solo i food_key del catalogo fornito, rispetta i limiti di grammatura ' +
      '(1-1000g per alimento, massimo 2000g per pasto), e non usare mai un alimento escluso.'
    )
  }

  const t = validation.tolerance
  const totals = validation.totals
  if (locale === 'en') {
    return (
      'These totals were computed by the SYSTEM from the items in your plan, not by you:\n' +
      `kcal=${totals.kcal.toFixed(0)} (target ${(t.kcalDelta + totals.kcal).toFixed(0)}, delta ${signed(t.kcalDelta)}), ` +
      `protein=${totals.proteinG.toFixed(0)}g (delta ${signed(t.proteinDelta)}g), ` +
      `fat=${totals.fatG.toFixed(0)}g (delta ${signed(t.fatDelta)}g), ` +
      `carb=${totals.carbG.toFixed(0)}g (delta ${signed(t.carbDelta)}g), ` +
      `fiber=${totals.fiberG.toFixed(0)}g (delta ${signed(t.fiberDelta)}g).\n` +
      'Adjust the grams of existing items where possible to close these deltas. ' +
      'You may add or remove at most 2 items. Do not change the meal structure.'
    )
  }
  return (
    'Questi totali sono stati calcolati dal SISTEMA a partire dagli alimenti del tuo piano, non da te:\n' +
    `kcal=${totals.kcal.toFixed(0)} (target ${(t.kcalDelta + totals.kcal).toFixed(0)}, delta ${signed(t.kcalDelta)}), ` +
    `proteine=${totals.proteinG.toFixed(0)}g (delta ${signed(t.proteinDelta)}g), ` +
    `grassi=${totals.fatG.toFixed(0)}g (delta ${signed(t.fatDelta)}g), ` +
    `carboidrati=${totals.carbG.toFixed(0)}g (delta ${signed(t.carbDelta)}g), ` +
    `fibre=${totals.fiberG.toFixed(0)}g (delta ${signed(t.fiberDelta)}g).\n` +
    'Aggiusta i grammi degli item esistenti dove possibile per chiudere questi delta. ' +
    'Puoi aggiungere o togliere al massimo 2 item. Non cambiare la struttura dei pasti.'
  )
}

function signed (n) {
  const rounded = Math.round(n)
  return rounded >= 0 ? `+${rounded}` : `${rounded}`
}

/**
 * extraInstruction carries a user's STRUCTURAL request (e.g. "only one
 * meal a day", "make it vegetarian overall") -- something that changes
 * the shape of the plan itself, not a specific ingredient. A scoped edit
 * (regenerateScope) can't express that; this is a full regeneration with
 * the request appended to the system prompt as an extra constraint,
 * still going through the exact same validate -> fit -> repair ->
 * targets_only pipeline below.
 */
export async function generatePlan (llmClient, targets, foodDb, excludedTags, locale, extraInstruction = '') {
  const catalogueFoods = filterFoods(foodDb, excludedTags)
  const systemPrompt = loadPrompt(locale, targets, extraInstruction)
  const catalogue = cataloguePayload(catalogueFoods, locale)

  const draft = await llmClient.createPlan(systemPrompt, catalogue, locale)
  const planDict = draft

  const result = validate(planDict, targets.calories.kcal, targets.macros, foodDb, excludedTags)
  if (result.ok) {
    return createPlanResult(PLAN_STATUS_OK, planDict, result.totals, result)
  }

  if (!result.hardFailed) {
    // Structurally valid, just numerically off -- try the free fix first.
    const fit = fitToTargets([...result.items], targets.calories.kcal, targets.macros, foodDb)
    if (fit.success) {
      const repairedPlan = rebuildPlanWithItems(planDict, fit.items)
      const revalidated = validate(repairedPlan, targets.calories.kcal, targets.macros, foodDb, excludedTags)
      return createPlanResult(PLAN_STATUS_REPAIRED, repairedPlan, revalidated.totals, revalidated)
    }
  }

  // One LLM repair call, for either a hard fail or a fitToTargets miss.
  const repairNote = buildRepairNote(result, targets, locale)
  let repairedDraft
  try {
    repairedDraft = await llmClient.repairPlan(systemPrompt, catalogue, draft, repairNote, locale)
  } catch {
    return createPlanResult(PLAN_STATUS_TARGETS_ONLY, null, null, result, result.hardFailReasons)
  }

  const repairedPlanDict = repairedDraft
  const final = validate(repairedPlanDict, targets.calories.kcal, targets.macros, foodDb, excludedTags)
  if (final.ok) {
    return createPlanResult(PLAN_STATUS_REPAIRED, repairedPlanDict, final.totals, final)
  }

  return createPlanResult(PLAN_STATUS_TARGETS_ONLY, repairedPlanDict, final.totals, final, final.hardFailReasons)
}

/**
 * Tells the model exactly which slots are open and what currently sits
 * in them, plus the user's free-text instruction. Everything NOT listed
 * here is locked and must not be touched -- the model is never even
 * shown those items, so there's nothing for it to "helpfully" rewrite.
 */
function buildScopeContext (planDict, positions, instruction, locale) {
  const openDesc = positions.map(([dIdx, mIdx, iIdx]) => {
    const current = describeItem(planDict, [dIdx, mIdx, iIdx])
    return locale === 'en'
      ? `- day ${dIdx + 1}, ${current.slot}, position ${iIdx + 1}: currently ${current.foodKey} (${current.grams}g)`
      : `- giorno ${dIdx + 1}, ${current.slot}, posizione ${iIdx + 1}: attualmente ${current.foodKey} (${current.grams}g)`
  })
  const slotsBlock = openDesc.join('\n')

  if (locale === 'en') {
    return (
      `The user wants to change ONLY these ${positions.length} item(s), in this exact order ` +
      `(return exactly ${positions.length} item(s), same order):\n${slotsBlock}\n\n` +
      `User's request: ${instruction}\n\n` +
      'Everything else in the plan is locked and already decided -- you are not shown it ' +
      'and must not try to recreate it. Pick a sensible food_key and grams for each open slot.'
    )
  }
  return (
    `L'utente vuole cambiare SOLO questi ${positions.length} elemento/i, in questo esatto ordine ` +
    `(restituisci esattamente ${positions.length} elemento/i, nello stesso ordine):\n${slotsBlock}\n\n` +
    `Richiesta dell'utente: ${instruction}\n\n` +
    "Tutto il resto del piano è bloccato ed è già deciso -- non ti viene mostrato e non devi " +
    'cercare di ricrearlo. Scegli un food_key e una grammatura sensata per ogni slot aperto.'
  )
}

function buildScopeRepairNote (reason, totals, targetKcal, macros, locale) {
  if (totals === null) {
    return locale === 'en'
      ? `Your previous answer had a problem: ${reason}. Follow the instructions exactly.`
      : `La tua risposta precedente aveva un problema: ${reason}. Segui le istruzioni esattamente.`
  }

  const t = checkTolerance(totals, targetKcal, macros)
  if (locale === 'en') {
    return (
      'The system recomputed the WHOLE plan\'s totals (your new item(s) plus everything ' +
      'already locked), not just your part:\n' +
      `kcal=${totals.kcal.toFixed(0)} (delta ${signed(t.kcalDelta)}), protein=${totals.proteinG.toFixed(0)}g ` +
      `(delta ${signed(t.proteinDelta)}g), fat=${totals.fatG.toFixed(0)}g (delta ${signed(t.fatDelta)}g), ` +
      `carb=${totals.carbG.toFixed(0)}g (delta ${signed(t.carbDelta)}g).\n` +
      'Adjust only the grams/food choice for the open slot(s) to close these deltas.'
    )
  }
  return (
    "Il sistema ha ricalcolato i totali dell'INTERO piano (i tuoi nuovi elementi più tutto " +
    'ciò che è già bloccato), non solo la tua parte:\n' +
    `kcal=${totals.kcal.toFixed(0)} (delta ${signed(t.kcalDelta)}), proteine=${totals.proteinG.toFixed(0)}g ` +
    `(delta ${signed(t.proteinDelta)}g), grassi=${totals.fatG.toFixed(0)}g (delta ${signed(t.fatDelta)}g), ` +
    `carboidrati=${totals.carbG.toFixed(0)}g (delta ${signed(t.carbDelta)}g).\n` +
    "Aggiusta solo i grammi/la scelta dell'alimento per lo slot aperto per chiudere questi delta."
  )
}

function sortPositions (positions) {
  return [...positions].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
}

/**
 * A scoped edit: swap one ingredient, regenerate one meal/day, or an
 * arbitrary multi-select -- all the same mechanism. Every item NOT in
 * scope comes out identical to how it went in (fitToTargets' locked
 * indices enforces this on the free-fix pass; the LLM is simply never
 * shown the locked items, so it has nothing to rewrite there).
 *
 * Mirrors generatePlan's validate -> fit -> one repair -> targets_only
 * shape, scoped to the open positions throughout.
 */
export async function regenerateScope (
  llmClient, currentPlan, scope, instruction, targets, foodDb, excludedTags, locale
) {
  const positions = sortPositions(openPositions(currentPlan, scope))
  if (positions.length === 0) {
    throw new ScopeError('scope matched no items in this plan')
  }

  const indexMap = flatIndexMap(currentPlan)
  const positionsSet = new Set(positions.map((p) => p.join(':')))
  const lockedIndices = new Set()
  for (const [key, idx] of indexMap) {
    if (!positionsSet.has(key)) lockedIndices.add(idx)
  }

  const catalogueFoods = filterFoods(foodDb, excludedTags)
  const systemPrompt = loadPrompt(locale, targets)
  const catalogue = cataloguePayload(catalogueFoods, locale)
  const context = buildScopeContext(currentPlan, positions, instruction, locale)

  const partial = await llmClient.generatePartial(systemPrompt, catalogue, context, locale)

  let mergedPlan = null
  let mismatchReason = null
  try {
    mergedPlan = applyPartial(currentPlan, positions, partial.items)
  } catch (e) {
    mergedPlan = null
    mismatchReason = e.message
  }

  const validateMerged = (planDict) => validate(planDict, targets.calories.kcal, targets.macros, foodDb, excludedTags)

  let result = null
  let repairNote

  if (mergedPlan !== null) {
    result = validateMerged(mergedPlan)
    if (result.ok) {
      return createPlanResult(PLAN_STATUS_OK, mergedPlan, result.totals, result)
    }

    if (!result.hardFailed) {
      const fit = fitToTargets(
        [...result.items], targets.calories.kcal, targets.macros, foodDb, lockedIndices
      )
      if (fit.success) {
        const repairedPlan = rebuildPlanWithItems(mergedPlan, fit.items)
        const revalidated = validateMerged(repairedPlan)
        return createPlanResult(PLAN_STATUS_REPAIRED, repairedPlan, revalidated.totals, revalidated)
      }
    }

    repairNote = buildScopeRepairNote(
      result.hardFailed ? result.hardFailReasons.join('; ') : 'tolerance miss',
      result.totals,
      targets.calories.kcal,
      targets.macros,
      locale
    )
  } else {
    repairNote = buildScopeRepairNote(mismatchReason, null, 0, null, locale)
  }

  // One repair call -- re-ask only for the open slots, with server-computed deltas.
  let finalMerged
  try {
    const repairedPartial = await llmClient.repairPartial(
      systemPrompt, catalogue, context, partial, repairNote, locale
    )
    finalMerged = applyPartial(currentPlan, positions, repairedPartial.items)
  } catch {
    const hardFailReasons = result ? result.hardFailReasons : [mismatchReason || 'unknown']
    return createPlanResult(PLAN_STATUS_TARGETS_ONLY, null, null, result, hardFailReasons)
  }

  const final = validateMerged(finalMerged)
  if (final.ok) {
    return createPlanResult(PLAN_STATUS_REPAIRED, finalMerged, final.totals, final)
  }

  return createPlanResult(PLAN_STATUS_TARGETS_ONLY, finalMerged, final.totals, final, final.hardFailReasons)
}

// Natural-language front-end over the scoped-editing primitives
// (lib/llm/scope.js, lib/llm/planner.js regenerateScope,
// lib/domain/substitutes.js).
//
// The model's only job here is to turn free text ("scambia il pollo con
// qualcosa di più leggero", "fammi un solo pasto al giorno", "cosa posso
// usare al posto del salmone?") into one of a small set of STRUCTURED
// operations the rest of the system already knows how to execute safely.
// It never decides a macro number, same principle as everywhere else in
// this codebase -- it only resolves *which* deterministic/validated
// mechanism to invoke and with which position(s).
//
// Sentinel values (-1, "") stand in for "not applicable" fields rather
// than true optionals, because OpenAI Structured Outputs' strict mode
// requires every field to be present -- true optionality isn't
// expressible in strict mode.
//
// Ported from app/llm/intent.py.

import { z } from 'zod'
import { allPositions, createEditScope, describeItem, ScopeError } from './scope.js'

export const ChatOperation = Object.freeze({
  REGENERATE_SCOPE: 'regenerate_scope',
  REGENERATE_FULL: 'regenerate_full',
  GET_ALTERNATIVES: 'get_alternatives',
  CLARIFY: 'clarify'
})

export const ChatIntentSchema = z.object({
  operation: z.enum(Object.values(ChatOperation)),
  scope_kind: z.string().describe('one of plan|day|meal|item|selection -- ignored unless operation=regenerate_scope'),
  day_index: z.number().int().describe('-1 if not applicable'),
  meal_index: z.number().int().describe('-1 if not applicable'),
  item_index: z.number().int().describe('-1 if not applicable'),
  selection: z.array(z.array(z.number().int())).describe(
    'list of [day_index, meal_index, item_index] triples, only for scope_kind=selection'
  ),
  target_food_key: z.string().describe("food_key the user is asking about -- for get_alternatives"),
  instruction: z.string().describe("the user's actual request, passed through verbatim to the executor"),
  clarification_question: z.string().describe('only used when operation=clarify')
}).strict()

export class ScopeConversionError extends ScopeError {}

/**
 * Numbers every position so the model can resolve "il pollo" / "the
 * chicken" to an exact (day, meal, item) triple instead of guessing in
 * prose. Reuses lib/llm/scope.js so this listing and the one
 * regenerateScope itself builds for the LLM never drift apart.
 */
export function describePlan (planDict, locale) {
  const lines = []
  for (const pos of allPositions(planDict)) {
    const [dIdx, mIdx, iIdx] = pos
    const item = describeItem(planDict, pos)
    lines.push(
      locale === 'en'
        ? `day=${dIdx} meal=${mIdx} item=${iIdx} (${item.slot}): ${item.foodKey} ${item.grams}g`
        : `giorno=${dIdx} pasto=${mIdx} item=${iIdx} (${item.slot}): ${item.foodKey} ${item.grams}g`
    )
  }
  return lines.join('\n')
}

function buildIntentSystemPrompt (planDescription, locale) {
  if (locale === 'en') {
    return (
      "You turn a user's free-text request about their meal plan into ONE structured " +
      'operation. Available operations:\n' +
      '- regenerate_scope: the user wants to change specific existing item(s) (swap one ' +
      'ingredient, redo one meal, redo one day, or an arbitrary selection). Resolve exactly ' +
      'which position(s) they mean using the plan listing below, and set scope_kind + indices ' +
      "accordingly. Put the user's actual request in `instruction` (e.g. 'something with less fat').\n" +
      '- regenerate_full: the user wants to change the overall STRUCTURE of the plan itself ' +
      "(e.g. 'only one meal a day', 'add a 6th day', 'make it vegetarian overall'), not just " +
      "swap specific foods. Put their request in `instruction`.\n" +
      '- get_alternatives: the user is asking what else they could use instead of ONE food, ' +
      "without committing to a change yet. Set target_food_key to that food's exact key.\n" +
      "- clarify: the request is ambiguous (e.g. you can't tell which item they mean) -- ask a " +
      'short clarifying question in `clarification_question`.\n\n' +
      `Current plan (day/meal/item indices are 0-based):\n${planDescription}\n\n` +
      "Use indices from this exact listing -- never invent a position that isn't in it. " +
      "Leave inapplicable fields at their sentinel value (-1 for indices, empty string/list " +
      'for the rest).'
    )
  }
  return (
    "Trasformi la richiesta in linguaggio naturale dell'utente sul suo piano alimentare in UNA " +
    'operazione strutturata. Operazioni disponibili:\n' +
    '- regenerate_scope: l\'utente vuole cambiare uno o più elementi esistenti specifici ' +
    '(scambiare un ingrediente, rifare un pasto, rifare un giorno, o una selezione arbitraria). ' +
    "Risolvi esattamente a quale posizione/i si riferisce usando l'elenco del piano sotto, e " +
    'imposta scope_kind + indici di conseguenza. Metti la richiesta reale dell\'utente in ' +
    "`instruction` (es. 'qualcosa con meno grassi').\n" +
    '- regenerate_full: l\'utente vuole cambiare la STRUTTURA generale del piano stesso (es. ' +
    "'solo un pasto al giorno', 'aggiungi un sesto giorno', 'rendilo vegetariano in generale'), " +
    'non solo scambiare alimenti specifici. Metti la richiesta in `instruction`.\n' +
    '- get_alternatives: l\'utente chiede cosa potrebbe usare al posto di UN alimento, senza ' +
    'ancora impegnarsi a un cambio. Imposta target_food_key con la chiave esatta di quell\'alimento.\n' +
    '- clarify: la richiesta è ambigua (es. non capisci a quale elemento si riferisce) -- fai ' +
    'una breve domanda di chiarimento in `clarification_question`.\n\n' +
    `Piano attuale (gli indici giorno/pasto/item partono da 0):\n${planDescription}\n\n` +
    "Usa indici solo da questo elenco esatto -- non inventare mai una posizione che non c'è. " +
    'Lascia i campi non applicabili al loro valore sentinella (-1 per gli indici, stringa/lista ' +
    'vuota per gli altri).'
  )
}

export async function resolveIntent (client, planDict, message, locale) {
  const planDescription = describePlan(planDict, locale)
  const systemPrompt = buildIntentSystemPrompt(planDescription, locale)
  return client.parse(systemPrompt, planDescription, message, locale)
}

export function intentToEditScope (intent) {
  if (intent.scope_kind === 'plan') {
    return createEditScope({ kind: 'plan' })
  }
  if (intent.scope_kind === 'day') {
    return createEditScope({ kind: 'day', dayIndex: intent.day_index })
  }
  if (intent.scope_kind === 'meal') {
    return createEditScope({ kind: 'meal', dayIndex: intent.day_index, mealIndex: intent.meal_index })
  }
  if (intent.scope_kind === 'item') {
    return createEditScope({
      kind: 'item', dayIndex: intent.day_index, mealIndex: intent.meal_index, itemIndex: intent.item_index
    })
  }
  if (intent.scope_kind === 'selection') {
    const positions = intent.selection.map((p) => [...p])
    return createEditScope({ kind: 'selection', positions })
  }
  throw new ScopeConversionError(`unknown scope_kind from model: ${JSON.stringify(intent.scope_kind)}`)
}

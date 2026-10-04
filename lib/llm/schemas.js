// The LLM's meal-plan output schema.
//
// The decisive design choice is what's NOT here: no `calories`, no
// `protein_g`, no macro field of any kind, at any level. If the field
// doesn't exist, the model cannot hallucinate it, and there is nothing
// tempting to trust. Every total in the system is computed by
// lib/domain/nutrition.js from these food_key/grams pairs.
//
// Used with OpenAI's Structured Outputs via zodResponseFormat (see
// lib/llm/openai-client.js), which requires every field to be required
// and additionalProperties:false at every level -- `.strict()` below
// enforces the second half; zod has no bare-Optional fields here so the
// first half holds too (mirrors app/llm/schemas.py's StrictModel +
// non-Optional fields).
//
// Ported from app/llm/schemas.py. Parsed zod output is already a plain
// JS object -- there's no separate "to_plain_dict()" step needed the way
// pydantic's model_dump() was; JSON.stringify() on the parsed object is
// the equivalent of Python's model_dump_json().

import { z } from 'zod'

export const MealSlot = z.enum(['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner'])

export const PlanItemDraftSchema = z.object({
  food_key: z.string().describe('Must be one of the food_key values supplied in the catalogue'),
  grams: z.number().gt(0),
  note: z.string().describe('Short prep note, or empty string')
}).strict()

export const MealDraftSchema = z.object({
  slot: MealSlot,
  items: z.array(PlanItemDraftSchema)
}).strict()

export const DayDraftSchema = z.object({
  meals: z.array(MealDraftSchema)
}).strict()

export const MealPlanDraftSchema = z.object({
  days: z.array(DayDraftSchema)
}).strict()

/**
 * Response shape for a scoped edit (lib/llm/planner.js regenerateScope):
 * the model fills in ONLY the open slots it was asked about, as a flat
 * ordered list matching the open positions 1:1 -- no day/meal nesting,
 * since the caller already knows which slots are open and just needs the
 * replacement items in that same order.
 */
export const PartialPlanDraftSchema = z.object({
  items: z.array(PlanItemDraftSchema)
}).strict()

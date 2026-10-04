// The real OpenAI-backed implementation of the LLMPlanClient contract
// lib/llm/planner.js expects (createPlan/repairPlan/generatePartial/
// repairPartial -- a plain duck-typed object, no formal interface
// needed in JS the way Python used typing.Protocol).
//
// Uses Structured Outputs (zodResponseFormat + chat.completions.parse)
// generated from the zod schema itself -- not "please reply with JSON".
// temperature is low (0.2) because this is a structured-choice task, not
// open-ended prose.
//
// Ported from app/llm/openai_client.py.

import { zodResponseFormat } from 'openai/helpers/zod'
import { MealPlanDraftSchema, PartialPlanDraftSchema } from './schemas.js'

// Fallback only: every real call site (app/api routes) passes an
// explicit model from settings so OPENAI_CHAT_MODEL actually controls
// it. The Python port of this file documents a real past bug where an
// env var model override had zero effect because nothing read it here --
// don't reintroduce that class of bug.
const DEFAULT_MODEL = 'gpt-4o-mini'
const TEMPERATURE = 0.2

export class OpenAIPlanClient {
  constructor (client, model = DEFAULT_MODEL) {
    this._client = client
    this._model = model
  }

  async _complete (messages, schema, schemaName) {
    const completion = await this._client.chat.completions.parse({
      model: this._model,
      messages,
      temperature: TEMPERATURE,
      response_format: zodResponseFormat(schema, schemaName)
    })
    const parsed = completion.choices[0].message.parsed
    if (!parsed) {
      throw new Error('empty completion from model')
    }
    return parsed
  }

  async createPlan (systemPrompt, catalogue, _locale) {
    const catalogueJson = JSON.stringify(catalogue)
    return this._complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Catalogo alimenti disponibili:\n${catalogueJson}` }
      ],
      MealPlanDraftSchema,
      'meal_plan_draft'
    )
  }

  async repairPlan (systemPrompt, catalogue, previousDraft, repairNote, _locale) {
    const catalogueJson = JSON.stringify(catalogue)
    return this._complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Catalogo alimenti disponibili:\n${catalogueJson}` },
        { role: 'assistant', content: JSON.stringify(previousDraft) },
        { role: 'user', content: repairNote }
      ],
      MealPlanDraftSchema,
      'meal_plan_draft'
    )
  }

  async generatePartial (systemPrompt, catalogue, context, _locale) {
    const catalogueJson = JSON.stringify(catalogue)
    return this._complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Catalogo alimenti disponibili:\n${catalogueJson}` },
        { role: 'user', content: context }
      ],
      PartialPlanDraftSchema,
      'partial_plan_draft'
    )
  }

  async repairPartial (systemPrompt, catalogue, context, previousPartial, repairNote, _locale) {
    const catalogueJson = JSON.stringify(catalogue)
    return this._complete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Catalogo alimenti disponibili:\n${catalogueJson}` },
        { role: 'user', content: context },
        { role: 'assistant', content: JSON.stringify(previousPartial) },
        { role: 'user', content: repairNote }
      ],
      PartialPlanDraftSchema,
      'partial_plan_draft'
    )
  }
}

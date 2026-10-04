// Real OpenAI-backed implementation of the IntentClient contract
// lib/llm/intent.js expects (a single `parse` method).
//
// Same Structured Outputs approach as lib/llm/openai-client.js: strict
// schema, low temperature (this is a classification task, not creative
// writing).
//
// Ported from app/llm/openai_intent_client.py.

import { zodResponseFormat } from 'openai/helpers/zod'
import { ChatIntentSchema } from './intent.js'

// Fallback only -- see lib/llm/openai-client.js's comment on the same
// pattern; real call sites always pass an explicit model.
const DEFAULT_MODEL = 'gpt-4o-mini'
const TEMPERATURE = 0.0

export class OpenAIIntentClient {
  constructor (client, model = DEFAULT_MODEL) {
    this._client = client
    this._model = model
  }

  async parse (systemPrompt, _planDescription, message, _locale) {
    const completion = await this._client.chat.completions.parse({
      model: this._model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: TEMPERATURE,
      response_format: zodResponseFormat(ChatIntentSchema, 'chat_intent')
    })
    const parsed = completion.choices[0].message.parsed
    if (!parsed) {
      throw new Error('empty completion from model')
    }
    return parsed
  }
}

// Lazily-constructed OpenAI client.
//
// Built on first use, not at module-import time, so a missing env var
// doesn't take the whole route down with an unhandled throw during cold
// start -- callers check lib/config.js's missingRequiredForPlan() first
// and return a clean 503 instead.
//
// Ported from app/clients.py (OpenAI client only -- no Postgres client
// in this phase, see lib/config.js's module comment).

import OpenAI from 'openai'
import { getSettings } from './config.js'

let cachedClient = null

export function getOpenAIClient () {
  if (cachedClient) return cachedClient
  const settings = getSettings()
  if (!settings.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  cachedClient = new OpenAI({ apiKey: settings.openaiApiKey })
  return cachedClient
}

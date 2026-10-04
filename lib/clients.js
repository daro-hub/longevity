// Lazily-constructed OpenAI / Postgres (Supabase) clients.
//
// Built on first use, not at module-import time, so a missing env var
// doesn't take the whole route down with an unhandled throw during cold
// start -- callers check lib/config.js's missingRequiredFor*() first and
// return a clean 503 instead.
//
// Ported from app/clients.py.

import { Client } from 'pg'
import OpenAI from 'openai'
import { getSettings } from './config.js'

let cachedOpenAIClient = null
let cachedPgClient = null

export function getOpenAIClient () {
  if (cachedOpenAIClient) return cachedOpenAIClient
  const settings = getSettings()
  if (!settings.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  cachedOpenAIClient = new OpenAI({ apiKey: settings.openaiApiKey })
  return cachedOpenAIClient
}

/**
 * A single long-lived pg Client, cached like the Pinecone index handle
 * (and the Python port's psycopg connection) used to be -- fine at this
 * project's scale (one operator, low request volume); a real connection
 * pool would be the next step if that stopped being true.
 */
export async function getPgClient () {
  if (cachedPgClient) return cachedPgClient
  const settings = getSettings()
  if (!settings.supabaseDbUrl) {
    throw new Error('SUPABASE_DB_URL is not configured')
  }
  const client = new Client({
    connectionString: settings.supabaseDbUrl,
    ssl: { rejectUnauthorized: false }
  })
  await client.connect()
  cachedPgClient = client
  return cachedPgClient
}

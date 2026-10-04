// Centralized settings, read from process.env (Next.js loads .env.local
// automatically -- no separate dotenv step needed the way the Python
// backend needed python-dotenv).
//
// Ported from app/config.py.

export function getSettings () {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY || null,
    openaiChatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
    openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    openaiEmbeddingDimensions: Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1024),
    supabaseDbUrl: process.env.SUPABASE_DB_URL || null,
    ragNamespace: process.env.RAG_NAMESPACE || ''
  }
}

/**
 * /api/plan (+ alternatives/edit/chat) need OpenAI only -- the README
 * for the Python backend was explicit that the vector store isn't used
 * by this route. Mirrors app/config.py's missing_required_for_plan(),
 * added there after a real bug where this route was gated on a stricter
 * check that also demanded vector-store credentials it never used.
 */
export function missingRequiredForPlan (settings = getSettings()) {
  const missing = []
  if (!settings.openaiApiKey) missing.push('OPENAI_API_KEY')
  return missing
}

/**
 * /api/ask needs both OpenAI (embeddings + chat) and the vector store.
 * Mirrors app/config.py's missing_required_for_ask().
 */
export function missingRequiredForAsk (settings = getSettings()) {
  const missing = []
  if (!settings.openaiApiKey) missing.push('OPENAI_API_KEY')
  if (!settings.supabaseDbUrl) missing.push('SUPABASE_DB_URL')
  return missing
}

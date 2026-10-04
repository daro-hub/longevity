// Centralized settings, read from process.env (Next.js loads .env.local
// automatically -- no separate dotenv step needed the way the Python
// backend needed python-dotenv).
//
// Ported from app/config.py (the subset this phase needs: OpenAI only --
// RAG/Supabase settings stay out of scope here, same as everywhere else
// in this port).

export function getSettings () {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY || null,
    openaiChatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'
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

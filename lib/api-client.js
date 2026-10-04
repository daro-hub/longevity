// Shared frontend fetch helper. /v1/targets and /v1/plan* now have local
// implementations (app/api/*) and are called via relative paths; /v1/ask
// stays on the external Python/Render backend until it's ported too
// (blocked on a real Supabase connection, same blocker either way).

const EXTERNAL_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://longevity-backend-07su.onrender.com'

// /v1/ask, non il legacy /ask: ha una soglia di rilevanza (sotto soglia,
// risposta "non lo so" deterministica senza nemmeno chiamare il modello)
// e citazioni numerate strutturate invece di una risposta non verificabile.
export const ASK_ENDPOINT = `${EXTERNAL_API_BASE_URL}/v1/ask`

export async function postJson (url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`Errore: ${response.status}`)
  return response.json()
}

export const fetchTargets = (profile) => postJson('/api/targets', profile)
export const fetchPlan = (profile) => postJson('/api/plan', profile)
export const fetchPlanAlternatives = (body) => postJson('/api/plan/alternatives', body)
export const fetchPlanEdit = (body) => postJson('/api/plan/edit', body)
export const fetchPlanChat = (body) => postJson('/api/plan/chat', body)

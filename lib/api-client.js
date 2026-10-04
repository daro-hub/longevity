// Shared frontend fetch helper. All backend calls (targets, plan*, ask)
// are now local implementations under app/api/ -- nothing points at the
// Render-hosted Python backend anymore.

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
export const fetchAsk = (body) => postJson('/api/ask', body)

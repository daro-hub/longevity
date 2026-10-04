// Query-side retrieval: fetch topK candidates, keep only the ones above
// a similarity threshold. topK=3 with no threshold (the old /ask
// behavior) always returns the 3 nearest vectors, relevant or not --
// this is what makes "I don't know" reachable at all.
//
// RETRIEVAL_MIN_SCORE in lib/domain/references.js is a placeholder until
// a real tune-threshold script has run against this corpus with a real
// labeled eval set. Treat the current value as provisional; the
// mechanism below is what matters and is fully tested with synthetic
// scores.
//
// Ported from app/rag/retrieve.py.

import * as ref from '../domain/references.js'
import { querySimilarChunks } from './pg_store.js'

export function createRetrievedChunk (text, metadata, score) {
  return Object.freeze({ text, metadata, score })
}

/**
 * matches: objects with .score and .metadata (kept duck-typed so tests
 * don't need a real database connection -- lib/rag/pg_store.js produces
 * this same shape from Postgres rows).
 *
 * Assumes matches arrive sorted by score descending (the "order by
 * embedding <=> ..." contract in lib/rag/pg_store.js's
 * querySimilarChunks); does not re-sort.
 */
export function filterByThreshold (
  matches, minScore = ref.RETRIEVAL_MIN_SCORE, keepAboveThreshold = ref.RETRIEVAL_KEEP_ABOVE_THRESHOLD
) {
  const kept = []
  for (const match of matches) {
    if (match.score < minScore) break // sorted descending -- nothing after this clears the bar either
    const metadata = match.metadata || {}
    const text = metadata.text
    if (!text) continue
    kept.push(createRetrievedChunk(text, metadata, match.score))
    if (kept.length >= keepAboveThreshold) break
  }
  return kept
}

export async function queryVectorForText (openaiClient, text, model, dimensions) {
  const response = await openaiClient.embeddings.create({ model, input: text, dimensions })
  return response.data[0].embedding
}

export async function retrieve (
  client, queryVector, namespace = '', topK = ref.RETRIEVAL_TOP_K,
  minScore = ref.RETRIEVAL_MIN_SCORE, keepAboveThreshold = ref.RETRIEVAL_KEEP_ABOVE_THRESHOLD
) {
  const matches = await querySimilarChunks(client, queryVector, namespace, topK)
  return filterByThreshold(matches, minScore, keepAboveThreshold)
}

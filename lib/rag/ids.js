// Content-addressed vector IDs. An id derived from (docId, chunkIndex,
// content hash) makes re-running ingestion on unchanged text idempotent
// (same id, same upsert, no-op) and makes edited text produce a new id
// rather than silently overwriting the old one's slot.
//
// Ported from app/rag/ids.py.

import { createHash } from 'node:crypto'

export function contentHash (text) {
  return createHash('sha256').update(text, 'utf-8').digest('hex')
}

export function chunkId (docId, chunkIndex, text) {
  const paddedIndex = String(chunkIndex).padStart(5, '0')
  return `${docId}:${paddedIndex}:${contentHash(text).slice(0, 12)}`
}

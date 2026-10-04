// Text splitting with character offsets preserved, so each chunk can be
// resolved back to a page via lib/rag/paging.js.
//
// NOT a port of app/rag/chunking.py's exact algorithm (LangChain's
// RecursiveCharacterTextSplitter). That file's docstring itself explains
// why byte-identical chunking doesn't matter here: this is a fresh
// ingest into an empty table (the old Pinecone corpus was already stale
// and is being discarded, not migrated), so there is no existing chunk
// boundary or id anything needs to line up with. This implementation is
// a simpler sliding window that still breaks on natural boundaries
// (paragraph > sentence > word) when one is available near the target
// size, and still tracks exact start offsets the same way.

export const CHUNK_SIZE = 1000
export const CHUNK_OVERLAP = 200

// Checked in this order, within a lookback window, to prefer a natural
// break over a hard cut mid-word.
const BREAK_SEPARATORS = ['\n\n', '\n', '. ', ' ']

export function createChunkSpan (text, startOffset, chunkIndex) {
  return Object.freeze({ text, startOffset, chunkIndex })
}

/**
 * Searches backward from `idealEnd` (within [searchFrom, idealEnd]) for
 * the last occurrence of one of BREAK_SEPARATORS, trying each separator
 * in order of preference across the whole window before falling back to
 * the next. Returns idealEnd itself (a hard cut) if none is found.
 */
function findBreakPoint (text, searchFrom, idealEnd) {
  for (const sep of BREAK_SEPARATORS) {
    const window = text.slice(searchFrom, idealEnd)
    const lastIndex = window.lastIndexOf(sep)
    if (lastIndex !== -1) {
      return searchFrom + lastIndex + sep.length
    }
  }
  return idealEnd
}

export function chunkText (text, chunkSize = CHUNK_SIZE, chunkOverlap = CHUNK_OVERLAP) {
  if (text.length === 0) return []

  const spans = []
  let start = 0
  let chunkIndex = 0

  while (start < text.length) {
    const idealEnd = Math.min(start + chunkSize, text.length)
    const end = idealEnd < text.length
      ? Math.max(findBreakPoint(text, start, idealEnd), start + 1) // always make forward progress
      : idealEnd

    spans.push(createChunkSpan(text.slice(start, end), start, chunkIndex))
    chunkIndex += 1

    if (end >= text.length) break

    const next = end - chunkOverlap
    start = next > start ? next : end // guard against a zero/negative advance
  }

  return spans
}

// Turns retrieved chunks into numbered context blocks for the prompt,
// and back into a structured citations array for the API response.
//
// The non-hallucinatable trick: the model is given numbered context
// blocks and instructed to emit ONLY [n] markers pointing at them --
// never free-form citation text (page numbers it writes itself would be
// invented). stripInvalidMarkers is the server-side backstop: any [n]
// the model emits where n is out of range gets removed rather than
// trusted.
//
// Ported from app/rag/citations.py.

export function buildContextBlocks (chunks) {
  return chunks.map((chunk, i) => `[${i + 1}] ${chunk.text}`).join('\n\n')
}

export function buildCitations (chunks) {
  return chunks.map((chunk, i) => {
    const m = chunk.metadata
    const page = m.page_start === m.page_end ? String(m.page_start) : `${m.page_start}-${m.page_end}`
    return {
      n: i + 1,
      doc_id: m.doc_id,
      title: m.source_title,
      page,
      score: Math.round(chunk.score * 1000) / 1000,
      snippet: chunk.text.slice(0, 200),
      url: m.url
    }
  })
}

const MARKER_RE = /\[(\d+)\]/g

/**
 * Removes any [n] marker where n is not a valid citation index
 * (1..numCitations). The model occasionally emits markers beyond what
 * it was given, or references from a prior turn -- those never get
 * surfaced as if they were real.
 */
export function stripInvalidMarkers (answer, numCitations) {
  return answer.replace(MARKER_RE, (match, nStr) => {
    const n = parseInt(nStr, 10)
    return (n >= 1 && n <= numCitations) ? match : ''
  })
}

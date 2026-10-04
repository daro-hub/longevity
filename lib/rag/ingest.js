// Prepares chunks for indexing: manifest-checked, page-accurate,
// content-addressed. Kept separate from the actual network calls
// (embeddings, Postgres upsert) so the assembly logic is testable
// without either.
//
// Ported from app/rag/ingest.py.

import { chunkText } from './chunking.js'
import { chunkId, contentHash } from './ids.js'
import { requireListed } from './manifest.js'
import { concatenatedText, createPageMap } from './paging.js'

export const INGEST_VERSION = 2

export function createPreparedChunk (id, text, metadata) {
  return Object.freeze({ id, text, metadata })
}

/**
 * Pure assembly logic: given a document already split into pages,
 * concatenates them (preserving the offset->page mapping), chunks the
 * result, and resolves each chunk's page span. No I/O.
 */
export function prepareChunksFromPages (pages, docId, sourceFile, sourceTitle, lang, indexedAt = null) {
  if (pages.length === 0) return []

  const pageMap = createPageMap(pages)
  const fullText = concatenatedText(pages)
  const spans = chunkText(fullText)
  const timestamp = indexedAt || new Date().toISOString()

  return spans.map((span) => {
    const [pageStart, pageEnd] = pageMap.pageRangeForSpan(span.startOffset, span.startOffset + span.text.length)
    const id = chunkId(docId, span.chunkIndex, span.text)
    return createPreparedChunk(id, span.text, {
      text: span.text,
      doc_id: docId,
      source_file: sourceFile,
      source_title: sourceTitle,
      page_start: pageStart,
      page_end: pageEnd,
      chunk_index: span.chunkIndex,
      char_start: span.startOffset,
      lang,
      content_hash: contentHash(span.text),
      ingest_version: INGEST_VERSION,
      indexed_at: timestamp
    })
  })
}

/**
 * Thin wrapper around unpdf -- not unit-tested against a real PDF (the
 * corpus files are gitignored, not committed, so CI can't rely on one
 * being present). prepareChunksFromPages above is where the actual
 * logic lives and is tested with synthetic pages.
 */
export async function loadPdfPages (filePath) {
  const { readFile } = await import('node:fs/promises')
  const { extractText, getDocumentProxy } = await import('unpdf')
  const buffer = await readFile(filePath)
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: false })
  return text
}

export async function prepareDocument (filePath, fileName, manifest) {
  const meta = requireListed(fileName, manifest)
  const pages = await loadPdfPages(filePath)
  return prepareChunksFromPages(pages, meta.docId, fileName, meta.title, meta.lang)
}

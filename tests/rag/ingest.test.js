import { expect, it } from 'vitest'
import { contentHash } from '../../lib/rag/ids.js'
import { prepareChunksFromPages } from '../../lib/rag/ingest.js'

// Ported from tests/rag/test_ingest.py.

function makePages () {
  return [
    'Page one. '.repeat(20), // ~200 chars
    'Page two. '.repeat(150), // ~1500 chars, spans multiple chunks
    'Page three, the final page.'
  ]
}

it('produces at least one chunk per document', () => {
  const chunks = prepareChunksFromPages(makePages(), 'doc1', 'file.pdf', 'Title', 'it')
  expect(chunks.length).toBeGreaterThan(0)
})

it('every chunk has full metadata', () => {
  const chunks = prepareChunksFromPages(makePages(), 'doc1', 'file.pdf', 'Title', 'it')
  for (const c of chunks) {
    expect(c.metadata.doc_id).toBe('doc1')
    expect(c.metadata.source_file).toBe('file.pdf')
    expect(c.metadata.source_title).toBe('Title')
    expect(c.metadata.lang).toBe('it')
    expect(c.metadata.ingest_version).toBe(2)
    expect(c.metadata.indexed_at).toBeTruthy()
    expect(c.metadata.content_hash).toBeTruthy()
    expect(c.metadata.page_start).toBeGreaterThanOrEqual(1)
    expect(c.metadata.page_end).toBeGreaterThanOrEqual(c.metadata.page_start)
  }
})

it('the first chunk is on page one', () => {
  const chunks = prepareChunksFromPages(makePages(), 'doc1', 'file.pdf', 'Title', 'it')
  expect(chunks[0].metadata.page_start).toBe(1)
})

it('the last chunk reaches page three', () => {
  const chunks = prepareChunksFromPages(makePages(), 'doc1', 'file.pdf', 'Title', 'it')
  expect(chunks[chunks.length - 1].metadata.page_end).toBe(3)
})

it('chunk ids are stable across runs', () => {
  const chunksA = prepareChunksFromPages(makePages(), 'doc1', 'file.pdf', 'Title', 'it')
  const chunksB = prepareChunksFromPages(makePages(), 'doc1', 'file.pdf', 'Title', 'it')
  expect(chunksA.map((c) => c.id)).toEqual(chunksB.map((c) => c.id))
})

it('chunk ids change when the text changes', () => {
  const pagesA = makePages()
  const pagesB = makePages()
  pagesB[0] = 'Completely different first page content here.'
  const chunksA = prepareChunksFromPages(pagesA, 'doc1', 'file.pdf', 'Title', 'it')
  const chunksB = prepareChunksFromPages(pagesB, 'doc1', 'file.pdf', 'Title', 'it')
  expect(chunksA[0].id).not.toBe(chunksB[0].id)
})

it('chunk ids differ by doc id', () => {
  const pages = makePages()
  const chunksA = prepareChunksFromPages(pages, 'doc1', 'file.pdf', 'Title', 'it')
  const chunksB = prepareChunksFromPages(pages, 'doc2', 'file.pdf', 'Title', 'it')
  expect(chunksA[0].id).not.toBe(chunksB[0].id)
})

it('chunk index is sequential', () => {
  const chunks = prepareChunksFromPages(makePages(), 'doc1', 'file.pdf', 'Title', 'it')
  expect(chunks.map((c) => c.metadata.chunk_index)).toEqual(chunks.map((_, i) => i))
})

it('empty pages produces no chunks', () => {
  expect(prepareChunksFromPages([], 'doc1', 'file.pdf', 'Title', 'it')).toEqual([])
})

it('content hash matches the chunk text', () => {
  const chunks = prepareChunksFromPages(makePages(), 'doc1', 'file.pdf', 'Title', 'it')
  for (const c of chunks) {
    expect(c.metadata.content_hash).toBe(contentHash(c.text))
  }
})

it('an explicit indexedAt is used verbatim', () => {
  const chunks = prepareChunksFromPages(
    makePages(), 'doc1', 'file.pdf', 'Title', 'it', '2020-01-01T00:00:00+00:00'
  )
  expect(chunks.every((c) => c.metadata.indexed_at === '2020-01-01T00:00:00+00:00')).toBe(true)
})

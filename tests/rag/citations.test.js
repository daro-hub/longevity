import { expect, it } from 'vitest'
import { buildCitations, buildContextBlocks, stripInvalidMarkers } from '../../lib/rag/citations.js'
import { createRetrievedChunk } from '../../lib/rag/retrieve.js'

// Ported from tests/rag/test_citations.py.

function makeChunk (text, {
  docId = 'crea-2018', title = 'Linee Guida', pageStart = 12, pageEnd = 12, score = 0.7
} = {}) {
  return createRetrievedChunk(text, {
    doc_id: docId, source_title: title, page_start: pageStart, page_end: pageEnd, url: 'https://example.org'
  }, score)
}

it('build context blocks numbers from one', () => {
  const chunks = [makeChunk('first'), makeChunk('second')]
  const blocks = buildContextBlocks(chunks)
  expect(blocks).toContain('[1] first')
  expect(blocks).toContain('[2] second')
})

it('build context blocks on an empty list', () => {
  expect(buildContextBlocks([])).toBe('')
})

it('build citations basic fields', () => {
  const chunks = [makeChunk('text', { docId: 'crea-2018', pageStart: 42, pageEnd: 42, score: 0.512345 })]
  const citations = buildCitations(chunks)
  expect(citations[0].n).toBe(1)
  expect(citations[0].doc_id).toBe('crea-2018')
  expect(citations[0].page).toBe('42')
  expect(citations[0].score).toBe(0.512)
})

it('build citations page range when spanning pages', () => {
  const chunks = [makeChunk('text', { pageStart: 42, pageEnd: 43 })]
  const citations = buildCitations(chunks)
  expect(citations[0].page).toBe('42-43')
})

it('build citations truncates the snippet', () => {
  const longText = 'x'.repeat(500)
  const chunks = [makeChunk(longText)]
  const citations = buildCitations(chunks)
  expect(citations[0].snippet.length).toBe(200)
})

it('strip invalid markers keeps valid ones', () => {
  const answer = 'Il fabbisogno proteico è descritto in [1] e [2].'
  expect(stripInvalidMarkers(answer, 2)).toBe(answer)
})

it('strip invalid markers removes out-of-range ones', () => {
  const answer = 'Vedi [1] e [5] per dettagli.'
  const result = stripInvalidMarkers(answer, 1)
  expect(result).toContain('[1]')
  expect(result).not.toContain('[5]')
})

it('strip invalid markers removes everything when there are zero citations', () => {
  const answer = 'Nessuna fonte ma cito [1] comunque.'
  expect(stripInvalidMarkers(answer, 0)).not.toContain('[1]')
})

it('strip invalid markers leaves text with no markers unchanged', () => {
  const answer = 'Risposta senza citazioni.'
  expect(stripInvalidMarkers(answer, 3)).toBe(answer)
})

it('strip invalid markers treats marker zero as invalid', () => {
  const answer = 'Riferimento [0] non valido.'
  expect(stripInvalidMarkers(answer, 3)).not.toContain('[0]')
})

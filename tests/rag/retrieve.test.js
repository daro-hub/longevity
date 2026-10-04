import { expect, it, vi } from 'vitest'
import * as pgStoreModule from '../../lib/rag/pg_store.js'
import { filterByThreshold, retrieve } from '../../lib/rag/retrieve.js'

// Ported from tests/rag/test_retrieve.py.

function match (score, { text = 'some text', ...extra } = {}) {
  return { score, metadata: { text, ...extra } }
}

it('keeps matches above the threshold', () => {
  const matches = [match(0.8), match(0.6), match(0.5)]
  const kept = filterByThreshold(matches, 0.4, 4)
  expect(kept.length).toBe(3)
})

it('stops at the first below-threshold match since the list is sorted descending', () => {
  const matches = [match(0.8), match(0.3), match(0.9)] // deliberately out of order after index 1
  const kept = filterByThreshold(matches, 0.4, 4)
  // Only the first match clears the bar; the function trusts the sorted
  // contract and stops at the first failure rather than scanning on.
  expect(kept.length).toBe(1)
})

it('returns an empty list when nothing is above the threshold', () => {
  const matches = [match(0.2), match(0.1)]
  expect(filterByThreshold(matches, 0.4)).toEqual([])
})

it('respects the keepAboveThreshold cap', () => {
  const matches = [match(0.9), match(0.8), match(0.7), match(0.6), match(0.5)]
  const kept = filterByThreshold(matches, 0.1, 2)
  expect(kept.length).toBe(2)
  expect(kept[0].score).toBe(0.9)
  expect(kept[1].score).toBe(0.8)
})

it('skips matches with no text metadata', () => {
  const matches = [match(0.9, { text: null }), match(0.8)]
  const kept = filterByThreshold(matches, 0.1)
  expect(kept.length).toBe(1)
  expect(kept[0].score).toBe(0.8)
})

it('handles an empty matches list', () => {
  expect(filterByThreshold([])).toEqual([])
})

it('preserves metadata on kept chunks', () => {
  const matches = [match(0.9, { doc_id: 'crea-2018', page_start: 12 })]
  const kept = filterByThreshold(matches, 0.1)
  expect(kept[0].metadata.doc_id).toBe('crea-2018')
  expect(kept[0].metadata.page_start).toBe(12)
})

it('retrieve calls querySimilarChunks and filters the result', async () => {
  vi.spyOn(pgStoreModule, 'querySimilarChunks').mockResolvedValue([match(0.9), match(0.2)])
  const fakeClient = {}
  const kept = await retrieve(fakeClient, [0.1, 0.2, 0.3], '', 8, 0.5)
  expect(kept.length).toBe(1)
  expect(kept[0].score).toBe(0.9)
})

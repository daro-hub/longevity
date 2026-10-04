import { expect, it } from 'vitest'
import { concatenatedText, createPageMap } from '../../lib/rag/paging.js'

// Ported from tests/rag/test_paging.py.

const PAGES = [
  'Page one text.',
  'Page two is a bit longer than page one.',
  'Page three.'
]
const SEPARATOR = '\n\n'

function makeMap () {
  return createPageMap(PAGES, SEPARATOR)
}

it('offset at the start of page one', () => {
  expect(makeMap().pageForOffset(0)).toBe(1)
})

it('offset within page one', () => {
  const pm = makeMap()
  const concatenated = PAGES.join(SEPARATOR)
  const offset = concatenated.indexOf('one text')
  expect(pm.pageForOffset(offset)).toBe(1)
})

it('offset within page two', () => {
  const pm = makeMap()
  const concatenated = PAGES.join(SEPARATOR)
  const offset = concatenated.indexOf('bit longer')
  expect(pm.pageForOffset(offset)).toBe(2)
})

it('offset within page three', () => {
  const pm = makeMap()
  const concatenated = PAGES.join(SEPARATOR)
  const offset = concatenated.indexOf('Page three')
  expect(pm.pageForOffset(offset)).toBe(3)
})

it('offset at the last character', () => {
  const pm = makeMap()
  const concatenated = PAGES.join(SEPARATOR)
  expect(pm.pageForOffset(concatenated.length - 1)).toBe(3)
})

it('offset past the end clamps to the last page', () => {
  const pm = makeMap()
  const concatenated = PAGES.join(SEPARATOR)
  expect(pm.pageForOffset(concatenated.length + 100)).toBe(3)
})

it('a negative offset throws', () => {
  expect(() => makeMap().pageForOffset(-1)).toThrow()
})

it('a span crossing a page boundary', () => {
  const pm = makeMap()
  const concatenated = PAGES.join(SEPARATOR)
  const start = concatenated.indexOf('text.')
  const end = concatenated.indexOf('bit longer') + 'bit longer'.length
  const [pageStart, pageEnd] = pm.pageRangeForSpan(start, end)
  expect(pageStart).toBe(1)
  expect(pageEnd).toBe(2)
})

it('a span within a single page', () => {
  const pm = makeMap()
  const concatenated = PAGES.join(SEPARATOR)
  const start = concatenated.indexOf('bit longer')
  const end = start + 'bit longer'.length
  const [pageStart, pageEnd] = pm.pageRangeForSpan(start, end)
  expect(pageStart).toBe(2)
  expect(pageEnd).toBe(2)
})

it('concatenatedText matches a manual join', () => {
  expect(concatenatedText(PAGES, SEPARATOR)).toBe(PAGES.join(SEPARATOR))
})

it('a single-page document', () => {
  const pm = createPageMap(['Only one page here.'])
  expect(pm.pageForOffset(0)).toBe(1)
  expect(pm.pageForOffset(5)).toBe(1)
})

it('a custom separator', () => {
  const pm = createPageMap(PAGES, '---')
  const concatenated = PAGES.join('---')
  const offset = concatenated.indexOf('Page three')
  expect(pm.pageForOffset(offset)).toBe(3)
})

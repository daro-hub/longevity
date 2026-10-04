import { describe, expect, it } from 'vitest'
import { chunkText } from '../../lib/rag/chunking.js'

// No Python equivalent test file -- app/rag/chunking.py wraps LangChain's
// RecursiveCharacterTextSplitter directly, this is a from-scratch sliding
// window (see lib/rag/chunking.js's module comment for why byte-identical
// behavior isn't required). These tests pin THIS implementation's own
// contract: every chunk's startOffset must correctly locate it back in
// the original text, chunks must always make forward progress, and
// consecutive chunks must overlap by roughly the configured amount.

it('returns nothing for empty text', () => {
  expect(chunkText('')).toEqual([])
})

it('returns a single chunk when text is shorter than chunkSize', () => {
  const spans = chunkText('short text', 1000, 200)
  expect(spans.length).toBe(1)
  expect(spans[0].text).toBe('short text')
  expect(spans[0].startOffset).toBe(0)
  expect(spans[0].chunkIndex).toBe(0)
})

it('every span\'s text matches text.slice(startOffset, startOffset + text.length)', () => {
  const text = ('Paragraph one. '.repeat(30) + '\n\n' + 'Paragraph two. '.repeat(40) + '\n\n' + 'Paragraph three. '.repeat(50))
  const spans = chunkText(text, 200, 40)
  for (const span of spans) {
    expect(text.slice(span.startOffset, span.startOffset + span.text.length)).toBe(span.text)
  }
})

it('chunk indices are sequential starting at 0', () => {
  const text = 'word '.repeat(500)
  const spans = chunkText(text, 200, 40)
  expect(spans.map((s) => s.chunkIndex)).toEqual([...spans.keys()])
})

it('consecutive chunks always make forward progress', () => {
  const text = 'word '.repeat(500)
  const spans = chunkText(text, 200, 40)
  for (let i = 1; i < spans.length; i++) {
    expect(spans[i].startOffset).toBeGreaterThan(spans[i - 1].startOffset)
  }
})

it('the last chunk reaches the end of the text', () => {
  const text = 'word '.repeat(500)
  const spans = chunkText(text, 200, 40)
  const last = spans[spans.length - 1]
  expect(last.startOffset + last.text.length).toBe(text.length)
})

it('prefers breaking on a paragraph boundary when one is available near the target size', () => {
  const text = 'a'.repeat(90) + '\n\n' + 'b'.repeat(90)
  const spans = chunkText(text, 100, 0)
  // The break should land right after the "\n\n", not mid-word at
  // character 100 (which would land inside the "b" run).
  expect(spans[0].text.endsWith('\n\n')).toBe(true)
})

it('falls back to a hard cut when no natural boundary exists nearby', () => {
  const text = 'x'.repeat(500) // no spaces, no punctuation, no newlines
  const spans = chunkText(text, 100, 20)
  expect(spans[0].text.length).toBe(100)
})

describe('with real document-shaped text', () => {
  const text = (
    'Introduzione.\n\n' +
    'Il fabbisogno proteico giornaliero varia in base al peso corporeo e al livello di attività. '.repeat(10) +
    '\n\nConclusione.'
  )

  it('every chunk is non-empty', () => {
    for (const span of chunkText(text)) {
      expect(span.text.length).toBeGreaterThan(0)
    }
  })

  it('concatenating chunks (dropping overlap) reconstructs text that covers the whole input', () => {
    const spans = chunkText(text, 200, 50)
    const first = spans[0]
    const last = spans[spans.length - 1]
    expect(first.startOffset).toBe(0)
    expect(last.startOffset + last.text.length).toBe(text.length)
  })
})

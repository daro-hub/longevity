import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { loadManifest, ManifestError, requireListed } from '../../lib/rag/manifest.js'

// Ported from tests/rag/test_manifest.py.

function tmpFile (contents) {
  const dir = mkdtempSync(path.join(tmpdir(), 'manifest-test-'))
  const file = path.join(dir, 'manifest.json')
  if (contents !== null) writeFileSync(file, contents)
  return file
}

it('the real manifest loads', () => {
  const manifest = loadManifest()
  expect(manifest['crea-linee-guida-2018.pdf']).toBeTruthy()
  const entry = manifest['crea-linee-guida-2018.pdf']
  expect(entry.docId).toBe('crea-2018')
  expect(entry.lang).toBe('it')
  expect(entry.year).toBe(2018)
})

it('requireListed returns meta for a known file', () => {
  const manifest = loadManifest()
  const meta = requireListed('crea-linee-guida-2018.pdf', manifest)
  expect(meta.docId).toBe('crea-2018')
})

it('requireListed throws for an unknown file', () => {
  const manifest = loadManifest()
  expect(() => requireListed('some-random-file.pdf', manifest)).toThrow(/not listed/)
})

it('a missing manifest file throws', () => {
  expect(() => loadManifest(path.join(tmpdir(), 'does-not-exist.json'))).toThrow(ManifestError)
})

it('a manifest entry missing a required field throws', () => {
  const file = tmpFile(JSON.stringify({ 'some-file.pdf': { doc_id: 'x', title: 'y' } }))
  expect(() => loadManifest(file)).toThrow(/missing fields/)
})

it('a duplicate doc_id throws', () => {
  const file = tmpFile(JSON.stringify({
    'file-a.pdf': { doc_id: 'dup', title: 'A', publisher: 'P', year: 2020, lang: 'it' },
    'file-b.pdf': { doc_id: 'dup', title: 'B', publisher: 'P', year: 2021, lang: 'it' }
  }))
  expect(() => loadManifest(file)).toThrow(/duplicate doc_id/)
})

it('a manifest entry\'s url is optional', () => {
  const file = tmpFile(JSON.stringify({
    'file.pdf': { doc_id: 'x', title: 'y', publisher: 'p', year: 2020, lang: 'en' }
  }))
  const manifest = loadManifest(file)
  expect(manifest['file.pdf'].url).toBeNull()
})

it('an empty manifest file loads as an empty object', () => {
  const file = tmpFile('')
  expect(loadManifest(file)).toEqual({})
})

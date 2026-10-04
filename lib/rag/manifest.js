// Loads data/manifest.json and enforces the one rule that makes
// citations possible: ingestion refuses to index any source file not
// listed here. Filenames alone are terrible citations
// ("crea-linee-guida-2018.pdf, p. 42" means nothing to a reader) -- the
// manifest is what turns that into "Linee Guida per una Sana
// Alimentazione — Revisione 2018, CREA, p. 42".
//
// Ported from app/rag/manifest.py. JSON instead of YAML -- this file is
// simple, fully-controlled config (not user input), so a YAML parser
// dependency buys nothing here. Only used by the ingestion script
// (a one-off Node process, not a serverless route), so a plain fs read
// relative to this module is fine -- the "breaks on Vercel" trap that
// applies to lib/domain/food_db.js's data doesn't apply here.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const DEFAULT_MANIFEST_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'manifest.json'
)

const REQUIRED_FIELDS = ['doc_id', 'title', 'publisher', 'year', 'lang']

export class ManifestError extends Error {}

export function createDocMeta ({ filename, docId, title, publisher, year, lang, url = null }) {
  return Object.freeze({ filename, docId, title, publisher, year, lang, url })
}

export function loadManifest (manifestPath = DEFAULT_MANIFEST_PATH) {
  let raw
  try {
    raw = readFileSync(manifestPath, 'utf-8')
  } catch {
    throw new ManifestError(`manifest not found at ${manifestPath}`)
  }

  const parsed = raw.trim() === '' ? {} : JSON.parse(raw)

  const entries = {}
  const docIdsSeen = new Set()
  for (const [filename, fields] of Object.entries(parsed)) {
    const missing = REQUIRED_FIELDS.filter((f) => !(f in fields))
    if (missing.length > 0) {
      throw new ManifestError(`manifest entry '${filename}' missing fields: ${missing.join(', ')}`)
    }
    const docId = fields.doc_id
    if (docIdsSeen.has(docId)) {
      throw new ManifestError(`duplicate doc_id in manifest: ${docId}`)
    }
    docIdsSeen.add(docId)
    entries[filename] = createDocMeta({
      filename,
      docId,
      title: fields.title,
      publisher: fields.publisher,
      year: fields.year,
      lang: fields.lang,
      url: fields.url ?? null
    })
  }
  return entries
}

/**
 * Throws if filename isn't in the manifest -- this is the actual
 * enforcement point, called by the ingest pipeline for every file it's
 * about to index. --allow-unlisted on the CLI is the only sanctioned
 * bypass, and it's opt-in per the ingest script, not the default.
 */
export function requireListed (filename, manifest) {
  const meta = manifest[filename]
  if (!meta) {
    throw new ManifestError(
      `'${filename}' is not listed in the manifest — refusing to index an ` +
      'unlisted file (every indexed chunk must be citable). Add it to ' +
      'data/manifest.json, or pass --allow-unlisted to override.'
    )
  }
  return meta
}

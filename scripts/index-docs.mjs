#!/usr/bin/env node
// Ingests documents from data/corpus/ into Supabase/pgvector.
//
// Thin CLI wrapper around lib/rag/ingest.js -- all the actual logic
// (manifest enforcement, page-accurate chunking, content-addressed ids)
// lives there and is unit-tested. This script is the I/O shell: file
// discovery, embeddings, and the Postgres upsert (lib/rag/pg_store.js).
//
// Ported from longevity-backend's scripts/index_docs.py.
//
// Usage:
//   node scripts/index-docs.mjs --namespace v2
//   node scripts/index-docs.mjs --namespace v2 --yes-really --delete-existing

import { parseArgs } from 'node:util'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getOpenAIClient, getPgClient } from '../lib/clients.js'
import { getSettings } from '../lib/config.js'
import { loadManifest, ManifestError, requireListed } from '../lib/rag/manifest.js'
import { deleteNamespace, upsertChunks } from '../lib/rag/pg_store.js'
import { loadPdfPages, prepareChunksFromPages, prepareDocument } from '../lib/rag/ingest.js'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'corpus')
const EMBEDDING_BATCH_SIZE = 50

function discoverFiles (dataDir) {
  let entries
  try {
    entries = readdirSync(dataDir)
  } catch {
    throw new Error(
      `${dataDir} does not exist. Create it and add source documents listed in data/manifest.json.`
    )
  }
  return entries.filter((f) => f.endsWith('.pdf') || f.endsWith('.txt')).sort().map((f) => path.join(dataDir, f))
}

async function main () {
  const { values: args } = parseArgs({
    options: {
      namespace: { type: 'string' },
      'allow-unlisted': { type: 'boolean', default: false },
      'delete-existing': { type: 'boolean', default: false },
      'yes-really': { type: 'boolean', default: false }
    }
  })

  if (!args.namespace) {
    console.error('[ERRORE] --namespace è obbligatorio (nessun default: puntare al namespace sbagliato ' +
      'con --delete-existing --yes-really è distruttivo per quel namespace specifico).')
    return 1
  }
  if (args['delete-existing'] && !args['yes-really']) {
    console.error('[ERRORE] --delete-existing richiede anche --yes-really.')
    return 1
  }

  const settings = getSettings()
  if (!settings.openaiApiKey || !settings.supabaseDbUrl) {
    console.error('[ERRORE] OPENAI_API_KEY / SUPABASE_DB_URL mancanti.')
    return 1
  }

  const openaiClient = getOpenAIClient()
  let pgClient
  try {
    pgClient = await getPgClient()
  } catch (e) {
    console.error(`[ERRORE] Connessione a Postgres fallita: ${e.message}`)
    return 1
  }

  let manifest
  try {
    manifest = loadManifest()
  } catch (e) {
    if (e instanceof ManifestError) {
      console.error(`[ERRORE] ${e.message}`)
      return 1
    }
    throw e
  }

  let files
  try {
    files = discoverFiles(DATA_DIR)
  } catch (e) {
    console.error(`[ERRORE] ${e.message}`)
    return 1
  }

  if (files.length === 0) {
    console.log(`[!] Nessun file trovato in ${DATA_DIR}.`)
    return 0
  }

  if (args['delete-existing']) {
    console.log(`[>] Cancellazione di tutte le righe nel namespace '${args.namespace}'...`)
    const deleted = await deleteNamespace(pgClient, args.namespace)
    console.log(`    -> ${deleted} righe cancellate.`)
  }

  console.log(`[*] Trovati ${files.length} file. Namespace di destinazione: '${args.namespace}'\n`)

  let allChunks = []
  for (const filePath of files) {
    const fileName = path.basename(filePath)
    console.log(`   [*] Preparazione: ${fileName}`)
    let chunks
    try {
      if (args['allow-unlisted'] && !manifest[fileName]) {
        // Bypass the manifest check by faking minimal metadata --
        // only reachable with the explicit flag.
        const pages = await loadPdfPages(filePath)
        chunks = prepareChunksFromPages(pages, path.parse(fileName).name, fileName, fileName, 'it')
      } else {
        chunks = await prepareDocument(filePath, fileName, manifest)
      }
    } catch (e) {
      console.error(`   [ERRORE] ${fileName}: ${e.message}`)
      continue
    }
    console.log(`      -> ${chunks.length} chunk`)
    allChunks = allChunks.concat(chunks)
  }

  if (allChunks.length === 0) {
    console.log('\n[!] Nessun chunk generato.')
    return 1
  }

  console.log(`\n[*] Totale chunk: ${allChunks.length}. Creazione embedding e upsert...\n`)

  let totalUploaded = 0
  let totalFailedBatches = 0
  const totalBatches = Math.ceil(allChunks.length / EMBEDDING_BATCH_SIZE)
  for (let i = 0; i < allChunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + EMBEDDING_BATCH_SIZE)
    const batchNum = Math.floor(i / EMBEDDING_BATCH_SIZE) + 1
    try {
      const response = await openaiClient.embeddings.create({
        model: settings.openaiEmbeddingModel,
        input: batch.map((c) => c.text),
        dimensions: settings.openaiEmbeddingDimensions
      })
      const embeddings = response.data.map((e) => e.embedding)
      // A dimension mismatch against the table's vector(N) column
      // (declared in supabase/migrations/0001_rag_chunks.sql) raises a
      // clear Postgres error right here rather than needing a separate
      // preflight check against the schema.
      await upsertChunks(pgClient, batch, args.namespace, embeddings)
      totalUploaded += batch.length
      console.log(`   [OK] Batch ${batchNum}/${totalBatches}: ${batch.length} chunk`)
    } catch (e) {
      totalFailedBatches += 1
      console.error(`   [ERRORE] Batch ${batchNum}/${totalBatches}: ${e.message}`)
    }
  }

  console.log(`\n[*] Caricati ${totalUploaded}/${allChunks.length} chunk nel namespace '${args.namespace}'.`)

  if (totalFailedBatches > 0) {
    console.error(
      `[ERRORE] ${totalFailedBatches} batch falliti su ${totalBatches} — run parziale, NON completata con successo.`
    )
    return 1
  }

  console.log('[OK] Operazione completata.')
  return 0
}

main().then((code) => {
  process.exit(code)
}).catch((e) => {
  console.error(e)
  process.exit(1)
})

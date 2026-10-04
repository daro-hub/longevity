// Supabase/Postgres (pgvector) storage for RAG chunks. Schema lives in
// supabase/migrations/0001_rag_chunks.sql (same migration already
// applied for the Python backend -- one shared table, whichever backend
// ends up serving /v1/ask), this module only does DML (query/insert),
// no DDL at request time.
//
// querySimilarChunks returns the same duck-typed shape ({score, metadata})
// that lib/rag/retrieve.js's filterByThreshold already expects -- that
// function is pure and works against this shape regardless of which
// store produced it.
//
// Ported from app/rag/pg_store.py (itself the Pinecone replacement).

import { toSql } from 'pgvector'

export function createMatch (score, metadata) {
  return Object.freeze({ score, metadata })
}

/**
 * Nearest neighbors by cosine similarity, scoped to one namespace.
 *
 * Returns rows already sorted by similarity descending (cosine
 * *distance* ascending via <=>, pgvector's ANN operator) -- the same
 * "sorted descending, stop at first miss" contract
 * lib/rag/retrieve.js's filterByThreshold relies on.
 */
export async function querySimilarChunks (client, queryVector, namespace = '', topK = 8) {
  const result = await client.query(
    `select text, doc_id, source_file, source_title, lang, page_start, page_end, url,
            1 - (embedding <=> $1) as score
     from rag_chunks
     where namespace = $2
     order by embedding <=> $1
     limit $3`,
    [toSql(queryVector), namespace, topK]
  )

  return result.rows.map((row) => createMatch(Number(row.score), {
    text: row.text,
    doc_id: row.doc_id,
    source_file: row.source_file,
    source_title: row.source_title,
    lang: row.lang,
    page_start: row.page_start,
    page_end: row.page_end,
    url: row.url
  }))
}

/**
 * Insert chunks, overwriting any existing row with the same id.
 *
 * Content-addressed ids (lib/rag/ids.js) make this idempotent the same
 * way the old Pinecone upsert was: re-running on unchanged text is a
 * no-op (same id, same row, same values); edited text gets a new id
 * instead of silently overwriting the old one's slot.
 */
export async function upsertChunks (client, chunks, namespace, embeddings) {
  if (chunks.length !== embeddings.length) {
    throw new Error(`${chunks.length} chunks but ${embeddings.length} embeddings`)
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const m = chunk.metadata
    await client.query(
      `insert into rag_chunks (
         id, doc_id, source_file, source_title, lang,
         page_start, page_end, chunk_index, char_start,
         content_hash, url, namespace, text, embedding
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       on conflict (id) do update set
         text = excluded.text,
         embedding = excluded.embedding,
         page_start = excluded.page_start,
         page_end = excluded.page_end,
         content_hash = excluded.content_hash,
         url = excluded.url,
         indexed_at = now()`,
      [
        chunk.id, m.doc_id, m.source_file, m.source_title, m.lang,
        m.page_start, m.page_end, m.chunk_index, m.char_start,
        m.content_hash, m.url ?? null, namespace, chunk.text, toSql(embeddings[i])
      ]
    )
  }
  return chunks.length
}

/**
 * Deletes every row in a namespace. Destructive -- the CLI's
 * --delete-existing flag is the only caller, same posture as the old
 * Pinecone --delete-existing: opt-in, scoped to one namespace, never a
 * silent default.
 */
export async function deleteNamespace (client, namespace) {
  const result = await client.query('delete from rag_chunks where namespace = $1', [namespace])
  return result.rowCount
}

export async function countNamespace (client, namespace) {
  const result = await client.query('select count(*) from rag_chunks where namespace = $1', [namespace])
  return Number(result.rows[0].count)
}

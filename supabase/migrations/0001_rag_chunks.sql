-- RAG corpus storage: one row per citable chunk. Already applied to the
-- live project (akqharjaeqjluptifhti) directly; this file exists so the
-- schema is reproducible for a fresh project instead of living only in
-- the Supabase dashboard's history. Mirrors longevity-backend's
-- supabase/migrations/0001_rag_chunks.sql (same table, now served by
-- this repo's /api/ask instead of the Python backend).
--
-- Embeddings are OPENAI_EMBEDDING_DIMENSIONS (1024 here, see
-- .env.example) -- if you change that setting, this table's vector(1024)
-- must be recreated to match.

create extension if not exists vector;

create table if not exists rag_chunks (
  id text primary key,
  doc_id text not null,
  source_file text not null,
  source_title text not null,
  lang text not null,
  page_start integer,
  page_end integer,
  chunk_index integer not null,
  char_start integer not null,
  content_hash text not null,
  url text,
  -- Scopes a corpus version (e.g. "v2") -- lets a re-ingest build a new
  -- namespace fully before anything points retrieval at it, instead of
  -- mutating the live one in place.
  namespace text not null default '',
  text text not null,
  embedding vector(1024) not null,
  indexed_at timestamptz not null default now()
);

create index if not exists rag_chunks_namespace_idx on rag_chunks (namespace);

-- HNSW over cosine distance (<=>) -- matches the cosine similarity the
-- app computes as `1 - distance` in lib/rag/pg_store.js.
create index if not exists rag_chunks_embedding_idx
  on rag_chunks using hnsw (embedding vector_cosine_ops);

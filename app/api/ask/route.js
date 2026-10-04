// POST /api/ask -- ported from app/api/routes/ask_v1.py (the retrieval-
// honest Q&A endpoint; the legacy unversioned /ask was already deleted
// from the Python backend and never ported here).
//
// - topK=8, keeping the top 4 above a similarity threshold, instead of
//   always trusting the nearest 3 regardless of relevance.
// - below threshold, the LLM is never called at all: a deterministic,
//   bilingual "not in my sources" message is returned instantly.
// - numbered citations (doc, page, score, snippet) returned as
//   structured data, not embedded in prose the model could misremember.
// - the model may only emit [n] markers pointing at supplied context;
//   any marker outside that range is stripped server-side before the
//   answer is returned (lib/rag/citations.js's stripInvalidMarkers).

import { NextResponse } from 'next/server'
import { getOpenAIClient, getPgClient } from '../../../lib/clients.js'
import { getSettings, missingRequiredForAsk } from '../../../lib/config.js'
import { DISCLAIMER, NOT_IN_SOURCES } from '../../../lib/domain/messages.js'
import { AskRequestSchema } from '../../../lib/api/schemas.js'
import { parseOrRespond } from '../../../lib/api/validate.js'
import { buildCitations, buildContextBlocks, stripInvalidMarkers } from '../../../lib/rag/citations.js'
import { queryVectorForText, retrieve } from '../../../lib/rag/retrieve.js'

const SYSTEM_MESSAGE_IT = `Sei un'assistente nutrizionista che risponde SOLO sulla base del contesto numerato fornito.
Regole:
- Puoi citare una fonte scrivendo esclusivamente il suo indice tra parentesi quadre, es. [1]. Non scrivere mai il nome del documento o il numero di pagina: verranno mostrati automaticamente dal sistema.
- Non inventare informazioni non presenti nel contesto.
- Se il contesto non è sufficiente per una parte della domanda, dillo esplicitamente.
- Non fornire diagnosi mediche; specifica che le risposte non sostituiscono un professionista qualificato quando appropriato.`

const SYSTEM_MESSAGE_EN = `You are a nutrition assistant who answers ONLY based on the numbered context provided.
Rules:
- You may cite a source by writing only its index in square brackets, e.g. [1]. Never write the document name or page number yourself -- the system displays those automatically.
- Never invent information not present in the context.
- If the context is insufficient for part of the question, say so explicitly.
- Do not provide medical diagnoses; note that answers don't replace a qualified professional when appropriate.`

export async function POST (request) {
  const settings = getSettings()
  const body = await request.json()
  const { data: askRequest, errorResponse } = parseOrRespond(AskRequestSchema, body)
  if (errorResponse) return errorResponse

  const disclaimer = DISCLAIMER[askRequest.locale] ?? DISCLAIMER.it

  const missing = missingRequiredForAsk(settings)
  if (missing.length > 0) {
    return NextResponse.json({ detail: 'Service not configured' }, { status: 503 })
  }

  try {
    const openaiClient = getOpenAIClient()
    const pgClient = await getPgClient()

    const queryVector = await queryVectorForText(
      openaiClient, askRequest.question, settings.openaiEmbeddingModel, settings.openaiEmbeddingDimensions
    )
    const chunks = await retrieve(pgClient, queryVector, settings.ragNamespace)

    if (chunks.length === 0) {
      return NextResponse.json({
        answer: NOT_IN_SOURCES[askRequest.locale] ?? NOT_IN_SOURCES.it,
        grounded: false,
        citations: [],
        disclaimer
      })
    }

    const context = buildContextBlocks(chunks)
    const citations = buildCitations(chunks)
    const systemMessage = askRequest.locale === 'en' ? SYSTEM_MESSAGE_EN : SYSTEM_MESSAGE_IT

    const completion = await openaiClient.chat.completions.create({
      model: settings.openaiChatModel,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: `Contesto:\n\n${context}\n\nDomanda: ${askRequest.question}` }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })
    let answer = completion.choices[0].message.content
    if (!answer) {
      return NextResponse.json({ detail: 'Empty model response' }, { status: 502 })
    }

    answer = stripInvalidMarkers(answer, citations.length)

    return NextResponse.json({ answer, grounded: true, citations, disclaimer })
  } catch (e) {
    console.error('ask.unhandled_error', e)
    return NextResponse.json({ detail: 'Internal server error' }, { status: 500 })
  }
}

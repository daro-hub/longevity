// Shared request-validation helper for the v1 API routes. FastAPI/
// pydantic auto-returns a structured 422 on a validation failure; Next.js
// route handlers need this done manually -- centralized here so the
// routes don't drift into slightly different error shapes.

import { NextResponse } from 'next/server'

export function parseOrRespond (schema, body) {
  const result = schema.safeParse(body)
  if (!result.success) {
    return {
      data: null,
      errorResponse: NextResponse.json({ detail: result.error.issues }, { status: 422 })
    }
  }
  return { data: result.data, errorResponse: null }
}

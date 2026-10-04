// POST /api/plan/alternatives -- ported from
// app/api/routes/plan.py::post_plan_alternatives.
//
// No LLM involved: alternatives are the nearest foods in macro-density
// space (lib/domain/substitutes.js), which is instant, free, and never
// wrong in the way an LLM suggestion could be -- it's a distance
// calculation over data already loaded in memory.

import { NextResponse } from 'next/server'
import { DEFAULT_FOOD_DB } from '../../../../lib/domain/food_db.js'
import { findSubstitutes } from '../../../../lib/domain/substitutes.js'
import { substituteToAlternativeOut } from '../../../../lib/api/mappers.js'
import { AlternativesRequestSchema } from '../../../../lib/api/schemas.js'
import { parseOrRespond } from '../../../../lib/api/validate.js'

export async function POST (request) {
  const body = await request.json()
  const { data, errorResponse } = parseOrRespond(AlternativesRequestSchema, body)
  if (errorResponse) return errorResponse

  const results = findSubstitutes(data.food_key, DEFAULT_FOOD_DB, data.excluded_tags, data.require_tags, data.n)
  return NextResponse.json({
    alternatives: results.map((s) => substituteToAlternativeOut(s, data.locale))
  })
}

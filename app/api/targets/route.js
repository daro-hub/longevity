// POST /api/targets -- ported from app/api/routes/targets.py.
//
// Computes deterministic nutrition targets (BMI, BMR, TDEE, calorie
// target, macro split, hydration) for a profile. No LLM call involved --
// every number here comes from lib/domain/, which is 100%-covered by
// unit tests and has a citation for every constant.

import { NextResponse } from 'next/server'
import { computeTargets } from '../../../lib/domain/engine.js'
import { profileInToDomain, targetsResultToResponse } from '../../../lib/api/mappers.js'
import { ProfileInSchema } from '../../../lib/api/schemas.js'
import { parseOrRespond } from '../../../lib/api/validate.js'

export async function POST (request) {
  const body = await request.json()
  const { data: profileIn, errorResponse } = parseOrRespond(ProfileInSchema, body)
  if (errorResponse) return errorResponse

  const profile = profileInToDomain(profileIn)
  const result = computeTargets(profile)
  return NextResponse.json(targetsResultToResponse(result, profileIn.locale))
}

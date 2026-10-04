// POST /api/plan -- ported from app/api/routes/plan.py::post_plan.
//
// Constrained meal-plan generation: the model's output schema carries
// only {food_key, grams} per item, no calorie or macro field anywhere.
// Every total is computed server-side; a plan outside tolerance is
// repaired first for free (plan_fitting, pure scaling/nudging, no LLM)
// and only then, at most once, sent back to the model with the
// server-computed deltas. If it still doesn't land, the response falls
// back to plan_status: "targets_only" -- never a 500, never a
// silently-wrong plan.

import { NextResponse } from 'next/server'
import { getOpenAIClient } from '../../../lib/clients.js'
import { getSettings, missingRequiredForPlan } from '../../../lib/config.js'
import { computeTargets } from '../../../lib/domain/engine.js'
import { DEFAULT_FOOD_DB } from '../../../lib/domain/food_db.js'
import { enrichPlanWithNames, profileInToDomain, targetsResultToResponse } from '../../../lib/api/mappers.js'
import { PlanRequestSchema } from '../../../lib/api/schemas.js'
import { parseOrRespond } from '../../../lib/api/validate.js'
import { generatePlan } from '../../../lib/llm/planner.js'
import { OpenAIPlanClient } from '../../../lib/llm/openai-client.js'

export async function POST (request) {
  const settings = getSettings()
  const body = await request.json()
  const { data: planRequest, errorResponse } = parseOrRespond(PlanRequestSchema, body)
  if (errorResponse) return errorResponse

  const profile = profileInToDomain(planRequest)
  const targetsResult = computeTargets(profile)

  if (targetsResult.refused) {
    const mapped = targetsResultToResponse(targetsResult, planRequest.locale)
    return NextResponse.json({
      refused: true, plan_status: null, targets: null, plan: null,
      violations: mapped.violations, disclaimer: mapped.disclaimer
    })
  }

  const missing = missingRequiredForPlan(settings)
  if (missing.length > 0) {
    return NextResponse.json({ detail: 'Service not configured' }, { status: 503 })
  }

  const mapped = targetsResultToResponse(targetsResult, planRequest.locale)

  let result
  try {
    const llmClient = new OpenAIPlanClient(getOpenAIClient(), settings.openaiChatModel)
    result = await generatePlan(
      llmClient, targetsResult.targets, DEFAULT_FOOD_DB, planRequest.excluded_tags, planRequest.locale
    )
  } catch {
    // Never a 500 for this route: the computed targets are still correct
    // and useful on their own even if plan generation blew up.
    return NextResponse.json({
      refused: false, plan_status: 'targets_only', targets: mapped.targets,
      plan: null, violations: mapped.violations, disclaimer: mapped.disclaimer
    })
  }

  return NextResponse.json({
    refused: false,
    plan_status: result.planStatus,
    targets: mapped.targets,
    plan: enrichPlanWithNames(result.plan, DEFAULT_FOOD_DB, planRequest.locale),
    violations: mapped.violations,
    disclaimer: mapped.disclaimer
  })
}

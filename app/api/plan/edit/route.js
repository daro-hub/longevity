// POST /api/plan/edit -- ported from app/api/routes/plan.py::post_plan_edit.
//
// Scoped edit: swap one ingredient, regenerate one meal/day, or an
// arbitrary multi-select -- see lib/llm/planner.js's regenerateScope.
// Every item NOT in scope is guaranteed unchanged; only the open
// positions are ever shown to or decided by the model.

import { NextResponse } from 'next/server'
import { getOpenAIClient } from '../../../../lib/clients.js'
import { getSettings, missingRequiredForPlan } from '../../../../lib/config.js'
import { computeTargets } from '../../../../lib/domain/engine.js'
import { DEFAULT_FOOD_DB } from '../../../../lib/domain/food_db.js'
import { enrichPlanWithNames, profileInToDomain, targetsResultToResponse } from '../../../../lib/api/mappers.js'
import { PlanEditRequestSchema } from '../../../../lib/api/schemas.js'
import { parseOrRespond } from '../../../../lib/api/validate.js'
import { regenerateScope } from '../../../../lib/llm/planner.js'
import { OpenAIPlanClient } from '../../../../lib/llm/openai-client.js'
import { createEditScope, ScopeError } from '../../../../lib/llm/scope.js'

export async function POST (request) {
  const settings = getSettings()
  const body = await request.json()
  const { data: editRequest, errorResponse } = parseOrRespond(PlanEditRequestSchema, body)
  if (errorResponse) return errorResponse

  const profile = profileInToDomain(editRequest)
  const targetsResult = computeTargets(profile)

  if (targetsResult.refused) {
    const mapped = targetsResultToResponse(targetsResult, editRequest.locale)
    return NextResponse.json({
      refused: true, plan_status: null, targets: null, plan: null,
      violations: mapped.violations, disclaimer: mapped.disclaimer
    })
  }

  const missing = missingRequiredForPlan(settings)
  if (missing.length > 0) {
    return NextResponse.json({ detail: 'Service not configured' }, { status: 503 })
  }

  const mapped = targetsResultToResponse(targetsResult, editRequest.locale)
  const scope = createEditScope({
    kind: editRequest.scope.kind,
    dayIndex: editRequest.scope.day_index,
    mealIndex: editRequest.scope.meal_index,
    itemIndex: editRequest.scope.item_index,
    positions: editRequest.scope.positions
  })

  let result
  try {
    const llmClient = new OpenAIPlanClient(getOpenAIClient(), settings.openaiChatModel)
    result = await regenerateScope(
      llmClient, editRequest.plan, scope, editRequest.instruction,
      targetsResult.targets, DEFAULT_FOOD_DB, editRequest.excluded_tags, editRequest.locale
    )
  } catch (e) {
    if (e instanceof ScopeError) {
      return NextResponse.json({ detail: e.message }, { status: 422 })
    }
    return NextResponse.json({
      refused: false, plan_status: 'targets_only', targets: mapped.targets,
      plan: null, violations: mapped.violations, disclaimer: mapped.disclaimer
    })
  }

  return NextResponse.json({
    refused: false,
    plan_status: result.planStatus,
    targets: mapped.targets,
    plan: enrichPlanWithNames(result.plan, DEFAULT_FOOD_DB, editRequest.locale),
    violations: mapped.violations,
    disclaimer: mapped.disclaimer
  })
}

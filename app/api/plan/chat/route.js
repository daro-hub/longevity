// POST /api/plan/chat -- ported from app/api/routes/plan.py::post_plan_chat.
//
// Natural-language front end: turns a free-text request about the
// current plan into one of (regenerate a scope, regenerate the whole
// structure, suggest alternatives, ask for clarification) via
// lib/llm/intent.js, then executes it through the exact same validated
// mechanisms /api/plan and /api/plan/edit use -- nothing about how a
// request arrives changes how safely it's executed.

import { NextResponse } from 'next/server'
import { getOpenAIClient } from '../../../../lib/clients.js'
import { getSettings, missingRequiredForPlan } from '../../../../lib/config.js'
import { computeTargets } from '../../../../lib/domain/engine.js'
import { DEFAULT_FOOD_DB } from '../../../../lib/domain/food_db.js'
import { findSubstitutes } from '../../../../lib/domain/substitutes.js'
import { enrichPlanWithNames, profileInToDomain, statusReply, substituteToAlternativeOut, targetsResultToResponse } from '../../../../lib/api/mappers.js'
import { PlanChatRequestSchema } from '../../../../lib/api/schemas.js'
import { parseOrRespond } from '../../../../lib/api/validate.js'
import { ChatOperation, intentToEditScope, resolveIntent } from '../../../../lib/llm/intent.js'
import { OpenAIIntentClient } from '../../../../lib/llm/openai-intent-client.js'
import { OpenAIPlanClient } from '../../../../lib/llm/openai-client.js'
import { generatePlan, PLAN_STATUS_TARGETS_ONLY, regenerateScope } from '../../../../lib/llm/planner.js'
import { ScopeError } from '../../../../lib/llm/scope.js'

export async function POST (request) {
  const settings = getSettings()
  const body = await request.json()
  const { data: chatRequest, errorResponse } = parseOrRespond(PlanChatRequestSchema, body)
  if (errorResponse) return errorResponse

  const profile = profileInToDomain(chatRequest)
  const targetsResult = computeTargets(profile)

  if (targetsResult.refused) {
    const mapped = targetsResultToResponse(targetsResult, chatRequest.locale)
    return NextResponse.json({
      refused: true, reply: '', plan_status: null, targets: null, plan: null,
      alternatives: null, violations: mapped.violations, disclaimer: mapped.disclaimer
    })
  }

  const missing = missingRequiredForPlan(settings)
  if (missing.length > 0) {
    return NextResponse.json({ detail: 'Service not configured' }, { status: 503 })
  }

  const mapped = targetsResultToResponse(targetsResult, chatRequest.locale)
  const excludedTags = chatRequest.excluded_tags
  const openaiClient = getOpenAIClient()

  let intent
  try {
    const intentClient = new OpenAIIntentClient(openaiClient, settings.openaiChatModel)
    intent = await resolveIntent(intentClient, chatRequest.plan, chatRequest.message, chatRequest.locale)
  } catch {
    const fallback = chatRequest.locale === 'en'
      ? "Sorry, I couldn't understand that request."
      : 'Mi dispiace, non sono riuscito a capire questa richiesta.'
    return NextResponse.json({
      refused: false, reply: fallback, plan_status: null, targets: mapped.targets,
      plan: null, alternatives: null, violations: mapped.violations, disclaimer: mapped.disclaimer
    })
  }

  if (intent.operation === ChatOperation.CLARIFY) {
    return NextResponse.json({
      refused: false, reply: intent.clarification_question, plan_status: null,
      targets: mapped.targets, plan: null, alternatives: null,
      violations: mapped.violations, disclaimer: mapped.disclaimer
    })
  }

  if (intent.operation === ChatOperation.GET_ALTERNATIVES) {
    const subs = findSubstitutes(intent.target_food_key, DEFAULT_FOOD_DB, excludedTags, [], 3)
    const alternatives = subs.map((s) => substituteToAlternativeOut(s, chatRequest.locale))
    let reply
    if (alternatives.length > 0) {
      const names = alternatives.map((a) => a.name).join(', ')
      reply = chatRequest.locale === 'en' ? `You could use: ${names}.` : `Potresti usare: ${names}.`
    } else {
      reply = chatRequest.locale === 'en'
        ? "I couldn't find a good alternative for that."
        : 'Non ho trovato una buona alternativa per questo alimento.'
    }
    return NextResponse.json({
      refused: false, reply, plan_status: null, targets: mapped.targets, plan: null,
      alternatives, violations: mapped.violations, disclaimer: mapped.disclaimer
    })
  }

  let result
  try {
    const planClient = new OpenAIPlanClient(openaiClient, settings.openaiChatModel)
    if (intent.operation === ChatOperation.REGENERATE_FULL) {
      result = await generatePlan(
        planClient, targetsResult.targets, DEFAULT_FOOD_DB, excludedTags, chatRequest.locale, intent.instruction
      )
    } else { // REGENERATE_SCOPE
      const scope = intentToEditScope(intent)
      result = await regenerateScope(
        planClient, chatRequest.plan, scope, intent.instruction,
        targetsResult.targets, DEFAULT_FOOD_DB, excludedTags, chatRequest.locale
      )
    }
  } catch (e) {
    if (e instanceof ScopeError) {
      return NextResponse.json({ detail: e.message }, { status: 422 })
    }
    return NextResponse.json({
      refused: false, reply: statusReply(PLAN_STATUS_TARGETS_ONLY, chatRequest.locale),
      plan_status: PLAN_STATUS_TARGETS_ONLY, targets: mapped.targets, plan: null,
      alternatives: null, violations: mapped.violations, disclaimer: mapped.disclaimer
    })
  }

  return NextResponse.json({
    refused: false,
    reply: statusReply(result.planStatus, chatRequest.locale),
    plan_status: result.planStatus,
    targets: mapped.targets,
    plan: enrichPlanWithNames(result.plan, DEFAULT_FOOD_DB, chatRequest.locale),
    alternatives: null,
    violations: mapped.violations,
    disclaimer: mapped.disclaimer
  })
}

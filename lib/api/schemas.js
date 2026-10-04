// zod request-validation schemas for the v1 API. Separate from the
// domain layer on purpose: the API schema is a public contract (field
// names stay snake_case to match the existing frontend contract and the
// Python backend this replaces) while the domain layer (lib/domain/) is
// free to use its own camelCase shape as the engine evolves.
//
// Ported from app/api/schemas.py (the request-side fields only --
// ProfileIn/PlanRequest; response shapes are plain objects built in
// mappers.js, not validated schemas, same as the Python response models
// which are serialized, never parsed).

import { z } from 'zod'
import { ActivityLevel, Goal, Sex } from '../domain/enums.js'

export const ProfileInSchema = z.object({
  age_years: z.number().int().min(0).max(150),
  sex: z.enum(Object.values(Sex)),
  height_cm: z.number().gt(0),
  weight_kg: z.number().gt(0),
  activity_level: z.enum(Object.values(ActivityLevel)),
  goal: z.enum(Object.values(Goal)),
  health_notes: z.string().max(2000).default(''),
  locale: z.string().regex(/^(it|en)$/).default('it')
})

export const PlanRequestSchema = ProfileInSchema.extend({
  excluded_tags: z.array(z.string()).default([])
})

export const AlternativesRequestSchema = z.object({
  food_key: z.string(),
  excluded_tags: z.array(z.string()).default([]),
  require_tags: z.array(z.string()).default([]),
  locale: z.string().regex(/^(it|en)$/).default('it'),
  n: z.number().int().min(1).max(10).default(3)
})

export const EditScopeInSchema = z.object({
  kind: z.enum(['plan', 'day', 'meal', 'item', 'selection']),
  day_index: z.number().int().nullable().default(null),
  meal_index: z.number().int().nullable().default(null),
  item_index: z.number().int().nullable().default(null),
  positions: z.array(z.tuple([z.number().int(), z.number().int(), z.number().int()])).default([])
})

export const PlanEditRequestSchema = PlanRequestSchema.extend({
  plan: z.record(z.string(), z.any()),
  scope: EditScopeInSchema,
  instruction: z.string().min(1).max(1000)
})

export const PlanChatRequestSchema = PlanRequestSchema.extend({
  plan: z.record(z.string(), z.any()),
  message: z.string().min(1).max(1000)
})

export const AskRequestSchema = z.object({
  question: z.string().min(1).max(4000),
  locale: z.string().regex(/^(it|en)$/).default('it')
})

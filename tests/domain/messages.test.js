import { describe, expect, it } from 'vitest'
import { DISCLAIMER, GUARDRAIL_MESSAGES, NOT_IN_SOURCES, guardrailMessage } from '../../lib/domain/messages.js'

// Ported from tests/domain/test_messages.py.

it('disclaimer has both locales and is nonempty', () => {
  expect(DISCLAIMER.it).toBeTruthy()
  expect(DISCLAIMER.en).toBeTruthy()
})

it('not-in-sources has both locales', () => {
  expect(NOT_IN_SOURCES.it).toBeTruthy()
  expect(NOT_IN_SOURCES.en).toBeTruthy()
})

it('every guardrail message has both locales', () => {
  for (const [key, entry] of Object.entries(GUARDRAIL_MESSAGES)) {
    expect(entry.it, `${key} missing it`).toBeTruthy()
    expect(entry.en, `${key} missing en`).toBeTruthy()
  }
})

describe('guardrailMessage', () => {
  it('returns the localized string', () => {
    expect(guardrailMessage('guardrail.age_child', 'en')).toBe(GUARDRAIL_MESSAGES['guardrail.age_child'].en)
    expect(guardrailMessage('guardrail.age_child', 'it')).toBe(GUARDRAIL_MESSAGES['guardrail.age_child'].it)
  })

  it('returns the key itself for an unknown key', () => {
    expect(guardrailMessage('not.a.real.key', 'en')).toBe('not.a.real.key')
  })

  it('falls back to it for an unknown locale', () => {
    expect(guardrailMessage('guardrail.age_child', 'fr')).toBe(GUARDRAIL_MESSAGES['guardrail.age_child'].it)
  })
})

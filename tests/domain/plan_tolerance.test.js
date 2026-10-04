import { expect, it } from 'vitest'
import { createMacroTargets } from '../../lib/domain/models.js'
import { createPlanTotals } from '../../lib/domain/nutrition.js'
import { checkTolerance } from '../../lib/domain/plan_tolerance.js'

// Ported from tests/domain/test_plan_tolerance.py.

const TARGET_KCAL = 2000.0
const MACROS = createMacroTargets({ proteinG: 120, carbG: 220, fatG: 60, fiberG: 30, kcalFromMacros: 2000 })

it('exact match is ok', () => {
  const totals = createPlanTotals({ kcal: 2000, proteinG: 120, carbG: 220, fatG: 60, fiberG: 30 })
  const result = checkTolerance(totals, TARGET_KCAL, MACROS)
  expect(result.allOk).toBe(true)
})

it('kcal within band is ok', () => {
  // 5% of 2000 = 100; 50 kcal over is within band
  const totals = createPlanTotals({ kcal: 2050, proteinG: 120, carbG: 220, fatG: 60, fiberG: 30 })
  const result = checkTolerance(totals, TARGET_KCAL, MACROS)
  expect(result.kcalOk).toBe(true)
})

it('kcal outside band fails', () => {
  const totals = createPlanTotals({ kcal: 2300, proteinG: 120, carbG: 220, fatG: 60, fiberG: 30 })
  const result = checkTolerance(totals, TARGET_KCAL, MACROS)
  expect(result.kcalOk).toBe(false)
  expect(result.allOk).toBe(false)
})

it('kcal min absolute band for small targets', () => {
  // 5% of 400 = 20, but the absolute floor is 75kcal
  const smallMacros = createMacroTargets({ proteinG: 30, carbG: 40, fatG: 10, fiberG: 10, kcalFromMacros: 400 })
  const totals = createPlanTotals({ kcal: 460, proteinG: 30, carbG: 40, fatG: 10, fiberG: 10 })
  const result = checkTolerance(totals, 400.0, smallMacros)
  expect(result.kcalOk).toBe(true) // 60kcal over, within the 75kcal absolute floor
})

it('protein undershoot band is narrow', () => {
  // -5% of 120 = -6; -10 is outside
  const totals = createPlanTotals({ kcal: 2000, proteinG: 110, carbG: 220, fatG: 60, fiberG: 30 })
  const result = checkTolerance(totals, TARGET_KCAL, MACROS)
  expect(result.proteinOk).toBe(false)
})

it('protein overshoot band is generous', () => {
  // +25% of 120 = +30 -> 150g is right at the edge, ok
  const totals = createPlanTotals({ kcal: 2000, proteinG: 150, carbG: 220, fatG: 60, fiberG: 30 })
  const result = checkTolerance(totals, TARGET_KCAL, MACROS)
  expect(result.proteinOk).toBe(true)
})

it('protein overshoot beyond band fails', () => {
  const totals = createPlanTotals({ kcal: 2000, proteinG: 170, carbG: 220, fatG: 60, fiberG: 30 })
  const result = checkTolerance(totals, TARGET_KCAL, MACROS)
  expect(result.proteinOk).toBe(false)
})

it('fat has a symmetric band', () => {
  // 15% of 60 = 9
  const totalsOver = createPlanTotals({ kcal: 2000, proteinG: 120, carbG: 220, fatG: 70, fiberG: 30 })
  const totalsUnder = createPlanTotals({ kcal: 2000, proteinG: 120, carbG: 220, fatG: 50, fiberG: 30 })
  expect(checkTolerance(totalsOver, TARGET_KCAL, MACROS).fatOk).toBe(false)
  expect(checkTolerance(totalsUnder, TARGET_KCAL, MACROS).fatOk).toBe(false)
  const totalsOk = createPlanTotals({ kcal: 2000, proteinG: 120, carbG: 220, fatG: 65, fiberG: 30 })
  expect(checkTolerance(totalsOk, TARGET_KCAL, MACROS).fatOk).toBe(true)
})

it('fiber is one-sided, no ceiling', () => {
  // way above target fiber should still be ok (no ceiling)
  const totals = createPlanTotals({ kcal: 2000, proteinG: 120, carbG: 220, fatG: 60, fiberG: 80 })
  const result = checkTolerance(totals, TARGET_KCAL, MACROS)
  expect(result.fiberOk).toBe(true)
})

it('fiber below 90 percent fails', () => {
  const totals = createPlanTotals({ kcal: 2000, proteinG: 120, carbG: 220, fatG: 60, fiberG: 20 })
  const result = checkTolerance(totals, TARGET_KCAL, MACROS)
  expect(result.fiberOk).toBe(false)
})

it('deltas are signed', () => {
  const totals = createPlanTotals({ kcal: 1900, proteinG: 100, carbG: 220, fatG: 60, fiberG: 30 })
  const result = checkTolerance(totals, TARGET_KCAL, MACROS)
  expect(result.kcalDelta).toBeCloseTo(-100.0, 5)
  expect(result.proteinDelta).toBeCloseTo(-20.0, 5)
})

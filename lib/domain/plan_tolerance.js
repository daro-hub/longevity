// Shared tolerance-checking logic, used by both plan_fitting.js (the
// pure, no-LLM repair pass) and lib/llm/validator.js (full validation
// with violation reasons for the LLM repair prompt). Kept in one place so
// the two never drift apart on what "close enough" means.
//
// Ported from app/domain/plan_tolerance.py.

import * as ref from './references.js'

export function createToleranceCheck (fields) {
  const check = { ...fields }
  Object.defineProperty(check, 'allOk', {
    enumerable: true,
    get () {
      return check.kcalOk && check.proteinOk && check.fatOk && check.carbOk && check.fiberOk
    }
  })
  return Object.freeze(check)
}

export function checkTolerance (totals, targetKcal, macros) {
  const kcalDelta = totals.kcal - targetKcal
  const kcalBand = Math.max(ref.KCAL_TOLERANCE_PCT * targetKcal, ref.KCAL_TOLERANCE_MIN_ABS)
  const kcalOk = Math.abs(kcalDelta) <= kcalBand

  const proteinDelta = totals.proteinG - macros.proteinG
  const proteinOk = (
    proteinDelta >= -ref.PROTEIN_TOLERANCE_UNDER_PCT * macros.proteinG &&
    proteinDelta <= ref.PROTEIN_TOLERANCE_OVER_PCT * macros.proteinG
  )

  const fatDelta = totals.fatG - macros.fatG
  const fatOk = Math.abs(fatDelta) <= ref.FAT_TOLERANCE_PCT * macros.fatG

  const carbDelta = totals.carbG - macros.carbG
  const carbOk = Math.abs(carbDelta) <= ref.CARB_TOLERANCE_PCT * macros.carbG

  const fiberDelta = totals.fiberG - macros.fiberG
  const fiberOk = totals.fiberG >= ref.FIBER_TOLERANCE_MIN_FRACTION * macros.fiberG

  return createToleranceCheck({
    kcalOk, proteinOk, fatOk, carbOk, fiberOk,
    kcalDelta, proteinDelta, fatDelta, carbDelta, fiberDelta
  })
}

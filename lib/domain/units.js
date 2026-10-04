// Unit conversions and the single rounding policy used everywhere else in
// the domain package. Keeping rounding in one place matters: macroTargets
// rounds grams to integers and then recomputes kcal from those rounded
// grams (see energy.js / macros.js) -- if two different rounding policies
// existed, the validator in the LLM plan pipeline would chase a target
// that no integer-gram plan could ever hit exactly.
//
// Ported from app/domain/units.py, which uses Python's builtin round()
// (round-half-to-even/banker's rounding), NOT JS's Math.round() (round-
// half-up) -- roundHalfToEven() below replicates the Python behavior
// exactly so this port stays numerically identical to the already-
// deployed Python engine, rather than silently diverging on a .5 tie.

/**
 * Generalizes to `decimals` places by scaling, matching Python's
 * round(value, decimals) semantics (also round-half-to-even on the
 * scaled value). Used directly for the whole-number cases below, and by
 * callers elsewhere in the domain layer that round a display value
 * (e.g. BMI to 1 decimal) rather than a whole-gram/kcal/ml quantity.
 */
export function roundHalfToEven (value, decimals = 0) {
  const scale = 10 ** decimals
  const scaled = value * scale
  const floor = Math.floor(scaled)
  const diff = scaled - floor
  let rounded
  if (diff < 0.5) {
    rounded = floor
  } else if (diff > 0.5) {
    rounded = floor + 1
  } else {
    // Exactly .5: round to the even neighbor.
    rounded = floor % 2 === 0 ? floor : floor + 1
  }
  return rounded / scale
}

export function roundGrams (value) {
  return roundHalfToEven(value)
}

export function roundKcal (value) {
  return roundHalfToEven(value)
}

export function roundMl (value) {
  return roundHalfToEven(value)
}

export function clamp (value, low, high) {
  return Math.max(low, Math.min(high, value))
}

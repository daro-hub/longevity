import { describe, expect, it } from 'vitest'
import { bmrMifflinStJeor, calorieTargetForAdjustment, tdee } from '../../lib/domain/energy.js'
import { ActivityLevel, Sex } from '../../lib/domain/enums.js'

// Ported from tests/domain/test_energy.py.

it('bmr male reference case', () => {
  // 30yo male, 80kg, 180cm: 10*80 + 6.25*180 - 5*30 + 5 = 800+1125-150+5 = 1780
  expect(bmrMifflinStJeor(80, 180, 30, Sex.MALE)).toBeCloseTo(1780.0, 5)
})

it('bmr female reference case', () => {
  // 30yo female, 65kg, 165cm: 10*65 + 6.25*165 - 5*30 - 161 = 650+1031.25-150-161 = 1370.25
  expect(bmrMifflinStJeor(65, 165, 30, Sex.FEMALE)).toBeCloseTo(1370.25, 5)
})

it('bmr sex offset difference is 166', () => {
  // Same body, only sex differs: the constant gap between +5 and -161 is 166 kcal.
  const male = bmrMifflinStJeor(70, 170, 30, Sex.MALE)
  const female = bmrMifflinStJeor(70, 170, 30, Sex.FEMALE)
  expect(male - female).toBeCloseTo(166.0, 5)
})

describe('tdee multipliers', () => {
  const cases = [
    [ActivityLevel.SEDENTARY, 1.2],
    [ActivityLevel.LIGHT, 1.375],
    [ActivityLevel.MODERATE, 1.55],
    [ActivityLevel.ACTIVE, 1.725],
    [ActivityLevel.VERY_ACTIVE, 1.9]
  ]

  it.each(cases)('%s -> x%s', (activity, multiplier) => {
    expect(tdee(1000.0, activity)).toBeCloseTo(1000.0 * multiplier, 5)
  })
})

it('calorie target applies adjustment', () => {
  // tdee=2500, bmr=1500 (way below floor concerns), -20% -> 2000
  const result = calorieTargetForAdjustment(2500.0, 1500.0, Sex.MALE, -0.20)
  expect(result.kcal).toBeCloseTo(2000.0, 0)
  expect(result.floorApplied).toBe(false)
})

it('calorie target bmr relative floor applies', () => {
  // tdee=1600, bmr=1550 -> -20% = 1280, but 1.1*bmr = 1705 > raw -> floor applies
  const result = calorieTargetForAdjustment(1600.0, 1550.0, Sex.MALE, -0.20)
  expect(result.floorApplied).toBe(true)
  expect(result.kcal).toBeCloseTo(1705.0, 0)
})

it('calorie target absolute floor applies for small body', () => {
  // Very small BMR/TDEE with a large deficit should hit the absolute floor.
  // -20% of 1300 = 1040; 1.1*1100=1210; absolute floor female=1200
  // floor = max(1210, 1200) = 1210
  const result = calorieTargetForAdjustment(1300.0, 1100.0, Sex.FEMALE, -0.20)
  expect(result.floorApplied).toBe(true)
  expect(result.kcal).toBeCloseTo(1210.0, 0)
})

it('calorie target with no adjustment returns tdee', () => {
  const result = calorieTargetForAdjustment(2200.0, 1600.0, Sex.MALE, 0.0)
  expect(result.kcal).toBeCloseTo(2200.0, 0)
  expect(result.floorApplied).toBe(false)
})

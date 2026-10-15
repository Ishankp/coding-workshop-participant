import { describe, expect, it } from 'vitest'
import { MILESTONE_STATUS_LABELS, daysLeftText } from './milestones'

describe('daysLeftText', () => {
  it('is empty without a value', () => {
    expect(daysLeftText(null)).toBe('')
    expect(daysLeftText(undefined)).toBe('')
  })

  it('handles today, future and past with singular and plural units', () => {
    expect(daysLeftText(0)).toBe('Ends today')
    expect(daysLeftText(1)).toBe('1 day left')
    expect(daysLeftText(12)).toBe('12 days left')
    expect(daysLeftText(-1)).toBe('1 day past end date')
    expect(daysLeftText(-3)).toBe('3 days past end date')
  })
})

describe('MILESTONE_STATUS_LABELS', () => {
  it('labels every API status', () => {
    expect(Object.keys(MILESTONE_STATUS_LABELS)).toEqual(
      expect.arrayContaining(['completed', 'not_started', 'in_progress', 'past_end_date', 'unscheduled']),
    )
  })
})

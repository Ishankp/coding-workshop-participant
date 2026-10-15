import { describe, expect, it, vi } from 'vitest'
import { formatCurrency, formatDate, formatHours, projectScheduleTone, projectStatus, todayIsoDate } from './format'

describe('formatDate', () => {
  it('shows a dash for empty values', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
  })

  it('formats a date-only string without shifting the day', () => {
    expect(formatDate('2026-07-01')).toMatch(/Jul 1, 2026/)
  })

  it('formats a timestamp', () => {
    expect(formatDate('2026-03-15T12:00:00Z')).toMatch(/2026/)
  })

  it('returns unparseable input unchanged', () => {
    expect(formatDate('not a date')).toBe('not a date')
  })
})

describe('formatCurrency', () => {
  it('shows a dash for empty values', () => {
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency(undefined)).toBe('—')
  })

  it('formats whole dollars', () => {
    expect(formatCurrency(12345.67)).toBe('$12,346')
    expect(formatCurrency(0)).toBe('$0')
  })
})

describe('formatHours', () => {
  it('shows a dash for empty values', () => {
    expect(formatHours(null)).toBe('—')
    expect(formatHours(undefined)).toBe('—')
  })

  it('formats hours with at most two decimals', () => {
    expect(formatHours(220.5)).toBe('220.5 h')
    expect(formatHours(1)).toBe('1 h')
    expect(formatHours(1.2345)).toBe('1.23 h')
  })
})

describe('projectStatus', () => {
  it('prefers archived, then completed, then active', () => {
    expect(projectStatus({ archivedAt: '2026-01-01', completedAt: '2026-01-01' })).toBe('Archived')
    expect(projectStatus({ archivedAt: null, completedAt: '2026-01-01' })).toBe('Completed')
    expect(projectStatus({ archivedAt: null, completedAt: null })).toBe('Active')
  })
})

describe('projectScheduleTone', () => {
  it('maps timestamps and days left to a tone', () => {
    expect(projectScheduleTone({ completedAt: 'x', archivedAt: null, daysLeft: -3 })).toBe('completed')
    expect(projectScheduleTone({ completedAt: null, archivedAt: 'x', daysLeft: -3 })).toBe('archived')
    expect(projectScheduleTone({ completedAt: null, archivedAt: null, daysLeft: -3 })).toBe('past_end_date')
    expect(projectScheduleTone({ completedAt: null, archivedAt: null, daysLeft: 3 })).toBe('in_progress')
    expect(projectScheduleTone({ completedAt: null, archivedAt: null, daysLeft: null })).toBe('in_progress')
  })
})

describe('todayIsoDate', () => {
  it('returns the local date as YYYY-MM-DD', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 5, 10, 0, 0))
    expect(todayIsoDate()).toBe('2026-03-05')
    vi.useRealTimers()
  })
})

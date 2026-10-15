import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MilestoneList from './MilestoneList'
import { renderWithProviders } from '../test/helpers'

const base = { startDate: '2026-01-01', endDate: '2026-02-01', completedAt: null, archivedAt: null, timeElapsedPercent: 50, daysLeft: 5, employees: [], dependsOn: [], alerts: [] }
const milestones = [
  { ...base, milestoneId: 1, name: 'Build', status: 'in_progress', employees: [{ employeeId: 1, name: 'Ann', username: 'ann' }] },
  { ...base, milestoneId: 2, name: 'Late', status: 'past_end_date', daysLeft: -2, alerts: ['Design is past due'] },
  { ...base, milestoneId: 3, name: 'Design', status: 'completed', completedAt: '2026-01-20' },
  { ...base, milestoneId: 4, name: 'Launch', status: 'not_started', daysLeft: 30 },
  { ...base, milestoneId: 5, name: 'Someday', status: 'unscheduled', startDate: null, endDate: null, timeElapsedPercent: null, daysLeft: null },
]

describe('MilestoneList', () => {
  it('says when there are no milestones', () => {
    renderWithProviders(<MilestoneList milestones={[]} />)
    expect(screen.getByText('This project has no milestones yet.')).toBeInTheDocument()
  })

  it('groups milestones into sections with counts and shows card details', () => {
    renderWithProviders(<MilestoneList milestones={milestones} />)
    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(3)
    expect(groups[0]).toHaveTextContent('In progress & past due')
    expect(groups[0]).toHaveTextContent('2')
    expect(groups[1]).toHaveTextContent('Completed')
    expect(groups[1]).not.toHaveAttribute('open')
    expect(groups[2]).toHaveTextContent('Yet to start')

    expect(within(groups[0]).getByRole('link', { name: 'Build' })).toHaveAttribute('href', '/milestones/1')
    expect(within(groups[0]).getByRole('link', { name: 'Ann' })).toBeInTheDocument()
    expect(within(groups[0]).getByText('⚠ Held up')).toHaveAttribute('title', 'Design is past due')
    expect(within(groups[0]).getByRole('alert')).toHaveTextContent('Design is past due')
    expect(within(groups[0]).getByText('2 days past end date')).toBeInTheDocument()
    expect(within(groups[0]).getAllByText('No one assigned')).toHaveLength(1)

    expect(within(groups[1]).getByText('Completed', { selector: '.muted' })).toBeInTheDocument()
    expect(within(groups[1]).queryByRole('progressbar')).not.toBeInTheDocument()

    expect(within(groups[2]).getByText('No dates set')).toBeInTheDocument()
    expect(within(groups[2]).getByText(/Add start and end dates/)).toBeInTheDocument()
  })

  it('shows empty-section text and an Archived section when needed', () => {
    const archived = { ...base, milestoneId: 9, name: 'Old', status: 'completed', archivedAt: '2026-01-01' }
    renderWithProviders(<MilestoneList milestones={[archived, { ...base, milestoneId: 1, name: 'Build', status: 'in_progress' }]} />)
    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(4)
    expect(groups[1]).toHaveTextContent('No milestones completed yet.')
    expect(groups[2]).toHaveTextContent('No upcoming milestones.')
    expect(groups[3]).toHaveTextContent('Archived')
    expect(within(groups[3]).getByRole('link', { name: 'Old' })).toBeInTheDocument()
    expect(within(groups[3]).getByText('Archived', { selector: '.status-badge' })).toBeInTheDocument()
    expect(within(groups[3]).getByRole('listitem')).toHaveClass('is-archived')
  })

  it('falls back to the raw status label', () => {
    renderWithProviders(<MilestoneList milestones={[{ ...base, milestoneId: 1, name: 'X', status: 'in_progress' }, { ...base, milestoneId: 2, name: 'Odd', status: 'in_progress', alerts: undefined }]} />)
    expect(screen.getAllByText('In progress')).toHaveLength(2)
  })
})

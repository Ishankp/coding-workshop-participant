import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TimeElapsedBar from './TimeElapsedBar'
import EmployeeChips from './EmployeeChips'
import CompletionBar from './CompletionBar'
import BudgetCard from './BudgetCard'
import { renderWithProviders } from '../test/helpers'

describe('TimeElapsedBar', () => {
  it('asks for dates when there is no percent', () => {
    renderWithProviders(<TimeElapsedBar status="unscheduled" />)
    expect(screen.getByText(/Add start and end dates/)).toBeInTheDocument()
  })

  it('renders the progress bar with the status class', () => {
    renderWithProviders(<TimeElapsedBar percent={42} status="in_progress" />)
    const bar = screen.getByRole('progressbar', { name: 'Time elapsed' })
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveClass('progress-in_progress')
    expect(screen.getByText('42%')).toBeInTheDocument()
  })
})

describe('EmployeeChips', () => {
  it('links each employee to their page', () => {
    renderWithProviders(
      <EmployeeChips
        label="Team"
        employees={[
          { employeeId: 1, name: 'Ann', username: 'ann' },
          { employeeId: 2, name: 'Bob', username: 'bob' },
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Team' })
    expect(within(list).getByRole('link', { name: 'Ann' })).toHaveAttribute('href', '/employees/1')
    expect(within(list).getByRole('link', { name: 'Bob' })).toHaveAttribute('title', 'bob')
  })
})

describe('CompletionBar', () => {
  const completion = {
    percent: 60,
    completedMilestones: 1,
    totalMilestones: 3,
    segments: [
      { milestoneId: 1, name: 'Design', weightPercent: 30, completed: true, progressPercent: 100, status: 'completed' },
      { milestoneId: 2, name: 'Build', weightPercent: 50, completed: false, progressPercent: 55, status: 'in_progress' },
      { milestoneId: 3, name: 'Launch', weightPercent: 20, completed: false, progressPercent: 0, status: 'not_started' },
    ],
  }

  it('explains when there are no milestones', () => {
    renderWithProviders(<CompletionBar completion={{ ...completion, percent: null }} />)
    expect(screen.getByText(/No milestones yet/)).toBeInTheDocument()
  })

  it('draws one segment per milestone without a legend', () => {
    renderWithProviders(<CompletionBar completion={completion} />)
    const bar = screen.getByRole('progressbar', { name: '1 of 3 milestones complete' })
    expect(bar).toHaveAttribute('aria-valuenow', '60')
    expect(screen.getByTitle('Design · 30% of the project · Complete')).toHaveClass('is-complete')
    expect(screen.getByTitle('Build · 50% of the project · In progress · 55%')).toBeInTheDocument()
    expect(screen.getByTitle('Launch · 20% of the project · Not started')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('lists each milestone in the legend', () => {
    renderWithProviders(<CompletionBar completion={completion} legend />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByRole('link', { name: 'Design' })).toHaveAttribute('href', '/milestones/1')
    expect(items[1]).toHaveClass('muted')
    expect(items[1]).toHaveTextContent('In progress · 55%')
  })

  it('falls back to the raw status for unknown values', () => {
    const odd = { ...completion, segments: [{ ...completion.segments[2], status: 'weird' }] }
    renderWithProviders(<CompletionBar completion={odd} />)
    expect(screen.getByTitle('Launch · 20% of the project · weird')).toBeInTheDocument()
  })
})

describe('BudgetCard', () => {
  const base = {
    budget: 10000,
    spent: 2500,
    remaining: 7500,
    spentPercent: 25,
    hoursLogged: 40,
    timeElapsedPercent: 20,
    projectedCost: 12500,
    variance: { amount: 2500, percent: 25, direction: 'over' },
    assumptions: { hoursPerYear: 2080, employeesWithoutSalary: 0 },
  }

  it('shows an over-budget verdict and the stats', () => {
    renderWithProviders(<BudgetCard budget={base} />)
    expect(screen.getByText('25% over budget')).toHaveClass('budget-over')
    expect(screen.getByText('$10,000')).toBeInTheDocument()
    expect(screen.getByText('$2,500')).toBeInTheDocument()
    expect(screen.getByText('· 25%')).toBeInTheDocument()
    expect(screen.getByText('Remaining')).toBeInTheDocument()
    expect(screen.getByText('$7,500')).toBeInTheDocument()
    expect(screen.getByText('$12,500')).toHaveClass('tone-over')
    expect(screen.getByRole('progressbar', { name: 'Share of budget spent' })).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByText(/20% of the schedule elapsed/)).toBeInTheDocument()
    expect(screen.getByText(/40 h logged/)).toBeInTheDocument()
    expect(screen.queryByText(/no salary on file/)).not.toBeInTheDocument()
  })

  it('shows under budget and on budget verdicts', () => {
    const { unmount } = renderWithProviders(
      <BudgetCard budget={{ ...base, projectedCost: 8000, variance: { amount: -2000, percent: -20, direction: 'under' } }} />,
    )
    expect(screen.getByText('20% under budget')).toHaveClass('budget-under')
    unmount()
    renderWithProviders(<BudgetCard budget={{ ...base, variance: { amount: 0, percent: 0, direction: 'on_budget' } }} />)
    expect(screen.getByText('On budget')).toBeInTheDocument()
  })

  it('handles overspend, capping the bar at 100%', () => {
    renderWithProviders(<BudgetCard budget={{ ...base, spent: 12000, remaining: -2000, spentPercent: 120 }} />)
    expect(screen.getByText('Over by')).toBeInTheDocument()
    expect(screen.getByText('$2,000')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByRole('progressbar')).toHaveClass('progress-past_end_date')
  })

  it('handles no budget and no projection, and notes missing salaries', () => {
    renderWithProviders(
      <BudgetCard
        budget={{
          ...base,
          budget: null,
          remaining: null,
          spentPercent: null,
          projectedCost: null,
          variance: null,
          assumptions: { hoursPerYear: 2080, employeesWithoutSalary: 2 },
        }}
      />,
    )
    expect(screen.getByText('No budget set')).toHaveClass('budget-neutral')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/A projection needs/)).toBeInTheDocument()
    expect(screen.getByText(/2 employee\(s\) have no salary/)).toBeInTheDocument()
  })

  it('says there is no projection yet when a budget exists but nothing is projected', () => {
    renderWithProviders(<BudgetCard budget={{ ...base, projectedCost: null, variance: null }} />)
    expect(screen.getByText('No projection yet')).toBeInTheDocument()
  })
})

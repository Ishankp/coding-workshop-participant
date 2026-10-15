import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DependencyList from './DependencyList'
import { addDependency, removeDependency } from '../services/milestoneService'
import { apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/milestoneService')

const milestones = [
  { milestoneId: 1, name: 'Design', status: 'completed', timeElapsedPercent: 100, alerts: [] },
  { milestoneId: 2, name: 'Build', status: 'in_progress', timeElapsedPercent: 40, alerts: [] },
  { milestoneId: 3, name: 'Test', status: 'not_started', timeElapsedPercent: null, alerts: [] },
]
const dependencies = [
  { milestoneId: 2, milestoneName: 'Build', dependsOnMilestoneId: 1, dependsOnName: 'Design', dependsOnEndDate: '2026-01-10', dependsOnCompleted: true, alert: null },
  { milestoneId: 3, milestoneName: 'Test', dependsOnMilestoneId: 2, dependsOnName: 'Build', dependsOnEndDate: '2026-02-10', dependsOnCompleted: false, alert: 'Build is past due' },
]

describe('DependencyList', () => {
  let onChanged
  beforeEach(() => {
    onChanged = vi.fn().mockResolvedValue()
  })

  it('shows a read-only message with no dependencies', () => {
    renderWithProviders(<DependencyList milestones={milestones} dependencies={[]} canEdit={false} onChanged={onChanged} />)
    expect(screen.getByText('No dependencies between milestones.')).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Add a dependency' })).not.toBeInTheDocument()
  })

  it('renders the graph, alerts and a hidden text list for viewers', () => {
    const { container } = renderWithProviders(<DependencyList milestones={milestones} dependencies={dependencies} canEdit={false} onChanged={onChanged} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Test is held up: Build is past due.')
    expect(container.querySelector('.dependency-list')).toHaveClass('visually-hidden')
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByText('Past due')).toBeInTheDocument()
  })

  it('shows due dates for pending prerequisites', () => {
    const pending = [{ ...dependencies[1], alert: null }]
    renderWithProviders(<DependencyList milestones={milestones} dependencies={pending} canEdit onChanged={onChanged} />)
    expect(screen.getByText(/Due .*Feb 10, 2026/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1)
  })

  it('adds a dependency', async () => {
    vi.mocked(addDependency).mockResolvedValue({})
    renderWithProviders(<DependencyList milestones={milestones} dependencies={[]} canEdit onChanged={onChanged} />)
    expect(screen.getByText('No dependencies between milestones yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('Choose both milestones')).toBeInTheDocument()
    expect(addDependency).not.toHaveBeenCalled()

    await userEvent.selectOptions(screen.getByLabelText('Milestone'), '3')
    expect(screen.queryByText('Choose both milestones')).not.toBeInTheDocument()
    const prerequisite = screen.getByLabelText('Prerequisite milestone')
    expect(within(prerequisite).queryByRole('option', { name: 'Test' })).not.toBeInTheDocument()
    await userEvent.selectOptions(prerequisite, '2')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(addDependency).toHaveBeenCalledWith(3, 2)
    expect(onChanged).toHaveBeenCalled()
    expect(screen.getByLabelText('Milestone')).toHaveValue('')
  })

  it('shows a field error from the server, or a banner for other errors', async () => {
    vi.mocked(addDependency).mockRejectedValueOnce(apiError(400, 'Invalid', { dependsOnMilestoneId: 'Would create a loop' }))
    vi.mocked(addDependency).mockRejectedValueOnce(apiError(409, 'Archived project'))
    renderWithProviders(<DependencyList milestones={milestones} dependencies={[]} canEdit onChanged={onChanged} />)
    await userEvent.selectOptions(screen.getByLabelText('Milestone'), '1')
    await userEvent.selectOptions(screen.getByLabelText('Prerequisite milestone'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Would create a loop')).toBeInTheDocument()
    expect(screen.getByLabelText('Prerequisite milestone')).toHaveAttribute('aria-describedby', 'dep-error')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Archived project')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('removes a dependency after confirmation', async () => {
    vi.mocked(removeDependency).mockResolvedValue(null)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderWithProviders(<DependencyList milestones={milestones} dependencies={dependencies} canEdit onChanged={onChanged} />)
    const buttons = screen.getAllByRole('button', { name: 'Remove' })
    await userEvent.click(buttons[0])
    expect(confirm).toHaveBeenCalledWith('Remove: Build depends on Design?')
    expect(removeDependency).not.toHaveBeenCalled()
    await userEvent.click(buttons[0])
    expect(removeDependency).toHaveBeenCalledWith(2, 1)
    expect(onChanged).toHaveBeenCalled()
  })

  it('reports a failed removal', async () => {
    vi.mocked(removeDependency).mockRejectedValue(apiError(500, 'Boom'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithProviders(<DependencyList milestones={milestones} dependencies={dependencies} canEdit onChanged={onChanged} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect((await screen.findAllByRole('alert')).some((el) => el.textContent.includes('Boom'))).toBe(true)
  })

  it('hides the add form with fewer than two milestones', () => {
    renderWithProviders(<DependencyList milestones={milestones.slice(0, 1)} dependencies={[]} canEdit onChanged={onChanged} />)
    expect(screen.queryByRole('heading', { name: 'Add a dependency' })).not.toBeInTheDocument()
  })
})

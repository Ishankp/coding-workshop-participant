import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MilestoneForm from './MilestoneForm'
import { createMilestone } from '../services/projectService'
import { updateMilestone } from '../services/milestoneService'
import { apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/projectService')
vi.mock('../services/milestoneService')

const project = { projectId: 1, startDate: '2026-01-01', endDate: '2026-12-31' }

describe('MilestoneForm', () => {
  let onSaved, onCancel
  beforeEach(() => {
    onSaved = vi.fn()
    onCancel = vi.fn()
  })

  it('creates a milestone inside the project dates', async () => {
    vi.mocked(createMilestone).mockResolvedValue({ milestoneId: 5 })
    renderWithProviders(<MilestoneForm project={project} onSaved={onSaved} onCancel={onCancel} />)
    expect(screen.getByRole('heading', { name: 'New milestone' })).toBeInTheDocument()
    expect(screen.getByText(/Dates must stay within the project: from .*Jan 1, 2026.* to .*Dec 31, 2026/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Title/), ' Design ')
    await userEvent.type(screen.getByLabelText('Description'), '  ')
    await userEvent.type(screen.getByLabelText('Start date'), '2026-02-01')
    await userEvent.type(screen.getByLabelText('End date'), '2026-03-01')
    await userEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(createMilestone).toHaveBeenCalledWith(1, { title: 'Design', description: null, startDate: '2026-02-01', endDate: '2026-03-01' })
    expect(onSaved).toHaveBeenCalledWith({ milestoneId: 5 })
  })

  it('rejects dates outside the project and an end before the start', async () => {
    renderWithProviders(<MilestoneForm project={project} onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.type(screen.getByLabelText('Start date'), '2025-12-01')
    await userEvent.type(screen.getByLabelText('End date'), '2025-11-01')
    await userEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(screen.getByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText(/Can't be before the project starts/)).toBeInTheDocument()
    expect(screen.getByText('Must be on or after the start date')).toBeInTheDocument()
    expect(createMilestone).not.toHaveBeenCalled()
  })

  it('rejects an end date after the project and a start after the project', async () => {
    renderWithProviders(<MilestoneForm project={project} onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'T')
    await userEvent.type(screen.getByLabelText('Start date'), '2027-01-05')
    await userEvent.type(screen.getByLabelText('End date'), '2027-02-01')
    await userEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(screen.getAllByText(/Can't be after the project ends/)).toHaveLength(2)
  })

  it('flags an end date before the project start when the start is empty', async () => {
    renderWithProviders(<MilestoneForm project={project} onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'T')
    await userEvent.type(screen.getByLabelText('End date'), '2025-06-01')
    await userEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(screen.getByText(/Can't be before the project starts/)).toBeInTheDocument()
  })

  it('works for a project without dates', async () => {
    vi.mocked(createMilestone).mockResolvedValue({})
    renderWithProviders(<MilestoneForm project={{ projectId: 2, startDate: null, endDate: null }} onSaved={onSaved} onCancel={onCancel} />)
    expect(screen.queryByText(/Dates must stay within/)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Title/), 'Free')
    await userEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(createMilestone).toHaveBeenCalledWith(2, { title: 'Free', description: null, startDate: null, endDate: null })
  })

  it('edits an existing milestone', async () => {
    vi.mocked(updateMilestone).mockResolvedValue({ milestoneId: 3, name: 'Edited' })
    const milestone = { milestoneId: 3, name: 'Old', description: 'Desc', startDate: null, endDate: null }
    renderWithProviders(<MilestoneForm project={project} milestone={milestone} onSaved={onSaved} onCancel={onCancel} />)
    expect(screen.getByRole('heading', { name: 'Edit milestone' })).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toHaveValue('Desc')
    await userEvent.clear(screen.getByLabelText(/Title/))
    await userEvent.type(screen.getByLabelText(/Title/), 'Edited')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updateMilestone).toHaveBeenCalledWith(3, { title: 'Edited', description: 'Desc', startDate: null, endDate: null })
    expect(onSaved).toHaveBeenCalledWith({ milestoneId: 3, name: 'Edited' })
  })

  it('shows server field errors and banner errors', async () => {
    vi.mocked(createMilestone).mockRejectedValueOnce(apiError(400, 'Invalid', { endDate: 'Outside project' }))
    vi.mocked(createMilestone).mockRejectedValueOnce(apiError(409, 'Project is archived'))
    renderWithProviders(<MilestoneForm project={project} onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'T')
    await userEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(await screen.findByText('Outside project')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Project is archived')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('cancels', async () => {
    renderWithProviders(<MilestoneForm project={project} onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

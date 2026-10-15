import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectForm from './ProjectForm'
import { createProject, updateProject } from '../services/projectService'
import { apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/projectService')

describe('ProjectForm', () => {
  let onSaved, onCancel
  beforeEach(() => {
    onSaved = vi.fn()
    onCancel = vi.fn()
  })

  it('creates a project with trimmed title and null optional fields', async () => {
    vi.mocked(createProject).mockResolvedValue({ projectId: 9, title: 'New' })
    renderWithProviders(<ProjectForm onSaved={onSaved} onCancel={onCancel} />)
    expect(screen.getByRole('heading', { name: 'New project' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Title/), '  New  ')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(createProject).toHaveBeenCalledWith({ title: 'New', startDate: null, endDate: null, budget: null })
    expect(onSaved).toHaveBeenCalledWith({ projectId: 9, title: 'New' })
  })

  it('sends dates and a numeric budget', async () => {
    vi.mocked(createProject).mockResolvedValue({})
    renderWithProviders(<ProjectForm onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'Dated')
    await userEvent.type(screen.getByLabelText('Start date'), '2026-01-01')
    await userEvent.type(screen.getByLabelText('End date'), '2026-02-01')
    await userEvent.type(screen.getByLabelText('Budget (USD)'), '1500.5')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(createProject).toHaveBeenCalledWith({ title: 'Dated', startDate: '2026-01-01', endDate: '2026-02-01', budget: 1500.5 })
  })

  it('validates locally before calling the API', async () => {
    renderWithProviders(<ProjectForm onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.type(screen.getByLabelText('Start date'), '2026-02-01')
    await userEvent.type(screen.getByLabelText('End date'), '2026-01-01')
    await userEvent.type(screen.getByLabelText('Budget (USD)'), '-5')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(screen.getByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Must be on or after the start date')).toBeInTheDocument()
    expect(screen.getByText("Can't be negative")).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Title/)).toHaveAttribute('aria-describedby', 'project-title-error')
    expect(createProject).not.toHaveBeenCalled()

    // Typing in a field clears its error
    await userEvent.type(screen.getByLabelText(/Title/), 'x')
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument()
  })

  it('edits an existing project', async () => {
    vi.mocked(updateProject).mockResolvedValue({ projectId: 1, title: 'Renamed' })
    const project = { projectId: 1, title: 'Old', startDate: '2026-01-01', endDate: null, budget: 500 }
    renderWithProviders(<ProjectForm project={project} onSaved={onSaved} onCancel={onCancel} />)
    expect(screen.getByRole('heading', { name: 'Edit project' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/)).toHaveValue('Old')
    expect(screen.getByLabelText('Budget (USD)')).toHaveValue(500)
    await userEvent.clear(screen.getByLabelText(/Title/))
    await userEvent.type(screen.getByLabelText(/Title/), 'Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updateProject).toHaveBeenCalledWith(1, { title: 'Renamed', startDate: '2026-01-01', endDate: null, budget: 500 })
    expect(onSaved).toHaveBeenCalledWith({ projectId: 1, title: 'Renamed' })
  })

  it('shows server field errors next to the field', async () => {
    vi.mocked(createProject).mockRejectedValue(apiError(400, 'Invalid', { title: 'Already used' }))
    renderWithProviders(<ProjectForm onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'Dup')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('Already used')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled()
  })

  it('shows other server errors in a banner', async () => {
    vi.mocked(createProject).mockRejectedValue(apiError(409, 'Conflict here'))
    renderWithProviders(<ProjectForm onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'X')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflict here')
  })

  it('disables the form while saving and cancels', async () => {
    let resolve
    vi.mocked(createProject).mockReturnValue(new Promise((r) => (resolve = r)))
    renderWithProviders(<ProjectForm onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.type(screen.getByLabelText(/Title/), 'X')
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByLabelText(/Title/)).toBeDisabled()
    resolve({ projectId: 1 })
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ projectId: 1 }))
  })

  it('cancels', async () => {
    renderWithProviders(<ProjectForm onSaved={onSaved} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

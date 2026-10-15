import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectsPage from './ProjectsPage'
import { createProject, listProjects } from '../services/projectService'
import { ADMIN, EMPLOYEE, MANAGER, apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/projectService')

const COMPLETION = {
  percent: 50,
  completedMilestones: 1,
  totalMilestones: 2,
  segments: [
    { milestoneId: 1, name: 'Design', weightPercent: 50, completed: true, progressPercent: 100, status: 'completed' },
    { milestoneId: 2, name: 'Build', weightPercent: 50, completed: false, progressPercent: 20, status: 'in_progress' },
  ],
}
const NO_MILESTONES = { percent: null, completedMilestones: 0, totalMilestones: 0, segments: [] }

const PROJECTS = [
  { projectId: 1, title: 'Alpha', startDate: '2026-01-01', endDate: '2026-12-31', archivedAt: null, completedAt: null, timeElapsedPercent: 40, daysLeft: 12, completion: COMPLETION },
  { projectId: 2, title: 'Beta', startDate: null, endDate: null, archivedAt: null, completedAt: '2026-05-01', timeElapsedPercent: null, daysLeft: null, completion: COMPLETION },
  { projectId: 3, title: 'Gamma', startDate: null, endDate: null, archivedAt: '2026-06-01', completedAt: null, timeElapsedPercent: null, daysLeft: -3, completion: NO_MILESTONES },
]

function renderPage(options = {}) {
  return renderWithProviders(<ProjectsPage />, { route: '/', path: '/', ...options })
}

describe('ProjectsPage', () => {
  it('shows a loading state then the project cards', async () => {
    vi.mocked(listProjects).mockResolvedValue(PROJECTS)
    renderPage({ user: MANAGER })
    expect(screen.getByRole('heading', { name: 'Welcome, Maria' })).toBeInTheDocument()
    expect(screen.getByText("Projects you're a member of")).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects…')

    const alpha = await screen.findByRole('link', { name: /Alpha/ })
    expect(alpha).toHaveAttribute('href', '/projects/1')
    expect(alpha).toHaveTextContent('Active')
    expect(alpha).toHaveTextContent('1 of 2 milestones complete · 12 days left')

    const beta = screen.getByRole('link', { name: /Beta/ })
    expect(beta).toHaveTextContent('Completed')
    expect(beta).toHaveTextContent('1 of 2 milestones complete')
    expect(beta).not.toHaveTextContent('left')

    const gamma = screen.getByRole('link', { name: /Gamma/ })
    expect(gamma).toHaveTextContent('Archived')
    expect(gamma).toHaveTextContent("No milestones yet, so completion can't be measured.")
    expect(gamma).not.toHaveTextContent('milestones complete')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(listProjects).toHaveBeenCalledWith('')
  })

  it('greets by username when there is no first name and hides creation from employees', async () => {
    vi.mocked(listProjects).mockResolvedValue([])
    renderPage({ user: { ...EMPLOYEE, firstName: '' } })
    expect(screen.getByRole('heading', { name: 'Welcome, priya' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ New project' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'No projects yet' })).toBeInTheDocument()
    expect(screen.getByText(/You aren't assigned to any projects/)).toBeInTheDocument()
  })

  it('shows the admin view and empty message', async () => {
    vi.mocked(listProjects).mockResolvedValue([])
    renderPage({ user: ADMIN })
    expect(screen.getByText('All projects (admin view)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ New project' })).toBeInTheDocument()
    expect(await screen.findByText('No projects have been created yet.')).toBeInTheDocument()
  })

  it('reads the query from the URL and reports no matches', async () => {
    vi.mocked(listProjects).mockResolvedValue([])
    renderPage({ route: '/?q=zzz' })
    expect(await screen.findByText('No projects match “zzz”.')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('heading', { name: 'No projects yet' })).not.toBeInTheDocument()
    expect(listProjects).toHaveBeenCalledWith('zzz')
  })

  it('searches again after typing in the search box', async () => {
    const user = userEvent.setup()
    vi.mocked(listProjects).mockResolvedValueOnce(PROJECTS).mockResolvedValueOnce([PROJECTS[0]])
    renderPage()
    await screen.findByRole('link', { name: /Beta/ })
    await user.type(screen.getByRole('searchbox'), 'alp')
    await waitFor(() => expect(listProjects).toHaveBeenCalledWith('alp'))
    await waitFor(() => expect(screen.queryByRole('link', { name: /Beta/ })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: /Alpha/ })).toBeInTheDocument()
  })

  it('shows a friendly 403 without retry', async () => {
    vi.mocked(listProjects).mockRejectedValue(apiError(403, 'Forbidden'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('No access')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('shows a generic error and retries on demand', async () => {
    const user = userEvent.setup()
    vi.mocked(listProjects).mockRejectedValueOnce(apiError(500, 'Boom')).mockResolvedValueOnce(PROJECTS)
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /Alpha/ })).toBeInTheDocument()
    expect(listProjects).toHaveBeenCalledTimes(2)
  })

  it('opens and cancels the new project form', async () => {
    const user = userEvent.setup()
    vi.mocked(listProjects).mockResolvedValue(PROJECTS)
    renderPage({ user: MANAGER })
    await user.click(screen.getByRole('button', { name: '+ New project' }))
    expect(screen.getByRole('heading', { name: 'New project' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ New project' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { name: 'New project' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ New project' })).toBeInTheDocument()
  })

  it('navigates to the new project after creating it', async () => {
    const user = userEvent.setup()
    vi.mocked(listProjects).mockResolvedValue(PROJECTS)
    vi.mocked(createProject).mockResolvedValue({ projectId: 42, title: 'Delta' })
    renderPage({ user: ADMIN })
    await screen.findByRole('link', { name: /Alpha/ })
    await user.click(screen.getByRole('button', { name: '+ New project' }))
    await user.type(screen.getByLabelText(/Title/), 'Delta')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ title: 'Delta', startDate: null, endDate: null, budget: null }))
    // Leaving "/" unmounts the page (nothing is mounted at /projects/42 in this test)
    await waitFor(() => expect(screen.queryByRole('heading', { name: /Welcome/ })).not.toBeInTheDocument())
  })
})

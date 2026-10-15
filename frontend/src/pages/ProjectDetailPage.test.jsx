import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectDetailPage from './ProjectDetailPage'
import {
  archiveProject,
  deleteProject,
  getProject,
  getProjectBudget,
  getProjectMilestones,
  unarchiveProject,
} from '../services/projectService'
import { ADMIN, EMPLOYEE, MANAGER, apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/projectService')

// Children that load their own data or submit forms are stubbed; the page's own wiring is what's under test.
vi.mock('../components/TeamManager', () => ({
  default: ({ projectId, milestones, onChanged }) => (
    <div data-testid="team-manager">
      team for {projectId} with {milestones.length} milestones
      <button type="button" onClick={onChanged}>team-changed</button>
    </div>
  ),
}))
vi.mock('../components/DependencyList', () => ({
  default: ({ dependencies, canEdit, onChanged }) => (
    <div data-testid="dependency-list">
      {dependencies.length} deps, canEdit={String(canEdit)}
      <button type="button" onClick={onChanged}>deps-changed</button>
    </div>
  ),
}))
vi.mock('../components/ProjectForm', () => ({
  default: ({ project, onSaved, onCancel }) => (
    <div data-testid="project-form">
      editing {project.title}
      <button type="button" onClick={() => onSaved(project)}>save-project</button>
      <button type="button" onClick={onCancel}>cancel-project</button>
    </div>
  ),
}))
vi.mock('../components/MilestoneForm', () => ({
  default: ({ project, onSaved, onCancel }) => (
    <div data-testid="milestone-form">
      new milestone for {project.title}
      <button type="button" onClick={() => onSaved({ milestoneId: 9 })}>save-milestone</button>
      <button type="button" onClick={onCancel}>cancel-milestone</button>
    </div>
  ),
}))

const COMPLETION = {
  percent: 50,
  completedMilestones: 1,
  totalMilestones: 2,
  segments: [
    { milestoneId: 1, name: 'Design', weightPercent: 50, completed: true, progressPercent: 100, status: 'completed' },
    { milestoneId: 2, name: 'Build', weightPercent: 50, completed: false, progressPercent: 20, status: 'in_progress' },
  ],
}

const PROJECT = {
  projectId: 7,
  title: 'Alpha',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  budget: 10000,
  archivedAt: null,
  completedAt: null,
  timeElapsedPercent: 40,
  daysLeft: 12,
  completion: COMPLETION,
}

const MILESTONE = {
  milestoneId: 1,
  name: 'Design',
  startDate: '2026-01-01',
  endDate: '2026-03-01',
  completedAt: '2026-02-20',
  timeElapsedPercent: 100,
  daysLeft: -10,
  status: 'completed',
  employees: [{ employeeId: 3, name: 'Priya Patel', username: 'priya' }],
  dependsOn: [],
  alerts: [],
}

const MILESTONES = {
  milestones: [MILESTONE, { ...MILESTONE, milestoneId: 2, name: 'Build', completedAt: null, status: 'in_progress', timeElapsedPercent: 20, daysLeft: 30, employees: [] }],
  dependencies: [{ milestoneId: 2, milestoneName: 'Build', dependsOnMilestoneId: 1, dependsOnName: 'Design', dependsOnEndDate: '2026-03-01', dependsOnCompleted: true, alert: null }],
  unassignedEmployees: [],
}

const BUDGET = {
  budget: 10000,
  spent: 2000,
  remaining: 8000,
  spentPercent: 20,
  hoursLogged: 40,
  timeElapsedPercent: 40,
  projectedCost: 5000,
  variance: { amount: -5000, percent: 50, direction: 'under' },
  assumptions: { hoursPerYear: 2080, employeesWithoutSalary: 0 },
}

function mockLoad({ project = PROJECT, milestones = MILESTONES, budget = BUDGET } = {}) {
  vi.mocked(getProject).mockResolvedValue(project)
  vi.mocked(getProjectMilestones).mockResolvedValue(milestones)
  vi.mocked(getProjectBudget).mockResolvedValue(budget)
}

function renderPage(options = {}) {
  return renderWithProviders(<ProjectDetailPage />, { route: '/projects/7', path: '/projects/:projectId', ...options })
}

async function renderLoaded(options) {
  const result = renderPage(options)
  await screen.findByRole('heading', { name: 'Alpha' })
  return result
}

describe('ProjectDetailPage', () => {
  it('shows a loading state then the project for a manager', async () => {
    mockLoad()
    renderPage({ user: MANAGER })
    expect(screen.getByRole('status')).toHaveTextContent('Loading project…')
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument()

    expect(getProject).toHaveBeenCalledWith('7')
    expect(getProjectMilestones).toHaveBeenCalledWith('7')
    expect(getProjectBudget).toHaveBeenCalledWith('7')
    expect(screen.getByRole('link', { name: '← Projects' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive project' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    // One "Budget" term in the project details, one in the budget card
    expect(screen.getAllByText('Budget', { selector: 'dt' })).toHaveLength(2)
    expect(screen.getAllByText('$10,000').length).toBeGreaterThan(0)
    expect(screen.queryByText('Completed', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.queryByText('Archived', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.getByText('1 of 2 milestones complete')).toBeInTheDocument()
    expect(screen.getByText(/Schedule: 40% of the planned time used · 12 days left/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Budget vs spend' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Milestones (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a milestone' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument()
    expect(screen.getByTestId('team-manager')).toHaveTextContent('team for 7 with 2 milestones')
    expect(screen.queryByText(/Not assigned to a milestone/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dependencies (1)' })).toBeInTheDocument()
    expect(screen.getByTestId('dependency-list')).toHaveTextContent('1 deps, canEdit=true')
  })

  it('gives admins a delete button', async () => {
    mockLoad()
    await renderLoaded({ user: ADMIN })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('hides budget, team management and editing from employees', async () => {
    mockLoad({ milestones: { ...MILESTONES, unassignedEmployees: [{ employeeId: 5, name: 'Sam Lee', username: 'sam' }] } })
    await renderLoaded({ user: EMPLOYEE })
    expect(getProjectBudget).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Archive project/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Budget', { selector: 'dt' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Budget vs spend' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a milestone' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('team-manager')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Not assigned to a milestone (1)' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sam Lee' })).toHaveAttribute('href', '/employees/5')
    expect(screen.getByTestId('dependency-list')).toHaveTextContent('canEdit=false')
  })

  it('tells employees when everyone has a milestone', async () => {
    mockLoad()
    await renderLoaded({ user: EMPLOYEE })
    expect(screen.getByRole('heading', { name: 'Not assigned to a milestone (0)' })).toBeInTheDocument()
    expect(screen.getByText('Every project member is working on at least one milestone.')).toBeInTheDocument()
  })

  it('shows completed and archived details, and handles unmeasurable progress', async () => {
    mockLoad({
      project: {
        ...PROJECT,
        completedAt: '2026-05-01',
        archivedAt: '2026-06-01',
        timeElapsedPercent: null,
        completion: { percent: null, completedMilestones: 0, totalMilestones: 0, segments: [] },
      },
    })
    await renderLoaded({ user: MANAGER })
    expect(screen.getByText('Archived', { selector: '.status-badge' })).toBeInTheDocument()
    expect(screen.getByText(/^Archived .*Employees can't see this project/)).toBeInTheDocument()
    expect(screen.getByText('Completed', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('Archived', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore project' })).toBeInTheDocument()
    expect(screen.queryByText(/milestones complete/)).not.toBeInTheDocument()
    expect(screen.getByText("No milestones yet, so completion can't be measured.")).toBeInTheDocument()
    expect(screen.queryByText(/Schedule:/)).not.toBeInTheDocument()
  })

  it('shows a friendly 404 when the project does not exist', async () => {
    vi.mocked(getProject).mockRejectedValue(apiError(404, 'Project not found'))
    vi.mocked(getProjectMilestones).mockResolvedValue(MILESTONES)
    vi.mocked(getProjectBudget).mockResolvedValue(BUDGET)
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found')
    expect(screen.getByRole('link', { name: 'Back to my projects' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('shows a generic error with retry', async () => {
    const user = userEvent.setup()
    vi.mocked(getProject).mockRejectedValueOnce(apiError(500, 'Database down')).mockResolvedValueOnce(PROJECT)
    vi.mocked(getProjectMilestones).mockResolvedValue(MILESTONES)
    vi.mocked(getProjectBudget).mockResolvedValue(BUDGET)
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Database down')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
    expect(getProject).toHaveBeenCalledTimes(2)
  })

  it('opens the edit form, then closes it on cancel', async () => {
    const user = userEvent.setup()
    mockLoad()
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('project-form')).toHaveTextContent('editing Alpha')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'cancel-project' }))
    expect(screen.queryByTestId('project-form')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(getProject).toHaveBeenCalledTimes(1)
  })

  it('closes the edit form and reloads after saving', async () => {
    const user = userEvent.setup()
    mockLoad()
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'save-project' }))
    await waitFor(() => expect(getProject).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByTestId('project-form')).not.toBeInTheDocument()
  })

  it('opens the milestone form, cancels it, and reloads after saving', async () => {
    const user = userEvent.setup()
    mockLoad()
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Add a milestone' }))
    expect(screen.getByTestId('milestone-form')).toHaveTextContent('new milestone for Alpha')
    expect(screen.queryByRole('button', { name: 'Add a milestone' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'cancel-milestone' }))
    expect(screen.queryByTestId('milestone-form')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add a milestone' }))
    await user.click(screen.getByRole('button', { name: 'save-milestone' }))
    await waitFor(() => expect(getProject).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Add a milestone' })).toBeInTheDocument()
    expect(screen.queryByTestId('milestone-form')).not.toBeInTheDocument()
  })

  it('reloads when the team or dependencies change', async () => {
    const user = userEvent.setup()
    mockLoad()
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'team-changed' }))
    await waitFor(() => expect(getProjectMilestones).toHaveBeenCalledTimes(2))
    await screen.findByRole('button', { name: 'deps-changed' })
    await user.click(screen.getByRole('button', { name: 'deps-changed' }))
    await waitFor(() => expect(getProjectMilestones).toHaveBeenCalledTimes(3))
  })

  it('archives the project after confirming', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockLoad()
    vi.mocked(archiveProject).mockResolvedValue({ projectId: 7, title: 'Alpha', archivedAt: '2026-06-01' })
    await renderLoaded({ user: MANAGER })
    vi.mocked(getProject).mockResolvedValue({ ...PROJECT, archivedAt: '2026-06-01' })
    await user.click(screen.getByRole('button', { name: 'Archive project' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^Archive "Alpha"\?/))
    expect(archiveProject).toHaveBeenCalledWith(7)
    expect(unarchiveProject).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Restore project' })).toBeInTheDocument()
    expect(getProject).toHaveBeenCalledTimes(2)
  })

  it('restores an archived project after confirming', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockLoad({ project: { ...PROJECT, archivedAt: '2026-06-01' } })
    vi.mocked(unarchiveProject).mockResolvedValue({ projectId: 7, title: 'Alpha', archivedAt: null })
    await renderLoaded({ user: ADMIN })
    vi.mocked(getProject).mockResolvedValue(PROJECT)
    await user.click(screen.getByRole('button', { name: 'Restore project' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^Restore "Alpha"\?/))
    expect(unarchiveProject).toHaveBeenCalledWith(7)
    expect(archiveProject).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Archive project' })).toBeInTheDocument()
  })

  it('does nothing when archiving is not confirmed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockLoad()
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Archive project' }))
    expect(archiveProject).not.toHaveBeenCalled()
    expect(getProject).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a busy state and then the error when archiving fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockLoad()
    let reject
    vi.mocked(archiveProject).mockImplementation(() => new Promise((_, r) => { reject = r }))
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Archive project' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    reject(apiError(409, 'Hours are still logged'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Hours are still logged')
    expect(screen.getByRole('button', { name: 'Archive project' })).toBeEnabled()
    expect(getProject).toHaveBeenCalledTimes(1)
  })

  it('deletes the project after confirming and goes home', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockLoad()
    vi.mocked(deleteProject).mockResolvedValue(null)
    await renderLoaded({ user: ADMIN })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^Permanently delete "Alpha"/))
    expect(deleteProject).toHaveBeenCalledWith(7)
    // Navigating to "/" unmounts the page (nothing is mounted there in this test)
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Alpha' })).not.toBeInTheDocument())
  })

  it('does nothing when deletion is not confirmed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockLoad()
    await renderLoaded({ user: ADMIN })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteProject).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
  })

  it('shows the error and stays on the page when deletion fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockLoad()
    vi.mocked(deleteProject).mockRejectedValue(apiError(409, 'Hours are logged on this project'))
    await renderLoaded({ user: ADMIN })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Hours are logged on this project')
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Archive project' })).toBeEnabled()
  })
})

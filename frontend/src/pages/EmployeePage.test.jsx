import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmployeePage from './EmployeePage'
import { getEmployee } from '../services/employeeService'
import { ADMIN, EMPLOYEE, MANAGER, apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/employeeService')

const employee = (overrides = {}) => ({
  employeeId: 3,
  name: 'Priya Patel',
  username: 'priya',
  email: 'priya@example.com',
  title: 'Engineer',
  role: 'employee',
  isSelf: false,
  canViewTimeLog: true,
  manager: { employeeId: 1, name: 'Maria Garcia' },
  totalHours: 12.5,
  projects: [],
  ...overrides,
})

const projects = [
  {
    projectId: 3,
    title: 'Website',
    status: 'active',
    hoursSpent: 10,
    milestones: [
      {
        milestoneId: 10,
        name: 'Design',
        startDate: '2026-09-01',
        endDate: '2026-09-15',
        hoursSpent: 6,
        timeElapsedPercent: 100,
        daysLeft: -5,
        status: 'completed',
        completedAt: '2026-09-14T10:00:00Z',
      },
      {
        milestoneId: 11,
        name: 'Build',
        startDate: '2026-09-16',
        endDate: '2026-10-31',
        hoursSpent: 4,
        timeElapsedPercent: 40,
        daysLeft: 16,
        status: 'in_progress',
        completedAt: null,
      },
      {
        milestoneId: 12,
        name: 'Mystery',
        startDate: null,
        endDate: null,
        hoursSpent: 0,
        timeElapsedPercent: null,
        daysLeft: null,
        status: 'brand_new_status',
        completedAt: null,
      },
    ],
  },
  { projectId: 4, title: 'Old thing', status: 'on_hold', hoursSpent: 2.5, milestones: [] },
]

function renderPage(user = MANAGER) {
  return renderWithProviders(<EmployeePage />, { user, route: '/employees/3', path: '/employees/:employeeId' })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('EmployeePage loading and errors', () => {
  it('shows a loading state, then the employee', async () => {
    vi.mocked(getEmployee).mockResolvedValue(employee())
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading employee…')
    expect(await screen.findByRole('heading', { level: 1, name: 'Priya Patel' })).toBeInTheDocument()
    expect(getEmployee).toHaveBeenCalledWith('3')
  })

  it('shows a friendly 403 from the server', async () => {
    vi.mocked(getEmployee).mockRejectedValue(apiError(403, 'You do not share a project with this employee'))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
    expect(screen.getByText('You do not share a project with this employee')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to my projects' })).toBeInTheDocument()
  })

  it('shows a generic error and retries', async () => {
    vi.mocked(getEmployee).mockRejectedValueOnce(apiError(500, 'Boom')).mockResolvedValueOnce(employee())
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Priya Patel' })).toBeInTheDocument()
    expect(getEmployee).toHaveBeenCalledTimes(2)
  })
})

describe('EmployeePage profile', () => {
  it('shows the profile details for someone else, as a manager', async () => {
    vi.mocked(getEmployee).mockResolvedValue(employee())
    renderPage(MANAGER)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('employee')).toBeInTheDocument()
    expect(screen.queryByText('You')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Time log' })).toHaveAttribute('href', '/employees/3/time-log')
    expect(screen.getByText('Engineer')).toBeInTheDocument()
    expect(screen.getByText('priya')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'priya@example.com' })).toHaveAttribute('href', 'mailto:priya@example.com')
    expect(screen.getByRole('link', { name: 'Maria Garcia' })).toHaveAttribute('href', '/employees/1')
    expect(screen.getByText('Hours on shared projects')).toBeInTheDocument()
    expect(screen.getByText('12.5 h')).toBeInTheDocument()
    expect(screen.getByText(/Only projects you.re also a member of are shown/)).toBeInTheDocument()
    expect(screen.getByText('Not assigned to any projects.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Projects (0)' })).toBeInTheDocument()
  })

  it('shows "You" and "My time log" for your own profile', async () => {
    vi.mocked(getEmployee).mockResolvedValue(employee({ isSelf: true }))
    renderPage(EMPLOYEE)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My time log' })).toBeInTheDocument()
    expect(screen.getByText('Total hours')).toBeInTheDocument()
    expect(screen.queryByText(/Only projects you/)).not.toBeInTheDocument()
  })

  it('hides the time log link when not allowed, and dashes a missing manager and title', async () => {
    vi.mocked(getEmployee).mockResolvedValue(employee({ canViewTimeLog: false, manager: null, title: null }))
    renderPage(EMPLOYEE)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('link', { name: /time log/i })).not.toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('Engineer')).not.toBeInTheDocument()
    expect(screen.getByText('Hours on shared projects')).toBeInTheDocument()
  })

  it('shows total hours and no shared-projects hint for admins', async () => {
    vi.mocked(getEmployee).mockResolvedValue(employee())
    renderPage(ADMIN)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('Total hours')).toBeInTheDocument()
    expect(screen.queryByText(/Only projects you/)).not.toBeInTheDocument()
  })

  it('goes back when the back button is clicked', async () => {
    vi.mocked(getEmployee).mockResolvedValue(employee())
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '← Back' }))
    // Nothing to go back to in a fresh MemoryRouter; the page just stays put
    expect(screen.getByRole('heading', { level: 1, name: 'Priya Patel' })).toBeInTheDocument()
  })
})

describe('EmployeePage projects and milestones', () => {
  it('lists projects with their status and milestones', async () => {
    vi.mocked(getEmployee).mockResolvedValue(employee({ projects }))
    renderPage()
    await screen.findByRole('heading', { name: 'Projects (2)' })
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('href', '/projects/3')
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('on_hold')).toBeInTheDocument()
    expect(screen.getByText('10 h logged across its milestones')).toBeInTheDocument()
    expect(screen.getByText('No milestones assigned in this project.')).toBeInTheDocument()

    const design = screen.getByRole('link', { name: 'Design' }).closest('li')
    expect(within(design).getByText('Completed', { selector: '.status-badge' })).toBeInTheDocument()
    expect(within(design).getByText('Sep 14, 2026')).toBeInTheDocument()
    expect(within(design).queryByRole('progressbar')).not.toBeInTheDocument()

    const build = screen.getByRole('link', { name: 'Build' }).closest('li')
    expect(within(build).getByText('In progress')).toBeInTheDocument()
    expect(within(build).getByText('16 days left')).toBeInTheDocument()
    expect(within(build).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')

    const mystery = screen.getByRole('link', { name: 'Mystery' }).closest('li')
    expect(within(mystery).getByText('brand_new_status')).toBeInTheDocument()
    expect(within(mystery).getByText('Add start and end dates to track time')).toBeInTheDocument()
  })
})

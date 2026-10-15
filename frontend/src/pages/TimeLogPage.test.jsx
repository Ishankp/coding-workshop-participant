import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TimeLogPage from './TimeLogPage'
import { addTimeEntry, deleteTimeEntry, getTimeLog, updateTimeEntry } from '../services/employeeService'
import { EMPLOYEE, MANAGER, apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/employeeService')

// TimeEntryForm is tested on its own; here a stub just drives the page's callbacks.
vi.mock('../components/TimeEntryForm', () => ({
  default: ({ assignments, entry = null, onSubmit, onCancel = null }) => (
    <div data-testid="time-entry-form">
      <h2>{entry ? `Edit entry ${entry.entryId}` : 'Log hours'}</h2>
      <span>{assignments.length} assignments</span>
      <button type="button" onClick={() => onSubmit({ milestoneId: 10, workDate: '2026-10-05', hours: 2 })}>
        Submit entry
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel edit
        </button>
      )}
    </div>
  ),
}))

const entry = (entryId, workDate, hours, overrides = {}) => ({
  entryId,
  workDate,
  hours,
  note: null,
  milestone: { milestoneId: 10, name: 'Design' },
  project: { projectId: 3, title: 'Website' },
  loggedBy: null,
  loggedBySelf: true,
  createdAt: `${workDate}T10:00:00Z`,
  ...overrides,
})

const log = (overrides = {}) => ({
  employee: { employeeId: 3, name: 'Priya Patel', isSelf: false },
  totalHours: 5,
  permissions: { canAdd: true, canDelete: true },
  assignments: [{ milestoneId: 10, milestoneName: 'Design', projectId: 3, projectTitle: 'Website' }],
  entries: [
    entry(1, '2026-10-05', 3, { note: 'Mockups' }),
    entry(2, '2026-10-01', 2, { loggedBySelf: false, loggedBy: { userId: 2, name: 'Maria Garcia', role: 'manager' } }),
  ],
  ...overrides,
})

function renderPage(user = MANAGER) {
  return renderWithProviders(<TimeLogPage />, {
    user,
    route: '/employees/3/time-log',
    path: '/employees/:employeeId/time-log',
  })
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

beforeEach(() => {
  vi.resetAllMocks()
  window.scrollTo = vi.fn()
})

describe('TimeLogPage loading and errors', () => {
  it('shows a loading state, then the log', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log())
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading time log…')
    expect(await screen.findByRole('heading', { level: 1, name: 'Priya Patel’s time log' })).toBeInTheDocument()
    expect(getTimeLog).toHaveBeenCalledWith('3')
  })

  it('shows a friendly 403', async () => {
    vi.mocked(getTimeLog).mockRejectedValue(apiError(403, 'Only the employee, their manager and admins'))
    renderPage(EMPLOYEE)
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument()
    expect(screen.getByText('Only the employee, their manager and admins')).toBeInTheDocument()
  })

  it('shows a generic error and retries', async () => {
    vi.mocked(getTimeLog).mockRejectedValueOnce(apiError(500, 'Boom')).mockResolvedValueOnce(log())
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('time log')
    expect(getTimeLog).toHaveBeenCalledTimes(2)
  })
})

describe('TimeLogPage rendering', () => {
  it("shows someone else's log with the add form and row actions", async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log())
    renderPage()
    await screen.findByRole('heading', { name: 'Entries (2)' })
    expect(screen.getByRole('link', { name: '← Priya Patel' })).toHaveAttribute('href', '/employees/3')
    expect(screen.getByText('5 h total')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Log hours' })).toBeInTheDocument()
    expect(screen.getByText('1 assignments')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Entries (2)' })).toBeInTheDocument()

    const [first, second] = rows()
    expect(within(first).getByText('Oct 5, 2026')).toBeInTheDocument()
    expect(within(first).getByRole('link', { name: 'Website' })).toHaveAttribute('href', '/projects/3')
    expect(within(first).getByRole('link', { name: 'Design' })).toHaveAttribute('href', '/milestones/10')
    expect(within(first).getByText('Mockups')).toBeInTheDocument()
    expect(within(first).getByText('Priya Patel')).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: 'Edit entry for Oct 5, 2026' })).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: 'Remove entry for Oct 5, 2026' })).toBeInTheDocument()

    expect(within(second).getByText('—')).toBeInTheDocument()
    expect(within(second).getByText('Maria Garcia')).toBeInTheDocument()
    expect(within(second).getByText('manager')).toBeInTheDocument()
  })

  it('shows your own log with "You" labels', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(
      log({
        employee: { employeeId: 3, name: 'Priya Patel', isSelf: true },
        permissions: { canAdd: true, canDelete: false },
        entries: [entry(1, '2026-10-05', 3), entry(2, '2026-10-01', 2, { loggedBySelf: false, loggedBy: null })],
      }),
    )
    renderPage(EMPLOYEE)
    expect(await screen.findByRole('heading', { level: 1, name: 'My time log' })).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Entries (2)' })
    expect(screen.getByRole('link', { name: '← My profile' })).toBeInTheDocument()
    const [first, second] = rows()
    expect(within(first).getByText('You')).toBeInTheDocument()
    // Logged by somebody else whose account is gone: a dash and no role badge
    expect(within(second).getAllByText('—')).toHaveLength(2)
    expect(within(second).queryByText('manager')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove entry/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit entry/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Actions')).not.toBeInTheDocument()
  })

  it('explains when you have no assignments to log against', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(
      log({ employee: { employeeId: 3, name: 'Priya Patel', isSelf: true }, assignments: [], entries: [] }),
    )
    renderPage(EMPLOYEE)
    expect(await screen.findByText(/You aren’t assigned to any milestones yet/)).toBeInTheDocument()
    expect(screen.queryByTestId('time-entry-form')).not.toBeInTheDocument()
    expect(screen.getByText('No hours logged yet.')).toBeInTheDocument()
    expect(screen.getByText('0 h total')).toBeInTheDocument()
  })

  it('explains when someone else has no assignments', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log({ assignments: [] }))
    renderPage()
    expect(await screen.findByText(/Priya Patel isn’t assigned to any milestones yet/)).toBeInTheDocument()
  })

  it('hides the add form when adding is not allowed', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log({ permissions: { canAdd: false, canDelete: false } }))
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByTestId('time-entry-form')).not.toBeInTheDocument()
    expect(screen.queryByText(/assigned to any milestones/)).not.toBeInTheDocument()
  })
})

describe('TimeLogPage adding', () => {
  it('adds an entry to the top of the list, sorted by date then id', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log())
    vi.mocked(addTimeEntry).mockResolvedValue(entry(3, '2026-10-05', 2, { note: 'Added' }))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Submit entry' }))
    expect(await screen.findByRole('heading', { name: 'Entries (3)' })).toBeInTheDocument()
    expect(addTimeEntry).toHaveBeenCalledWith('3', { milestoneId: 10, workDate: '2026-10-05', hours: 2 })
    const [first, second] = rows()
    expect(within(first).getByText('Added')).toBeInTheDocument()
    expect(within(second).getByText('Mockups')).toBeInTheDocument()
    expect(screen.getByText('7 h total')).toBeInTheDocument()
  })

  it('sorts an older entry below newer ones', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log())
    vi.mocked(addTimeEntry).mockResolvedValue(entry(3, '2026-09-20', 1, { note: 'Late' }))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Submit entry' }))
    await screen.findByRole('heading', { name: 'Entries (3)' })
    const all = rows()
    expect(within(all[2]).getByText('Late')).toBeInTheDocument()
  })
})

describe('TimeLogPage editing', () => {
  it('opens the edit form in place of the add form, cancels, and scrolls to top', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log())
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit entry for Oct 5, 2026' }))
    expect(screen.getByRole('heading', { name: 'Edit entry 1' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Log hours' })).not.toBeInTheDocument()
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    await user.click(screen.getByRole('button', { name: 'Cancel edit' }))
    expect(screen.queryByRole('heading', { name: 'Edit entry 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Log hours' })).toBeInTheDocument()
  })

  it('saves the edit, replaces the row and re-sorts', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log())
    vi.mocked(updateTimeEntry).mockResolvedValue(entry(1, '2026-09-01', 1.5, { note: 'Moved' }))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit entry for Oct 5, 2026' }))
    await user.click(screen.getByRole('button', { name: 'Submit entry' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit entry 1' })).not.toBeInTheDocument())
    expect(updateTimeEntry).toHaveBeenCalledWith('3', 1, { milestoneId: 10, workDate: '2026-10-05', hours: 2 })
    const [first, second] = rows()
    expect(within(first).getByText('Oct 1, 2026')).toBeInTheDocument()
    expect(within(second).getByText('Moved')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Entries (2)' })).toBeInTheDocument()
    expect(screen.getByText('3.5 h total')).toBeInTheDocument()
  })
})

describe('TimeLogPage removing', () => {
  it('does nothing when not confirmed', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log())
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Entries (2)' })
    await user.click(screen.getByRole('button', { name: 'Remove entry for Oct 5, 2026' }))
    expect(window.confirm).toHaveBeenCalledWith('Remove 3 h on Oct 5, 2026 (Design)?')
    expect(deleteTimeEntry).not.toHaveBeenCalled()
    expect(rows()).toHaveLength(2)
  })

  it('removes the entry and shows Removing… meanwhile', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log())
    let resolve
    vi.mocked(deleteTimeEntry).mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Remove entry for Oct 5, 2026' }))
    const removing = await screen.findByRole('button', { name: 'Remove entry for Oct 5, 2026' })
    expect(removing).toHaveTextContent('Removing…')
    expect(removing).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit entry for Oct 5, 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove entry for Oct 1, 2026' })).toBeEnabled()
    resolve(null)
    expect(await screen.findByRole('heading', { name: 'Entries (1)' })).toBeInTheDocument()
    expect(deleteTimeEntry).toHaveBeenCalledWith('3', 1)
    expect(screen.queryByText('Mockups')).not.toBeInTheDocument()
    expect(screen.getByText('2 h total')).toBeInTheDocument()
  })

  it('shows an error when removing fails', async () => {
    vi.mocked(getTimeLog).mockResolvedValue(log())
    vi.mocked(deleteTimeEntry).mockRejectedValue(apiError(500, 'Could not remove'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Remove entry for Oct 5, 2026' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove')
    expect(rows()).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Remove entry for Oct 5, 2026' })).toBeEnabled()
  })
})

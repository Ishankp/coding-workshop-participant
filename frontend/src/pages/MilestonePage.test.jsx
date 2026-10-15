import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MilestonePage from './MilestonePage'
import {
  archiveMilestone,
  completeMilestone,
  deleteMilestone,
  getMilestone,
  reopenMilestone,
  unarchiveMilestone,
  updateMilestone,
} from '../services/milestoneService'
import { ADMIN, EMPLOYEE, MANAGER, apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/milestoneService')

const milestone = (overrides = {}) => ({
  milestoneId: 7,
  projectId: 3,
  name: 'Design review',
  description: 'Review the designs',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  completedAt: null,
  archivedAt: null,
  projectArchivedAt: null,
  projectStartDate: '2026-08-01',
  projectEndDate: '2026-12-31',
  dependsOn: [],
  requiredBy: [],
  totalHours: 0,
  hoursByEmployee: [],
  entries: [],
  ...overrides,
})

function renderPage(user = MANAGER) {
  return renderWithProviders(<MilestonePage />, { user, route: '/milestones/7', path: '/milestones/:milestoneId' })
}

/** A promise the test resolves by hand, to observe in-flight UI. */
function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('MilestonePage loading and errors', () => {
  it('shows a loading state, then the milestone', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading milestone…')
    expect(await screen.findByRole('heading', { level: 1, name: 'Design review' })).toBeInTheDocument()
    expect(getMilestone).toHaveBeenCalledWith('7')
    expect(screen.getByRole('link', { name: '← Back to project' })).toHaveAttribute('href', '/projects/3')
  })

  it('shows a friendly 404', async () => {
    vi.mocked(getMilestone).mockRejectedValue(apiError(404, 'Milestone not found'))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to my projects' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('shows a generic error with retry that reloads', async () => {
    vi.mocked(getMilestone).mockRejectedValueOnce(apiError(500, 'Server exploded')).mockResolvedValueOnce(milestone())
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('Server exploded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Design review' })).toBeInTheDocument()
    expect(getMilestone).toHaveBeenCalledTimes(2)
  })
})

describe('MilestonePage rendering', () => {
  it('shows status badges, dates and an empty description/work log', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone({ description: null, totalHours: 0 }))
    renderPage(EMPLOYEE)
    await screen.findByRole('heading', { level: 1, name: 'Design review' })
    expect(screen.getByText('Milestone')).toBeInTheDocument()
    expect(screen.getByText('No description.')).toBeInTheDocument()
    expect(screen.getByText('No hours logged on this milestone yet.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Work log \(0 h\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dependencies' })).not.toBeInTheDocument()
    expect(screen.getByText('Sep 1, 2026')).toBeInTheDocument()
    expect(screen.getByText('Sep 30, 2026')).toBeInTheDocument()
  })

  it('hides every action from employees', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    renderPage(EMPLOYEE)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows manager actions but not delete', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    renderPage(MANAGER)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive milestone' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('shows delete for admins', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    renderPage(ADMIN)
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('shows completed and archived badges and swaps the buttons', async () => {
    vi.mocked(getMilestone).mockResolvedValue(
      milestone({ completedAt: '2026-09-20T10:00:00Z', archivedAt: '2026-09-25T10:00:00Z' }),
    )
    renderPage(MANAGER)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText(/^Completed /)).toBeInTheDocument()
    expect(screen.getByText(/^Archived /)).toBeInTheDocument()
    expect(screen.queryByText('Milestone')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark complete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore milestone' })).toBeInTheDocument()
  })

  it('shows Reopen for a completed, unarchived milestone', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone({ completedAt: '2026-09-20T10:00:00Z' }))
    renderPage(MANAGER)
    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeInTheDocument()
  })

  it('notes when the project is archived but the milestone is not', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone({ projectArchivedAt: '2026-09-01T00:00:00Z' }))
    renderPage()
    expect(await screen.findByText(/project is archived/)).toBeInTheDocument()
  })

  it('does not show the project-archived note when the milestone itself is archived', async () => {
    vi.mocked(getMilestone).mockResolvedValue(
      milestone({ projectArchivedAt: '2026-09-01T00:00:00Z', archivedAt: '2026-09-02T00:00:00Z' }),
    )
    renderPage()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText(/project is archived/)).not.toBeInTheDocument()
  })

  it('lists dependencies with their state', async () => {
    vi.mocked(getMilestone).mockResolvedValue(
      milestone({
        dependsOn: [
          { milestoneId: 1, name: 'Wireframes', completed: true, alert: null },
          { milestoneId: 2, name: 'Research', completed: false, alert: 'Ends after this milestone starts' },
          { milestoneId: 4, name: 'Copy', completed: false, alert: null },
        ],
        requiredBy: [{ milestoneId: 9, name: 'Launch' }],
      }),
    )
    renderPage()
    await screen.findByRole('heading', { name: 'Dependencies' })
    expect(screen.getByRole('link', { name: 'Wireframes' })).toHaveAttribute('href', '/milestones/1')
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByText('Past due')).toBeInTheDocument()
    expect(screen.getByText('Not complete')).toBeInTheDocument()
    expect(screen.getByText(/Ends after this milestone starts/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Required by' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Launch' })).toHaveAttribute('href', '/milestones/9')
  })

  it('shows only the required-by list when nothing is depended on', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone({ requiredBy: [{ milestoneId: 9, name: 'Launch' }] }))
    renderPage()
    await screen.findByRole('heading', { name: 'Dependencies' })
    expect(screen.queryByRole('heading', { name: 'Depends on' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Required by' })).toBeInTheDocument()
  })

  it('shows the work log with per-person totals and who logged each entry', async () => {
    vi.mocked(getMilestone).mockResolvedValue(
      milestone({
        totalHours: 5.5,
        hoursByEmployee: [{ employeeId: 3, name: 'Priya Patel', hours: 5.5 }],
        entries: [
          {
            entryId: 1,
            workDate: '2026-09-10',
            hours: 3,
            note: 'Reviewed mockups',
            employee: { employeeId: 3, name: 'Priya Patel' },
            loggedBy: null,
            loggedBySelf: true,
            createdAt: '2026-09-10T10:00:00Z',
          },
          {
            entryId: 2,
            workDate: '2026-09-11',
            hours: 2.5,
            note: null,
            employee: { employeeId: 3, name: 'Priya Patel' },
            loggedBy: { userId: 2, name: 'Maria Garcia', role: 'manager' },
            loggedBySelf: false,
            createdAt: '2026-09-11T10:00:00Z',
          },
        ],
      }),
    )
    renderPage()
    await screen.findByRole('heading', { name: /Work log \(5.5 h\)/ })
    const totals = screen.getByRole('list', { name: 'Hours by person' })
    expect(within(totals).getByRole('link', { name: /Priya Patel/ })).toHaveAttribute('href', '/employees/3')
    expect(screen.getByText('Reviewed mockups')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText(/logged by Maria Garcia/)).toBeInTheDocument()
    expect(screen.getByText('manager')).toBeInTheDocument()
    expect(screen.getByText('2.5 h')).toBeInTheDocument()
  })
})

describe('MilestonePage actions', () => {
  it('does nothing when completing is not confirmed', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Mark complete' }))
    expect(window.confirm).toHaveBeenCalledWith('Mark "Design review" as complete?')
    expect(completeMilestone).not.toHaveBeenCalled()
  })

  it('marks complete, shows Saving… while in flight, then reloads', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    const pending = deferred()
    vi.mocked(completeMilestone).mockReturnValue(pending.promise)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Mark complete' }))
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeDisabled()
    pending.resolve({ milestoneId: 7, name: 'Design review', completedAt: '2026-10-01T00:00:00Z' })
    await waitFor(() => expect(getMilestone).toHaveBeenCalledTimes(2))
    expect(completeMilestone).toHaveBeenCalledWith(7)
    expect(await screen.findByRole('button', { name: 'Archive milestone' })).toBeEnabled()
  })

  it('reopens a completed milestone', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone({ completedAt: '2026-09-20T10:00:00Z' }))
    vi.mocked(reopenMilestone).mockResolvedValue({ milestoneId: 7, name: 'Design review', completedAt: null })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Reopen' }))
    expect(window.confirm).toHaveBeenCalledWith('Reopen "Design review"?')
    await waitFor(() => expect(reopenMilestone).toHaveBeenCalledWith(7))
    await waitFor(() => expect(getMilestone).toHaveBeenCalledTimes(2))
  })

  it('shows an error when completing fails', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    vi.mocked(completeMilestone).mockRejectedValue(apiError(409, 'Dependencies are not complete'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Mark complete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Dependencies are not complete')
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeEnabled()
    expect(getMilestone).toHaveBeenCalledTimes(1)
  })

  it('does nothing when archiving is not confirmed', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Archive milestone' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Archive "Design review"\?/))
    expect(archiveMilestone).not.toHaveBeenCalled()
  })

  it('archives and reloads', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    vi.mocked(archiveMilestone).mockResolvedValue({ milestoneId: 7, name: 'Design review', archivedAt: 'x' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Archive milestone' }))
    await waitFor(() => expect(archiveMilestone).toHaveBeenCalledWith(7))
    await waitFor(() => expect(getMilestone).toHaveBeenCalledTimes(2))
  })

  it('restores an archived milestone', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone({ archivedAt: '2026-09-25T10:00:00Z' }))
    vi.mocked(unarchiveMilestone).mockResolvedValue({ milestoneId: 7, name: 'Design review', archivedAt: null })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Restore milestone' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Restore "Design review"\?/))
    await waitFor(() => expect(unarchiveMilestone).toHaveBeenCalledWith(7))
    await waitFor(() => expect(getMilestone).toHaveBeenCalledTimes(2))
  })

  it('shows an error when archiving fails', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    vi.mocked(archiveMilestone).mockRejectedValue(apiError(500, 'Could not archive'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Archive milestone' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not archive')
    expect(screen.getByRole('button', { name: 'Archive milestone' })).toBeEnabled()
  })

  it('does nothing when deleting is not confirmed', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderPage(ADMIN)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(window.confirm).toHaveBeenCalledWith('Permanently delete "Design review"? This cannot be undone.')
    expect(deleteMilestone).not.toHaveBeenCalled()
  })

  it('deletes and navigates back to the project', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    vi.mocked(deleteMilestone).mockResolvedValue(null)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage(ADMIN)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteMilestone).toHaveBeenCalledWith(7))
    // The page is only mounted on /milestones/:id, so leaving for /projects/3 unmounts it
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument())
  })

  it('shows an error when deleting fails and re-enables the buttons', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    vi.mocked(deleteMilestone).mockRejectedValue(apiError(409, 'Hours are logged on this milestone'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage(ADMIN)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Hours are logged on this milestone')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(screen.getByRole('heading', { level: 1, name: 'Design review' })).toBeInTheDocument()
  })
})

describe('MilestonePage editing', () => {
  it('opens the edit form, hides the Edit button, and cancels', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('heading', { name: 'Edit milestone' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/)).toHaveValue('Design review')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { name: 'Edit milestone' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('saves the edit, closes the form and reloads', async () => {
    vi.mocked(getMilestone).mockResolvedValue(milestone())
    vi.mocked(updateMilestone).mockResolvedValue({ ...milestone(), name: 'Design review v2' })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const title = screen.getByLabelText(/Title/)
    await user.clear(title)
    await user.type(title, 'Design review v2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit milestone' })).not.toBeInTheDocument())
    expect(updateMilestone).toHaveBeenCalledWith(7, expect.objectContaining({ title: 'Design review v2' }))
    expect(getMilestone).toHaveBeenCalledTimes(2)
  })
})

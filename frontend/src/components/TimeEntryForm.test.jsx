import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TimeEntryForm from './TimeEntryForm'
import { apiError } from '../test/helpers'
import { todayIsoDate } from '../utils/format'

const ASSIGNMENTS = [
  { milestoneId: 10, milestoneName: 'Design', projectId: 1, projectTitle: 'Website' },
  { milestoneId: 11, milestoneName: 'Build', projectId: 1, projectTitle: 'Website' },
  { milestoneId: 20, milestoneName: 'Audit', projectId: 2, projectTitle: 'Compliance' },
]

const ENTRY = { entryId: 5, workDate: '2026-03-02', hours: 4, note: null, milestone: { milestoneId: 20 } }

function setup(props = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(<TimeEntryForm assignments={ASSIGNMENTS} onSubmit={onSubmit} {...props} />)
  return { onSubmit, user }
}

describe('TimeEntryForm initial render', () => {
  it('renders add mode with milestones grouped by project and today as the date', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Log hours' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Website' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Compliance' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Build' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Date/)).toHaveValue(todayIsoDate())
    expect(screen.getByLabelText(/Milestone/)).toHaveValue('')
    expect(screen.getByLabelText(/Hours/)).toHaveValue(null)
  })

  it('renders edit mode prefilled from the entry, with a cancel button', async () => {
    const onCancel = vi.fn()
    const { user } = setup({ entry: ENTRY, onCancel })
    expect(screen.getByRole('heading', { name: 'Edit entry' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Milestone/)).toHaveValue('20')
    expect(screen.getByLabelText(/Date/)).toHaveValue('2026-03-02')
    expect(screen.getByLabelText(/Hours/)).toHaveValue(4)
    expect(screen.getByLabelText('Note')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps the note from the entry when present', () => {
    setup({ entry: { ...ENTRY, note: 'Reviewed docs' } })
    expect(screen.getByLabelText('Note')).toHaveValue('Reviewed docs')
  })
})

describe('TimeEntryForm validation', () => {
  it('shows required errors and does not submit when empty', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(screen.getByText('Choose a milestone')).toHaveAttribute('id', 'milestoneId-error')
    expect(screen.getByText('Hours are required')).toBeInTheDocument()
    expect(screen.getByLabelText(/Milestone/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Milestone/)).toHaveAttribute('aria-describedby', 'milestoneId-error')
    expect(screen.getByLabelText('Note')).not.toHaveAttribute('aria-describedby')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires a date and rejects future dates', async () => {
    const { onSubmit, user } = setup()
    const date = screen.getByLabelText(/Date/)
    fireEvent.change(date, { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(screen.getByText('Date is required')).toBeInTheDocument()

    fireEvent.change(date, { target: { value: '2999-01-01' } })
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(screen.getByText('Cannot be in the future')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects hours outside (0, 24]', async () => {
    const { user } = setup()
    const hours = screen.getByLabelText(/Hours/)
    await user.type(hours, '0')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(screen.getByText('Must be more than 0 and at most 24')).toBeInTheDocument()

    await user.clear(hours)
    await user.type(hours, '25')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(screen.getByText('Must be more than 0 and at most 24')).toBeInTheDocument()
  })

  it('rejects notes over 500 characters', async () => {
    const { user } = setup()
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'x'.repeat(501) } })
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(screen.getByText('Must be at most 500 characters')).toHaveAttribute('id', 'note-error')
  })

  it('clears a field error once the field is edited', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(screen.getByText('Hours are required')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Hours/), '2')
    expect(screen.queryByText('Hours are required')).not.toBeInTheDocument()
  })
})

describe('TimeEntryForm submit', () => {
  it('submits the trimmed body and keeps milestone and date for the next entry', async () => {
    const { onSubmit, user } = setup()
    await user.selectOptions(screen.getByLabelText(/Milestone/), '11')
    await user.type(screen.getByLabelText(/Hours/), '7.5')
    await user.type(screen.getByLabelText('Note'), '  Wrote tests  ')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      milestoneId: 11,
      workDate: todayIsoDate(),
      hours: 7.5,
      note: 'Wrote tests',
    })
    await waitFor(() => expect(screen.getByLabelText(/Hours/)).toHaveValue(null))
    expect(screen.getByLabelText('Note')).toHaveValue('')
    expect(screen.getByLabelText(/Milestone/)).toHaveValue('11')
    expect(screen.getByLabelText(/Date/)).toHaveValue(todayIsoDate())
  })

  it('omits the note when it is blank', async () => {
    const { onSubmit, user } = setup()
    await user.selectOptions(screen.getByLabelText(/Milestone/), '10')
    await user.type(screen.getByLabelText(/Hours/), '1')
    await user.type(screen.getByLabelText('Note'), '   ')
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ milestoneId: 10, workDate: todayIsoDate(), hours: 1 }))
  })

  it('keeps the values after saving an edit', async () => {
    const { onSubmit, user } = setup({ entry: ENTRY, onCancel: vi.fn() })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ milestoneId: 20, workDate: '2026-03-02', hours: 4 }),
    )
    expect(screen.getByLabelText(/Hours/)).toHaveValue(4)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('shows server field errors next to the fields', async () => {
    const { onSubmit, user } = setup({ entry: ENTRY })
    onSubmit.mockRejectedValue(apiError(400, 'Validation failed', { hours: 'Daily total over 24', workDate: 'Locked' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Daily total over 24')).toHaveAttribute('id', 'hours-error')
    expect(screen.getByText('Locked')).toHaveAttribute('id', 'workDate-error')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('shows a non-field error in the banner', async () => {
    const { onSubmit, user } = setup({ entry: ENTRY })
    onSubmit.mockRejectedValue(apiError(409, 'Entry already exists'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Entry already exists')
  })

  it('disables the form while submitting', async () => {
    let resolve
    const { onSubmit, user } = setup({ entry: ENTRY, onCancel: vi.fn() })
    onSubmit.mockReturnValue(new Promise((r) => (resolve = r)))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByLabelText(/Hours/)).toBeDisabled()
    expect(screen.getByLabelText(/Milestone/)).toBeDisabled()
    resolve()
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
})

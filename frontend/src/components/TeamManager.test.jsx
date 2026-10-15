import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeamManager from './TeamManager'
import {
  addProjectMember,
  assignMilestone,
  getProjectTeam,
  removeProjectMember,
  unassignMilestone,
} from '../services/projectService'
import { ADMIN, MANAGER, apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/projectService')

const MILESTONES = [
  { milestoneId: 10, name: 'Design' },
  { milestoneId: 11, name: 'Build' },
]

const MARIA = {
  employeeId: 1,
  name: 'Maria Garcia',
  username: 'maria',
  title: 'Lead',
  role: 'manager',
  hoursLogged: 12.5,
  milestones: [{ milestoneId: 10, name: 'Design' }],
}
const PRIYA = {
  employeeId: 3,
  name: 'Priya Patel',
  username: 'priya',
  title: null,
  role: 'employee',
  hoursLogged: 0,
  milestones: [],
}
const TEAM = {
  members: [MARIA, PRIYA],
  candidates: [
    { employeeId: 5, name: 'Sam Lee', username: 'sam', title: 'Dev', role: 'employee' },
    { employeeId: 6, name: 'Tom Nguyen', username: 'tom', title: null, role: 'employee' },
  ],
}

function setup({ team = TEAM, user = MANAGER, milestones = MILESTONES } = {}) {
  vi.mocked(getProjectTeam).mockResolvedValue(team)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  const ue = userEvent.setup()
  renderWithProviders(<TeamManager projectId="7" milestones={milestones} onChanged={onChanged} />, { user })
  return { onChanged, user: ue }
}

describe('TeamManager initial render', () => {
  it('shows loading, then members with milestones, hours and the manager hint', async () => {
    setup()
    expect(screen.getByRole('status')).toHaveTextContent('Loading team…')
    expect(await screen.findByRole('link', { name: 'Maria Garcia' })).toHaveAttribute('href', '/employees/1')
    expect(getProjectTeam).toHaveBeenCalledWith('7')
    expect(screen.getByText('Lead')).toBeInTheDocument()
    expect(screen.getByText('employee')).toBeInTheDocument() // Priya has no title, so her role shows
    expect(screen.getByText('12.5 h')).toBeInTheDocument()
    expect(screen.getByText('0 h')).toBeInTheDocument()
    expect(screen.getByText('None yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unassign Maria Garcia from Design' })).toBeInTheDocument()
    // Maria can still be assigned to Build; Priya to both
    expect(screen.getByRole('combobox', { name: 'Assign Maria Garcia to a milestone' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Assign Priya Patel to a milestone' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sam Lee · Dev' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tom Nguyen' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Add someone to the project…' })).toBeInTheDocument()
    expect(screen.getByText(/You can add your direct reports/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to project' })).toBeDisabled()
  })

  it('shows the admin hint for admins', async () => {
    setup({ user: ADMIN })
    expect(await screen.findByText(/As an admin you can add anyone/)).toBeInTheDocument()
  })

  it('hides the assign select when every milestone is assigned and says when no one is left to add', async () => {
    setup({
      team: { members: [{ ...MARIA, milestones: MILESTONES }], candidates: [] },
    })
    await screen.findByRole('link', { name: 'Maria Garcia' })
    expect(screen.queryByRole('combobox', { name: /Assign Maria/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'No one else to add' })).toBeInTheDocument()
  })

  it('shows the load error with a retry that reloads', async () => {
    vi.mocked(getProjectTeam).mockRejectedValueOnce(apiError(500, 'Boom')).mockResolvedValueOnce(TEAM)
    const onChanged = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<TeamManager projectId="7" milestones={MILESTONES} onChanged={onChanged} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Maria Garcia' })).toBeInTheDocument()
    expect(getProjectTeam).toHaveBeenCalledTimes(2)
  })
})

describe('TeamManager add member', () => {
  it('adds the chosen candidate, shows a notice, reloads and calls onChanged', async () => {
    vi.mocked(addProjectMember).mockResolvedValue({ employeeId: 5, name: 'Sam Lee', projectId: 7 })
    const { onChanged, user } = setup()
    const picker = await screen.findByLabelText('Add someone to the project')
    await user.selectOptions(picker, '5')
    expect(screen.getByRole('button', { name: 'Add to project' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Add to project' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Sam Lee added to the project. Assign a milestone')
    expect(addProjectMember).toHaveBeenCalledWith('7', 5)
    expect(onChanged).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(getProjectTeam).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Add someone to the project')).toHaveValue('')
  })

  it('ignores a submit without a candidate', async () => {
    setup()
    const button = await screen.findByRole('button', { name: 'Add to project' })
    fireEvent.submit(button.closest('form'))
    expect(addProjectMember).not.toHaveBeenCalled()
  })

  it('shows the employeeId field error when adding fails', async () => {
    vi.mocked(addProjectMember).mockRejectedValue(apiError(400, 'Validation failed', { employeeId: 'Not one of your reports' }))
    const { onChanged, user } = setup()
    await user.selectOptions(await screen.findByLabelText('Add someone to the project'), '5')
    await user.click(screen.getByRole('button', { name: 'Add to project' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not one of your reports')
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('falls back to the error message when there is no field error', async () => {
    vi.mocked(addProjectMember).mockRejectedValue(apiError(409, 'Already a member'))
    const { user } = setup()
    await user.selectOptions(await screen.findByLabelText('Add someone to the project'), '6')
    await user.click(screen.getByRole('button', { name: 'Add to project' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Already a member')
  })
})

describe('TeamManager assign and unassign', () => {
  it('assigns a member to a milestone from the select', async () => {
    vi.mocked(assignMilestone).mockResolvedValue({
      employeeId: 3,
      name: 'Priya Patel',
      milestoneId: 10,
      milestoneName: 'Design',
      addedToProject: false,
    })
    const { onChanged, user } = setup()
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Assign Priya Patel to a milestone' }), '10')
    expect(await screen.findByRole('status')).toHaveTextContent('Priya Patel assigned to Design.')
    expect(assignMilestone).toHaveBeenCalledWith('7', 10, 3)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('ignores picking the placeholder option', async () => {
    setup()
    const select = await screen.findByRole('combobox', { name: 'Assign Priya Patel to a milestone' })
    // Move React's value tracker off '' so a change event back to '' reaches onChange
    select.value = '10'
    fireEvent.change(select, { target: { value: '' } })
    expect(assignMilestone).not.toHaveBeenCalled()
  })

  it('shows the error when assigning fails', async () => {
    vi.mocked(assignMilestone).mockRejectedValue(apiError(403, 'Not allowed'))
    const { user } = setup()
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Assign Maria Garcia to a milestone' }), '11')
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed')
  })

  it('unassigns after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(unassignMilestone).mockResolvedValue(null)
    const { onChanged, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Unassign Maria Garcia from Design' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Maria Garcia unassigned from Design.')
    expect(window.confirm).toHaveBeenCalledWith('Unassign Maria Garcia from Design?')
    expect(unassignMilestone).toHaveBeenCalledWith('7', 10, 1)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('does nothing when unassign is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onChanged, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Unassign Maria Garcia from Design' }))
    expect(unassignMilestone).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('TeamManager remove member', () => {
  it('removes after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(removeProjectMember).mockResolvedValue(null)
    const { onChanged, user } = setup()
    const [removeMaria] = await screen.findAllByRole('button', { name: 'Remove' })
    await user.click(removeMaria)
    expect(await screen.findByRole('status')).toHaveTextContent('Maria Garcia removed from the project.')
    expect(window.confirm).toHaveBeenCalledWith('Remove Maria Garcia from the project?')
    expect(removeProjectMember).toHaveBeenCalledWith('7', 1)
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('does nothing when removal is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = setup()
    const [, removePriya] = await screen.findAllByRole('button', { name: 'Remove' })
    await user.click(removePriya)
    expect(removeProjectMember).not.toHaveBeenCalled()
  })

  it('shows the error when removal is refused and clears any earlier notice', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(removeProjectMember).mockRejectedValue(apiError(409, 'Has hours logged'))
    const { user } = setup()
    const [removeMaria] = await screen.findAllByRole('button', { name: 'Remove' })
    await user.click(removeMaria)
    expect(await screen.findByRole('alert')).toHaveTextContent('Has hours logged')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(removeMaria).toBeEnabled()
  })

  it('disables the controls while an action is in flight', async () => {
    let resolve
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(removeProjectMember).mockReturnValue(new Promise((r) => (resolve = r)))
    const { user } = setup()
    const [removeMaria, removePriya] = await screen.findAllByRole('button', { name: 'Remove' })
    await user.click(removeMaria)
    await waitFor(() => expect(removePriya).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Unassign Maria Garcia from Design' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Assign Priya Patel to a milestone' })).toBeDisabled()
    expect(screen.getByLabelText('Add someone to the project')).toBeDisabled()
    resolve(null)
    expect(await screen.findByRole('status')).toHaveTextContent('removed from the project')
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Remove' })[1]).toBeEnabled())
  })
})

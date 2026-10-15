import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountPanel from './AccountPanel'
import { deactivateUser, reactivateUser, setUserPassword, updateUser } from '../services/userService'
import { apiError } from '../test/helpers'

vi.mock('../services/userService')

const EMPLOYEE_ACCOUNT = {
  userId: 7,
  username: 'sam.lee',
  name: 'Sam Lee',
  email: 'sam@example.com',
  firstName: 'Sam',
  lastName: 'Lee',
  role: 'employee',
  title: 'Engineer',
  salary: 85000,
  deactivatedAt: null,
  manager: { employeeId: 1, name: 'Maria Garcia' },
}

const ADMIN_ACCOUNT = {
  userId: 1,
  username: 'admin',
  name: 'admin',
  email: 'admin@example.com',
  firstName: null,
  lastName: null,
  role: 'admin',
  title: null,
  salary: null,
  deactivatedAt: null,
  manager: null,
}

function setup(account = EMPLOYEE_ACCOUNT, props = {}) {
  const onChanged = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  const user = userEvent.setup()
  render(<AccountPanel account={account} isSelf={false} onChanged={onChanged} onClose={onClose} {...props} />)
  return { onChanged, onClose, user }
}

describe('AccountPanel initial render', () => {
  it('prefills an employee account with role select, title, salary and manager', () => {
    setup()
    expect(screen.getByRole('heading', { name: /Sam Lee/ })).toHaveTextContent('sam.lee')
    expect(screen.queryByText('Deactivated')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('sam@example.com')
    expect(screen.getByLabelText('First name')).toHaveValue('Sam')
    expect(screen.getByLabelText('Last name')).toHaveValue('Lee')
    expect(screen.getByLabelText('Role')).toHaveValue('employee')
    expect(screen.getByRole('option', { name: 'Manager' })).toBeInTheDocument()
    expect(screen.getByLabelText('Job title')).toHaveValue('Engineer')
    expect(screen.getByLabelText('Annual salary (USD)')).toHaveValue(85000)
    expect(screen.getByLabelText('Manager')).toHaveValue('Maria Garcia')
    expect(screen.getByLabelText('Manager')).toBeDisabled()
    const deactivate = screen.getByRole('button', { name: 'Deactivate account' })
    expect(deactivate).toBeEnabled()
    expect(deactivate).toHaveClass('danger-button')
    expect(screen.queryByText(/your own account/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set password' })).toBeDisabled()
  })

  it('shows a fixed role and no employee fields for an admin account, defaulting null fields to empty', () => {
    setup(ADMIN_ACCOUNT)
    const role = screen.getByLabelText('Role')
    expect(role).toHaveValue('Admin')
    expect(role).toBeDisabled()
    expect(screen.getByLabelText('First name')).toHaveValue('')
    expect(screen.getByLabelText('Last name')).toHaveValue('')
    expect(screen.queryByLabelText('Job title')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Annual salary (USD)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Manager')).not.toBeInTheDocument()
  })

  it('shows a dash when an employee has no manager and empty salary when unset', () => {
    setup({ ...EMPLOYEE_ACCOUNT, manager: null, salary: null, title: null })
    expect(screen.getByLabelText('Manager')).toHaveValue('—')
    expect(screen.getByLabelText('Annual salary (USD)')).toHaveValue(null)
    expect(screen.getByLabelText('Job title')).toHaveValue('')
  })

  it('shows the deactivated badge and a reactivate button', () => {
    setup({ ...EMPLOYEE_ACCOUNT, deactivatedAt: '2026-01-01T00:00:00Z' })
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Reactivate account' })
    expect(button).not.toHaveClass('danger-button')
  })

  it('blocks deactivating your own account', () => {
    setup(EMPLOYEE_ACCOUNT, { isSelf: true })
    expect(screen.getByRole('button', { name: 'Deactivate account' })).toBeDisabled()
    expect(screen.getByText(/You can't deactivate your own account/)).toBeInTheDocument()
  })

  it('closes from the close button', async () => {
    const { onClose, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('AccountPanel save details', () => {
  it('sends trimmed details for an employee and reports success', async () => {
    vi.mocked(updateUser).mockResolvedValue({ userId: 7 })
    const { onChanged, user } = setup()
    const email = screen.getByLabelText('Email')
    await user.clear(email)
    await user.type(email, ' new@example.com ')
    await user.selectOptions(screen.getByLabelText('Role'), 'manager')
    const title = screen.getByLabelText('Job title')
    await user.clear(title)
    await user.type(title, ' Lead ')
    const salary = screen.getByLabelText('Annual salary (USD)')
    await user.clear(salary)
    await user.type(salary, '90000.5')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Details saved.')
    expect(updateUser).toHaveBeenCalledWith(7, {
      email: 'new@example.com',
      role: 'manager',
      firstName: 'Sam',
      lastName: 'Lee',
      title: 'Lead',
      salary: 90000.5,
    })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('sends null for blank names, title and salary', async () => {
    vi.mocked(updateUser).mockResolvedValue({ userId: 7 })
    const { user } = setup()
    await user.clear(screen.getByLabelText('First name'))
    await user.clear(screen.getByLabelText('Last name'))
    await user.type(screen.getByLabelText('Last name'), '   ')
    await user.clear(screen.getByLabelText('Job title'))
    await user.clear(screen.getByLabelText('Annual salary (USD)'))
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await screen.findByRole('status')
    expect(updateUser).toHaveBeenCalledWith(7, {
      email: 'sam@example.com',
      role: 'employee',
      firstName: null,
      lastName: null,
      title: null,
      salary: null,
    })
  })

  it('omits title and salary for an admin account', async () => {
    vi.mocked(updateUser).mockResolvedValue({ userId: 1 })
    const { user } = setup(ADMIN_ACCOUNT)
    await user.type(screen.getByLabelText('First name'), 'Ada')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await screen.findByRole('status')
    expect(updateUser).toHaveBeenCalledWith(1, {
      email: 'admin@example.com',
      role: 'admin',
      firstName: 'Ada',
      lastName: null,
    })
  })

  it('shows server field errors next to the fields and clears them on edit', async () => {
    vi.mocked(updateUser).mockRejectedValue(apiError(400, 'Validation failed', { email: 'Already in use', role: 'Bad role' }))
    const { onChanged, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByText('Already in use')).toHaveAttribute('id', 'acct-email-error')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'acct-email-error')
    expect(screen.getByLabelText('First name')).not.toHaveAttribute('aria-describedby')
    expect(screen.getByText('Bad role')).toBeInTheDocument()
    expect(screen.getByLabelText('Role')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Email'), 'x')
    expect(screen.queryByText('Already in use')).not.toBeInTheDocument()
  })

  it('shows a non-field error in the banner', async () => {
    vi.mocked(updateUser).mockRejectedValue(apiError(500, 'Server exploded'))
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded')
    expect(screen.getByRole('button', { name: 'Save details' })).toBeEnabled()
  })

  it('disables everything while saving', async () => {
    let resolve
    vi.mocked(updateUser).mockReturnValue(new Promise((r) => (resolve = r)))
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Role')).toBeDisabled()
    expect(screen.getByLabelText('New password')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deactivate account' })).toBeDisabled()
    resolve({ userId: 7 })
    expect(await screen.findByRole('button', { name: 'Save details' })).toBeEnabled()
  })
})

describe('AccountPanel password', () => {
  it('rejects passwords under 8 characters without calling the API', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('New password'), 'short')
    expect(screen.getByRole('button', { name: 'Set password' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Set password' }))
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
    expect(setUserPassword).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('New password'), 'x')
    expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument()
  })

  it('sets the password, clears the field and reports success', async () => {
    vi.mocked(setUserPassword).mockResolvedValue(null)
    const { onChanged, user } = setup()
    await user.type(screen.getByLabelText('New password'), 'longpassword')
    await user.click(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed.')
    expect(setUserPassword).toHaveBeenCalledWith(7, 'longpassword')
    expect(screen.getByLabelText('New password')).toHaveValue('')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('shows a server password error next to the field', async () => {
    vi.mocked(setUserPassword).mockRejectedValue(apiError(400, 'Validation failed', { password: 'Too common' }))
    const { user } = setup()
    await user.type(screen.getByLabelText('New password'), 'longpassword')
    await user.click(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByText('Too common')).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toHaveValue('longpassword')
  })
})

describe('AccountPanel activation', () => {
  it('deactivates after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deactivateUser).mockResolvedValue({ userId: 7, deactivatedAt: '2026-01-01' })
    const { onChanged, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Deactivate account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Sam Lee deactivated.')
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Deactivate Sam Lee\?/))
    expect(deactivateUser).toHaveBeenCalledWith(7)
    expect(reactivateUser).not.toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('does nothing when deactivation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onChanged, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Deactivate account' }))
    expect(deactivateUser).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('reactivates a deactivated account after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(reactivateUser).mockResolvedValue({ userId: 7, deactivatedAt: null })
    const { user } = setup({ ...EMPLOYEE_ACCOUNT, deactivatedAt: '2026-01-01T00:00:00Z' })
    await user.click(screen.getByRole('button', { name: 'Reactivate account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Sam Lee reactivated.')
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/^Reactivate Sam Lee\?/))
    expect(reactivateUser).toHaveBeenCalledWith(7)
    expect(deactivateUser).not.toHaveBeenCalled()
  })

  it('shows the error when deactivation fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deactivateUser).mockRejectedValue(apiError(409, 'Last admin cannot be deactivated'))
    const { onChanged, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Deactivate account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Last admin cannot be deactivated')
    expect(onChanged).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deactivate account' })).toBeEnabled())
  })
})

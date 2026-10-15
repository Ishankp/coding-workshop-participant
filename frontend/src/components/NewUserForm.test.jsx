import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewUserForm from './NewUserForm'
import { createUser } from '../services/userService'
import { apiError } from '../test/helpers'

vi.mock('../services/userService')

const MANAGERS = [
  { employeeId: 1, name: 'Maria Garcia' },
  { employeeId: 2, name: 'Tom Nguyen' },
]

const CREATED = { userId: 9, employeeId: 7, username: 'sam.lee', email: 'sam@example.com', name: 'Sam Lee', role: 'employee' }

function setup() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<NewUserForm managers={MANAGERS} onCreated={onCreated} onCancel={onCancel} />)
  return { onCreated, onCancel, user }
}

async function fillRequired(user, { username = 'sam.lee', email = 'sam@example.com', password = 'longpassword' } = {}) {
  await user.type(screen.getByLabelText(/Username/), username)
  await user.type(screen.getByLabelText(/Email/), email)
  await user.type(screen.getByLabelText(/Initial password/), password)
}

describe('NewUserForm initial render', () => {
  it('shows employee fields and hints by default', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'New account' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Role/)).toHaveValue('employee')
    expect(screen.getByLabelText('Job title')).toBeInTheDocument()
    expect(screen.getByLabelText('Annual salary (USD)')).toBeInTheDocument()
    expect(screen.getByLabelText('Manager')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tom Nguyen' })).toBeInTheDocument()
    expect(screen.getByText(/Fixed once set/)).toBeInTheDocument()
    expect(screen.getByText(/Used to cost logged hours/)).toBeInTheDocument()
    expect(screen.getByText(/At least 8 characters; share it/)).toBeInTheDocument()
    expect(screen.queryByText(/Admins have no employee record/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('hides the employee fields for an admin', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText(/Role/), 'admin')
    expect(screen.queryByLabelText('Job title')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Annual salary (USD)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Manager')).not.toBeInTheDocument()
    expect(screen.getByText(/Admins have no employee record/)).toBeInTheDocument()
  })

  it('calls onCancel from the cancel button', async () => {
    const { onCancel, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('NewUserForm validation', () => {
  it('flags username, email and password when empty', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('3-100 letters, digits, dots, dashes or underscores')).toHaveAttribute('id', 'user-username-error')
    expect(screen.getByText('Must be a valid email address')).toHaveAttribute('id', 'user-email-error')
    expect(screen.getByText('At least 8 characters')).toHaveAttribute('id', 'user-password-error')
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('aria-describedby', 'user-username-error')
    expect(screen.getByLabelText(/First name/)).not.toHaveAttribute('aria-describedby')
    // The password hint gives way to the error
    expect(screen.queryByText(/share it with the person out of band/)).not.toBeInTheDocument()
    expect(createUser).not.toHaveBeenCalled()
  })

  it('flags bad username characters, bad email and a short password', async () => {
    const { user } = setup()
    await fillRequired(user, { username: 'bad name!', email: 'not-an-email', password: 'short' })
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('3-100 letters, digits, dots, dashes or underscores')).toBeInTheDocument()
    expect(screen.getByText('Must be a valid email address')).toBeInTheDocument()
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument()
    expect(createUser).not.toHaveBeenCalled()
  })

  it('rejects a negative salary', async () => {
    const { user } = setup()
    await fillRequired(user)
    await user.type(screen.getByLabelText('Annual salary (USD)'), '-5')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText("Can't be negative")).toHaveAttribute('id', 'user-salary-error')
    expect(screen.queryByText(/Used to cost logged hours/)).not.toBeInTheDocument()
    expect(createUser).not.toHaveBeenCalled()
  })

  it('clears a field error once the field is edited', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Must be a valid email address')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Email/), 'a')
    expect(screen.queryByText('Must be a valid email address')).not.toBeInTheDocument()
  })
})

describe('NewUserForm submit', () => {
  it('creates an employee with every optional field', async () => {
    vi.mocked(createUser).mockResolvedValue(CREATED)
    const { onCreated, user } = setup()
    await user.selectOptions(screen.getByLabelText(/Role/), 'manager')
    await fillRequired(user, { username: ' sam.lee ', email: ' sam@example.com ' })
    await user.type(screen.getByLabelText(/First name/), ' Sam ')
    await user.type(screen.getByLabelText(/Last name/), ' Lee ')
    await user.type(screen.getByLabelText('Job title'), ' Engineer ')
    await user.type(screen.getByLabelText('Annual salary (USD)'), '85000.5')
    await user.selectOptions(screen.getByLabelText('Manager'), '2')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED))
    expect(createUser).toHaveBeenCalledWith({
      username: 'sam.lee',
      email: 'sam@example.com',
      role: 'manager',
      password: 'longpassword',
      firstName: 'Sam',
      lastName: 'Lee',
      title: 'Engineer',
      salary: 85000.5,
      managerId: 2,
    })
  })

  it('sends only the required fields when the optional ones are blank', async () => {
    vi.mocked(createUser).mockResolvedValue(CREATED)
    const { onCreated, user } = setup()
    await fillRequired(user)
    await user.type(screen.getByLabelText(/First name/), '   ')
    await user.type(screen.getByLabelText('Job title'), '   ')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(createUser).toHaveBeenCalledWith({
      username: 'sam.lee',
      email: 'sam@example.com',
      role: 'employee',
      password: 'longpassword',
    })
  })

  it('drops employee-only fields when the role is admin', async () => {
    vi.mocked(createUser).mockResolvedValue({ ...CREATED, employeeId: null, role: 'admin' })
    const { onCreated, user } = setup()
    await fillRequired(user)
    await user.type(screen.getByLabelText('Job title'), 'Boss')
    await user.type(screen.getByLabelText('Annual salary (USD)'), '1')
    await user.selectOptions(screen.getByLabelText('Manager'), '1')
    await user.selectOptions(screen.getByLabelText(/Role/), 'admin')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(createUser).toHaveBeenCalledWith({
      username: 'sam.lee',
      email: 'sam@example.com',
      role: 'admin',
      password: 'longpassword',
    })
  })

  it('shows server field errors next to the fields and re-enables the form', async () => {
    vi.mocked(createUser).mockRejectedValue(
      apiError(400, 'Validation failed', { username: 'Already taken', managerId: 'Not a manager', role: 'Bad role' }),
    )
    const { onCreated, user } = setup()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Already taken')).toHaveAttribute('id', 'user-username-error')
    expect(screen.getByText('Not a manager')).toHaveAttribute('id', 'user-managerId-error')
    expect(screen.getByLabelText('Manager')).toHaveAttribute('aria-describedby', 'user-managerId-error')
    expect(screen.getByText('Bad role')).toBeInTheDocument()
    expect(screen.queryByText(/Fixed once set/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('shows a non-field error in the banner', async () => {
    vi.mocked(createUser).mockRejectedValue(apiError(409, 'Username already exists'))
    const { user } = setup()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Username already exists')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('disables the form while creating', async () => {
    let resolve
    vi.mocked(createUser).mockReturnValue(new Promise((r) => (resolve = r)))
    const { onCreated, user } = setup()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByLabelText(/Username/)).toBeDisabled()
    expect(screen.getByLabelText(/Role/)).toBeDisabled()
    expect(screen.getByLabelText('Manager')).toBeDisabled()
    resolve(CREATED)
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED))
  })
})

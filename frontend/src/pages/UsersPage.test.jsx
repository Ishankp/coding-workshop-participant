import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UsersPage from './UsersPage'
import { listUsers } from '../services/userService'
import { ADMIN, MANAGER, apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/userService')

// NewUserForm and AccountPanel are tested on their own; stubs just drive the page's callbacks.
vi.mock('../components/NewUserForm', () => ({
  default: ({ managers, onCreated, onCancel }) => (
    <div data-testid="new-user-form">
      <h2>New user form</h2>
      <ul aria-label="Manager options">
        {managers.map((m) => (
          <li key={m.userId}>{m.name}</li>
        ))}
      </ul>
      <button type="button" onClick={() => onCreated({ userId: 50, employeeId: 40, name: 'New Hire', role: 'employee' })}>
        Create employee
      </button>
      <button type="button" onClick={() => onCreated({ userId: 51, employeeId: null, name: 'New Admin', role: 'admin' })}>
        Create admin
      </button>
      <button type="button" onClick={onCancel}>
        Cancel form
      </button>
    </div>
  ),
}))

vi.mock('../components/AccountPanel', () => ({
  default: ({ account, isSelf, onChanged, onClose }) => (
    <div data-testid="account-panel">
      <h2>Panel for {account.username}</h2>
      {isSelf && <span>This is you</span>}
      <button type="button" onClick={onChanged}>
        Changed
      </button>
      <button type="button" onClick={onClose}>
        Close panel
      </button>
    </div>
  ),
}))

const users = [
  {
    userId: 1,
    username: 'admin',
    email: 'admin@example.com',
    firstName: 'Ada',
    lastName: 'Admin',
    name: 'Ada Admin',
    role: 'admin',
    deactivatedAt: null,
    employeeId: null,
    title: null,
    salary: null,
    manager: null,
  },
  {
    userId: 2,
    username: 'maria',
    email: 'maria@example.com',
    firstName: 'Maria',
    lastName: 'Garcia',
    name: 'Maria Garcia',
    role: 'manager',
    deactivatedAt: null,
    employeeId: 1,
    title: 'Engineering Manager',
    salary: 120000,
    manager: null,
  },
  {
    userId: 3,
    username: 'priya',
    email: 'priya@example.com',
    firstName: 'Priya',
    lastName: 'Patel',
    name: 'Priya Patel',
    role: 'employee',
    deactivatedAt: null,
    employeeId: 3,
    title: 'Engineer',
    salary: 90000,
    manager: { employeeId: 1, name: 'Maria Garcia' },
  },
  {
    userId: 4,
    username: 'gone',
    email: 'gone@example.com',
    firstName: 'Gone',
    lastName: 'Manager',
    name: 'Gone Manager',
    role: 'manager',
    deactivatedAt: '2026-01-01T00:00:00Z',
    employeeId: 4,
    title: 'Former Manager',
    salary: 100000,
    manager: null,
  },
  {
    userId: 5,
    username: 'ghost',
    email: 'ghost@example.com',
    firstName: null,
    lastName: null,
    name: 'ghost',
    role: 'manager',
    deactivatedAt: null,
    employeeId: null,
    title: null,
    salary: null,
    manager: null,
  },
]

function renderPage(user = ADMIN) {
  return renderWithProviders(<UsersPage />, { user, route: '/users', path: '/users' })
}

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('UsersPage access and loading', () => {
  it('refuses non-admins', () => {
    // The list request still fires from the hook; keep it pending so nothing updates after the test
    vi.mocked(listUsers).mockReturnValue(new Promise(() => {}))
    renderPage(MANAGER)
    expect(screen.getByRole('heading', { name: 'No access' })).toBeInTheDocument()
    expect(screen.getByText('Only admins can manage accounts.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Accounts' })).not.toBeInTheDocument()
  })

  it('shows a loading state, then the table', async () => {
    vi.mocked(listUsers).mockResolvedValue(users)
    renderPage()
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading accounts…')
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    vi.mocked(listUsers).mockRejectedValueOnce(apiError(500, 'Boom')).mockResolvedValueOnce(users)
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(listUsers).toHaveBeenCalledTimes(2)
  })
})

describe('UsersPage table', () => {
  it('renders each account with links, badges and dashes', async () => {
    vi.mocked(listUsers).mockResolvedValue(users)
    renderPage()
    await screen.findByRole('table')
    const [admin, maria, priya, gone] = rows()

    // Admin: no employee record, so plain name and dashes for title/salary/manager
    expect(within(admin).queryByRole('link')).not.toBeInTheDocument()
    expect(within(admin).getByText('Ada Admin')).toBeInTheDocument()
    expect(within(admin).getByText('admin', { selector: '.small' })).toBeInTheDocument()
    expect(within(admin).getAllByText('—')).toHaveLength(3)

    expect(within(maria).getByRole('link', { name: 'Maria Garcia' })).toHaveAttribute('href', '/employees/1')
    expect(within(maria).getByText('Engineering Manager')).toBeInTheDocument()
    expect(within(maria).getByText('$120,000')).toBeInTheDocument()

    expect(within(priya).getByRole('link', { name: 'Maria Garcia' })).toHaveAttribute('href', '/employees/1')
    expect(within(priya).getByText('$90,000')).toBeInTheDocument()

    expect(gone).toHaveClass('row-deactivated')
    expect(within(gone).getByText('Deactivated')).toBeInTheDocument()
    expect(within(maria).queryByText('Deactivated')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Manage' })).toHaveLength(5)
  })
})

describe('UsersPage creating accounts', () => {
  it('opens the form with only active managers who have employee records, and cancels', async () => {
    vi.mocked(listUsers).mockResolvedValue(users)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: '+ New account' }))
    expect(screen.getByRole('heading', { name: 'New user form' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ New account' })).not.toBeInTheDocument()
    const options = within(screen.getByRole('list', { name: 'Manager options' })).getAllByRole('listitem')
    expect(options.map((o) => o.textContent)).toEqual(['Maria Garcia'])
    await user.click(screen.getByRole('button', { name: 'Cancel form' }))
    expect(screen.queryByRole('heading', { name: 'New user form' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ New account' })).toBeInTheDocument()
  })

  it('passes no managers while the list has not loaded', async () => {
    vi.mocked(listUsers).mockRejectedValue(apiError(500, 'Boom'))
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Something went wrong' })
    await user.click(screen.getByRole('button', { name: '+ New account' }))
    expect(within(screen.getByRole('list', { name: 'Manager options' })).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('announces a created employee, closes the form and reloads', async () => {
    vi.mocked(listUsers).mockResolvedValue(users)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: '+ New account' }))
    await user.click(screen.getByRole('button', { name: 'Create employee' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      "New Hire created as employee. Add them to a project from that project's Team card.",
    )
    expect(screen.queryByRole('heading', { name: 'New user form' })).not.toBeInTheDocument()
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument())
  })

  it('announces a created admin', async () => {
    vi.mocked(listUsers).mockResolvedValue(users)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: '+ New account' }))
    await user.click(screen.getByRole('button', { name: 'Create admin' }))
    expect(screen.getByRole('status')).toHaveTextContent('New Admin created as admin.')
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument())
  })
})

describe('UsersPage managing accounts', () => {
  it('opens the panel for the chosen account, reloads on change and closes', async () => {
    vi.mocked(listUsers).mockResolvedValue(users)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    expect(screen.queryByTestId('account-panel')).not.toBeInTheDocument()
    await user.click(within(rows()[2]).getByRole('button', { name: 'Manage' }))
    expect(screen.getByRole('heading', { name: 'Panel for priya' })).toBeInTheDocument()
    expect(screen.queryByText('This is you')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Changed' }))
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('Loading accounts…')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Panel for priya' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close panel' }))
    expect(screen.queryByTestId('account-panel')).not.toBeInTheDocument()
  })

  it('flags your own account in the panel', async () => {
    vi.mocked(listUsers).mockResolvedValue(users)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    await user.click(within(rows()[0]).getByRole('button', { name: 'Manage' }))
    expect(screen.getByRole('heading', { name: 'Panel for admin' })).toBeInTheDocument()
    expect(screen.getByText('This is you')).toBeInTheDocument()
  })

  it('switches the panel when another Manage button is clicked', async () => {
    vi.mocked(listUsers).mockResolvedValue(users)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    await user.click(within(rows()[1]).getByRole('button', { name: 'Manage' }))
    expect(screen.getByRole('heading', { name: 'Panel for maria' })).toBeInTheDocument()
    await user.click(within(rows()[3]).getByRole('button', { name: 'Manage' }))
    expect(screen.getByRole('heading', { name: 'Panel for gone' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Panel for maria' })).not.toBeInTheDocument()
  })
})

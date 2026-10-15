import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PeoplePage from './PeoplePage'
import { listEmployees } from '../services/employeeService'
import { ADMIN, EMPLOYEE, MANAGER, apiError, renderWithProviders } from '../test/helpers'

vi.mock('../services/employeeService')

const PEOPLE = [
  { employeeId: 1, name: 'Maria Garcia', username: 'maria', title: 'Lead', role: 'manager' },
  { employeeId: 3, name: 'Priya Patel', username: 'priya', title: null, role: 'employee' },
]

describe('PeoplePage', () => {
  it('shows a loading state then the people table', async () => {
    vi.mocked(listEmployees).mockResolvedValue(PEOPLE)
    renderWithProviders(<PeoplePage />, { user: MANAGER })
    expect(screen.getByRole('status')).toHaveTextContent('Loading people…')
    expect(screen.getByText('You and the people on your projects')).toBeInTheDocument()

    expect(await screen.findByRole('link', { name: 'Maria Garcia' })).toHaveAttribute('href', '/employees/1')
    expect(screen.getByText('maria')).toBeInTheDocument()
    expect(screen.getByText('Lead')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('manager')).toBeInTheDocument()
    expect(screen.getByText('employee')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(listEmployees).toHaveBeenCalledWith('')
  })

  it('describes the admin view for admins', async () => {
    vi.mocked(listEmployees).mockResolvedValue(PEOPLE)
    renderWithProviders(<PeoplePage />, { user: ADMIN })
    expect(screen.getByText('All managers and employees (admin view)')).toBeInTheDocument()
    await screen.findByRole('table')
  })

  it('shows an empty message when nobody is visible', async () => {
    vi.mocked(listEmployees).mockResolvedValue([])
    renderWithProviders(<PeoplePage />, { user: EMPLOYEE })
    expect(await screen.findByText('No one to show yet.')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('reads the query from the URL and reports no matches', async () => {
    vi.mocked(listEmployees).mockResolvedValue([])
    renderWithProviders(<PeoplePage />, { route: '/people?q=zed', path: '/people' })
    expect(await screen.findByText('No one matches “zed”.')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('searchbox')).toHaveValue('zed')
    expect(listEmployees).toHaveBeenCalledWith('zed')
  })

  it('searches again after typing in the search box', async () => {
    const user = userEvent.setup()
    vi.mocked(listEmployees).mockResolvedValueOnce(PEOPLE).mockResolvedValueOnce([PEOPLE[0]])
    renderWithProviders(<PeoplePage />, { route: '/people', path: '/people' })
    await screen.findByRole('table')
    await user.type(screen.getByRole('searchbox'), 'mar')
    await waitFor(() => expect(listEmployees).toHaveBeenCalledWith('mar'))
    await waitFor(() => expect(screen.queryByText('Priya Patel')).not.toBeInTheDocument())
    expect(screen.getByText('Maria Garcia')).toBeInTheDocument()
  })

  it('shows a friendly 403 without retry', async () => {
    vi.mocked(listEmployees).mockRejectedValue(apiError(403, 'Not allowed'))
    renderWithProviders(<PeoplePage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No access')
    expect(screen.getByRole('link', { name: 'Back to my projects' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('shows a generic error and retries on demand', async () => {
    const user = userEvent.setup()
    vi.mocked(listEmployees).mockRejectedValueOnce(apiError(500, 'Server exploded')).mockResolvedValueOnce(PEOPLE)
    renderWithProviders(<PeoplePage />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong')
    expect(alert).toHaveTextContent('Server exploded')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(listEmployees).toHaveBeenCalledTimes(2)
  })
})

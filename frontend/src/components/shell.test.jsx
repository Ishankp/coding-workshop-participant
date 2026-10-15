import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Routes, Route } from 'react-router-dom'
import Layout from './Layout'
import RequireAuth from './RequireAuth'
import { ADMIN, EMPLOYEE, MANAGER, renderWithProviders } from '../test/helpers'

describe('RequireAuth', () => {
  it('renders children when logged in', () => {
    renderWithProviders(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
      { user: EMPLOYEE },
    )
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })

  it('redirects to /login when logged out', () => {
    renderWithProviders(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
      { user: null },
    )
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })
})

describe('Layout', () => {
  const layoutWithOutlet = (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<p>Page body</p>} />
      </Route>
    </Routes>
  )

  it('shows navigation, the user name, role and the page for an employee', () => {
    renderWithProviders(layoutWithOutlet, { user: EMPLOYEE })
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'People' })).toHaveAttribute('href', '/employees')
    expect(screen.getByRole('link', { name: 'My time' })).toHaveAttribute('href', '/employees/3/time-log')
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Priya Patel' })).toHaveAttribute('href', '/employees/3')
    expect(screen.getByText('employee')).toBeInTheDocument()
    expect(screen.getByText('Page body')).toBeInTheDocument()
  })

  it('shows the Accounts link and no profile link for an admin', () => {
    renderWithProviders(layoutWithOutlet, { user: ADMIN })
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/users')
    expect(screen.queryByRole('link', { name: 'My time' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ada Admin' })).not.toBeInTheDocument()
    expect(screen.getByText('Ada Admin')).toBeInTheDocument()
  })

  it('falls back to the username when there is no name', () => {
    renderWithProviders(layoutWithOutlet, { user: { ...MANAGER, firstName: null, lastName: null } })
    expect(screen.getByRole('link', { name: 'maria' })).toBeInTheDocument()
  })

  it('signs out', async () => {
    const logout = vi.fn()
    renderWithProviders(layoutWithOutlet, { user: MANAGER, logout })
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })
})

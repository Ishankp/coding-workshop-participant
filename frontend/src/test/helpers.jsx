import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../context/authContext'

export const ADMIN = { username: 'admin', firstName: 'Ada', lastName: 'Admin', role: 'admin', employeeId: null }
export const MANAGER = { username: 'maria', firstName: 'Maria', lastName: 'Garcia', role: 'manager', employeeId: 1 }
export const EMPLOYEE = { username: 'priya', firstName: 'Priya', lastName: 'Patel', role: 'employee', employeeId: 3 }

/**
 * Render `ui` inside a router and a fake auth context.
 * @param {import('react').ReactElement} ui
 * @param {{user?: object|null, route?: string, path?: string, login?: Function, logout?: Function}} [options]
 *   `path` is the route pattern to mount `ui` on (e.g. '/projects/:projectId'); `route` the initial URL.
 */
export function renderWithProviders(ui, { user = MANAGER, route = '/', path = '*', login = vi.fn(), logout = vi.fn() } = {}) {
  const auth = { user, userId: user ? 99 : null, login, logout }
  const result = render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return { ...result, auth }
}

/** A rejected-promise error shaped like the API client's ApiError. */
export function apiError(status, message, fields) {
  const error = new Error(message)
  error.status = status
  error.code = 'error'
  error.fields = fields
  return error
}

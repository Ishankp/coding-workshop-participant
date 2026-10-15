import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './context/AuthProvider'
import { apiRequest } from './services/api'

vi.mock('./services/api', async (importOriginal) => ({ ...(await importOriginal()), apiRequest: vi.fn() }))

const SESSION = { userId: 4, token: 'tok', user: { username: 'priya', firstName: 'Priya', lastName: 'Patel', role: 'employee', employeeId: 3 } }

describe('App', () => {
  it('shows the login page to a visitor', () => {
    window.history.pushState({}, '', '/')
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the projects page inside the shell to a signed-in user', async () => {
    localStorage.setItem('session', JSON.stringify(SESSION))
    vi.mocked(apiRequest).mockResolvedValue([])
    window.history.pushState({}, '', '/')
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Welcome, Priya' })).toBeInTheDocument()
  })

  it('shows the not-found page for an unknown URL', () => {
    localStorage.setItem('session', JSON.stringify(SESSION))
    window.history.pushState({}, '', '/nowhere')
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument()
  })
})

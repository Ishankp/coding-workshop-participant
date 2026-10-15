import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'
import * as api from '../services/api'
import * as authService from '../services/authService'

vi.mock('../services/api', () => ({ setAuthToken: vi.fn(), setUnauthorizedHandler: vi.fn() }))
vi.mock('../services/authService', async (importOriginal) => ({ ...(await importOriginal()), login: vi.fn() }))

const SESSION = { userId: 4, token: 'tok', user: { username: 'priya', role: 'employee' } }

function Probe() {
  const { user, userId, login, logout } = useAuth()
  return (
    <div>
      <p>{user ? `${user.username}:${userId}` : 'anonymous'}</p>
      <button onClick={() => login('priya', 'pw')}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

describe('AuthProvider', () => {
  it('restores a saved session and syncs the token', () => {
    localStorage.setItem('session', JSON.stringify(SESSION))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByText('priya:4')).toBeInTheDocument()
    expect(api.setAuthToken).toHaveBeenCalledWith('tok')
    expect(api.setUnauthorizedHandler).toHaveBeenCalledWith(expect.any(Function))
  })

  it('starts anonymous, logs in, then logs out', async () => {
    vi.mocked(authService.login).mockResolvedValue(SESSION)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByText('anonymous')).toBeInTheDocument()
    expect(api.setAuthToken).toHaveBeenCalledWith(null)

    await userEvent.click(screen.getByText('login'))
    expect(await screen.findByText('priya:4')).toBeInTheDocument()
    expect(authService.login).toHaveBeenCalledWith('priya', 'pw')
    expect(JSON.parse(localStorage.getItem('session'))).toEqual(SESSION)
    expect(api.setAuthToken).toHaveBeenLastCalledWith('tok')

    await userEvent.click(screen.getByText('logout'))
    expect(screen.getByText('anonymous')).toBeInTheDocument()
    expect(localStorage.getItem('session')).toBeNull()
    expect(api.setAuthToken).toHaveBeenLastCalledWith(null)
  })

  it('logs out when the API reports an unauthorized request', () => {
    localStorage.setItem('session', JSON.stringify(SESSION))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    const handler = vi.mocked(api.setUnauthorizedHandler).mock.calls.at(-1)[0]
    act(() => handler())
    expect(screen.getByText('anonymous')).toBeInTheDocument()
  })

  it('unregisters the handler on unmount', () => {
    const { unmount } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    unmount()
    expect(api.setUnauthorizedHandler).toHaveBeenLastCalledWith(null)
  })
})

describe('useAuth', () => {
  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>')
  })
})

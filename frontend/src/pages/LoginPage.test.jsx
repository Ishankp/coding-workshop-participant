import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from './LoginPage'
import { MANAGER, apiError, renderWithProviders } from '../test/helpers'

const PATH = '/signin'

function renderLogin({ login = vi.fn().mockResolvedValue(MANAGER), user = null, route = PATH } = {}) {
  const result = renderWithProviders(<LoginPage />, { user, login, route, path: PATH })
  return { ...result, login }
}

describe('LoginPage', () => {
  it('renders the sign-in form', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Username/)).toHaveValue('')
    expect(screen.getByLabelText(/Password/)).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('redirects an already signed-in user to the page they came from', () => {
    renderLogin({ user: MANAGER, route: { pathname: PATH, state: { from: { pathname: '/login' } } } })
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('redirects an already signed-in user home when there is no origin', async () => {
    renderLogin({ user: MANAGER })
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('validates empty fields without calling login', async () => {
    const user = userEvent.setup()
    const { login } = renderLogin()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText('Username is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('aria-describedby', 'username-error')
    expect(screen.getByLabelText(/Password/)).toHaveAttribute('aria-describedby', 'password-error')
    expect(login).not.toHaveBeenCalled()
  })

  it('validates only the missing field and clears the error when typing', async () => {
    const user = userEvent.setup()
    const { login } = renderLogin()
    await user.type(screen.getByLabelText(/Username/), '  maria ')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.queryByText('Username is required')).not.toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/Password/), 'x')
    expect(screen.queryByText('Password is required')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Password/)).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText(/Password/)).not.toHaveAttribute('aria-describedby')
  })

  it('signs in with trimmed username and navigates to the origin page', async () => {
    const user = userEvent.setup()
    const { login } = renderLogin({ route: { pathname: PATH, state: { from: { pathname: '/login' } } } })
    await user.type(screen.getByLabelText(/Username/), '  maria ')
    await user.type(screen.getByLabelText(/Password/), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(login).toHaveBeenCalledWith('maria', 'secret')
    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })

  it('shows a busy state while signing in and goes home by default', async () => {
    const user = userEvent.setup()
    let resolveLogin
    const login = vi.fn(() => new Promise((resolve) => { resolveLogin = resolve }))
    renderLogin({ login })
    await user.type(screen.getByLabelText(/Username/), 'maria')
    await user.type(screen.getByLabelText(/Password/), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
    expect(screen.getByLabelText(/Username/)).toBeDisabled()
    expect(screen.getByLabelText(/Password/)).toBeDisabled()

    resolveLogin(MANAGER)
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument())
  })

  it('shows the server message and field errors when login fails', async () => {
    const user = userEvent.setup()
    const login = vi.fn().mockRejectedValue(apiError(401, 'Wrong password', { password: 'Does not match' }))
    renderLogin({ login })
    await user.type(screen.getByLabelText(/Username/), 'maria')
    await user.type(screen.getByLabelText(/Password/), 'nope')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password')
    expect(screen.getByText('Does not match')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('shows a generic failure without field errors', async () => {
    const user = userEvent.setup()
    const login = vi.fn().mockRejectedValue(new Error('Network down'))
    renderLogin({ login })
    await user.type(screen.getByLabelText(/Username/), 'maria')
    await user.type(screen.getByLabelText(/Password/), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
    expect(screen.queryByText('Does not match')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Username/)).toHaveAttribute('aria-invalid', 'false')
  })
})

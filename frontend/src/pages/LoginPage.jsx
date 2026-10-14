import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

function validate({ username, password }) {
  const errors = {}
  if (!username.trim()) errors.username = 'Username is required'
  if (!password) errors.password = 'Password is required'
  return errors
}

/**
 * Login form. On success, returns the user to the page they originally asked for.
 */
export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname ?? '/'

  const [form, setForm] = useState({ username: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={redirectTo} replace />

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')

    const errors = validate(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length) return

    setSubmitting(true)
    try {
      await login(form.username.trim(), form.password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setFieldErrors(err.fields ?? {})
      setFormError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <form className="card login-card" onSubmit={handleSubmit} noValidate>
        <h1>Sign in</h1>
        <p className="muted">Project management workspace</p>

        {formError && (
          <div className="alert" role="alert">
            {formError}
          </div>
        )}

        <label htmlFor="username">
          Username <span aria-hidden="true">*</span>
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={form.username}
          onChange={updateField}
          disabled={submitting}
          aria-invalid={Boolean(fieldErrors.username)}
          aria-describedby={fieldErrors.username ? 'username-error' : undefined}
          required
        />
        {fieldErrors.username && (
          <p id="username-error" className="field-error">
            {fieldErrors.username}
          </p>
        )}

        <label htmlFor="password">
          Password <span aria-hidden="true">*</span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={updateField}
          disabled={submitting}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          required
        />
        {fieldErrors.password && (
          <p id="password-error" className="field-error">
            {fieldErrors.password}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}

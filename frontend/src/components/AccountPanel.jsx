import { useState } from 'react'
import PropTypes from 'prop-types'
import { deactivateUser, reactivateUser, setUserPassword, updateUser } from '../services/userService'

const ROLE_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
]

/**
 * Admin controls for one account: edit details (and salary), set a new password,
 * deactivate or reactivate. `onChanged` reloads the list; `onClose` hides the panel.
 */
export default function AccountPanel({ account, isSelf, onChanged, onClose }) {
  const [form, setForm] = useState({
    email: account.email,
    firstName: account.firstName ?? '',
    lastName: account.lastName ?? '',
    role: account.role,
    title: account.title ?? '',
    salary: account.salary === null || account.salary === undefined ? '' : String(account.salary),
  })
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [message, setMessage] = useState({ kind: '', text: '' })
  const [busy, setBusy] = useState(false)
  const isAdminAccount = account.role === 'admin'

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const run = async (action, successText) => {
    setBusy(true)
    setMessage({ kind: '', text: '' })
    try {
      await action()
      setMessage({ kind: 'ok', text: successText })
      await onChanged()
    } catch (err) {
      const fieldErrs = err.fields ?? {}
      setFieldErrors(fieldErrs)
      if (!Object.keys(fieldErrs).length) setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const handleSave = (event) => {
    event.preventDefault()
    run(
      () =>
        updateUser(account.userId, {
          email: form.email.trim(),
          role: form.role,
          firstName: form.firstName.trim() || null,
          lastName: form.lastName.trim() || null,
          ...(!isAdminAccount && { title: form.title.trim() || null, salary: form.salary === '' ? null : Number(form.salary) }),
        }),
      'Details saved.',
    )
  }

  const handlePassword = (event) => {
    event.preventDefault()
    if (password.length < 8) {
      setFieldErrors((prev) => ({ ...prev, password: 'At least 8 characters' }))
      return
    }
    run(async () => {
      await setUserPassword(account.userId, password)
      setPassword('')
    }, 'Password changed. Share the new one with the person out of band.')
  }

  const handleActive = () => {
    const deactivated = Boolean(account.deactivatedAt)
    const question = deactivated
      ? `Reactivate ${account.name}? They'll be able to log in again.`
      : `Deactivate ${account.name}? They won't be able to log in and will leave team pickers; their history stays.`
    if (!window.confirm(question)) return
    run(
      () => (deactivated ? reactivateUser(account.userId) : deactivateUser(account.userId)),
      deactivated ? `${account.name} reactivated.` : `${account.name} deactivated.`,
    )
  }

  const errorId = (name) => (fieldErrors[name] ? `acct-${name}-error` : undefined)
  const field = (name, label, props = {}) => (
    <div className="field">
      <label htmlFor={`acct-${name}`}>{label}</label>
      <input
        id={`acct-${name}`}
        name={name}
        value={form[name]}
        onChange={updateField}
        disabled={busy}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={errorId(name)}
        {...props}
      />
      {fieldErrors[name] && (
        <p id={`acct-${name}-error`} className="field-error">
          {fieldErrors[name]}
        </p>
      )}
    </div>
  )

  return (
    <div className="card account-panel">
      <div className="milestone-header">
        <h3>
          {account.name} <span className="muted">· {account.username}</span>
          {account.deactivatedAt && <span className="status-badge"> Deactivated</span>}
        </h3>
        <button type="button" className="secondary small-button" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>

      {message.text && (
        <p className={message.kind === 'error' ? 'alert' : 'notice'} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      <form onSubmit={handleSave} noValidate>
        <div className="time-form-grid">
          {field('email', 'Email', { type: 'email' })}
          {field('firstName', 'First name', { maxLength: 100 })}
          {field('lastName', 'Last name', { maxLength: 100 })}
          <div className="field">
            <label htmlFor="acct-role">Role</label>
            {isAdminAccount ? (
              <input id="acct-role" value="Admin" disabled />
            ) : (
              <select id="acct-role" name="role" value={form.role} onChange={updateField} disabled={busy} aria-invalid={Boolean(fieldErrors.role)}>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {fieldErrors.role && <p className="field-error">{fieldErrors.role}</p>}
          </div>
          {!isAdminAccount && field('title', 'Job title', { maxLength: 255 })}
          {!isAdminAccount && field('salary', 'Annual salary (USD)', { type: 'number', min: '0', step: '0.01', inputMode: 'decimal' })}
          {!isAdminAccount && (
            <div className="field">
              <label htmlFor="acct-manager">Manager</label>
              <input id="acct-manager" value={account.manager?.name ?? '—'} disabled />
              <p className="muted small field-hint">Fixed once set.</p>
            </div>
          )}
        </div>
        <div className="form-actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>

      <form className="inline-form account-password" onSubmit={handlePassword} noValidate>
        <div className="field">
          <label htmlFor="acct-password">New password</label>
          <input
            id="acct-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setFieldErrors((prev) => ({ ...prev, password: undefined }))
            }}
            disabled={busy}
            aria-invalid={Boolean(fieldErrors.password)}
          />
          {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
        </div>
        <button type="submit" className="secondary" disabled={busy || !password}>
          Set password
        </button>
      </form>

      <div className="form-actions account-active">
        <button type="button" className={`secondary ${account.deactivatedAt ? '' : 'danger-button'}`} onClick={handleActive} disabled={busy || isSelf}>
          {account.deactivatedAt ? 'Reactivate account' : 'Deactivate account'}
        </button>
        {isSelf && <span className="muted small">You can&apos;t deactivate your own account.</span>}
      </div>
    </div>
  )
}

AccountPanel.propTypes = {
  account: PropTypes.shape({
    userId: PropTypes.number.isRequired,
    username: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    firstName: PropTypes.string,
    lastName: PropTypes.string,
    role: PropTypes.string.isRequired,
    title: PropTypes.string,
    salary: PropTypes.number,
    deactivatedAt: PropTypes.string,
    manager: PropTypes.shape({ employeeId: PropTypes.number, name: PropTypes.string }),
  }).isRequired,
  isSelf: PropTypes.bool.isRequired,
  onChanged: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}

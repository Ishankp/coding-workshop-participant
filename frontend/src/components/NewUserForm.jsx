import { useState } from 'react'
import PropTypes from 'prop-types'
import { createUser } from '../services/userService'

const EMPTY = {
  username: '',
  email: '',
  firstName: '',
  lastName: '',
  role: 'employee',
  password: '',
  title: '',
  salary: '',
  managerId: '',
}

function validate(form) {
  const errors = {}
  if (!/^[A-Za-z0-9._-]{3,100}$/.test(form.username.trim())) errors.username = '3-100 letters, digits, dots, dashes or underscores'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errors.email = 'Must be a valid email address'
  if (form.password.length < 8) errors.password = 'At least 8 characters'
  if (form.role !== 'admin' && form.salary !== '' && (Number.isNaN(Number(form.salary)) || Number(form.salary) < 0)) {
    errors.salary = "Can't be negative"
  }
  return errors
}

/**
 * Admin form to create an account. Managers and employees get an employee record
 * (title, salary, manager); admins don't. `managers` fills the manager dropdown.
 */
export default function NewUserForm({ managers, onCreated, onCancel }) {
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isAdmin = form.role === 'admin'

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
      const created = await createUser({
        username: form.username.trim(),
        email: form.email.trim(),
        role: form.role,
        password: form.password,
        ...(form.firstName.trim() && { firstName: form.firstName.trim() }),
        ...(form.lastName.trim() && { lastName: form.lastName.trim() }),
        ...(!isAdmin && form.title.trim() && { title: form.title.trim() }),
        ...(!isAdmin && form.salary !== '' && { salary: Number(form.salary) }),
        ...(!isAdmin && form.managerId && { managerId: Number(form.managerId) }),
      })
      onCreated(created)
    } catch (err) {
      // Field errors go next to their fields; anything else (e.g. a 409 conflict) goes in the banner
      const fieldErrs = err.fields ?? {}
      setFieldErrors(fieldErrs)
      setFormError(Object.keys(fieldErrs).length ? '' : err.message)
      setSubmitting(false)
    }
  }

  const errorId = (name) => (fieldErrors[name] ? `user-${name}-error` : undefined)
  const field = (name, label, props = {}, hint = null) => (
    <div className="field">
      <label htmlFor={`user-${name}`}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={`user-${name}`}
        name={name}
        value={form[name]}
        onChange={updateField}
        disabled={submitting}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={errorId(name)}
        {...props}
      />
      {hint && !fieldErrors[name] && <p className="muted small field-hint">{hint}</p>}
      {fieldErrors[name] && (
        <p id={`user-${name}-error`} className="field-error">
          {fieldErrors[name]}
        </p>
      )}
    </div>
  )

  return (
    <form className="card time-form" onSubmit={handleSubmit} noValidate aria-labelledby="new-user-heading">
      <h2 id="new-user-heading">New account</h2>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}
      <div className="time-form-grid">
        <div className="field">
          <label htmlFor="user-role">
            Role <span aria-hidden="true">*</span>
          </label>
          <select id="user-role" name="role" value={form.role} onChange={updateField} disabled={submitting}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          {fieldErrors.role && <p className="field-error">{fieldErrors.role}</p>}
        </div>
        {field('username', 'Username', { required: true, autoComplete: 'off', autoFocus: true })}
        {field('email', 'Email', { required: true, type: 'email', autoComplete: 'off' })}
        {field('password', 'Initial password', { required: true, type: 'password', autoComplete: 'new-password' }, 'At least 8 characters; share it with the person out of band')}
        {field('firstName', 'First name', { maxLength: 100 })}
        {field('lastName', 'Last name', { maxLength: 100 })}
        {!isAdmin && field('title', 'Job title', { maxLength: 255 })}
        {!isAdmin && field('salary', 'Annual salary (USD)', { type: 'number', min: '0', step: '0.01', inputMode: 'decimal' }, 'Used to cost logged hours against project budgets')}
        {!isAdmin && (
          <div className="field">
            <label htmlFor="user-managerId">Manager</label>
            <select
              id="user-managerId"
              name="managerId"
              value={form.managerId}
              onChange={updateField}
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.managerId)}
              aria-describedby={errorId('managerId')}
            >
              <option value="">No manager yet</option>
              {managers.map((m) => (
                <option key={m.employeeId} value={m.employeeId}>
                  {m.name}
                </option>
              ))}
            </select>
            {!fieldErrors.managerId && <p className="muted small field-hint">Fixed once set; it can&apos;t be changed later.</p>}
            {fieldErrors.managerId && (
              <p id="user-managerId-error" className="field-error">
                {fieldErrors.managerId}
              </p>
            )}
          </div>
        )}
      </div>
      {isAdmin && <p className="muted small">Admins have no employee record: no title, salary, manager, projects or time log.</p>}
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

NewUserForm.propTypes = {
  managers: PropTypes.arrayOf(
    PropTypes.shape({ employeeId: PropTypes.number.isRequired, name: PropTypes.string.isRequired }),
  ).isRequired,
  onCreated: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
}

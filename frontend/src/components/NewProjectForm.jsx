import { useState } from 'react'
import PropTypes from 'prop-types'
import { createProject } from '../services/projectService'

const EMPTY = { title: '', startDate: '', endDate: '', budget: '' }

function validate(form) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Title is required'
  if (form.startDate && form.endDate && form.endDate < form.startDate) errors.endDate = 'Must be on or after the start date'
  if (form.budget !== '' && (Number.isNaN(Number(form.budget)) || Number(form.budget) < 0)) errors.budget = "Can't be negative"
  return errors
}

/**
 * Inline form to create a project (managers and admins).
 * `onCreated` receives the new project; `onCancel` closes the form.
 */
export default function NewProjectForm({ onCreated, onCancel }) {
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      const project = await createProject({
        title: form.title.trim(),
        ...(form.startDate && { startDate: form.startDate }),
        ...(form.endDate && { endDate: form.endDate }),
        ...(form.budget !== '' && { budget: Number(form.budget) }),
      })
      onCreated(project)
    } catch (err) {
      setFieldErrors(err.fields ?? {})
      setFormError(err.fields ? '' : err.message)
      setSubmitting(false)
    }
  }

  const errorId = (name) => (fieldErrors[name] ? `project-${name}-error` : undefined)
  const field = (name, label, props = {}) => (
    <div className="field">
      <label htmlFor={`project-${name}`}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={`project-${name}`}
        name={name}
        value={form[name]}
        onChange={updateField}
        disabled={submitting}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={errorId(name)}
        {...props}
      />
      {fieldErrors[name] && (
        <p id={`project-${name}-error`} className="field-error">
          {fieldErrors[name]}
        </p>
      )}
    </div>
  )

  return (
    <form className="card time-form" onSubmit={handleSubmit} noValidate aria-labelledby="new-project-heading">
      <h2 id="new-project-heading">New project</h2>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}
      <div className="time-form-grid">
        <div className="field-wide">{field('title', 'Title', { required: true, maxLength: 255, autoFocus: true })}</div>
        {field('startDate', 'Start date', { type: 'date' })}
        {field('endDate', 'End date', { type: 'date', min: form.startDate || undefined })}
        {field('budget', 'Budget (USD)', { type: 'number', min: '0', step: '0.01', inputMode: 'decimal', placeholder: 'e.g. 12000' })}
      </div>
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create project'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

NewProjectForm.propTypes = {
  onCreated: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
}

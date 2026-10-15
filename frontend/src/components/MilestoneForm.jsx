import { useState } from 'react'
import PropTypes from 'prop-types'
import { createMilestone } from '../services/projectService'
import { updateMilestone } from '../services/milestoneService'
import { formatDate } from '../utils/format'

const EMPTY = { title: '', description: '', startDate: '', endDate: '' }

const fromMilestone = (m) => ({
  title: m.name,
  description: m.description ?? '',
  startDate: m.startDate ?? '',
  endDate: m.endDate ?? '',
})

function validate(form, project) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Title is required'
  if (form.startDate && form.endDate && form.endDate < form.startDate) errors.endDate = 'Must be on or after the start date'
  if (project.startDate) {
    if (form.startDate && form.startDate < project.startDate) errors.startDate = `Can't be before the project starts (${formatDate(project.startDate)})`
    if (form.endDate && form.endDate < project.startDate) errors.endDate = errors.endDate ?? `Can't be before the project starts (${formatDate(project.startDate)})`
  }
  if (project.endDate) {
    if (form.endDate && form.endDate > project.endDate) errors.endDate = errors.endDate ?? `Can't be after the project ends (${formatDate(project.endDate)})`
    if (form.startDate && form.startDate > project.endDate) errors.startDate = errors.startDate ?? `Can't be after the project ends (${formatDate(project.endDate)})`
  }
  return errors
}

/**
 * Inline form to add a milestone to a project, or edit one when `milestone` is given
 * (managers who are members, and admins). Dates are limited to the project's dates.
 * `onSaved` receives the saved milestone; `onCancel` closes the form.
 */
export default function MilestoneForm({ project, milestone = null, onSaved, onCancel }) {
  const [form, setForm] = useState(milestone ? fromMilestone(milestone) : EMPTY)
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
    const errors = validate(form, project)
    setFieldErrors(errors)
    if (Object.keys(errors).length) return

    setSubmitting(true)
    try {
      const data = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      }
      const saved = milestone
        ? await updateMilestone(milestone.milestoneId, data)
        : await createMilestone(project.projectId, data)
      onSaved(saved)
    } catch (err) {
      setFieldErrors(err.fields ?? {})
      setFormError(err.fields ? '' : err.message)
      setSubmitting(false)
    }
  }

  const errorId = (name) => (fieldErrors[name] ? `milestone-${name}-error` : undefined)
  const field = (name, label, props = {}) => (
    <div className="field">
      <label htmlFor={`milestone-${name}`}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={`milestone-${name}`}
        name={name}
        value={form[name]}
        onChange={updateField}
        disabled={submitting}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={errorId(name)}
        {...props}
      />
      {fieldErrors[name] && (
        <p id={`milestone-${name}-error`} className="field-error">
          {fieldErrors[name]}
        </p>
      )}
    </div>
  )

  const bounds = [project.startDate && `from ${formatDate(project.startDate)}`, project.endDate && `to ${formatDate(project.endDate)}`]
    .filter(Boolean)
    .join(' ')

  return (
    <form className="card time-form" onSubmit={handleSubmit} noValidate aria-labelledby="new-milestone-heading">
      <h2 id="new-milestone-heading">{milestone ? 'Edit milestone' : 'New milestone'}</h2>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}
      <div className="time-form-grid">
        <div className="field-wide">{field('title', 'Title', { required: true, maxLength: 255, autoFocus: true })}</div>
        <div className="field-wide">{field('description', 'Description', { maxLength: 5000, placeholder: 'What this milestone delivers (optional)' })}</div>
        {field('startDate', 'Start date', { type: 'date', min: project.startDate || undefined, max: project.endDate || undefined })}
        {field('endDate', 'End date', { type: 'date', min: form.startDate || project.startDate || undefined, max: project.endDate || undefined })}
      </div>
      {bounds && <p className="muted small">Dates must stay within the project: {bounds}.</p>}
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : milestone ? 'Save changes' : 'Add milestone'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

MilestoneForm.propTypes = {
  project: PropTypes.shape({
    projectId: PropTypes.number.isRequired,
    startDate: PropTypes.string,
    endDate: PropTypes.string,
  }).isRequired,
  milestone: PropTypes.shape({
    milestoneId: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    startDate: PropTypes.string,
    endDate: PropTypes.string,
  }),
  onSaved: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
}

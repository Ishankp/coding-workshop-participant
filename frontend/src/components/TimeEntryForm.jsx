import { useState } from 'react'
import PropTypes from 'prop-types'
import { todayIsoDate } from '../utils/format'

const EMPTY = { milestoneId: '', workDate: todayIsoDate(), hours: '', note: '' }

function validate(form) {
  const errors = {}
  if (!form.milestoneId) errors.milestoneId = 'Choose a milestone'
  if (!form.workDate) errors.workDate = 'Date is required'
  else if (form.workDate > todayIsoDate()) errors.workDate = 'Cannot be in the future'
  const hours = Number(form.hours)
  if (form.hours === '' || Number.isNaN(hours)) errors.hours = 'Hours are required'
  else if (hours <= 0 || hours > 24) errors.hours = 'Must be more than 0 and at most 24'
  if (form.note.length > 500) errors.note = 'Must be at most 500 characters'
  return errors
}

const fromEntry = (entry) => ({
  milestoneId: String(entry.milestone.milestoneId),
  workDate: entry.workDate,
  hours: String(entry.hours),
  note: entry.note ?? '',
})

/**
 * Form to log hours on one of the employee's assigned milestones, or to change an
 * existing entry when `entry` is given. `onSubmit` receives {milestoneId, workDate,
 * hours, note?} and may reject with an ApiError; `onCancel` (edit mode) closes the form.
 */
export default function TimeEntryForm({ assignments, onSubmit, entry = null, onCancel = null }) {
  const [form, setForm] = useState(entry ? fromEntry(entry) : EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Group milestones by project for the select
  const projects = assignments.reduce((groups, a) => {
    const group = groups.find((g) => g.projectId === a.projectId)
    if (group) group.milestones.push(a)
    else groups.push({ projectId: a.projectId, projectTitle: a.projectTitle, milestones: [a] })
    return groups
  }, [])

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
      await onSubmit({
        milestoneId: Number(form.milestoneId),
        workDate: form.workDate,
        hours: Number(form.hours),
        ...(form.note.trim() && { note: form.note.trim() }),
      })
      // When adding, keep the milestone and date so several entries in a row are quick to add
      if (!entry) setForm((prev) => ({ ...prev, hours: '', note: '' }))
    } catch (err) {
      // Field errors go next to their fields; anything else (e.g. a 409 conflict) goes in the banner
      const fieldErrs = err.fields ?? {}
      setFieldErrors(fieldErrs)
      setFormError(Object.keys(fieldErrs).length ? '' : err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const errorId = (name) => (fieldErrors[name] ? `${name}-error` : undefined)

  return (
    <form className="card time-form" onSubmit={handleSubmit} noValidate aria-labelledby="log-hours-heading">
      <h2 id="log-hours-heading">{entry ? 'Edit entry' : 'Log hours'}</h2>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}

      <div className="time-form-grid">
        <div className="field">
          <label htmlFor="milestoneId">
            Milestone <span aria-hidden="true">*</span>
          </label>
          <select
            id="milestoneId"
            name="milestoneId"
            value={form.milestoneId}
            onChange={updateField}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.milestoneId)}
            aria-describedby={errorId('milestoneId')}
            required
          >
            <option value="">Choose…</option>
            {projects.map((project) => (
              <optgroup key={project.projectId} label={project.projectTitle}>
                {project.milestones.map((m) => (
                  <option key={m.milestoneId} value={m.milestoneId}>
                    {m.milestoneName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {fieldErrors.milestoneId && (
            <p id="milestoneId-error" className="field-error">
              {fieldErrors.milestoneId}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="workDate">
            Date <span aria-hidden="true">*</span>
          </label>
          <input
            id="workDate"
            name="workDate"
            type="date"
            max={todayIsoDate()}
            value={form.workDate}
            onChange={updateField}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.workDate)}
            aria-describedby={errorId('workDate')}
            required
          />
          {fieldErrors.workDate && (
            <p id="workDate-error" className="field-error">
              {fieldErrors.workDate}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="hours">
            Hours <span aria-hidden="true">*</span>
          </label>
          <input
            id="hours"
            name="hours"
            type="number"
            inputMode="decimal"
            min="0.25"
            max="24"
            step="0.25"
            placeholder="e.g. 7.5"
            value={form.hours}
            onChange={updateField}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.hours)}
            aria-describedby={errorId('hours')}
            required
          />
          {fieldErrors.hours && (
            <p id="hours-error" className="field-error">
              {fieldErrors.hours}
            </p>
          )}
        </div>

        <div className="field field-wide">
          <label htmlFor="note">Note</label>
          <input
            id="note"
            name="note"
            maxLength={500}
            placeholder="What did you work on? (optional)"
            value={form.note}
            onChange={updateField}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.note)}
            aria-describedby={errorId('note')}
          />
          {fieldErrors.note && (
            <p id="note-error" className="field-error">
              {fieldErrors.note}
            </p>
          )}
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : entry ? 'Save changes' : 'Add entry'}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

TimeEntryForm.propTypes = {
  assignments: PropTypes.arrayOf(
    PropTypes.shape({
      milestoneId: PropTypes.number.isRequired,
      milestoneName: PropTypes.string.isRequired,
      projectId: PropTypes.number.isRequired,
      projectTitle: PropTypes.string.isRequired,
    }),
  ).isRequired,
  onSubmit: PropTypes.func.isRequired,
  entry: PropTypes.shape({
    entryId: PropTypes.number.isRequired,
    workDate: PropTypes.string.isRequired,
    hours: PropTypes.number.isRequired,
    note: PropTypes.string,
    milestone: PropTypes.shape({ milestoneId: PropTypes.number.isRequired }).isRequired,
  }),
  onCancel: PropTypes.func,
}

import { useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { addDependency, removeDependency } from '../services/milestoneService'
import { formatDate } from '../utils/format'
import DependencyGraph from './DependencyGraph'

/**
 * The dependencies between a project's milestones, drawn as a flow diagram, with
 * an alert when a prerequisite is past due and not complete. Managers and admins
 * get a list to remove from and a form to add; `onChanged` reloads the project.
 */
export default function DependencyList({ milestones, dependencies, canEdit, onChanged }) {
  const [form, setForm] = useState({ milestoneId: '', dependsOnMilestoneId: '' })
  const [fieldError, setFieldError] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const updateField = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
    setFieldError('')
    setFormError('')
  }

  const handleAdd = async (event) => {
    event.preventDefault()
    if (!form.milestoneId || !form.dependsOnMilestoneId) {
      setFieldError('Choose both milestones')
      return
    }
    setBusy(true)
    try {
      await addDependency(Number(form.milestoneId), Number(form.dependsOnMilestoneId))
      setForm({ milestoneId: '', dependsOnMilestoneId: '' })
      await onChanged()
    } catch (err) {
      if (err.fields?.dependsOnMilestoneId) setFieldError(err.fields.dependsOnMilestoneId)
      else setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (dep) => {
    if (!window.confirm(`Remove: ${dep.milestoneName} depends on ${dep.dependsOnName}?`)) return
    setBusy(true)
    setFormError('')
    try {
      await removeDependency(dep.milestoneId, dep.dependsOnMilestoneId)
      await onChanged()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const alerts = dependencies.filter((d) => d.alert)

  return (
    <div className="dependencies">
      {dependencies.length === 0 ? (
        <p className="muted">No dependencies between milestones{canEdit ? ' yet' : ''}.</p>
      ) : (
        <>
          <div className="card dependency-graph-card">
            <DependencyGraph milestones={milestones} dependencies={dependencies} />
            <p className="muted small dependency-key">
              Arrows point from a milestone to the ones that wait on it.
              <span className="key-swatch key-complete" /> complete
              <span className="key-swatch key-progress" /> in progress
              <span className="key-swatch key-waiting" /> not started
              <span className="key-swatch key-alert" /> held up
            </p>
          </div>

          {alerts.length > 0 && (
            <ul className="plain-list dependency-alerts" role="alert">
              {alerts.map((dep) => (
                <li key={`${dep.milestoneId}-${dep.dependsOnMilestoneId}`} className="dependency-alert">
                  ⚠ <strong>{dep.milestoneName}</strong> is held up: {dep.alert}.
                </li>
              ))}
            </ul>
          )}

          {/* Plain-text version of the diagram for screen readers (and the manager's remove list) */}
          <ul className={`plain-list dependency-list ${canEdit ? '' : 'visually-hidden'}`}>
          {dependencies.map((dep) => (
            <li key={`${dep.milestoneId}-${dep.dependsOnMilestoneId}`} className={`card dependency ${dep.alert ? 'has-alert' : ''}`}>
              <div className="dependency-row">
                <Link to={`/milestones/${dep.milestoneId}`}>{dep.milestoneName}</Link>
                <span className="muted">depends on</span>
                <Link to={`/milestones/${dep.dependsOnMilestoneId}`}>{dep.dependsOnName}</Link>
                <span className={`status-badge ${dep.dependsOnCompleted ? 'milestone-status-completed' : dep.alert ? 'milestone-status-past_end_date' : ''}`}>
                  {dep.dependsOnCompleted ? 'Complete' : dep.alert ? 'Past due' : `Due ${formatDate(dep.dependsOnEndDate)}`}
                </span>
                {canEdit && (
                  <button type="button" className="secondary small-button dependency-remove" onClick={() => handleRemove(dep)} disabled={busy}>
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
          </ul>
        </>
      )}

      {canEdit && milestones.length >= 2 && (
        <form className="card dependency-form" onSubmit={handleAdd} noValidate>
          <h3>Add a dependency</h3>
          <div className="dependency-form-row">
            <label htmlFor="dep-milestone" className="visually-hidden">
              Milestone
            </label>
            <select id="dep-milestone" name="milestoneId" value={form.milestoneId} onChange={updateField} disabled={busy}>
              <option value="">Milestone…</option>
              {milestones.map((m) => (
                <option key={m.milestoneId} value={m.milestoneId}>
                  {m.name}
                </option>
              ))}
            </select>
            <span className="muted">depends on</span>
            <label htmlFor="dep-prerequisite" className="visually-hidden">
              Prerequisite milestone
            </label>
            <select
              id="dep-prerequisite"
              name="dependsOnMilestoneId"
              value={form.dependsOnMilestoneId}
              onChange={updateField}
              disabled={busy}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'dep-error' : undefined}
            >
              <option value="">Milestone…</option>
              {milestones
                .filter((m) => String(m.milestoneId) !== form.milestoneId)
                .map((m) => (
                  <option key={m.milestoneId} value={m.milestoneId}>
                    {m.name}
                  </option>
                ))}
            </select>
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Add'}
            </button>
          </div>
          {fieldError && (
            <p id="dep-error" className="field-error">
              {fieldError}
            </p>
          )}
          {formError && (
            <div className="alert" role="alert">
              {formError}
            </div>
          )}
          <p className="muted small">
            A milestone can&apos;t depend on itself or on a chain that leads back to it, and it can&apos;t start
            before the milestone it depends on.
          </p>
        </form>
      )}
    </div>
  )
}

DependencyList.propTypes = {
  milestones: PropTypes.arrayOf(
    PropTypes.shape({ milestoneId: PropTypes.number.isRequired, name: PropTypes.string.isRequired }),
  ).isRequired,
  dependencies: PropTypes.arrayOf(
    PropTypes.shape({
      milestoneId: PropTypes.number.isRequired,
      milestoneName: PropTypes.string.isRequired,
      dependsOnMilestoneId: PropTypes.number.isRequired,
      dependsOnName: PropTypes.string.isRequired,
      dependsOnEndDate: PropTypes.string,
      dependsOnCompleted: PropTypes.bool.isRequired,
      alert: PropTypes.string,
    }),
  ).isRequired,
  canEdit: PropTypes.bool.isRequired,
  onChanged: PropTypes.func.isRequired,
}

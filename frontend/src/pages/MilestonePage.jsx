import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useApiData } from '../hooks/useApiData'
import {
  archiveMilestone,
  completeMilestone,
  getMilestone,
  reopenMilestone,
  unarchiveMilestone,
} from '../services/milestoneService'
import MilestoneForm from '../components/MilestoneForm'
import { ErrorMessage, Loading } from '../components/StatusMessage'
import { formatDate, formatHours } from '../utils/format'

/**
 * One milestone's details, with a link back to its project.
 */
export default function MilestonePage() {
  const { milestoneId } = useParams()
  const loadMilestone = useCallback(() => getMilestone(milestoneId), [milestoneId])
  const { data: milestone, error, loading, reload } = useApiData(loadMilestone)
  const { role } = useAuth().user
  const canManage = role === 'admin' || role === 'manager'
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [editing, setEditing] = useState(false)

  const toggleComplete = async () => {
    const done = Boolean(milestone.completedAt)
    if (!window.confirm(done ? `Reopen "${milestone.name}"?` : `Mark "${milestone.name}" as complete?`)) return
    setArchiving(true)
    setArchiveError('')
    try {
      await (done ? reopenMilestone(milestone.milestoneId) : completeMilestone(milestone.milestoneId))
      reload()
    } catch (err) {
      setArchiveError(err.message)
    } finally {
      setArchiving(false)
    }
  }

  const toggleArchive = async () => {
    const archived = Boolean(milestone.archivedAt)
    const question = archived
      ? `Restore "${milestone.name}"? Employees will see it again and it will count towards progress.`
      : `Archive "${milestone.name}"? Employees won't see it and it won't count towards progress (hours still count in the budget).`
    if (!window.confirm(question)) return
    setArchiving(true)
    setArchiveError('')
    try {
      await (archived ? unarchiveMilestone(milestone.milestoneId) : archiveMilestone(milestone.milestoneId))
      reload()
    } catch (err) {
      setArchiveError(err.message)
    } finally {
      setArchiving(false)
    }
  }

  if (loading) return <Loading label="Loading milestone…" />
  if (error) return <ErrorMessage error={error} onRetry={reload} />

  return (
    <>
      <Link to={`/projects/${milestone.projectId}`} className="back-link">
        ← Back to project
      </Link>
      <div className="page-title">
        <h1>{milestone.name}</h1>
        {milestone.completedAt ? (
          <span className="status-badge milestone-status-completed">Completed {formatDate(milestone.completedAt)}</span>
        ) : (
          <span className="status-badge">Milestone</span>
        )}
        {milestone.archivedAt && <span className="status-badge">Archived {formatDate(milestone.archivedAt)}</span>}
        {canManage && (
          <span className="header-actions">
            {!editing && (
              <button type="button" className="secondary" onClick={() => setEditing(true)} disabled={archiving}>
                Edit
              </button>
            )}
            {!milestone.archivedAt && (
              <button type="button" onClick={toggleComplete} disabled={archiving}>
                {milestone.completedAt ? 'Reopen' : 'Mark complete'}
              </button>
            )}
            <button type="button" className="secondary" onClick={toggleArchive} disabled={archiving}>
              {archiving ? 'Saving…' : milestone.archivedAt ? 'Restore milestone' : 'Archive milestone'}
            </button>
          </span>
        )}
      </div>
      {editing && (
        <MilestoneForm
          project={{ projectId: milestone.projectId, startDate: milestone.projectStartDate, endDate: milestone.projectEndDate }}
          milestone={milestone}
          onSaved={() => {
            setEditing(false)
            reload()
          }}
          onCancel={() => setEditing(false)}
        />
      )}
      {archiveError && (
        <div className="alert" role="alert">
          {archiveError}
        </div>
      )}
      {milestone.projectArchivedAt && !milestone.archivedAt && (
        <p className="notice-muted">This milestone&apos;s project is archived, so employees can&apos;t see it.</p>
      )}

      <dl className="card details">
        <div>
          <dt>Start</dt>
          <dd>{formatDate(milestone.startDate)}</dd>
        </div>
        <div>
          <dt>End</dt>
          <dd>{formatDate(milestone.endDate)}</dd>
        </div>
      </dl>

      {(milestone.dependsOn.length > 0 || milestone.requiredBy.length > 0) && (
        <>
          <h2 className="section-title">Dependencies</h2>
          <div className="card dependency-detail">
            {milestone.dependsOn.length > 0 && (
              <div>
                <h3>Depends on</h3>
                <ul className="plain-list">
                  {milestone.dependsOn.map((d) => (
                    <li key={d.milestoneId}>
                      <Link to={`/milestones/${d.milestoneId}`}>{d.name}</Link>{' '}
                      <span className={`status-badge ${d.completed ? 'milestone-status-completed' : d.alert ? 'milestone-status-past_end_date' : ''}`}>
                        {d.completed ? 'Complete' : d.alert ? 'Past due' : 'Not complete'}
                      </span>
                      {d.alert && <p className="dependency-alert">⚠ {d.alert}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {milestone.requiredBy.length > 0 && (
              <div>
                <h3>Required by</h3>
                <ul className="plain-list">
                  {milestone.requiredBy.map((d) => (
                    <li key={d.milestoneId}>
                      <Link to={`/milestones/${d.milestoneId}`}>{d.name}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      <h2 className="section-title">Description</h2>
      <p className="card description">{milestone.description || <span className="muted">No description.</span>}</p>

      <h2 className="section-title">Work log ({formatHours(milestone.totalHours)})</h2>
      <p className="muted section-hint">What each person did on this milestone and how long it took, newest first.</p>
      {milestone.entries.length === 0 ? (
        <p className="muted">No hours logged on this milestone yet.</p>
      ) : (
        <>
          <ul className="plain-list chip-list work-log-totals" aria-label="Hours by person">
            {milestone.hoursByEmployee.map((person) => (
              <li key={person.employeeId}>
                <Link to={`/employees/${person.employeeId}`} className="chip">
                  {person.name} <span className="chip-hours">{formatHours(person.hours)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="card table-wrap">
            <table className="time-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Who</th>
                  <th scope="col" className="num">
                    Hours
                  </th>
                  <th scope="col">What they did</th>
                </tr>
              </thead>
              <tbody>
                {milestone.entries.map((entry) => (
                  <tr key={entry.entryId}>
                    <td>{formatDate(entry.workDate)}</td>
                    <td>
                      <Link to={`/employees/${entry.employee.employeeId}`}>{entry.employee.name}</Link>
                      {!entry.loggedBySelf && entry.loggedBy && (
                        <div className="muted small">
                          logged by {entry.loggedBy.name} <span className="role-badge">{entry.loggedBy.role}</span>
                        </div>
                      )}
                    </td>
                    <td className="num">{formatHours(entry.hours)}</td>
                    <td className={entry.note ? '' : 'muted'}>{entry.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

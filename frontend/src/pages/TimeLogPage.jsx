import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApiData } from '../hooks/useApiData'
import { addTimeEntry, deleteTimeEntry, getTimeLog } from '../services/employeeService'
import { ErrorMessage, Loading } from '../components/StatusMessage'
import TimeEntryForm from '../components/TimeEntryForm'
import { formatDate, formatHours } from '../utils/format'

const sumHours = (entries) => entries.reduce((total, e) => total + e.hours, 0)

/**
 * An employee's time log: total hours, a form to log more (when allowed),
 * and every entry with who logged it. Managers and admins can remove entries.
 */
export default function TimeLogPage() {
  const { employeeId } = useParams()
  const loadLog = useCallback(() => getTimeLog(employeeId), [employeeId])
  const { data, error, loading, reload } = useApiData(loadLog)

  // Local copy of the entries so adds and removes update the page without a reload
  const [entries, setEntries] = useState([])
  const [actionError, setActionError] = useState('')
  const [removingId, setRemovingId] = useState(null)
  useEffect(() => {
    if (data) setEntries(data.entries)
  }, [data])

  if (loading) return <Loading label="Loading time log…" />
  if (error) return <ErrorMessage error={error} onRetry={reload} />

  const { employee, permissions, assignments } = data
  const title = employee.isSelf ? 'My time log' : `${employee.name}’s time log`

  const handleAdd = async (entry) => {
    const created = await addTimeEntry(employeeId, entry)
    setEntries((prev) =>
      [created, ...prev].sort((a, b) => b.workDate.localeCompare(a.workDate) || b.entryId - a.entryId),
    )
  }

  const handleRemove = async (entry) => {
    const what = `${formatHours(entry.hours)} on ${formatDate(entry.workDate)} (${entry.milestone.name})`
    if (!window.confirm(`Remove ${what}?`)) return
    setActionError('')
    setRemovingId(entry.entryId)
    try {
      await deleteTimeEntry(employeeId, entry.entryId)
      setEntries((prev) => prev.filter((e) => e.entryId !== entry.entryId))
    } catch (err) {
      setActionError(err.message)
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <>
      <Link to={`/employees/${employee.employeeId}`} className="back-link">
        ← {employee.isSelf ? 'My profile' : employee.name}
      </Link>
      <div className="page-title">
        <h1>{title}</h1>
        <span className="status-badge">{formatHours(sumHours(entries))} total</span>
      </div>

      {permissions.canAdd &&
        (assignments.length > 0 ? (
          <TimeEntryForm assignments={assignments} onSubmit={handleAdd} />
        ) : (
          <p className="card muted">
            {employee.isSelf ? 'You aren’t' : `${employee.name} isn’t`} assigned to any milestones yet, so
            no hours can be logged.
          </p>
        ))}

      {actionError && (
        <div className="alert" role="alert">
          {actionError}
        </div>
      )}

      <h2 className="section-title">Entries ({entries.length})</h2>
      {entries.length === 0 ? (
        <p className="muted">No hours logged yet.</p>
      ) : (
        <div className="card table-wrap">
          <table className="time-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Project</th>
                <th scope="col">Milestone</th>
                <th scope="col" className="num">
                  Hours
                </th>
                <th scope="col">Note</th>
                <th scope="col">Logged by</th>
                {permissions.canDelete && (
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.entryId}>
                  <td>{formatDate(entry.workDate)}</td>
                  <td>
                    <Link to={`/projects/${entry.project.projectId}`}>{entry.project.title}</Link>
                  </td>
                  <td>
                    <Link to={`/milestones/${entry.milestone.milestoneId}`}>{entry.milestone.name}</Link>
                  </td>
                  <td className="num">{formatHours(entry.hours)}</td>
                  <td className={entry.note ? '' : 'muted'}>{entry.note ?? '—'}</td>
                  <td className="muted">{entry.loggedBy?.name ?? '—'}</td>
                  {permissions.canDelete && (
                    <td className="num">
                      <button
                        type="button"
                        className="secondary small-button"
                        onClick={() => handleRemove(entry)}
                        disabled={removingId === entry.entryId}
                        aria-label={`Remove entry for ${formatDate(entry.workDate)}`}
                      >
                        {removingId === entry.entryId ? 'Removing…' : 'Remove'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

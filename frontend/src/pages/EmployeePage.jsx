import { useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useApiData } from '../hooks/useApiData'
import { getEmployee } from '../services/employeeService'
import { ErrorMessage, Loading } from '../components/StatusMessage'
import TimeElapsedBar from '../components/TimeElapsedBar'
import { formatDate, formatHours } from '../utils/format'
import { MILESTONE_STATUS_LABELS, daysLeftText } from '../utils/milestones'

const PROJECT_STATUS_LABELS = { active: 'Active', completed: 'Completed', archived: 'Archived' }

/**
 * One employee: profile details, then each project they work on (that you share)
 * with the milestones they're assigned to in it.
 */
export default function EmployeePage() {
  const { employeeId } = useParams()
  const navigate = useNavigate()
  const isAdmin = useAuth().user.role === 'admin'
  const loadEmployee = useCallback(() => getEmployee(employeeId), [employeeId])
  const { data: employee, error, loading, reload } = useApiData(loadEmployee)

  if (loading) return <Loading label="Loading employee…" />
  if (error) return <ErrorMessage error={error} onRetry={reload} />

  return (
    <>
      <button type="button" className="link-button back-link" onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className="page-title">
        <h1>{employee.name}</h1>
        <span className="role-badge">{employee.role}</span>
        {employee.isSelf && <span className="status-badge">You</span>}
        {employee.canViewTimeLog && (
          <Link to={`/employees/${employee.employeeId}/time-log`} className="button-link">
            {employee.isSelf ? 'My time log' : 'Time log'}
          </Link>
        )}
      </div>
      {employee.title && <p className="muted subtitle">{employee.title}</p>}

      <dl className="card details">
        <div>
          <dt>Username</dt>
          <dd>{employee.username}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${employee.email}`}>{employee.email}</a>
          </dd>
        </div>
        <div>
          <dt>Manager</dt>
          <dd>
            {employee.manager ? (
              <Link to={`/employees/${employee.manager.employeeId}`}>{employee.manager.name}</Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>{employee.isSelf || isAdmin ? 'Total hours' : 'Hours on shared projects'}</dt>
          <dd className="stat">{formatHours(employee.totalHours)}</dd>
        </div>
      </dl>

      <h2 className="section-title">Projects ({employee.projects.length})</h2>
      {!employee.isSelf && !isAdmin && (
        <p className="muted section-hint">Only projects you&apos;re also a member of are shown.</p>
      )}

      {employee.projects.length === 0 ? (
        <p className="muted">Not assigned to any projects.</p>
      ) : (
        <ul className="plain-list employee-projects">
          {employee.projects.map((project) => (
            <li key={project.projectId} className="card">
              <div className="milestone-header">
                <h3>
                  <Link to={`/projects/${project.projectId}`}>{project.title}</Link>
                </h3>
                <span className={`status-badge status-${project.status}`}>
                  {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                </span>
              </div>
              <p className="muted hours">{formatHours(project.hoursSpent)} logged across its milestones</p>

              {project.milestones.length === 0 ? (
                <p className="muted">No milestones assigned in this project.</p>
              ) : (
                <ul className="plain-list employee-milestones">
                  {project.milestones.map((milestone) => (
                    <li key={milestone.milestoneId}>
                      <div className="milestone-header">
                        <Link to={`/milestones/${milestone.milestoneId}`}>{milestone.name}</Link>
                        <div className="milestone-meta">
                          <span className="hours-pill">{formatHours(milestone.hoursSpent)}</span>
                          <span className={`status-badge milestone-status-${milestone.status}`}>
                            {MILESTONE_STATUS_LABELS[milestone.status] ?? milestone.status}
                          </span>
                        </div>
                      </div>
                      <div className="milestone-schedule">
                        <span>
                          <span className="muted">Start</span> {formatDate(milestone.startDate)}
                        </span>
                        <span>
                          <span className="muted">End</span> {formatDate(milestone.endDate)}
                        </span>
                        {milestone.status === 'completed' ? (
                          <span>
                            <span className="muted">Completed</span> {formatDate(milestone.completedAt)}
                          </span>
                        ) : (
                          <span className="muted">{daysLeftText(milestone.daysLeft)}</span>
                        )}
                      </div>
                      {milestone.status !== 'completed' && (
                        <TimeElapsedBar percent={milestone.timeElapsedPercent} status={milestone.status} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

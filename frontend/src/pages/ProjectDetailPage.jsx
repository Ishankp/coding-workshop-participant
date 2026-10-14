import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useApiData } from '../hooks/useApiData'
import { getProject, getProjectBudget, getProjectMilestones } from '../services/projectService'
import BudgetCard from '../components/BudgetCard'
import EmployeeChips from '../components/EmployeeChips'
import MilestoneList from '../components/MilestoneList'
import { ErrorMessage, Loading } from '../components/StatusMessage'
import CompletionBar from '../components/CompletionBar'
import { formatCurrency, formatDate, projectStatus } from '../utils/format'
import { daysLeftText } from '../utils/milestones'

/**
 * One project: its details (budget vs spend for managers and admins), then its
 * milestones (most time elapsed first) with the employees working on each,
 * then members not on any milestone.
 */
export default function ProjectDetailPage() {
  const { projectId } = useParams()
  const { role } = useAuth().user
  const canSeeBudget = role === 'admin' || role === 'manager'
  const loadProject = useCallback(
    () =>
      Promise.all([
        getProject(projectId),
        getProjectMilestones(projectId),
        canSeeBudget ? getProjectBudget(projectId) : Promise.resolve(null),
      ]),
    [projectId, canSeeBudget],
  )
  const { data, error, loading, reload } = useApiData(loadProject)

  if (loading) return <Loading label="Loading project…" />
  if (error) return <ErrorMessage error={error} onRetry={reload} />

  const [project, { milestones, unassignedEmployees }, budget] = data
  const status = projectStatus(project)

  return (
    <>
      <Link to="/" className="back-link">
        ← Projects
      </Link>
      <div className="page-title">
        <h1>{project.title}</h1>
        <span className={`status-badge status-${status.toLowerCase()}`}>{status}</span>
      </div>

      <dl className="card details">
        <div>
          <dt>Start</dt>
          <dd>{formatDate(project.startDate)}</dd>
        </div>
        <div>
          <dt>End</dt>
          <dd>{formatDate(project.endDate)}</dd>
        </div>
        {canSeeBudget && (
          <div>
            <dt>Budget</dt>
            <dd>{formatCurrency(project.budget)}</dd>
          </div>
        )}
        {project.completedAt && (
          <div>
            <dt>Completed</dt>
            <dd>{formatDate(project.completedAt)}</dd>
          </div>
        )}
        {project.archivedAt && (
          <div>
            <dt>Archived</dt>
            <dd>{formatDate(project.archivedAt)}</dd>
          </div>
        )}
      </dl>

      <div className="card schedule-card">
        <div className="milestone-header">
          <h2>Progress</h2>
          <span className="muted small">
            {project.completion.percent !== null &&
              `${project.completion.completedMilestones} of ${project.completion.totalMilestones} milestones complete`}
          </span>
        </div>
        <CompletionBar completion={project.completion} legend />
        {project.timeElapsedPercent !== null && (
          <p className="muted small schedule-note">
            Schedule: {project.timeElapsedPercent}% of the planned time used · {daysLeftText(project.daysLeft)}
          </p>
        )}
      </div>

      {budget && <BudgetCard budget={budget} />}

      <h2 className="section-title">Milestones ({milestones.length})</h2>
      <p className="muted section-hint">
        Grouped by state; within a group, milestones closest to their end date are on top. Click a heading to
        collapse or expand it.
      </p>
      <MilestoneList milestones={milestones} />

      <h2 className="section-title">Not assigned to a milestone ({unassignedEmployees.length})</h2>
      {unassignedEmployees.length === 0 ? (
        <p className="muted">Every project member is working on at least one milestone.</p>
      ) : (
        <div className="card">
          <EmployeeChips employees={unassignedEmployees} label="Project members without a milestone" />
        </div>
      )}
    </>
  )
}

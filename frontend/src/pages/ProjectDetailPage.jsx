import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useApiData } from '../hooks/useApiData'
import {
  archiveProject,
  deleteProject,
  getProject,
  getProjectBudget,
  getProjectMilestones,
  unarchiveProject,
} from '../services/projectService'
import BudgetCard from '../components/BudgetCard'
import EmployeeChips from '../components/EmployeeChips'
import MilestoneList from '../components/MilestoneList'
import { ErrorMessage, Loading } from '../components/StatusMessage'
import CompletionBar from '../components/CompletionBar'
import DependencyList from '../components/DependencyList'
import MilestoneForm from '../components/MilestoneForm'
import ProjectForm from '../components/ProjectForm'
import TeamManager from '../components/TeamManager'
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
  const isAdmin = role === 'admin'
  const navigate = useNavigate()
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
  const [addingMilestone, setAddingMilestone] = useState(false)
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState('')

  const toggleArchive = async (project) => {
    const archived = Boolean(project.archivedAt)
    const question = archived
      ? `Restore "${project.title}"? Employees will see it again and it will count towards progress.`
      : `Archive "${project.title}"? Employees will no longer see it and it won't count towards progress.`
    if (!window.confirm(question)) return
    setArchiving(true)
    setArchiveError('')
    try {
      await (archived ? unarchiveProject(project.projectId) : archiveProject(project.projectId))
      reload()
    } catch (err) {
      setArchiveError(err.message)
    } finally {
      setArchiving(false)
    }
  }

  const handleDelete = async (project) => {
    const question = `Permanently delete "${project.title}" and all its milestones? This cannot be undone.`
    if (!window.confirm(question)) return
    setArchiving(true)
    setArchiveError('')
    try {
      await deleteProject(project.projectId)
      navigate('/')
    } catch (err) {
      setArchiveError(err.message)
      setArchiving(false)
    }
  }

  if (loading) return <Loading label="Loading project…" />
  if (error) return <ErrorMessage error={error} onRetry={reload} />

  const [project, { milestones, unassignedEmployees, dependencies }, budget] = data
  const status = projectStatus(project)

  return (
    <>
      <Link to="/" className="back-link">
        ← Projects
      </Link>
      <div className="page-title">
        <h1>{project.title}</h1>
        <span className={`status-badge status-${status.toLowerCase()}`}>{status}</span>
        {canSeeBudget && (
          <span className="header-actions">
            {!editing && (
              <button type="button" className="secondary" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            <button type="button" className="secondary" onClick={() => toggleArchive(project)} disabled={archiving}>
              {archiving ? 'Saving…' : project.archivedAt ? 'Restore project' : 'Archive project'}
            </button>
            {isAdmin && (
              <button type="button" className="secondary danger-button" onClick={() => handleDelete(project)} disabled={archiving}>
                Delete
              </button>
            )}
          </span>
        )}
      </div>
      {editing && (
        <ProjectForm
          project={project}
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
      {project.archivedAt && (
        <p className="notice-muted">
          Archived {formatDate(project.archivedAt)}. Employees can&apos;t see this project; it doesn&apos;t count
          towards progress, but its hours still count in the budget.
        </p>
      )}

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

      <div className="section-heading">
        <h2 className="section-title">Milestones ({milestones.length})</h2>
        {canSeeBudget && !addingMilestone && (
          <button type="button" className="icon-button" onClick={() => setAddingMilestone(true)} aria-label="Add a milestone" title="Add a milestone">
            +
          </button>
        )}
      </div>
      <p className="muted section-hint">
        Grouped by state; within a group, milestones closest to their end date are on top. Click a heading to
        collapse or expand it.
      </p>
      {addingMilestone && (
        <MilestoneForm
          project={project}
          onSaved={() => {
            setAddingMilestone(false)
            reload()
          }}
          onCancel={() => setAddingMilestone(false)}
        />
      )}
      <MilestoneList milestones={milestones} />

      {canSeeBudget ? (
        <>
          <h2 className="section-title">Team</h2>
          <p className="muted section-hint">
            Add people to the project and assign them to milestones. Assigning a milestone lets them log hours on it.
          </p>
          <TeamManager projectId={projectId} milestones={milestones} onChanged={async () => reload()} />
        </>
      ) : (
        <>
          <h2 className="section-title">Not assigned to a milestone ({unassignedEmployees.length})</h2>
          {unassignedEmployees.length === 0 ? (
            <p className="muted">Every project member is working on at least one milestone.</p>
          ) : (
            <div className="card">
              <EmployeeChips employees={unassignedEmployees} label="Project members without a milestone" />
            </div>
          )}
        </>
      )}

      <h2 className="section-title">Dependencies ({dependencies.length})</h2>
      <p className="muted section-hint">
        Which milestones wait on others. A warning shows when a prerequisite is past its end date and not complete.
      </p>
      <DependencyList
        milestones={milestones}
        dependencies={dependencies}
        canEdit={canSeeBudget}
        onChanged={async () => reload()}
      />
    </>
  )
}

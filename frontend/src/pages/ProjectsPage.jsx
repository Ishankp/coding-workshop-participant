import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useApiData } from '../hooks/useApiData'
import { useSearchQuery } from '../hooks/useSearchQuery'
import { listProjects } from '../services/projectService'
import NewProjectForm from '../components/NewProjectForm'
import SearchBar from '../components/SearchBar'
import { ErrorMessage, Loading } from '../components/StatusMessage'
import CompletionBar from '../components/CompletionBar'
import { projectStatus } from '../utils/format'
import { daysLeftText } from '../utils/milestones'

/**
 * Home page: every project for admins, otherwise the projects the user is a member of.
 */
export default function ProjectsPage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const canCreate = isAdmin || user.role === 'manager'
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useSearchQuery()
  const loadProjects = useCallback(() => listProjects(query), [query])
  const { data: projects, error, loading, reload } = useApiData(loadProjects)

  return (
    <>
      <div className="page-title">
        <h1>Welcome, {user.firstName || user.username}</h1>
        {canCreate && !creating && (
          <button type="button" className="button-link" onClick={() => setCreating(true)}>
            + New project
          </button>
        )}
      </div>
      <p className="muted">{isAdmin ? 'All projects (admin view)' : 'Projects you\'re a member of'}</p>
      {creating && (
        <NewProjectForm
          onCreated={(project) => navigate(`/projects/${project.projectId}`)}
          onCancel={() => setCreating(false)}
        />
      )}
      <SearchBar
        value={query}
        onChange={setQuery}
        label="Search projects"
        placeholder="Search projects by title or milestone…"
      />

      {loading && <Loading label="Loading projects…" />}
      {error && <ErrorMessage error={error} onRetry={reload} />}

      {projects && projects.length === 0 && query && (
        <p className="muted status" role="status">
          No projects match &ldquo;{query}&rdquo;.
        </p>
      )}

      {projects && projects.length === 0 && !query && (
        <div className="card status-card">
          <h2>No projects yet</h2>
          <p className="muted">
            {isAdmin ? 'No projects have been created yet.' : "You aren't assigned to any projects. Ask a manager to add you to one."}
          </p>
        </div>
      )}

      {projects && projects.length > 0 && (
        <ul className="grid plain-list">
          {projects.map((project) => (
            <li key={project.projectId}>
              <Link to={`/projects/${project.projectId}`} className="card card-link">
                <div className="milestone-header">
                  <h2>{project.title}</h2>
                  <span className={`status-badge status-${projectStatus(project).toLowerCase()}`}>
                    {projectStatus(project)}
                  </span>
                </div>
                <CompletionBar completion={project.completion} />
                <span className="muted small">
                  {[
                    project.completion.percent !== null &&
                      `${project.completion.completedMilestones} of ${project.completion.totalMilestones} milestones complete`,
                    !project.completedAt && !project.archivedAt && daysLeftText(project.daysLeft),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

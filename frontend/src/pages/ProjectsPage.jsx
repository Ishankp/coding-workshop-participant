import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useApiData } from '../hooks/useApiData'
import { listProjects } from '../services/projectService'
import { ErrorMessage, Loading } from '../components/StatusMessage'

/**
 * Home page: every project for admins, otherwise the projects the user is a member of.
 */
export default function ProjectsPage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const { data: projects, error, loading, reload } = useApiData(listProjects)

  return (
    <>
      <h1>Welcome, {user.firstName || user.username}</h1>
      <p className="muted">{isAdmin ? 'All projects (admin view)' : 'Projects you\'re a member of'}</p>

      {loading && <Loading label="Loading projects…" />}
      {error && <ErrorMessage error={error} onRetry={reload} />}

      {projects && projects.length === 0 && (
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
                <h2>{project.title}</h2>
                <span className="muted">View details and team →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

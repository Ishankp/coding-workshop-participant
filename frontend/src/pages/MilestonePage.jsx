import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApiData } from '../hooks/useApiData'
import { getMilestone } from '../services/milestoneService'
import { ErrorMessage, Loading } from '../components/StatusMessage'
import { formatDate } from '../utils/format'

/**
 * One milestone's details, with a link back to its project.
 */
export default function MilestonePage() {
  const { milestoneId } = useParams()
  const loadMilestone = useCallback(() => getMilestone(milestoneId), [milestoneId])
  const { data: milestone, error, loading, reload } = useApiData(loadMilestone)

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
      </div>

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

      <h2 className="section-title">Description</h2>
      <p className="card description">{milestone.description || <span className="muted">No description.</span>}</p>
    </>
  )
}

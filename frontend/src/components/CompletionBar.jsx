import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { MILESTONE_STATUS_LABELS } from '../utils/milestones'

// One color per milestone, by position in the project; wraps after eight
export const SEGMENT_COLORS = ['#2457d6', '#1a7f37', '#b7791f', '#9333ea', '#0e7490', '#c2410c', '#be185d', '#4d7c0f']

/**
 * Short state text for the legend, e.g. "Complete" or "In progress · 98%".
 * @param {{completed: boolean, progressPercent: number, status: string}} segment
 * @returns {string}
 */
function segmentState(segment) {
  if (segment.completed) return 'Complete'
  const label = MILESTONE_STATUS_LABELS[segment.status] ?? segment.status
  return segment.progressPercent > 0 ? `${label} · ${segment.progressPercent}%` : label
}

/**
 * Project completion as a bar split into one segment per milestone, sized by the
 * milestone's share of the project. Each segment fills in proportion to the
 * milestone's progress and is only solid end to end once it's complete.
 * With `legend`, lists each milestone with its color, share and state.
 */
export default function CompletionBar({ completion, legend = false }) {
  if (completion.percent === null) {
    return <span className="muted">No milestones yet, so completion can&apos;t be measured.</span>
  }

  return (
    <div className="completion">
      <div className="time-elapsed">
        <div
          className="progress completion-bar"
          role="progressbar"
          aria-valuenow={completion.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${completion.completedMilestones} of ${completion.totalMilestones} milestones complete`}
        >
          {completion.segments.map((segment, i) => (
            <div
              key={segment.milestoneId}
              className={`completion-segment ${segment.completed ? 'is-complete' : ''}`}
              style={{ width: `${segment.weightPercent}%`, '--segment-color': SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
              title={`${segment.name} · ${segment.weightPercent}% of the project · ${segmentState(segment)}`}
            >
              <div className="completion-segment-fill" style={{ width: `${segment.progressPercent}%` }} />
            </div>
          ))}
        </div>
        <span className="progress-value">{completion.percent}%</span>
      </div>

      {legend && (
        <ul className="plain-list completion-legend">
          {completion.segments.map((segment, i) => (
            <li key={segment.milestoneId} className={segment.completed ? '' : 'muted'}>
              <span
                className={`legend-swatch ${segment.completed ? 'is-complete' : ''}`}
                style={{ '--segment-color': SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
                aria-hidden="true"
              />
              <Link to={`/milestones/${segment.milestoneId}`}>{segment.name}</Link>
              <span className="legend-share">{segment.weightPercent}%</span>
              <span className="legend-state">{segmentState(segment)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export const completionShape = PropTypes.shape({
  percent: PropTypes.number,
  completedMilestones: PropTypes.number.isRequired,
  totalMilestones: PropTypes.number.isRequired,
  segments: PropTypes.arrayOf(
    PropTypes.shape({
      milestoneId: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      weightPercent: PropTypes.number.isRequired,
      completed: PropTypes.bool.isRequired,
      progressPercent: PropTypes.number.isRequired,
      status: PropTypes.string.isRequired,
    }),
  ).isRequired,
})

CompletionBar.propTypes = {
  completion: completionShape.isRequired,
  legend: PropTypes.bool,
}

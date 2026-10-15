import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import EmployeeChips from './EmployeeChips'
import TimeElapsedBar from './TimeElapsedBar'
import { formatDate } from '../utils/format'
import { MILESTONE_STATUS_LABELS, daysLeftText } from '../utils/milestones'

// The three sections of the list, in display order. Each milestone lands in exactly one.
const GROUPS = [
  {
    key: 'active',
    title: 'In progress & past due',
    statuses: ['in_progress', 'past_end_date'],
    empty: 'Nothing is in progress right now.',
    openByDefault: true,
  },
  {
    key: 'completed',
    title: 'Completed',
    statuses: ['completed'],
    empty: 'No milestones completed yet.',
    openByDefault: false,
  },
  {
    key: 'upcoming',
    title: 'Yet to start',
    statuses: ['not_started', 'unscheduled'],
    empty: 'No upcoming milestones.',
    openByDefault: true,
  },
]

const milestoneShape = PropTypes.shape({
  milestoneId: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  startDate: PropTypes.string,
  endDate: PropTypes.string,
  completedAt: PropTypes.string,
  timeElapsedPercent: PropTypes.number,
  daysLeft: PropTypes.number,
  status: PropTypes.string.isRequired,
  dependsOn: PropTypes.arrayOf(
    PropTypes.shape({ milestoneId: PropTypes.number.isRequired, name: PropTypes.string.isRequired }),
  ),
  alerts: PropTypes.arrayOf(PropTypes.string),
  employees: PropTypes.arrayOf(
    PropTypes.shape({
      employeeId: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      username: PropTypes.string.isRequired,
    }),
  ).isRequired,
})

/**
 * One milestone card: name, status, dates, time elapsed and the employees working on it.
 */
function MilestoneCard({ milestone }) {
  const completed = milestone.status === 'completed'
  return (
    <li className="card milestone">
      <div className="milestone-header">
        <h3>
          <Link to={`/milestones/${milestone.milestoneId}`}>{milestone.name}</Link>
        </h3>
        <span className="milestone-meta">
          {milestone.alerts?.length > 0 && (
            <span className="status-badge milestone-status-past_end_date" title={milestone.alerts.join('; ')}>
              ⚠ Held up
            </span>
          )}
          <span className={`status-badge milestone-status-${milestone.status}`}>
            {MILESTONE_STATUS_LABELS[milestone.status] ?? milestone.status}
          </span>
        </span>
      </div>

      {milestone.alerts?.map((alert) => (
        <p key={alert} className="dependency-alert" role="alert">
          ⚠ {alert}
        </p>
      ))}

      <div className="milestone-schedule">
        <span>
          <span className="muted">Start</span> {formatDate(milestone.startDate)}
        </span>
        <span>
          <span className="muted">End</span> {formatDate(milestone.endDate)}
        </span>
        {completed ? (
          <span>
            <span className="muted">Completed</span> {formatDate(milestone.completedAt)}
          </span>
        ) : (
          <span className="muted">{daysLeftText(milestone.daysLeft)}</span>
        )}
      </div>

      {!completed && <TimeElapsedBar percent={milestone.timeElapsedPercent} status={milestone.status} />}

      <div className="milestone-employees">
        {milestone.employees.length === 0 ? (
          <span className="muted">No one assigned</span>
        ) : (
          <EmployeeChips employees={milestone.employees} label={`Employees on ${milestone.name}`} />
        )}
      </div>
    </li>
  )
}

MilestoneCard.propTypes = {
  milestone: milestoneShape.isRequired,
}

/**
 * A project's milestones in three collapsible sections: in progress & past due,
 * completed, and yet to start. Within a section the API's order (most time
 * elapsed first) is kept.
 */
export default function MilestoneList({ milestones }) {
  if (milestones.length === 0) {
    return <p className="muted">This project has no milestones yet.</p>
  }

  return (
    <div className="milestone-groups">
      {GROUPS.map((group) => {
        const items = milestones.filter((m) => group.statuses.includes(m.status))
        return (
          <details key={group.key} className="milestone-group" open={group.openByDefault}>
            <summary>
              <span className="milestone-group-title">{group.title}</span>
              <span className="milestone-group-count">{items.length}</span>
            </summary>
            {items.length === 0 ? (
              <p className="muted milestone-group-empty">{group.empty}</p>
            ) : (
              <ol className="milestone-list plain-list">
                {items.map((milestone) => (
                  <MilestoneCard key={milestone.milestoneId} milestone={milestone} />
                ))}
              </ol>
            )}
          </details>
        )
      })}
    </div>
  )
}

MilestoneList.propTypes = {
  milestones: PropTypes.arrayOf(milestoneShape).isRequired,
}

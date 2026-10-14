import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import EmployeeChips from './EmployeeChips'
import TimeElapsedBar from './TimeElapsedBar'
import { formatDate } from '../utils/format'
import { MILESTONE_STATUS_LABELS, daysLeftText } from '../utils/milestones'

/**
 * A project's milestones, in the order given (the API sorts by time elapsed),
 * each with its dates, time elapsed and the employees working on it.
 */
export default function MilestoneList({ milestones }) {
  if (milestones.length === 0) {
    return <p className="muted">This project has no milestones yet.</p>
  }

  return (
    <ol className="milestone-list plain-list">
      {milestones.map((milestone) => (
        <li key={milestone.milestoneId} className="card milestone">
          <div className="milestone-header">
            <h3>
              <Link to={`/milestones/${milestone.milestoneId}`}>{milestone.name}</Link>
            </h3>
            <span className={`status-badge milestone-status-${milestone.status}`}>
              {MILESTONE_STATUS_LABELS[milestone.status] ?? milestone.status}
            </span>
          </div>

          <div className="milestone-schedule">
            <span>
              <span className="muted">Start</span> {formatDate(milestone.startDate)}
            </span>
            <span>
              <span className="muted">End</span> {formatDate(milestone.endDate)}
            </span>
            <span className="muted">{daysLeftText(milestone.daysLeft)}</span>
          </div>

          <TimeElapsedBar percent={milestone.timeElapsedPercent} status={milestone.status} />

          <div className="milestone-employees">
            {milestone.employees.length === 0 ? (
              <span className="muted">No one assigned</span>
            ) : (
              <EmployeeChips employees={milestone.employees} label={`Employees on ${milestone.name}`} />
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

MilestoneList.propTypes = {
  milestones: PropTypes.arrayOf(
    PropTypes.shape({
      milestoneId: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      startDate: PropTypes.string,
      endDate: PropTypes.string,
      timeElapsedPercent: PropTypes.number,
      daysLeft: PropTypes.number,
      status: PropTypes.string.isRequired,
      employees: PropTypes.arrayOf(
        PropTypes.shape({
          employeeId: PropTypes.number.isRequired,
          name: PropTypes.string.isRequired,
          username: PropTypes.string.isRequired,
        }),
      ).isRequired,
    }),
  ).isRequired,
}

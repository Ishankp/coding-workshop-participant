import PropTypes from 'prop-types'

/**
 * Bar showing the share of a milestone's scheduled time that has passed.
 */
export default function TimeElapsedBar({ percent = null, status }) {
  if (percent === null) return <span className="muted">Add start and end dates to track time</span>

  return (
    <div className="time-elapsed">
      <div
        className={`progress progress-${status}`}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Time elapsed"
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-value">{percent}%</span>
    </div>
  )
}

TimeElapsedBar.propTypes = {
  percent: PropTypes.number,
  status: PropTypes.string.isRequired,
}

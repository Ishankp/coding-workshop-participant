import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

/**
 * Loading indicator announced to screen readers.
 */
export function Loading({ label = 'Loading…' }) {
  return (
    <p className="status muted" role="status">
      {label}
    </p>
  )
}

Loading.propTypes = {
  label: PropTypes.string,
}

const FRIENDLY_ERRORS = {
  // 403 messages come from the server, which knows why (e.g. not a project member)
  403: { title: 'No access' },
  404: { title: 'Not found', text: "This doesn't exist, or it may have been deleted." },
}

/**
 * Explain an API error. 403/404 get a friendly message and a way home;
 * anything else shows the server's message with a retry button.
 */
export function ErrorMessage({ error, onRetry }) {
  const friendly = FRIENDLY_ERRORS[error.status]

  return (
    <div className="card status-card" role="alert">
      <h2>{friendly?.title ?? 'Something went wrong'}</h2>
      <p className="muted">{friendly?.text ?? error.message}</p>
      {friendly ? (
        <Link to="/">Back to my projects</Link>
      ) : (
        onRetry && (
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        )
      )}
    </div>
  )
}

ErrorMessage.propTypes = {
  error: PropTypes.shape({
    status: PropTypes.number,
    message: PropTypes.string.isRequired,
  }).isRequired,
  onRetry: PropTypes.func,
}

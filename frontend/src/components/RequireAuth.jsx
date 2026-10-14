import PropTypes from 'prop-types'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

/**
 * Render children only when logged in; otherwise send the user to /login
 * and remember where they were going.
 */
export default function RequireAuth({ children }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

RequireAuth.propTypes = {
  children: PropTypes.node.isRequired,
}

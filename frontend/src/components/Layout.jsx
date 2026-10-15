import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

/**
 * App shell for logged-in pages: top bar with navigation, the user and sign-out, then the page.
 */
export default function Layout() {
  const { user, logout } = useAuth()
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username
  // The admin account has no employee record, so it has no profile or time log of its own
  const hasProfile = Boolean(user.employeeId)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-nav">
          <Link to="/" className="brand">
            Workspace
          </Link>
          <nav aria-label="Main">
            <NavLink to="/" end className="nav-link">
              Projects
            </NavLink>
            <NavLink to="/employees" end className="nav-link">
              People
            </NavLink>
            {hasProfile && (
              <NavLink to={`/employees/${user.employeeId}/time-log`} className="nav-link">
                My time
              </NavLink>
            )}
            {user.role === 'admin' && (
              <NavLink to="/users" end className="nav-link">
                Accounts
              </NavLink>
            )}
          </nav>
        </div>
        <div className="topbar-user">
          {hasProfile ? <Link to={`/employees/${user.employeeId}`}>{name}</Link> : <span>{name}</span>}
          <span className="role-badge">{user.role}</span>
          <button type="button" className="secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

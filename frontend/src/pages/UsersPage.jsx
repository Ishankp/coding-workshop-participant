import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useApiData } from '../hooks/useApiData'
import { listUsers } from '../services/userService'
import NewUserForm from '../components/NewUserForm'
import { ErrorMessage, Loading } from '../components/StatusMessage'

/**
 * Admin-only directory of every account, with a form to create new ones.
 * New employees and managers appear on the People page once an admin places
 * them on a project; until then they're "new hires" visible only here.
 */
export default function UsersPage() {
  const isAdmin = useAuth().user.role === 'admin'
  const { data: users, error, loading, reload } = useApiData(listUsers)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')

  if (!isAdmin) return <ErrorMessage error={{ status: 403, message: 'Only admins can manage accounts.' }} />

  const managers = (users ?? []).filter((u) => u.role === 'manager' && u.employeeId !== null)

  return (
    <>
      <div className="page-title">
        <h1>Accounts</h1>
        {!creating && (
          <button type="button" className="button-link" onClick={() => setCreating(true)}>
            + New account
          </button>
        )}
      </div>
      <p className="muted">Every login, including admins. Only admins can see this page or create accounts.</p>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {creating && (
        <NewUserForm
          managers={managers}
          onCreated={(created) => {
            setCreating(false)
            setNotice(
              created.employeeId
                ? `${created.name} created as ${created.role}. Add them to a project from that project's Team card.`
                : `${created.name} created as admin.`,
            )
            reload()
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {loading && <Loading label="Loading accounts…" />}
      {error && <ErrorMessage error={error} onRetry={reload} />}

      {users && (
        <div className="card table-wrap people-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Title</th>
                <th scope="col">Manager</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId}>
                  <td>
                    {u.employeeId ? <Link to={`/employees/${u.employeeId}`}>{u.name}</Link> : u.name}
                    <div className="muted small">{u.username}</div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className="role-badge">{u.role}</span>
                  </td>
                  <td>{u.title ?? <span className="muted">—</span>}</td>
                  <td>
                    {u.manager ? (
                      <Link to={`/employees/${u.manager.employeeId}`}>{u.manager.name}</Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

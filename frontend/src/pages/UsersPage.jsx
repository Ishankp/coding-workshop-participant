import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useApiData } from '../hooks/useApiData'
import { listUsers } from '../services/userService'
import AccountPanel from '../components/AccountPanel'
import NewUserForm from '../components/NewUserForm'
import { formatCurrency } from '../utils/format'
import { ErrorMessage, Loading } from '../components/StatusMessage'

/**
 * Admin-only directory of every account, with a form to create new ones.
 * New employees and managers appear on the People page once an admin places
 * them on a project; until then they're "new hires" visible only here.
 */
export default function UsersPage() {
  const { user: me } = useAuth()
  const isAdmin = me.role === 'admin'
  const { data: users, error, loading, reload } = useApiData(listUsers)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const [openId, setOpenId] = useState(null)
  const openAccount = users?.find((u) => u.userId === openId) ?? null

  if (!isAdmin) return <ErrorMessage error={{ status: 403, message: 'Only admins can manage accounts.' }} />

  const managers = (users ?? []).filter((u) => u.role === 'manager' && u.employeeId !== null && !u.deactivatedAt)

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

      {openAccount && (
        <AccountPanel
          key={openAccount.userId}
          account={openAccount}
          isSelf={openAccount.username === me.username}
          onChanged={async () => reload()}
          onClose={() => setOpenId(null)}
        />
      )}

      {users && (
        <div className="card table-wrap people-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Title</th>
                <th scope="col" className="num">
                  Salary
                </th>
                <th scope="col">Manager</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} className={u.deactivatedAt ? 'row-deactivated' : ''}>
                  <td>
                    {u.employeeId ? <Link to={`/employees/${u.employeeId}`}>{u.name}</Link> : u.name}
                    {u.deactivatedAt && <span className="status-badge"> Deactivated</span>}
                    <div className="muted small">{u.username}</div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className="role-badge">{u.role}</span>
                  </td>
                  <td>{u.title ?? <span className="muted">—</span>}</td>
                  <td className="num">{u.employeeId ? formatCurrency(u.salary) : <span className="muted">—</span>}</td>
                  <td>
                    {u.manager ? (
                      <Link to={`/employees/${u.manager.employeeId}`}>{u.manager.name}</Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num">
                    <button type="button" className="secondary small-button" onClick={() => setOpenId(u.userId)}>
                      Manage
                    </button>
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

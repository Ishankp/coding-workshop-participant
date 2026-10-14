import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useApiData } from '../hooks/useApiData'
import { useSearchQuery } from '../hooks/useSearchQuery'
import { listEmployees } from '../services/employeeService'
import SearchBar from '../components/SearchBar'
import { ErrorMessage, Loading } from '../components/StatusMessage'

/**
 * Directory of the employees you can see: everyone (managers and employees) for
 * admins, otherwise yourself and the people you share a project with.
 */
export default function PeoplePage() {
  const isAdmin = useAuth().user.role === 'admin'
  const [query, setQuery] = useSearchQuery()
  const loadPeople = useCallback(() => listEmployees(query), [query])
  const { data: people, error, loading, reload } = useApiData(loadPeople)

  return (
    <>
      <h1>People</h1>
      <p className="muted">{isAdmin ? 'All managers and employees (admin view)' : 'You and the people on your projects'}</p>
      <SearchBar value={query} onChange={setQuery} label="Search people" placeholder="Search by name, username or title…" />

      {loading && <Loading label="Loading people…" />}
      {error && <ErrorMessage error={error} onRetry={reload} />}

      {people && people.length === 0 && (
        <p className="muted status" role="status">
          {query ? `No one matches “${query}”.` : 'No one to show yet.'}
        </p>
      )}

      {people && people.length > 0 && (
        <div className="card table-wrap people-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Title</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.employeeId}>
                  <td>
                    <Link to={`/employees/${person.employeeId}`}>{person.name}</Link>
                    <div className="muted small">{person.username}</div>
                  </td>
                  <td>{person.title ?? <span className="muted">—</span>}</td>
                  <td>
                    <span className="role-badge">{person.role}</span>
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

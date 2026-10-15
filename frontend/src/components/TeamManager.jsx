import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useApiData } from '../hooks/useApiData'
import {
  addProjectMember,
  assignMilestone,
  getProjectTeam,
  removeProjectMember,
  unassignMilestone,
} from '../services/projectService'
import { ErrorMessage, Loading } from './StatusMessage'
import { formatHours } from '../utils/format'

/**
 * Manager/admin view of who is on a project and which milestones they work on,
 * with controls to add people (with or without a milestone), assign them to
 * milestones, and undo both. `onChanged` reloads the rest of the project page.
 */
export default function TeamManager({ projectId, milestones, onChanged }) {
  const isAdmin = useAuth().user.role === 'admin'
  const loadTeam = useCallback(() => getProjectTeam(projectId), [projectId])
  const { data: team, error, loading, reload } = useApiData(loadTeam)
  const [candidateId, setCandidateId] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (action, successNotice) => {
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      const result = await action()
      setNotice(typeof successNotice === 'function' ? successNotice(result) : successNotice)
      reload()
      await onChanged()
    } catch (err) {
      setActionError(err.fields?.employeeId ?? err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = (event) => {
    event.preventDefault()
    if (!candidateId) return
    run(
      () => addProjectMember(projectId, Number(candidateId)),
      (r) => `${r.name} added to the project. Assign a milestone so they can log hours.`,
    )
    setCandidateId('')
  }

  const handleAssign = (member, milestoneId) => {
    if (!milestoneId) return
    run(
      () => assignMilestone(projectId, Number(milestoneId), member.employeeId),
      (r) => `${r.name} assigned to ${r.milestoneName}.`,
    )
  }

  const handleUnassign = (member, milestone) => {
    if (!window.confirm(`Unassign ${member.name} from ${milestone.name}?`)) return
    run(() => unassignMilestone(projectId, milestone.milestoneId, member.employeeId), `${member.name} unassigned from ${milestone.name}.`)
  }

  const handleRemove = (member) => {
    if (!window.confirm(`Remove ${member.name} from the project?`)) return
    run(() => removeProjectMember(projectId, member.employeeId), `${member.name} removed from the project.`)
  }

  if (loading) return <Loading label="Loading team…" />
  if (error) return <ErrorMessage error={error} onRetry={reload} />

  return (
    <div className="team-manager">
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <div className="alert" role="alert">
          {actionError}
        </div>
      )}

      <div className="card table-wrap">
        <table className="team-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Milestones</th>
              <th scope="col" className="num">
                Hours
              </th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {team.members.map((member) => {
              const assignedIds = new Set(member.milestones.map((m) => m.milestoneId))
              const available = milestones.filter((m) => !assignedIds.has(m.milestoneId))
              return (
                <tr key={member.employeeId}>
                  <td>
                    <Link to={`/employees/${member.employeeId}`}>{member.name}</Link>
                    <div className="muted small">{member.title ?? member.role}</div>
                  </td>
                  <td>
                    <div className="chip-list">
                      {member.milestones.length === 0 && <span className="muted">None yet</span>}
                      {member.milestones.map((milestone) => (
                        <span key={milestone.milestoneId} className="chip chip-removable">
                          {milestone.name}
                          <button
                            type="button"
                            className="chip-x"
                            onClick={() => handleUnassign(member, milestone)}
                            disabled={busy}
                            aria-label={`Unassign ${member.name} from ${milestone.name}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {available.length > 0 && (
                        <select
                          className="assign-select"
                          value=""
                          onChange={(e) => handleAssign(member, e.target.value)}
                          disabled={busy}
                          aria-label={`Assign ${member.name} to a milestone`}
                        >
                          <option value="">+ Assign…</option>
                          {available.map((m) => (
                            <option key={m.milestoneId} value={m.milestoneId}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="num">{formatHours(member.hoursLogged)}</td>
                  <td className="num">
                    <button type="button" className="secondary small-button" onClick={() => handleRemove(member)} disabled={busy}>
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <form className="card team-add" onSubmit={handleAdd}>
        <label htmlFor="team-candidate" className="visually-hidden">
          Add someone to the project
        </label>
        <select id="team-candidate" value={candidateId} onChange={(e) => setCandidateId(e.target.value)} disabled={busy}>
          <option value="">
            {team.candidates.length === 0 ? 'No one else to add' : 'Add someone to the project…'}
          </option>
          {team.candidates.map((c) => (
            <option key={c.employeeId} value={c.employeeId}>
              {c.name}
              {c.title ? ` · ${c.title}` : ''}
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy || !candidateId}>
          Add to project
        </button>
        <p className="muted small">
          {isAdmin
            ? 'As an admin you can add anyone. '
            : 'You can add your direct reports and people on projects you\u2019re a member of. '}
          Hours can only be logged against an assigned milestone, and someone with hours logged can&apos;t be
          removed until those entries are removed.
        </p>
      </form>
    </div>
  )
}

TeamManager.propTypes = {
  projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  milestones: PropTypes.arrayOf(
    PropTypes.shape({ milestoneId: PropTypes.number.isRequired, name: PropTypes.string.isRequired }),
  ).isRequired,
  onChanged: PropTypes.func.isRequired,
}

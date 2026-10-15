import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './api'
import * as auth from './authService'
import * as users from './userService'
import * as employees from './employeeService'
import * as milestones from './milestoneService'
import * as projects from './projectService'

vi.mock('./api', () => ({ apiRequest: vi.fn() }))

beforeEach(() => {
  vi.mocked(apiRequest).mockResolvedValue('result')
})

const lastCall = () => apiRequest.mock.calls.at(-1)

describe('authService', () => {
  it('posts credentials to the login endpoint', async () => {
    await expect(auth.login('u', 'p')).resolves.toBe('result')
    expect(lastCall()).toEqual(['/api/auth/login', { method: 'POST', body: { username: 'u', password: 'p' } }])
  })

  it('round-trips the session through localStorage', () => {
    expect(auth.loadSession()).toBeNull()
    const session = { userId: 1, token: 't', user: { username: 'u' } }
    auth.saveSession(session)
    expect(auth.loadSession()).toEqual(session)
    auth.clearSession()
    expect(auth.loadSession()).toBeNull()
  })

  it('ignores incomplete or corrupt sessions', () => {
    localStorage.setItem('session', JSON.stringify({ token: 't' }))
    expect(auth.loadSession()).toBeNull()
    localStorage.setItem('session', '{not json')
    expect(auth.loadSession()).toBeNull()
  })

  it('tolerates unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => auth.saveSession({ token: 't', user: {} })).not.toThrow()
    expect(() => auth.clearSession()).not.toThrow()
  })
})

describe('userService', () => {
  it.each([
    [() => users.listUsers(), ['/api/users']],
    [() => users.createUser({ username: 'x' }), ['/api/users', { method: 'POST', body: { username: 'x' } }]],
    [() => users.updateUser(5, { email: 'e' }), ['/api/users/5', { method: 'PUT', body: { email: 'e' } }]],
    [() => users.setUserPassword(5, 'pw'), ['/api/users/5/password', { method: 'POST', body: { password: 'pw' } }]],
    [() => users.deleteUser(5), ['/api/users/5', { method: 'DELETE' }]],
    [() => users.deactivateUser(5), ['/api/users/5/deactivate', { method: 'POST' }]],
    [() => users.reactivateUser(5), ['/api/users/5/reactivate', { method: 'POST' }]],
  ])('calls the right endpoint (%#)', async (call, expected) => {
    await expect(call()).resolves.toBe('result')
    expect(lastCall()).toEqual(expected)
  })
})

describe('employeeService', () => {
  it.each([
    [() => employees.listEmployees(), ['/api/employees']],
    [() => employees.listEmployees('a b'), ['/api/employees?q=a%20b']],
    [() => employees.getEmployee(3), ['/api/employees/3']],
    [() => employees.getTimeLog(3), ['/api/employees/3/time-entries']],
    [() => employees.addTimeEntry(3, { hours: 1 }), ['/api/employees/3/time-entries', { method: 'POST', body: { hours: 1 } }]],
    [() => employees.updateTimeEntry(3, 7, { hours: 2 }), ['/api/employees/3/time-entries/7', { method: 'PUT', body: { hours: 2 } }]],
    [() => employees.deleteTimeEntry(3, 7), ['/api/employees/3/time-entries/7', { method: 'DELETE' }]],
  ])('calls the right endpoint (%#)', async (call, expected) => {
    await expect(call()).resolves.toBe('result')
    expect(lastCall()).toEqual(expected)
  })
})

describe('milestoneService', () => {
  it.each([
    [() => milestones.getMilestone(2), ['/api/milestones/2']],
    [() => milestones.updateMilestone(2, { title: 't' }), ['/api/milestones/2', { method: 'PUT', body: { title: 't' } }]],
    [() => milestones.completeMilestone(2), ['/api/milestones/2/complete', { method: 'POST' }]],
    [() => milestones.reopenMilestone(2), ['/api/milestones/2/reopen', { method: 'POST' }]],
    [() => milestones.deleteMilestone(2), ['/api/milestones/2', { method: 'DELETE' }]],
    [() => milestones.archiveMilestone(2), ['/api/milestones/2/archive', { method: 'POST' }]],
    [() => milestones.unarchiveMilestone(2), ['/api/milestones/2/unarchive', { method: 'POST' }]],
    [() => milestones.addDependency(2, 1), ['/api/milestones/2/dependencies', { method: 'POST', body: { dependsOnMilestoneId: 1 } }]],
    [() => milestones.removeDependency(2, 1), ['/api/milestones/2/dependencies/1', { method: 'DELETE' }]],
  ])('calls the right endpoint (%#)', async (call, expected) => {
    await expect(call()).resolves.toBe('result')
    expect(lastCall()).toEqual(expected)
  })
})

describe('projectService', () => {
  it.each([
    [() => projects.listProjects(), ['/api/projects']],
    [() => projects.listProjects('crm'), ['/api/projects?q=crm']],
    [() => projects.getProject(1), ['/api/projects/1']],
    [() => projects.getProjectMembers(1), ['/api/projects/1/members']],
    [() => projects.getProjectMilestones(1), ['/api/projects/1/milestones']],
    [() => projects.getProjectBudget(1), ['/api/projects/1/budget']],
    [() => projects.createProject({ title: 't' }), ['/api/projects', { method: 'POST', body: { title: 't' } }]],
    [() => projects.updateProject(1, { title: 't' }), ['/api/projects/1', { method: 'PUT', body: { title: 't' } }]],
    [() => projects.createMilestone(1, { title: 'm' }), ['/api/projects/1/milestones', { method: 'POST', body: { title: 'm' } }]],
    [() => projects.deleteProject(1), ['/api/projects/1', { method: 'DELETE' }]],
    [() => projects.archiveProject(1), ['/api/projects/1/archive', { method: 'POST' }]],
    [() => projects.unarchiveProject(1), ['/api/projects/1/unarchive', { method: 'POST' }]],
    [() => projects.getProjectTeam(1), ['/api/projects/1/team']],
    [() => projects.addProjectMember(1, 4), ['/api/projects/1/members', { method: 'POST', body: { employeeId: 4 } }]],
    [() => projects.removeProjectMember(1, 4), ['/api/projects/1/members/4', { method: 'DELETE' }]],
    [() => projects.assignMilestone(1, 2, 4), ['/api/projects/1/milestones/2/assignees', { method: 'POST', body: { employeeId: 4 } }]],
    [() => projects.unassignMilestone(1, 2, 4), ['/api/projects/1/milestones/2/assignees/4', { method: 'DELETE' }]],
  ])('calls the right endpoint (%#)', async (call, expected) => {
    await expect(call()).resolves.toBe('result')
    expect(lastCall()).toEqual(expected)
  })
})

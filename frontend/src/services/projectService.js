import { apiRequest } from './api'

const BASE = '/api/projects'

/**
 * How much of a project is done, judged by its milestones: each owns a share proportional
 * to its planned length and contributes it in proportion to its progress (fully once complete,
 * at most 99% before). `percent` is null without milestones and 100 only when all are complete.
 * @typedef {{percent: number|null, completedMilestones: number, totalMilestones: number,
 *   segments: Array<{milestoneId: number, name: string, weightPercent: number, completed: boolean,
 *   progressPercent: number, status: string}>}} Completion
 */

/**
 * Projects the logged-in user can see (all of them for admins), with schedule progress.
 * GET /api/projects?q=
 * @param {string} [query] Only projects whose title or milestone names contain this text
 * @returns {Promise<Array<{projectId: number, title: string, startDate: string|null, endDate: string|null,
 *   archivedAt: string|null, completedAt: string|null, timeElapsedPercent: number|null, daysLeft: number|null,
 *   completion: Completion}>>}
 */
export function listProjects(query = '') {
  return apiRequest(query ? `${BASE}?q=${encodeURIComponent(query)}` : BASE)
}

/**
 * One project's details. GET /api/projects/{projectId}
 * @param {number|string} projectId
 * @returns {Promise<{projectId: number, title: string, startDate: string|null, endDate: string|null,
 *   budget: number|null, archivedAt: string|null, completedAt: string|null,
 *   timeElapsedPercent: number|null, daysLeft: number|null, completion: Completion}>}
 */
export function getProject(projectId) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}`)
}

/**
 * A project's members and their milestones. GET /api/projects/{projectId}/members
 * @param {number|string} projectId
 * @returns {Promise<Array<{employeeId: number, name: string, username: string,
 *   milestones: Array<{milestoneId: number, name: string}>}>>}
 */
export function getProjectMembers(projectId) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}/members`)
}

/**
 * A project's milestones with schedule progress and assigned employees (sorted by
 * time elapsed, highest first), plus members not on any milestone.
 * GET /api/projects/{projectId}/milestones
 * @param {number|string} projectId
 * @returns {Promise<{milestones: Array<{milestoneId: number, name: string, startDate: string|null,
 *   endDate: string|null, completedAt: string|null, timeElapsedPercent: number|null, daysLeft: number|null,
 *   status: 'completed'|'not_started'|'in_progress'|'past_end_date'|'unscheduled',
 *   employees: Array<{employeeId: number, name: string, username: string}>,
 *   dependsOn: Array<{milestoneId: number, name: string, completed: boolean}>, alerts: string[]}>,
 *   dependencies: Array<{milestoneId: number, milestoneName: string, dependsOnMilestoneId: number,
 *     dependsOnName: string, dependsOnEndDate: string|null, dependsOnCompleted: boolean, alert: string|null}>,
 *   unassignedEmployees: Array<{employeeId: number, name: string, username: string}>}>}
 */
export function getProjectMilestones(projectId) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}/milestones`)
}

/**
 * Budget vs cost so far and the projected final cost (managers and admins only).
 * GET /api/projects/{projectId}/budget
 * @param {number|string} projectId
 * @returns {Promise<{budget: number|null, spent: number, remaining: number|null, spentPercent: number|null,
 *   hoursLogged: number, timeElapsedPercent: number|null, projectedCost: number|null,
 *   variance: {amount: number, percent: number, direction: 'over'|'under'|'on_budget'}|null,
 *   assumptions: {hoursPerYear: number, employeesWithoutSalary: number}}>}
 */
export function getProjectBudget(projectId) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}/budget`)
}

/**
 * Create a project (managers and admins; a creating manager becomes a member). POST /api/projects
 * @param {{title: string, startDate?: string, endDate?: string, budget?: number}} data
 * @returns {Promise<{projectId: number, title: string, startDate: string|null, endDate: string|null,
 *   budget: number|null, archivedAt: string|null, completedAt: string|null}>}
 */
export function createProject(data) {
  return apiRequest(BASE, { method: 'POST', body: data })
}

/**
 * Edit a project's title, dates and budget (managers who are members, and admins). The dates can't be
 * narrowed past an existing milestone. PUT /api/projects/{projectId}
 * @param {number|string} projectId
 * @param {{title: string, startDate: string|null, endDate: string|null, budget: number|null}} data
 * @returns {Promise<{projectId: number, title: string, startDate: string|null, endDate: string|null,
 *   budget: number|null, archivedAt: string|null, completedAt: string|null}>}
 */
export function updateProject(projectId, data) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}`, { method: 'PUT', body: data })
}

/**
 * Add a milestone to a project (managers who are members, and admins). Dates must fit inside the project.
 * POST /api/projects/{projectId}/milestones
 * @param {number|string} projectId
 * @param {{title: string, description?: string, startDate?: string, endDate?: string}} data
 * @returns {Promise<{milestoneId: number, projectId: number, name: string, description: string|null,
 *   startDate: string|null, endDate: string|null, completedAt: string|null}>}
 */
export function createMilestone(projectId, data) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}/milestones`, { method: 'POST', body: data })
}

/**
 * Archive a project: hidden from employees and left out of progress (managers who are members, and admins).
 * POST /api/projects/{projectId}/archive
 * @param {number|string} projectId
 * @returns {Promise<{projectId: number, title: string, archivedAt: string}>}
 */
export function archiveProject(projectId) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}/archive`, { method: 'POST' })
}

/**
 * Restore an archived project. POST /api/projects/{projectId}/unarchive
 * @param {number|string} projectId
 * @returns {Promise<{projectId: number, title: string, archivedAt: null}>}
 */
export function unarchiveProject(projectId) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}/unarchive`, { method: 'POST' })
}

/**
 * @typedef {{employeeId: number, name: string, username: string, title: string|null, role: string}} Person
 */

/**
 * The project's members with their milestones, and everyone who could be added
 * (managers who are members, and admins). GET /api/projects/{projectId}/team
 * @param {number|string} projectId
 * @returns {Promise<{members: Array<Person & {hoursLogged: number, milestones: Array<{milestoneId: number, name: string}>}>,
 *   candidates: Person[]}>}
 */
export function getProjectTeam(projectId) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}/team`)
}

/**
 * Add someone to the project without a milestone. POST /api/projects/{projectId}/members
 * @param {number|string} projectId
 * @param {number} employeeId
 * @returns {Promise<Person & {projectId: number}>}
 */
export function addProjectMember(projectId, employeeId) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}/members`, { method: 'POST', body: { employeeId } })
}

/**
 * Remove someone from the project (refused with 409 while they have hours logged on it).
 * DELETE /api/projects/{projectId}/members/{employeeId}
 * @param {number|string} projectId
 * @param {number} employeeId
 * @returns {Promise<null>}
 */
export function removeProjectMember(projectId, employeeId) {
  return apiRequest(`${BASE}/${encodeURIComponent(projectId)}/members/${encodeURIComponent(employeeId)}`, {
    method: 'DELETE',
  })
}

/**
 * Assign someone to a milestone, adding them to the project if needed.
 * POST /api/projects/{projectId}/milestones/{milestoneId}/assignees
 * @param {number|string} projectId
 * @param {number} milestoneId
 * @param {number} employeeId
 * @returns {Promise<{employeeId: number, name: string, milestoneId: number, milestoneName: string, addedToProject: boolean}>}
 */
export function assignMilestone(projectId, milestoneId, employeeId) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}/assignees`,
    { method: 'POST', body: { employeeId } },
  )
}

/**
 * Unassign someone from a milestone (refused with 409 while they have hours logged on it).
 * DELETE /api/projects/{projectId}/milestones/{milestoneId}/assignees/{employeeId}
 * @param {number|string} projectId
 * @param {number} milestoneId
 * @param {number} employeeId
 * @returns {Promise<null>}
 */
export function unassignMilestone(projectId, milestoneId, employeeId) {
  return apiRequest(
    `${BASE}/${encodeURIComponent(projectId)}/milestones/${encodeURIComponent(milestoneId)}/assignees/${encodeURIComponent(employeeId)}`,
    { method: 'DELETE' },
  )
}

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
 *   employees: Array<{employeeId: number, name: string, username: string}>}>,
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

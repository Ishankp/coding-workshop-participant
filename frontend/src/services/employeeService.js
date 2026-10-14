import { apiRequest } from './api'

/**
 * Employees you can see: everyone for admins, otherwise yourself, people you share a project
 * with and your direct reports. GET /api/employees?q=
 * @param {string} [query] Only people whose name, username or title contain this text
 * @returns {Promise<Array<{employeeId: number, name: string, username: string, title: string|null,
 *   role: 'admin'|'manager'|'employee'}>>}
 */
export function listEmployees(query = '') {
  return apiRequest(query ? `/api/employees?q=${encodeURIComponent(query)}` : '/api/employees')
}

/**
 * An employee's profile with the projects (shared with you) and milestones they work on.
 * GET /api/employees/{employeeId}
 * @param {number|string} employeeId
 * @returns {Promise<{employeeId: number, name: string, username: string, email: string, title: string|null,
 *   role: string, isSelf: boolean, manager: {employeeId: number, name: string}|null,
 *   totalHours: number,
 *   projects: Array<{projectId: number, title: string, status: 'active'|'completed'|'archived',
 *     hoursSpent: number, milestones: Array<{milestoneId: number, name: string, startDate: string|null,
 *     endDate: string|null, hoursSpent: number, timeElapsedPercent: number|null, daysLeft: number|null,
 *     status: string}>}>}>}
 */
export function getEmployee(employeeId) {
  return apiRequest(`/api/employees/${encodeURIComponent(employeeId)}`)
}

/**
 * An employee's time log. Allowed for the employee, their direct manager and admins.
 * GET /api/employees/{employeeId}/time-entries
 * @param {number|string} employeeId
 * @returns {Promise<{employee: {employeeId: number, name: string, isSelf: boolean}, totalHours: number,
 *   permissions: {canAdd: boolean, canDelete: boolean},
 *   assignments: Array<{milestoneId: number, milestoneName: string, projectId: number, projectTitle: string}>,
 *   entries: Array<TimeEntry>}>}
 */
export function getTimeLog(employeeId) {
  return apiRequest(`/api/employees/${encodeURIComponent(employeeId)}/time-entries`)
}

/**
 * @typedef {{entryId: number, workDate: string, hours: number, note: string|null,
 *   milestone: {milestoneId: number, name: string}, project: {projectId: number, title: string},
 *   loggedBy: {userId: number, name: string, role: string}|null, loggedBySelf: boolean,
 *   createdAt: string}} TimeEntry
 */

/**
 * Log hours for an employee. POST /api/employees/{employeeId}/time-entries
 * @param {number|string} employeeId
 * @param {{milestoneId: number, workDate: string, hours: number, note?: string}} entry
 * @returns {Promise<TimeEntry>}
 */
export function addTimeEntry(employeeId, entry) {
  return apiRequest(`/api/employees/${encodeURIComponent(employeeId)}/time-entries`, { method: 'POST', body: entry })
}

/**
 * Remove an entry from an employee's log (managers and admins only).
 * DELETE /api/employees/{employeeId}/time-entries/{entryId}
 * @param {number|string} employeeId
 * @param {number} entryId
 * @returns {Promise<null>}
 */
export function deleteTimeEntry(employeeId, entryId) {
  return apiRequest(
    `/api/employees/${encodeURIComponent(employeeId)}/time-entries/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' },
  )
}

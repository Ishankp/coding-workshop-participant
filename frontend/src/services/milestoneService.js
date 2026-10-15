import { apiRequest } from './api'

/**
 * One milestone's details. GET /api/milestones/{milestoneId}
 * @param {number|string} milestoneId
 * @returns {Promise<{milestoneId: number, projectId: number, name: string, description: string|null,
 *   startDate: string|null, endDate: string|null, completedAt: string|null,
 *   archivedAt: string|null, projectArchivedAt: string|null,
 *   projectStartDate: string|null, projectEndDate: string|null,
 *   dependsOn: Array<{milestoneId: number, name: string, completed: boolean, alert: string|null}>,
 *   requiredBy: Array<{milestoneId: number, name: string}>,
 *   totalHours: number, hoursByEmployee: Array<{employeeId: number, name: string, hours: number}>,
 *   entries: Array<{entryId: number, workDate: string, hours: number, note: string|null,
 *     employee: {employeeId: number, name: string}, loggedBy: {userId: number, name: string, role: string}|null,
 *     loggedBySelf: boolean, createdAt: string}>}>}
 */
export function getMilestone(milestoneId) {
  return apiRequest(`/api/milestones/${encodeURIComponent(milestoneId)}`)
}

/**
 * Edit a milestone's title, description and dates (managers who are members, and admins).
 * PUT /api/milestones/{milestoneId}
 * @param {number|string} milestoneId
 * @param {{title: string, description: string|null, startDate: string|null, endDate: string|null}} data
 * @returns {Promise<{milestoneId: number, projectId: number, name: string, description: string|null,
 *   startDate: string|null, endDate: string|null, completedAt: string|null, archivedAt: string|null}>}
 */
export function updateMilestone(milestoneId, data) {
  return apiRequest(`/api/milestones/${encodeURIComponent(milestoneId)}`, { method: 'PUT', body: data })
}

/**
 * Mark a milestone complete (managers who are members, and admins). POST /api/milestones/{milestoneId}/complete
 * @param {number|string} milestoneId
 * @returns {Promise<{milestoneId: number, name: string, completedAt: string}>}
 */
export function completeMilestone(milestoneId) {
  return apiRequest(`/api/milestones/${encodeURIComponent(milestoneId)}/complete`, { method: 'POST' })
}

/**
 * Reopen a completed milestone. POST /api/milestones/{milestoneId}/reopen
 * @param {number|string} milestoneId
 * @returns {Promise<{milestoneId: number, name: string, completedAt: null}>}
 */
export function reopenMilestone(milestoneId) {
  return apiRequest(`/api/milestones/${encodeURIComponent(milestoneId)}/reopen`, { method: 'POST' })
}

/**
 * Archive a milestone: hidden from employees and left out of progress; still counted in dependencies and costs.
 * POST /api/milestones/{milestoneId}/archive (managers who are members, and admins)
 * @param {number|string} milestoneId
 * @returns {Promise<{milestoneId: number, name: string, archivedAt: string}>}
 */
export function archiveMilestone(milestoneId) {
  return apiRequest(`/api/milestones/${encodeURIComponent(milestoneId)}/archive`, { method: 'POST' })
}

/**
 * Restore an archived milestone. POST /api/milestones/{milestoneId}/unarchive
 * @param {number|string} milestoneId
 * @returns {Promise<{milestoneId: number, name: string, archivedAt: null}>}
 */
export function unarchiveMilestone(milestoneId) {
  return apiRequest(`/api/milestones/${encodeURIComponent(milestoneId)}/unarchive`, { method: 'POST' })
}

/**
 * Make one milestone depend on another in the same project (managers and admins).
 * POST /api/milestones/{milestoneId}/dependencies
 * @param {number} milestoneId The dependent milestone
 * @param {number} dependsOnMilestoneId The milestone that should finish first
 * @returns {Promise<{milestoneId: number, milestoneName: string, dependsOnMilestoneId: number, dependsOnName: string}>}
 */
export function addDependency(milestoneId, dependsOnMilestoneId) {
  return apiRequest(`/api/milestones/${encodeURIComponent(milestoneId)}/dependencies`, {
    method: 'POST',
    body: { dependsOnMilestoneId },
  })
}

/**
 * Remove a dependency (managers and admins).
 * DELETE /api/milestones/{milestoneId}/dependencies/{dependsOnMilestoneId}
 * @param {number} milestoneId
 * @param {number} dependsOnMilestoneId
 * @returns {Promise<null>}
 */
export function removeDependency(milestoneId, dependsOnMilestoneId) {
  return apiRequest(
    `/api/milestones/${encodeURIComponent(milestoneId)}/dependencies/${encodeURIComponent(dependsOnMilestoneId)}`,
    { method: 'DELETE' },
  )
}

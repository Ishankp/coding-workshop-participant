import { apiRequest } from './api'

/**
 * One milestone's details. GET /api/milestones/{milestoneId}
 * @param {number|string} milestoneId
 * @returns {Promise<{milestoneId: number, projectId: number, name: string, description: string|null,
 *   startDate: string|null, endDate: string|null, completedAt: string|null,
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

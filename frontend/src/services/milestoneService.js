import { apiRequest } from './api'

/**
 * One milestone's details. GET /api/milestones/{milestoneId}
 * @param {number|string} milestoneId
 * @returns {Promise<{milestoneId: number, projectId: number, name: string, description: string|null,
 *   startDate: string|null, endDate: string|null, completedAt: string|null}>}
 */
export function getMilestone(milestoneId) {
  return apiRequest(`/api/milestones/${encodeURIComponent(milestoneId)}`)
}

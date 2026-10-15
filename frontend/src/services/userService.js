import { apiRequest } from './api'

const BASE = '/api/users'

/**
 * @typedef {{userId: number, username: string, email: string, firstName: string|null, lastName: string|null,
 *   name: string, role: 'admin'|'manager'|'employee', deactivatedAt: string|null, employeeId: number|null,
 *   title: string|null, salary: number|null, manager: {employeeId: number, name: string}|null}} Account
 */

/**
 * Every account (admins only). GET /api/users
 * @returns {Promise<Account[]>}
 */
export function listUsers() {
  return apiRequest(BASE)
}

/**
 * Create an account (admins only). Managers and employees also get an employee record.
 * POST /api/users
 * @param {{username: string, email: string, role: string, password: string, firstName?: string,
 *   lastName?: string, title?: string, salary?: number, managerId?: number}} data
 * @returns {Promise<{userId: number, employeeId: number|null, username: string, email: string, name: string, role: string}>}
 */
export function createUser(data) {
  return apiRequest(BASE, { method: 'POST', body: data })
}

/**
 * Edit an account's email, name, role, title and salary (admins only; the manager is fixed).
 * PUT /api/users/{userId}
 * @param {number} userId
 * @param {{email: string, role: string, firstName?: string|null, lastName?: string|null, title?: string|null, salary?: number|null}} data
 * @returns {Promise<{userId: number, username: string, email: string, name: string, role: string}>}
 */
export function updateUser(userId, data) {
  return apiRequest(`${BASE}/${encodeURIComponent(userId)}`, { method: 'PUT', body: data })
}

/**
 * Set a new password for an account (admins only). POST /api/users/{userId}/password
 * @param {number} userId
 * @param {string} password
 * @returns {Promise<null>}
 */
export function setUserPassword(userId, password) {
  return apiRequest(`${BASE}/${encodeURIComponent(userId)}/password`, { method: 'POST', body: { password } })
}

/**
 * Permanently delete an employee's or manager's account (admins only). Refused with 409 for admin
 * accounts, managers with direct reports, and anyone with hours logged: deactivate those instead.
 * DELETE /api/users/{userId}
 * @param {number} userId
 * @returns {Promise<null>}
 */
export function deleteUser(userId) {
  return apiRequest(`${BASE}/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

/**
 * Deactivate an account: it can't log in and leaves pickers, but history stays. POST /api/users/{userId}/deactivate
 * @param {number} userId
 * @returns {Promise<{userId: number, deactivatedAt: string}>}
 */
export function deactivateUser(userId) {
  return apiRequest(`${BASE}/${encodeURIComponent(userId)}/deactivate`, { method: 'POST' })
}

/**
 * Reactivate a deactivated account. POST /api/users/{userId}/reactivate
 * @param {number} userId
 * @returns {Promise<{userId: number, deactivatedAt: null}>}
 */
export function reactivateUser(userId) {
  return apiRequest(`${BASE}/${encodeURIComponent(userId)}/reactivate`, { method: 'POST' })
}

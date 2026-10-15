import { apiRequest } from './api'

const BASE = '/api/users'

/**
 * @typedef {{userId: number, username: string, email: string, firstName: string|null, lastName: string|null,
 *   name: string, role: 'admin'|'manager'|'employee', employeeId: number|null, title: string|null,
 *   manager: {employeeId: number, name: string}|null}} Account
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

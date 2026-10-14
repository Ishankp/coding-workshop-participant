import { apiRequest } from './api'

const SESSION_KEY = 'session'

/**
 * Log in. POST /api/auth/login
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{userId: number, token: string, user: {username: string, firstName: string, lastName: string, role: string}}>}
 */
export function login(username, password) {
  return apiRequest('/api/auth/login', { method: 'POST', body: { username, password } })
}

// Storage can be unavailable (private mode, blocked site data); treat that as "not logged in"

/**
 * Read the saved session, or null if there is none.
 * @returns {{userId: number, token: string, user: object}|null}
 */
export function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY))
    return session?.token && session?.user ? session : null
  } catch {
    return null
  }
}

/**
 * Save the session so a page reload stays logged in.
 * @param {{userId: number, token: string, user: object}} session
 */
export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Session still works until the page is reloaded
  }
}

/** Remove the saved session. */
export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nothing stored
  }
}

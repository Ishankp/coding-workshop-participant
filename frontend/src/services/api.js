// Thin fetch wrapper: one place for the base URL, session token and error shape.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

let authToken = null
let onUnauthorized = null

/**
 * Error thrown for any failed API call, mirroring the backend's error shape.
 */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP status (0 for network errors)
   * @param {string} code Machine-readable error code from the backend
   * @param {string} message Human-readable message
   * @param {Object<string, string>} [fields] Per-field validation messages
   */
  constructor(status, code, message, fields = {}) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

/**
 * Set the session token sent as a bearer token on every request.
 * @param {string|null} token
 */
export function setAuthToken(token) {
  authToken = token
}

/**
 * Register a callback for 401 responses to authenticated requests (e.g. expired session).
 * @param {(() => void)|null} handler
 */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

/**
 * Call the backend and return the parsed JSON body.
 * @param {string} path Path starting with /api/...
 * @param {{method?: string, body?: object}} [options]
 * @returns {Promise<any>}
 * @throws {ApiError}
 */
export async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const sentToken = authToken
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection and try again.')
  }

  if (response.status === 204) return null

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = data?.error ?? {}
    if (response.status === 401 && sentToken && onUnauthorized) onUnauthorized()
    throw new ApiError(
      response.status,
      error.code ?? 'unknown_error',
      error.message ?? `Request failed (${response.status})`,
      error.fields,
    )
  }
  if (data === null) {
    throw new ApiError(response.status, 'invalid_response', 'The server returned an unexpected response.')
  }
  return data
}

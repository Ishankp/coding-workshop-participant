import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest, setAuthToken, setUnauthorizedHandler } from './api'

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  }
}

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setAuthToken(null)
    setUnauthorizedHandler(null)
  })

  it('GETs JSON from the API base URL without a token by default', async () => {
    fetch.mockResolvedValue(jsonResponse(200, { ok: 1 }))
    await expect(apiRequest('/api/projects')).resolves.toEqual({ ok: 1 })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('http://localhost:3001/api/projects')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('sends the bearer token and a JSON body', async () => {
    setAuthToken('tok')
    fetch.mockResolvedValue(jsonResponse(201, { id: 1 }))
    await apiRequest('/api/x', { method: 'POST', body: { a: 1 } })
    const [, init] = fetch.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(init.body).toBe('{"a":1}')
  })

  it('returns null for 204', async () => {
    fetch.mockResolvedValue(jsonResponse(204))
    await expect(apiRequest('/api/x', { method: 'DELETE' })).resolves.toBeNull()
  })

  it('wraps network failures', async () => {
    fetch.mockRejectedValue(new TypeError('offline'))
    const err = await apiRequest('/api/x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
    expect(err.code).toBe('network_error')
  })

  it('throws the backend error shape with fields', async () => {
    fetch.mockResolvedValue(
      jsonResponse(400, { error: { code: 'validation_error', message: 'Invalid', fields: { title: 'Required' } } }),
    )
    const err = await apiRequest('/api/x').catch((e) => e)
    expect(err).toMatchObject({ status: 400, code: 'validation_error', message: 'Invalid', fields: { title: 'Required' } })
  })

  it('falls back to generic code and message when the error body is missing', async () => {
    fetch.mockResolvedValue(jsonResponse(500))
    const err = await apiRequest('/api/x').catch((e) => e)
    expect(err).toMatchObject({ status: 500, code: 'unknown_error', message: 'Request failed (500)', fields: {} })
  })

  it('calls the unauthorized handler on 401 only when a token was sent', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetch.mockResolvedValue(jsonResponse(401, { error: { code: 'unauthorized', message: 'Bad token' } }))

    await expect(apiRequest('/api/x')).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()

    setAuthToken('tok')
    await expect(apiRequest('/api/x')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not fail when no unauthorized handler is registered', async () => {
    setAuthToken('tok')
    fetch.mockResolvedValue(jsonResponse(401, { error: { code: 'unauthorized', message: 'Bad token' } }))
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ status: 401 })
  })

  it('rejects a successful response without a JSON body', async () => {
    fetch.mockResolvedValue(jsonResponse(200))
    await expect(apiRequest('/api/x')).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('ApiError', () => {
  it('defaults fields to an empty object', () => {
    const err = new ApiError(404, 'not_found', 'Nope')
    expect(err.fields).toEqual({})
    expect(err.message).toBe('Nope')
  })
})

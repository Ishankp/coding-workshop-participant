import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { AuthContext } from './authContext'
import { setAuthToken, setUnauthorizedHandler } from '../services/api'
import * as authService from '../services/authService'

/**
 * Holds the logged-in session and keeps the API client's token in sync with it.
 * A 401 from any authenticated request (e.g. expired token) logs the user out.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const saved = authService.loadSession()
    setAuthToken(saved?.token ?? null)
    return saved
  })

  const logout = useCallback(() => {
    authService.clearSession()
    setAuthToken(null)
    setSession(null)
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await authService.login(username, password)
    authService.saveSession(data)
    setAuthToken(data.token)
    setSession(data)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const value = useMemo(
    () => ({ user: session?.user ?? null, userId: session?.userId ?? null, login, logout }),
    [session, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
}

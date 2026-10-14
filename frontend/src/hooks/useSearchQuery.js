import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * The page's search text, kept in the URL as ?q= so it survives reloads and the back button.
 * @returns {[string, (q: string) => void]}
 */
export function useSearchQuery() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const setQuery = useCallback(
    (q) => setParams(q ? { q } : {}, { replace: true }),
    [setParams],
  )
  return [query, setQuery]
}

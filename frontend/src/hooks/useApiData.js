import { useCallback, useEffect, useState } from 'react'

/**
 * Load data from the API and track loading / error state.
 * Re-runs when `load` changes, so wrap it in useCallback with its inputs as deps.
 * @template T
 * @param {() => Promise<T>} load
 * @returns {{data: T|null, error: import('../services/api').ApiError|null, loading: boolean, reload: () => void}}
 */
export function useApiData(load) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, error: null, loading: true }))
    load()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((error) => !cancelled && setState({ data: null, error, loading: false }))
    return () => {
      cancelled = true
    }
  }, [load, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, reload }
}

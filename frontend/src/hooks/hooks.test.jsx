import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { useApiData } from './useApiData'
import { useSearchQuery } from './useSearchQuery'

describe('useApiData', () => {
  it('starts loading, then exposes the data', async () => {
    const load = vi.fn().mockResolvedValue({ a: 1 })
    const { result } = renderHook(() => useApiData(load))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({ a: 1 })
    expect(result.current.error).toBeNull()
  })

  it('exposes the error and reloads on demand', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok')
    const { result } = renderHook(() => useApiData(load))
    await waitFor(() => expect(result.current.error?.message).toBe('boom'))
    expect(result.current.data).toBeNull()

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.data).toBe('ok'))
    expect(result.current.error).toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('ignores results that arrive after the load function changed', async () => {
    let resolveFirst
    const first = () => new Promise((resolve) => (resolveFirst = resolve))
    const second = vi.fn().mockResolvedValue('second')
    const { result, rerender } = renderHook(({ load }) => useApiData(load), { initialProps: { load: first } })
    rerender({ load: second })
    await waitFor(() => expect(result.current.data).toBe('second'))
    await act(async () => resolveFirst('first'))
    expect(result.current.data).toBe('second')
  })
})

describe('useSearchQuery', () => {
  const wrapper = ({ children }) => <MemoryRouter initialEntries={['/?q=abc']}>{children}</MemoryRouter>

  it('reads and writes ?q= in the URL', () => {
    const { result } = renderHook(() => useSearchQuery(), { wrapper })
    expect(result.current[0]).toBe('abc')
    act(() => result.current[1]('new'))
    expect(result.current[0]).toBe('new')
    act(() => result.current[1](''))
    expect(result.current[0]).toBe('')
  })
})

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchBar from './SearchBar'

describe('SearchBar', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  const props = { onChange: vi.fn(), placeholder: 'Search projects', label: 'Search' }

  it('reports the trimmed text after the user pauses', async () => {
    const onChange = vi.fn()
    render(<SearchBar {...props} value="" onChange={onChange} />)
    const input = screen.getByRole('searchbox', { name: 'Search' })
    await userEvent.type(input, ' crm ')
    expect(onChange).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(onChange).toHaveBeenCalledWith('crm')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('clears the box with the Clear button', async () => {
    const onChange = vi.fn()
    render(<SearchBar {...props} value="abc" onChange={onChange} />)
    expect(screen.getByRole('searchbox')).toHaveValue('abc')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('follows the applied value when it changes from outside', () => {
    const { rerender } = render(<SearchBar {...props} value="one" />)
    rerender(<SearchBar {...props} value="two" />)
    expect(screen.getByRole('searchbox')).toHaveValue('two')
  })
})

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorMessage, Loading } from './StatusMessage'
import { renderWithProviders } from '../test/helpers'

describe('Loading', () => {
  it('announces a default and a custom label', () => {
    const { unmount } = renderWithProviders(<Loading />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    unmount()
    renderWithProviders(<Loading label="Fetching" />)
    expect(screen.getByRole('status')).toHaveTextContent('Fetching')
  })
})

describe('ErrorMessage', () => {
  it('explains a 404 with a way home', () => {
    renderWithProviders(<ErrorMessage error={{ status: 404, message: 'x' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Not found')
    expect(screen.getByText(/may have been deleted/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to my projects' })).toHaveAttribute('href', '/')
  })

  it("shows the server's message for a 403", () => {
    renderWithProviders(<ErrorMessage error={{ status: 403, message: 'Not a member' }} onRetry={vi.fn()} />)
    expect(screen.getByRole('heading')).toHaveTextContent('No access')
    expect(screen.getByText('Not a member')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('offers a retry for other errors when a handler is given', async () => {
    const onRetry = vi.fn()
    renderWithProviders(<ErrorMessage error={{ status: 500, message: 'Server exploded' }} onRetry={onRetry} />)
    expect(screen.getByRole('heading')).toHaveTextContent('Something went wrong')
    expect(screen.getByText('Server exploded')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows no retry button without a handler', () => {
    renderWithProviders(<ErrorMessage error={{ status: 0, message: 'Offline' }} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

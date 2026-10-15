import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import NotFoundPage from './NotFoundPage'
import { renderWithProviders } from '../test/helpers'

describe('NotFoundPage', () => {
  it('shows the friendly 404 message with a link home', () => {
    renderWithProviders(<NotFoundPage />, { route: '/nope' })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument()
    expect(screen.getByText(/doesn't exist/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to my projects' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })
})

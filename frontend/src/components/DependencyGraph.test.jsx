import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DependencyGraph from './DependencyGraph'
import { renderWithProviders } from '../test/helpers'

const milestones = [
  { milestoneId: 1, name: 'Design', status: 'completed', timeElapsedPercent: 100, alerts: [] },
  { milestoneId: 2, name: 'Build', status: 'in_progress', timeElapsedPercent: 40, alerts: [] },
  { milestoneId: 3, name: 'Test', status: 'not_started', timeElapsedPercent: null, alerts: ['Build is past due'] },
  { milestoneId: 4, name: 'Docs', status: 'in_progress', timeElapsedPercent: null },
]
const dependencies = [
  { milestoneId: 2, dependsOnMilestoneId: 1, dependsOnCompleted: true, alert: null },
  { milestoneId: 3, dependsOnMilestoneId: 2, dependsOnCompleted: false, alert: 'Build is past due' },
  { milestoneId: 3, dependsOnMilestoneId: 99, dependsOnCompleted: false, alert: null },
]

describe('DependencyGraph', () => {
  it('lays milestones out by depth and draws one edge per known dependency', () => {
    const { container } = renderWithProviders(<DependencyGraph milestones={milestones} dependencies={dependencies} />)
    const design = screen.getByRole('link', { name: /Design/ })
    const build = screen.getByRole('link', { name: /Build/ })
    const test = screen.getByRole('link', { name: /Test/ })
    const docs = screen.getByRole('link', { name: /Docs/ })
    expect(parseInt(design.style.left, 10)).toBeLessThan(parseInt(build.style.left, 10))
    expect(parseInt(build.style.left, 10)).toBeLessThan(parseInt(test.style.left, 10))
    expect(design.style.left).toBe(docs.style.left)
    expect(design.style.top).not.toBe(docs.style.top)
    expect(design).toHaveAttribute('href', '/milestones/1')
    expect(design).toHaveClass('node-completed')
    expect(test).toHaveClass('has-alert')
    expect(test).toHaveAttribute('title', 'Build is past due')
    expect(build).toHaveAttribute('title', 'Build')

    expect(design).toHaveTextContent('Completed')
    expect(build).toHaveTextContent('In progress · 40%')
    expect(test).toHaveTextContent('Held up')
    expect(docs).toHaveTextContent('In progress')

    const edges = container.querySelectorAll('path.dependency-edge')
    expect(edges).toHaveLength(2)
    expect(edges[0]).toHaveClass('is-complete')
    expect(edges[1]).toHaveClass('has-alert')
  })

  it('renders a single column when nothing depends on anything', () => {
    const { container } = renderWithProviders(<DependencyGraph milestones={milestones.slice(0, 2)} dependencies={[]} />)
    expect(container.querySelectorAll('path.dependency-edge')).toHaveLength(0)
    const [a, b] = screen.getAllByRole('link')
    expect(a.style.left).toBe(b.style.left)
  })

  it('does not loop forever on a cycle', () => {
    const cyclic = [
      { milestoneId: 1, dependsOnMilestoneId: 2, dependsOnCompleted: false, alert: null },
      { milestoneId: 2, dependsOnMilestoneId: 1, dependsOnCompleted: false, alert: null },
    ]
    renderWithProviders(<DependencyGraph milestones={milestones.slice(0, 2)} dependencies={cyclic} />)
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
})

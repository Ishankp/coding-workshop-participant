import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { MILESTONE_STATUS_LABELS } from '../utils/milestones'

const NODE_W = 210
const NODE_H = 72
const COL_GAP = 64
const ROW_GAP = 14
const PAD = 6

/**
 * Place milestones in columns by dependency depth: a milestone sits one column to
 * the right of the furthest-right milestone it depends on. Milestones with no
 * prerequisites are in the first column.
 */
function layout(milestones, dependencies) {
  const prerequisites = new Map(milestones.map((m) => [m.milestoneId, []]))
  dependencies.forEach((d) => prerequisites.get(d.milestoneId)?.push(d.dependsOnMilestoneId))

  const depth = new Map()
  const visit = (id, trail) => {
    if (depth.has(id)) return depth.get(id)
    if (trail.has(id)) return 0 // can't happen (the API refuses loops), but never recurse forever
    trail.add(id)
    const parents = prerequisites.get(id) ?? []
    const d = parents.length ? 1 + Math.max(...parents.map((p) => visit(p, trail))) : 0
    depth.set(id, d)
    return d
  }
  milestones.forEach((m) => visit(m.milestoneId, new Set()))

  const columns = []
  milestones.forEach((m) => {
    const c = depth.get(m.milestoneId)
    columns[c] = columns[c] ?? []
    columns[c].push(m)
  })

  const positions = new Map()
  columns.forEach((column, c) =>
    column.forEach((m, r) =>
      positions.set(m.milestoneId, { x: PAD + c * (NODE_W + COL_GAP), y: PAD + r * (NODE_H + ROW_GAP) }),
    ),
  )
  const rows = Math.max(...columns.map((c) => c.length))
  return {
    positions,
    width: PAD * 2 + columns.length * NODE_W + (columns.length - 1) * COL_GAP,
    height: PAD * 2 + rows * NODE_H + (rows - 1) * ROW_GAP,
  }
}

function stateText(milestone) {
  if (milestone.alerts?.length) return 'Held up'
  if (milestone.status === 'in_progress' && milestone.timeElapsedPercent !== null) {
    return `In progress · ${milestone.timeElapsedPercent}%`
  }
  return MILESTONE_STATUS_LABELS[milestone.status] ?? milestone.status
}

/**
 * The project's milestones as a left-to-right flow: an arrow runs from each
 * milestone to the ones that wait on it. Boxes are colored by state and a red
 * dashed arrow marks a prerequisite that is past due and not complete.
 */
export default function DependencyGraph({ milestones, dependencies }) {
  const { positions, width, height } = layout(milestones, dependencies)

  return (
    <div className="dependency-graph-scroll">
      <div className="dependency-graph" style={{ width, height }}>
        <svg className="dependency-edges" width={width} height={height} aria-hidden="true">
          <defs>
            <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {dependencies.map((d) => {
            const from = positions.get(d.dependsOnMilestoneId)
            const to = positions.get(d.milestoneId)
            if (!from || !to) return null
            const x1 = from.x + NODE_W
            const y1 = from.y + NODE_H / 2
            const x2 = to.x
            const y2 = to.y + NODE_H / 2
            const bend = Math.max((x2 - x1) / 2, 24)
            return (
              <path
                key={`${d.milestoneId}-${d.dependsOnMilestoneId}`}
                className={`dependency-edge ${d.alert ? 'has-alert' : d.dependsOnCompleted ? 'is-complete' : ''}`}
                d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                markerEnd="url(#dep-arrow)"
              />
            )
          })}
        </svg>

        {milestones.map((m) => {
          const { x, y } = positions.get(m.milestoneId)
          return (
            <Link
              key={m.milestoneId}
              to={`/milestones/${m.milestoneId}`}
              className={`dependency-node node-${m.status} ${m.alerts?.length ? 'has-alert' : ''}`}
              style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
              title={m.alerts?.length ? m.alerts.join('; ') : m.name}
            >
              <span className="dependency-node-name">{m.name}</span>
              <span className="dependency-node-state">{stateText(m)}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

DependencyGraph.propTypes = {
  milestones: PropTypes.arrayOf(
    PropTypes.shape({
      milestoneId: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
      timeElapsedPercent: PropTypes.number,
      alerts: PropTypes.arrayOf(PropTypes.string),
    }),
  ).isRequired,
  dependencies: PropTypes.arrayOf(
    PropTypes.shape({
      milestoneId: PropTypes.number.isRequired,
      dependsOnMilestoneId: PropTypes.number.isRequired,
      dependsOnCompleted: PropTypes.bool.isRequired,
      alert: PropTypes.string,
    }),
  ).isRequired,
}

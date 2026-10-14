import PropTypes from 'prop-types'
import { formatCurrency, formatHours } from '../utils/format'

/**
 * Short verdict for the header badge, e.g. "25% over budget".
 * @param {{variance: object|null, budget: number|null, projectedCost: number|null}} budget
 * @returns {{label: string, tone: 'over'|'under'|'neutral'}}
 */
function verdict({ variance, budget, projectedCost }) {
  if (budget === null) return { label: 'No budget set', tone: 'neutral' }
  if (projectedCost === null || !variance) return { label: 'No projection yet', tone: 'neutral' }
  if (variance.direction === 'on_budget') return { label: 'On budget', tone: 'under' }
  const percent = Math.abs(variance.percent)
  return variance.direction === 'over'
    ? { label: `${percent}% over budget`, tone: 'over' }
    : { label: `${percent}% under budget`, tone: 'under' }
}

/**
 * Budget vs cost so far, and the projected final cost assuming spending
 * continues at the average rate so far. Shown to managers and admins only.
 */
export default function BudgetCard({ budget }) {
  const { label, tone } = verdict(budget)
  const spentPercent = budget.spentPercent ?? 0
  const overspent = budget.remaining !== null && budget.remaining < 0

  return (
    <section className="card budget-card" aria-labelledby="budget-heading">
      <div className="milestone-header">
        <h2 id="budget-heading">Budget vs spend</h2>
        <span className={`status-badge budget-${tone}`}>{label}</span>
      </div>

      <dl className="details budget-stats">
        <div>
          <dt>Budget</dt>
          <dd>{formatCurrency(budget.budget)}</dd>
        </div>
        <div>
          <dt>Spent so far</dt>
          <dd>
            {formatCurrency(budget.spent)}
            {budget.spentPercent !== null && <span className="muted small"> · {budget.spentPercent}%</span>}
          </dd>
        </div>
        <div>
          <dt>{overspent ? 'Over by' : 'Remaining'}</dt>
          <dd>{budget.remaining === null ? '—' : formatCurrency(Math.abs(budget.remaining))}</dd>
        </div>
        <div>
          <dt>Projected cost</dt>
          <dd className={budget.variance ? `tone-${budget.variance.direction}` : ''}>
            {formatCurrency(budget.projectedCost)}
          </dd>
        </div>
      </dl>

      {budget.budget !== null && (
        <div
          className={`progress ${overspent ? 'progress-past_end_date' : ''}`}
          role="progressbar"
          aria-valuenow={Math.min(spentPercent, 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Share of budget spent"
        >
          <div className="progress-fill" style={{ width: `${Math.min(spentPercent, 100)}%` }} />
        </div>
      )}

      <p className="muted small budget-note">
        {budget.projectedCost === null
          ? 'A projection needs the project’s start and end dates and some elapsed time.'
          : `Projected from the average spend so far, with ${budget.timeElapsedPercent}% of the schedule elapsed.`}{' '}
        Cost is {formatHours(budget.hoursLogged)} logged, priced at each person&apos;s salary ÷{' '}
        {budget.assumptions.hoursPerYear.toLocaleString()} hours a year.
        {budget.assumptions.employeesWithoutSalary > 0 &&
          ` ${budget.assumptions.employeesWithoutSalary} employee(s) have no salary on file, so their hours add no cost.`}
      </p>
    </section>
  )
}

BudgetCard.propTypes = {
  budget: PropTypes.shape({
    budget: PropTypes.number,
    spent: PropTypes.number.isRequired,
    remaining: PropTypes.number,
    spentPercent: PropTypes.number,
    hoursLogged: PropTypes.number.isRequired,
    timeElapsedPercent: PropTypes.number,
    projectedCost: PropTypes.number,
    variance: PropTypes.shape({
      amount: PropTypes.number.isRequired,
      percent: PropTypes.number.isRequired,
      direction: PropTypes.oneOf(['over', 'under', 'on_budget']).isRequired,
    }),
    assumptions: PropTypes.shape({
      hoursPerYear: PropTypes.number.isRequired,
      employeesWithoutSalary: PropTypes.number.isRequired,
    }).isRequired,
  }).isRequired,
}

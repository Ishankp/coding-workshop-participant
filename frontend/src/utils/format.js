/**
 * Format an ISO date ("2026-07-01") or timestamp for display; "—" when empty.
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function formatDate(value) {
  if (!value) return '—'
  // Date-only strings are parsed as UTC by Date; pin to local midnight so the day doesn't shift
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Format an amount as whole US dollars; "—" when empty.
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function formatCurrency(value) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

/**
 * Derive a project's status from its timestamps.
 * @param {{archivedAt: string|null, completedAt: string|null}} project
 * @returns {'Archived'|'Completed'|'Active'}
 */
export function projectStatus(project) {
  if (project.archivedAt) return 'Archived'
  if (project.completedAt) return 'Completed'
  return 'Active'
}

/**
 * Tone for a project's time-elapsed bar: finished projects aren't "past due".
 * @param {{archivedAt: string|null, completedAt: string|null, daysLeft: number|null}} project
 * @returns {'completed'|'archived'|'past_end_date'|'in_progress'}
 */
export function projectScheduleTone(project) {
  if (project.completedAt) return 'completed'
  if (project.archivedAt) return 'archived'
  if (project.daysLeft !== null && project.daysLeft < 0) return 'past_end_date'
  return 'in_progress'
}

/**
 * Today's date in the browser's local time zone as YYYY-MM-DD (for date inputs).
 * @returns {string}
 */
export function todayIsoDate() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Format a number of hours, e.g. 220.5 -> "220.5 h", 1 -> "1 h"; "—" when empty.
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function formatHours(value) {
  if (value === null || value === undefined) return '—'
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} h`
}

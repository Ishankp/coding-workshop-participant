/** Display labels for the milestone status values the API returns. */
export const MILESTONE_STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  past_end_date: 'Past end date',
  unscheduled: 'No dates set',
}

/**
 * Short text for how much time is left, e.g. "12 days left" or "3 days past end date".
 * @param {number|null} daysLeft
 * @returns {string}
 */
export function daysLeftText(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return ''
  if (daysLeft === 0) return 'Ends today'
  const days = Math.abs(daysLeft)
  const unit = days === 1 ? 'day' : 'days'
  return daysLeft > 0 ? `${days} ${unit} left` : `${days} ${unit} past end date`
}

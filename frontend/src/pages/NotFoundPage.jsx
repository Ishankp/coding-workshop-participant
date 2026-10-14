import { ErrorMessage } from '../components/StatusMessage'

/**
 * Fallback for URLs that don't match any page.
 */
export default function NotFoundPage() {
  return <ErrorMessage error={{ status: 404, message: 'Page not found' }} />
}

import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'

/**
 * A row of employee names, each linking to that employee's page.
 */
export default function EmployeeChips({ employees, label }) {
  return (
    <ul className="plain-list chip-list" aria-label={label}>
      {employees.map((employee) => (
        <li key={employee.employeeId}>
          <Link to={`/employees/${employee.employeeId}`} className="chip" title={employee.username}>
            {employee.name}
          </Link>
        </li>
      ))}
    </ul>
  )
}

EmployeeChips.propTypes = {
  employees: PropTypes.arrayOf(
    PropTypes.shape({
      employeeId: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      username: PropTypes.string.isRequired,
    }),
  ).isRequired,
  label: PropTypes.string.isRequired,
}

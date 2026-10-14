import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

const DEBOUNCE_MS = 250

/**
 * Search box that reports its value after the user pauses typing.
 * `value` is the current (already applied) query; `onChange` gets the new one.
 */
export default function SearchBar({ value, onChange, placeholder, label }) {
  const [text, setText] = useState(value)

  // Keep the box in sync if the query changes from outside (e.g. back button)
  useEffect(() => setText(value), [value])

  useEffect(() => {
    if (text === value) return undefined
    const timer = setTimeout(() => onChange(text.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, value, onChange])

  return (
    <div className="search-bar" role="search">
      <label htmlFor="search" className="visually-hidden">
        {label}
      </label>
      <input
        id="search"
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={100}
        autoComplete="off"
      />
      {text && (
        <button type="button" className="secondary small-button" onClick={() => setText('')} aria-label="Clear search">
          Clear
        </button>
      )}
    </div>
  )
}

SearchBar.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
}

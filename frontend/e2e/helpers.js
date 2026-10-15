import { expect } from '@playwright/test'

export const PASSWORD = 'Password123!'

/** Sign in through the login form and wait for the app shell. */
export async function login(page, username, password = PASSWORD) {
  // Start from the home page so the login form sends the user there afterwards,
  // rather than back to whatever page the previous user signed out from.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}

export async function logout(page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
}

/** A short unique suffix so tests that create records can run repeatedly. */
export function unique(prefix) {
  return `${prefix} ${Date.now().toString(36)}`
}

/** Accept the next window.confirm dialog. */
export function acceptNextConfirm(page) {
  page.once('dialog', (dialog) => dialog.accept())
}

const API = process.env.E2E_API_URL || 'http://localhost:3001'

/**
 * Remove an employee's time entries whose note contains `noteText`, acting as `manager`
 * through the API. Lets a test that logs hours as an employee (who can't delete entries)
 * leave the database as it found it.
 */
export async function deleteTimeEntriesByNote(request, manager, employeeId, noteText) {
  const loginResponse = await request.post(`${API}/api/auth/login`, { data: { username: manager, password: PASSWORD } })
  const { token } = await loginResponse.json()
  const headers = { Authorization: `Bearer ${token}` }
  const log = await (await request.get(`${API}/api/employees/${employeeId}/time-entries`, { headers })).json()
  for (const entry of log.entries.filter((e) => e.note?.includes(noteText))) {
    await request.delete(`${API}/api/employees/${employeeId}/time-entries/${entry.entryId}`, { headers })
  }
}

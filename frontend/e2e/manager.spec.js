import { expect, test } from '@playwright/test'
import { acceptNextConfirm, login, logout, unique } from './helpers'

test.describe('Manager', () => {
  test('creates a project, adds a milestone, builds the team, then archives it', async ({ page }) => {
    const title = unique('E2E Project')
    await login(page, 'maria')
    await expect(page.getByText("Projects you're a member of")).toBeVisible()

    // Create the project
    await page.getByRole('button', { name: '+ New project' }).click()
    await page.getByLabel(/Title/).fill(title)
    await page.getByLabel('Start date').fill('2026-10-01')
    await page.getByLabel('End date').fill('2026-12-31')
    await page.getByLabel('Budget (USD)').fill('5000')
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Budget vs spend' })).toBeVisible()
    await expect(page.getByText('$5,000').first()).toBeVisible()
    const projectUrl = page.url()

    // Milestone dates are checked against the project
    await page.getByRole('button', { name: 'Add a milestone' }).click()
    await page.getByLabel(/Title/).fill('Kickoff')
    await page.getByLabel('Start date').fill('2026-09-01')
    await page.getByRole('button', { name: 'Add milestone' }).click()
    await expect(page.getByText(/Can't be before the project starts/)).toBeVisible()
    await page.getByLabel('Start date').fill('2026-10-05')
    await page.getByLabel('End date').fill('2026-10-20')
    await page.getByRole('button', { name: 'Add milestone' }).click()
    await expect(page.getByRole('link', { name: 'Kickoff' }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Milestones (1)' })).toBeVisible()

    // Add a direct report and assign the milestone
    await page.getByLabel('Add someone to the project').selectOption('4')
    await page.getByRole('button', { name: 'Add to project' }).click()
    await expect(page.getByRole('row', { name: /James Smith/ })).toBeVisible()
    await page.getByRole('combobox', { name: 'Assign James Smith to a milestone' }).selectOption({ label: 'Kickoff' })
    await expect(page.getByRole('button', { name: 'Unassign James Smith from Kickoff' })).toBeVisible()

    // The milestone now shows James
    await page.goto(projectUrl)
    await expect(page.getByRole('list', { name: 'Employees on Kickoff' }).getByRole('link', { name: 'James Smith' })).toBeVisible()

    // Mark the milestone complete from its page
    await page.getByRole('link', { name: 'Kickoff' }).first().click()
    acceptNextConfirm(page)
    await page.getByRole('button', { name: 'Mark complete' }).click()
    await expect(page.getByRole('button', { name: 'Reopen' })).toBeVisible()

    // Archive the project; it disappears for employees
    await page.goto(projectUrl)
    acceptNextConfirm(page)
    await page.getByRole('button', { name: 'Archive project' }).click()
    await expect(page.getByRole('button', { name: 'Restore project' })).toBeVisible()
    await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible()

    await logout(page)
    await login(page, 'james')
    await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0)
    await page.goto(projectUrl)
    await expect(page.getByRole('heading', { name: /No access|Not found/ })).toBeVisible()

    // Clean up: an admin can delete it since no hours were logged
    await logout(page)
    await login(page, 'admin')
    await page.goto(projectUrl)
    acceptNextConfirm(page)
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome, Alice' })).toBeVisible()
  })

  test("manages a direct report's time log", async ({ page }) => {
    const note = unique('Manager entry')
    await login(page, 'maria')
    await page.getByRole('link', { name: 'People' }).click()
    await page.getByRole('link', { name: 'Priya Patel' }).click()
    await expect(page.getByRole('heading', { name: 'Priya Patel' })).toBeVisible()
    await page.goto('/employees/3/time-log')
    await expect(page.getByRole('heading', { name: 'Priya Patel’s time log' })).toBeVisible()

    await page.getByLabel('Milestone').selectOption('2')
    await page.getByLabel('Date').fill('2026-10-09')
    await page.getByRole('spinbutton', { name: 'Hours' }).fill('1.25')
    await page.getByLabel('Note').fill(note)
    await page.getByRole('button', { name: 'Add entry' }).click()
    const row = page.getByRole('row', { name: new RegExp(note) })
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: /Edit entry/ }).click()
    await expect(page.getByRole('heading', { name: 'Edit entry' })).toBeVisible()
    await page.getByRole('spinbutton', { name: 'Hours' }).fill('3')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('row', { name: new RegExp(note) })).toContainText('3 h')

    acceptNextConfirm(page)
    await page.getByRole('row', { name: new RegExp(note) }).getByRole('button', { name: /Remove entry/ }).click()
    await expect(page.getByRole('row', { name: new RegExp(note) })).toHaveCount(0)
  })

  test('cannot see projects they are not on or manage accounts', async ({ page }) => {
    await login(page, 'maria')
    await expect(page.getByRole('link', { name: /Data Warehouse Migration/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Accounts' })).toHaveCount(0)
    await page.goto('/projects/2')
    await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible()
  })
})

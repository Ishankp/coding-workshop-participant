import { expect, test } from '@playwright/test'
import { deleteTimeEntriesByNote, login, unique } from './helpers'

test.describe('Employee', () => {
  test('sees only their projects, with no budget or create button', async ({ page }) => {
    await login(page, 'priya')
    await expect(page.getByText("Projects you're a member of")).toBeVisible()
    await expect(page.getByRole('link', { name: /Customer Portal Redesign/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Mobile App Launch/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Data Warehouse Migration/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Legacy CRM Integration/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ New project' })).toHaveCount(0)

    await page.getByRole('link', { name: /Customer Portal Redesign/ }).click()
    await expect(page.getByRole('heading', { name: 'Customer Portal Redesign' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Budget vs spend' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Archive project' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Milestones \(\d+\)/ })).toBeVisible()
  })

  test('is refused a project they are not on', async ({ page }) => {
    await login(page, 'priya')
    await page.goto('/projects/2')
    await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible()
  })

  test('opens a milestone and sees its work log', async ({ page }) => {
    await login(page, 'priya')
    await page.goto('/milestones/2')
    await expect(page.getByRole('heading', { name: 'Design System' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Work log/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark complete' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Back to project' }).click()
    await expect(page).toHaveURL(/\/projects\/1$/)
  })

  test('searches projects and people', async ({ page }) => {
    await login(page, 'priya')
    await page.getByRole('searchbox', { name: 'Search projects' }).fill('Mobile')
    await expect(page).toHaveURL(/\?q=Mobile$/)
    await expect(page.getByRole('link', { name: /Mobile App Launch/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Customer Portal Redesign/ })).toHaveCount(0)

    await page.getByRole('link', { name: 'People' }).click()
    await expect(page.getByRole('heading', { name: 'People' })).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search people' }).fill('James')
    await expect(page.getByRole('link', { name: 'James Smith' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sofia Rossi' })).toHaveCount(0)
  })

  test('logs hours on an assigned milestone and cannot edit or remove them', async ({ page, request }) => {
    const note = unique('E2E entry')
    await login(page, 'priya')
    await page.getByRole('link', { name: 'My time' }).click()
    await expect(page.getByRole('heading', { name: 'My time log' })).toBeVisible()

    await page.getByLabel('Milestone').selectOption('2')
    await page.getByLabel('Date').fill('2026-10-10')
    await page.getByRole('spinbutton', { name: 'Hours' }).fill('2.5')
    await page.getByLabel('Note').fill(note)
    await page.getByRole('button', { name: 'Add entry' }).click()

    const row = page.getByRole('row', { name: new RegExp(note) })
    await expect(row).toBeVisible()
    await expect(row).toContainText('2.5')
    await expect(row.getByRole('button', { name: /Remove entry/ })).toHaveCount(0)
    await expect(row.getByRole('button', { name: /Edit entry/ })).toHaveCount(0)

    // Priya can't remove it, but her manager can
    await deleteTimeEntriesByNote(request, 'maria', 3, note)
  })

  test('is told when hours are invalid', async ({ page }) => {
    await login(page, 'priya')
    await page.goto('/employees/3/time-log')
    await page.getByLabel('Milestone').selectOption('2')
    await page.getByLabel('Date').fill('2026-10-10')
    await page.getByRole('spinbutton', { name: 'Hours' }).fill('30')
    await page.getByRole('button', { name: 'Add entry' }).click()
    await expect(page.locator('.field-error')).toBeVisible()
  })

  test('cannot open the accounts page', async ({ page }) => {
    await login(page, 'priya')
    await expect(page.getByRole('link', { name: 'Accounts' })).toHaveCount(0)
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible()
  })
})

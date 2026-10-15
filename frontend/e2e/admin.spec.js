import { expect, test } from '@playwright/test'
import { PASSWORD, acceptNextConfirm, login, logout, unique } from './helpers'

test.describe('Admin', () => {
  test('sees every project and can delete an empty one', async ({ page }) => {
    const title = unique('Admin project')
    await login(page, 'admin')
    await expect(page.getByText('All projects (admin view)')).toBeVisible()
    for (const name of ['Customer Portal Redesign', 'Data Warehouse Migration', 'Mobile App Launch', 'Legacy CRM Integration']) {
      await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
    }
    await expect(page.getByRole('link', { name: 'My time' })).toHaveCount(0)

    await page.getByRole('button', { name: '+ New project' }).click()
    await page.getByLabel(/Title/).fill(title)
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    acceptNextConfirm(page)
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome, Alice' })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0)
  })

  test('is refused deleting a project with logged hours', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/projects/1')
    acceptNextConfirm(page)
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Customer Portal Redesign' })).toBeVisible()
  })

  test('creates an account, resets its password, then deactivates it', async ({ page }) => {
    const stamp = Date.now().toString(36)
    const username = `e2e${stamp}`
    await login(page, 'admin')
    await page.getByRole('link', { name: 'Accounts' }).click()
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()

    await page.getByRole('button', { name: '+ New account' }).click()
    await page.getByLabel('Role').selectOption('employee')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Email').fill(`${username}@example.com`)
    await page.getByLabel('Initial password').fill(PASSWORD)
    await page.getByLabel('First name').fill('Test')
    await page.getByLabel('Last name').fill(stamp)
    await page.getByLabel('Job title').fill('QA Engineer')
    await page.getByLabel('Manager').selectOption('1')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('status')).toContainText(`Test ${stamp} created as employee`)
    const row = page.getByRole('row', { name: new RegExp(username) })
    await expect(row).toBeVisible()

    // Set a new password
    await row.getByRole('button', { name: 'Manage' }).click()
    await page.getByLabel('New password').fill('NewPassword456!')
    await page.getByRole('button', { name: 'Set password' }).click()
    await expect(page.locator('.account-panel').getByRole('status')).toBeVisible()

    // The new person can sign in with it and sees an empty workspace
    await logout(page)
    await login(page, username, 'NewPassword456!')
    await expect(page.getByRole('heading', { name: 'Welcome, Test' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible()
    await logout(page)

    // Deactivate; they can no longer sign in
    await login(page, 'admin')
    await page.goto('/users')
    await page.getByRole('row', { name: new RegExp(username) }).getByRole('button', { name: 'Manage' }).click()
    acceptNextConfirm(page)
    await page.getByRole('button', { name: 'Deactivate account' }).click()
    await expect(page.getByRole('button', { name: 'Reactivate account' })).toBeVisible()
    await logout(page)

    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill('NewPassword456!')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)

    // Delete the account for good; it never logged hours so this is allowed
    await login(page, 'admin')
    await page.goto('/users')
    await page.getByRole('row', { name: new RegExp(username) }).getByRole('button', { name: 'Manage' }).click()
    acceptNextConfirm(page)
    await page.getByRole('button', { name: 'Delete account' }).click()
    await expect(page.getByRole('row', { name: new RegExp(username) })).toHaveCount(0)
    await expect(page.locator('.account-panel')).toHaveCount(0)
  })

  test('is refused deleting an account with hours logged', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/users')
    await page.getByRole('row', { name: /priya/ }).getByRole('button', { name: 'Manage' }).click()
    acceptNextConfirm(page)
    await page.getByRole('button', { name: 'Delete account' }).click()
    await expect(page.locator('.account-panel').getByRole('alert')).toContainText('deactivate the account instead')
    await expect(page.getByRole('row', { name: /priya/ })).toBeVisible()
  })

  test('rejects a duplicate username', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/users')
    await page.getByRole('button', { name: '+ New account' }).click()
    await page.getByLabel('Username').fill('priya')
    await page.getByLabel('Email').fill('dup@example.com')
    await page.getByLabel('Initial password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.locator('.field-error, [role=alert]').first()).toBeVisible()
  })
})

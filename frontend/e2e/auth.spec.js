import { expect, test } from '@playwright/test'
import { login, logout } from './helpers'

test.describe('Authentication', () => {
  test('signs in, lands on projects, and signs out', async ({ page }) => {
    await login(page, 'priya')
    await expect(page.getByRole('heading', { name: 'Welcome, Priya' })).toBeVisible()
    await expect(page.getByText('employee', { exact: true })).toBeVisible()
    await logout(page)
    await expect(page).toHaveURL(/\/login$/)
  })

  test('rejects a wrong password', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Username').fill('priya')
    await page.getByLabel('Password').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('requires both fields', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.locator('#username-error')).toBeVisible()
    await expect(page.locator('#password-error')).toBeVisible()
  })

  test('redirects a signed-out visitor to login and back to where they were going', async ({ page }) => {
    await page.goto('/projects/1')
    await expect(page).toHaveURL(/\/login$/)
    await page.getByLabel('Username').fill('priya')
    await page.getByLabel('Password').fill('Password123!')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/projects\/1$/)
    await expect(page.getByRole('heading', { name: 'Customer Portal Redesign' })).toBeVisible()
  })

  test('keeps the session across a reload', async ({ page }) => {
    await login(page, 'james')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Welcome, James' })).toBeVisible()
  })

  test('shows a not-found page for unknown URLs', async ({ page }) => {
    await login(page, 'priya')
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to my projects' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome, Priya' })).toBeVisible()
  })
})

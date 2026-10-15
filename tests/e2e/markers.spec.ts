import { expect, test } from '@playwright/test'

async function waitForMarkers(page: import('@playwright/test').Page): Promise<number> {
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="timeline-marker"]').length > 0, null, {
    timeout: 20_000,
  })
  return page.locator('[data-testid="timeline-marker"]').count()
}

test('world zoom with synthetic corpus mounts at most 150 markers', async ({ page }) => {
  await page.goto('/?synthetic=1&y=1&z=1')
  const n = await waitForMarkers(page)
  expect(n).toBeGreaterThan(0)
  expect(n).toBeLessThanOrEqual(150)
})

test('zooming into 1914–1945 reveals more markers', async ({ page }) => {
  await page.goto('/?synthetic=1&y=1&z=1')
  const world = await waitForMarkers(page)

  await page.goto('/?synthetic=1&y=1930&z=9')
  const close = await waitForMarkers(page)
  expect(close).toBeGreaterThan(world)
  expect(close).toBeLessThanOrEqual(150)
})

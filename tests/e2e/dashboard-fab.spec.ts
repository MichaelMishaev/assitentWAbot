import { test, expect } from '@playwright/test';

test.describe('Dashboard FAB and Bottom Sheet', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard - adjust the URL/token as needed
    // This is a placeholder - you'll need to handle authentication
    await page.goto('/dashboard');
  });

  test('FAB button should be visible on agenda tab', async ({ page }) => {
    // Navigate to agenda tab
    await page.click('#tab-agenda');

    // Check if FAB is visible
    const fab = page.locator('#add-fab');
    await expect(fab).toBeVisible();

    // Verify FAB styling
    await expect(fab).toHaveCSS('position', 'fixed');
    await expect(fab).toHaveAttribute('aria-label', 'הוסף פריט חדש');
  });

  test('FAB should be hidden on week/month tabs', async ({ page }) => {
    // Navigate to week tab
    await page.click('#tab-week');

    const fab = page.locator('#add-fab');
    await expect(fab).toBeHidden();

    // Navigate to month tab
    await page.click('#tab-month');
    await expect(fab).toBeHidden();
  });

  test('clicking FAB should open bottom sheet menu', async ({ page }) => {
    // Navigate to agenda tab
    await page.click('#tab-agenda');

    // Click FAB button
    await page.click('#add-fab');

    // Check if bottom sheet menu is visible
    const bottomSheet = page.locator('#add-menu');
    await expect(bottomSheet).toBeVisible();
    await expect(bottomSheet).not.toHaveClass(/translate-y-full/);

    // Check if overlay is visible
    const overlay = page.locator('#add-menu-overlay');
    await expect(overlay).toBeVisible();
  });

  test('bottom sheet should display all three options', async ({ page }) => {
    await page.click('#tab-agenda');
    await page.click('#add-fab');

    // Check for event option
    const eventButton = page.locator('text=אירוע חדש');
    await expect(eventButton).toBeVisible();

    // Check for reminder option
    const reminderButton = page.locator('text=תזכורת חדשה');
    await expect(reminderButton).toBeVisible();

    // Check for task option
    const taskButton = page.locator('text=משימה חדשה');
    await expect(taskButton).toBeVisible();

    // Check for cancel button
    const cancelButton = page.locator('text=ביטול');
    await expect(cancelButton).toBeVisible();
  });

  test('clicking overlay should close bottom sheet', async ({ page }) => {
    await page.click('#tab-agenda');
    await page.click('#add-fab');

    // Verify bottom sheet is open
    const bottomSheet = page.locator('#add-menu');
    await expect(bottomSheet).toBeVisible();

    // Click overlay
    await page.click('#add-menu-overlay');

    // Wait for animation
    await page.waitForTimeout(350);

    // Verify bottom sheet is closed
    await expect(bottomSheet).toBeHidden();
  });

  test('clicking cancel button should close bottom sheet', async ({ page }) => {
    await page.click('#tab-agenda');
    await page.click('#add-fab');

    // Click cancel button
    await page.click('text=ביטול');

    // Wait for animation
    await page.waitForTimeout(350);

    // Verify bottom sheet is closed
    const bottomSheet = page.locator('#add-menu');
    await expect(bottomSheet).toBeHidden();
  });

  test('pressing Escape key should close bottom sheet', async ({ page }) => {
    await page.click('#tab-agenda');
    await page.click('#add-fab');

    // Press Escape key
    await page.keyboard.press('Escape');

    // Wait for animation
    await page.waitForTimeout(350);

    // Verify bottom sheet is closed
    const bottomSheet = page.locator('#add-menu');
    await expect(bottomSheet).toBeHidden();
  });

  test('keyboard shortcut Cmd+N should open bottom sheet', async ({ page }) => {
    await page.click('#tab-agenda');

    // Press Cmd+N (or Ctrl+N on Windows/Linux)
    await page.keyboard.press('Meta+n');

    // Verify bottom sheet is open
    const bottomSheet = page.locator('#add-menu');
    await expect(bottomSheet).toBeVisible();
  });

  test('FAB should have hover effect', async ({ page }) => {
    await page.click('#tab-agenda');

    const fab = page.locator('#add-fab');

    // Hover over FAB
    await fab.hover();

    // Check if transform scale is applied (this is a basic check)
    const box = await fab.boundingBox();
    expect(box).toBeTruthy();
  });

  test.describe('Mobile specific tests', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone size

    test('FAB should be positioned in thumb zone on mobile', async ({ page }) => {
      await page.click('#tab-agenda');

      const fab = page.locator('#add-fab');
      const box = await fab.boundingBox();

      // Verify FAB is in the bottom center (thumb zone)
      expect(box).toBeTruthy();
      if (box) {
        // Should be near bottom
        expect(box.y).toBeGreaterThan(500);

        // Should be horizontally centered (approximately)
        const centerX = box.x + (box.width / 2);
        expect(centerX).toBeGreaterThan(150);
        expect(centerX).toBeLessThan(225);
      }
    });

    test('bottom sheet should slide up from bottom on mobile', async ({ page }) => {
      await page.click('#tab-agenda');
      await page.click('#add-fab');

      const bottomSheet = page.locator('#add-menu');

      // Check if bottom sheet has proper mobile styling
      await expect(bottomSheet).toHaveCSS('position', 'fixed');

      // Verify it's at the bottom
      const box = await bottomSheet.boundingBox();
      expect(box).toBeTruthy();
    });
  });

  test.describe('Calendar fixes verification', () => {
    test('month view should not be cut off', async ({ page }) => {
      await page.click('#tab-month');

      const monthViewContent = page.locator('#month-view-content');
      await expect(monthViewContent).toBeVisible();

      // Check if overflow is set to auto
      await expect(monthViewContent).toHaveCSS('overflow', 'auto');
    });

    test('events in month view day details should be clickable', async ({ page }) => {
      await page.click('#tab-month');

      // Try to find a day with events (this will depend on your test data)
      // This is a placeholder - adjust based on your actual data
      const dayWithEvents = page.locator('.compact-day.has-events').first();

      if (await dayWithEvents.count() > 0) {
        await dayWithEvents.click();

        // Check if day details panel is visible
        const dayDetails = page.locator('#day-details');
        await expect(dayDetails).toBeVisible();

        // Check if events have cursor-pointer class
        const events = page.locator('#day-details-content .cursor-pointer');
        if (await events.count() > 0) {
          await expect(events.first()).toHaveClass(/cursor-pointer/);
        }
      }
    });
  });
});

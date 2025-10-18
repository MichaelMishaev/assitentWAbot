import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🔍 Opening past events report page...');
  await page.goto('http://localhost:7100/past-events-report');

  // Wait for page to load
  await page.waitForTimeout(2000);

  // Check if data auto-loaded
  console.log('\n📊 Checking if data auto-loaded...');
  const statsSection = await page.$('#stats-section');
  const isStatsVisible = await statsSection.isVisible();
  console.log('Stats section visible:', isStatsVisible);

  if (isStatsVisible) {
    const totalEvents = await page.$eval('#stat-total', el => el.textContent);
    const totalLocations = await page.$eval('#stat-locations', el => el.textContent);
    console.log('Total events:', totalEvents);
    console.log('Total locations:', totalLocations);
  }

  // Check locations section
  console.log('\n📍 Checking locations section...');
  const locationsSection = await page.$('#locations-section');
  const isLocationsVisible = await locationsSection.isVisible();
  console.log('Locations section visible:', isLocationsVisible);

  if (isLocationsVisible) {
    const locationCards = await page.$$('#locations-list > div');
    console.log('Number of location cards:', locationCards.length);

    if (locationCards.length > 0) {
      console.log('\n🖱️ Clicking first location card...');
      await locationCards[0].click();
      await page.waitForTimeout(1000);

      const modal = await page.$('#detailModal');
      const isModalVisible = await modal.evaluate(el => el.classList.contains('active'));
      console.log('Modal opened:', isModalVisible);

      if (isModalVisible) {
        const modalContent = await page.$eval('#modalBody', el => el.textContent.substring(0, 100));
        console.log('Modal content preview:', modalContent);
      }

      // Close modal
      const closeBtn = await page.$('#detailModal button');
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
  }

  // Check events section
  console.log('\n🗂️ Checking events section...');
  const eventsSection = await page.$('#events-section');
  const isEventsVisible = await eventsSection.isVisible();
  console.log('Events section visible:', isEventsVisible);

  if (isEventsVisible) {
    const eventCards = await page.$$('#events-list > div');
    console.log('Number of event cards:', eventCards.length);

    if (eventCards.length > 0) {
      console.log('\n🖱️ Clicking first event card...');
      await eventCards[0].click();
      await page.waitForTimeout(1000);

      const modal = await page.$('#detailModal');
      const isModalVisible = await modal.evaluate(el => el.classList.contains('active'));
      console.log('Modal opened:', isModalVisible);

      if (isModalVisible) {
        const modalTitle = await page.$eval('#modalBody h3', el => el.textContent).catch(() => 'Not found');
        console.log('Event title in modal:', modalTitle);
      }
    }
  }

  // Check for JavaScript errors
  console.log('\n⚠️ Checking console for errors...');
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Console error:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('❌ Page error:', error.message);
  });

  console.log('\n✅ Test completed. Browser will stay open for 10 seconds...');
  await page.waitForTimeout(10000);

  await browser.close();
})();

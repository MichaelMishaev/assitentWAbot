import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Listen for console messages and errors
  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}]:`, msg.text());
  });

  page.on('pageerror', error => {
    console.log('❌ Page error:', error.message);
  });

  console.log('🔍 Opening past events report page...');
  await page.goto('http://localhost:7100/past-events-report');

  // Wait for page to load
  await page.waitForTimeout(3000);

  // Take screenshot 1
  await page.screenshot({ path: '/tmp/page-loaded.png' });
  console.log('📸 Screenshot 1 saved: /tmp/page-loaded.png');

  // Check if data auto-loaded
  console.log('\n📊 Checking if data auto-loaded...');
  const statsSection = await page.$('#stats-section');
  if (statsSection) {
    const isStatsVisible = await statsSection.isVisible();
    console.log('Stats section visible:', isStatsVisible);

    if (isStatsVisible) {
      const totalEvents = await page.$eval('#stat-total', el => el.textContent);
      const totalLocations = await page.$eval('#stat-locations', el => el.textContent);
      console.log('Total events:', totalEvents);
      console.log('Total locations:', totalLocations);
    }
  }

  // Check locations section
  console.log('\n📍 Checking locations section...');
  const locationCards = await page.$$('#locations-list > div');
  console.log('Number of location cards:', locationCards.length);

  if (locationCards.length > 0) {
    console.log('\n🖱️ Testing location card click...');

    // Check onclick attribute
    const onclickAttr = await locationCards[0].getAttribute('onclick');
    console.log('Location card onclick:', onclickAttr);

    // Click the first location
    await locationCards[0].click();
    await page.waitForTimeout(1000);

    // Take screenshot 2
    await page.screenshot({ path: '/tmp/after-location-click.png' });
    console.log('📸 Screenshot 2 saved: /tmp/after-location-click.png');

    // Check modal state
    const modal = await page.$('#detailModal');
    if (modal) {
      const modalClasses = await modal.getAttribute('class');
      console.log('Modal classes:', modalClasses);

      const isModalActive = modalClasses && modalClasses.includes('active');
      console.log('Modal is active:', isModalActive);

      if (isModalActive) {
        const modalBody = await page.$('#modalBody');
        const modalText = await modalBody.textContent();
        console.log('Modal body text (first 200 chars):', modalText.substring(0, 200));
      } else {
        console.log('❌ Modal did not open!');
      }
    } else {
      console.log('❌ Modal element not found!');
    }
  }

  // Check events section
  console.log('\n🗂️ Checking events section...');
  const eventCards = await page.$$('#events-list > div');
  console.log('Number of event cards:', eventCards.length);

  if (eventCards.length > 0) {
    console.log('\n🖱️ Testing event card click...');

    // Check onclick attribute
    const onclickAttr = await eventCards[0].getAttribute('onclick');
    console.log('Event card onclick (first 100 chars):', onclickAttr ? onclickAttr.substring(0, 100) : 'null');

    // Close previous modal if open
    const existingModal = await page.$('#detailModal.active');
    if (existingModal) {
      await page.click('#detailModal');
      await page.waitForTimeout(500);
    }

    // Click the first event
    await eventCards[0].click();
    await page.waitForTimeout(1000);

    // Take screenshot 3
    await page.screenshot({ path: '/tmp/after-event-click.png' });
    console.log('📸 Screenshot 3 saved: /tmp/after-event-click.png');

    // Check modal state
    const modal = await page.$('#detailModal');
    if (modal) {
      const modalClasses = await modal.getAttribute('class');
      const isModalActive = modalClasses && modalClasses.includes('active');
      console.log('Modal is active after event click:', isModalActive);
    }
  }

  console.log('\n✅ Test completed. Check screenshots in /tmp/');
  console.log('Browser will stay open for 15 seconds for manual inspection...');
  await page.waitForTimeout(15000);

  await browser.close();
})();

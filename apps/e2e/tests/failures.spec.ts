import { expect, test } from '@playwright/test';
import { newUser, signUp, signUpWithFamily } from './helpers';

// Server failures. The API keeps running: page.route intercepts the browser's requests and
// answers 500 instead, which is quicker and safer than stopping a server in the middle of a
// run. A failed query is retried twice (after 1 s and 2 s, see queryClient.ts), so the app
// gives up about 3 s after the first attempt.
const AFTER_RETRIES = { timeout: 10_000 };

test('8. a failed background refresh keeps the loaded family on screen', async ({ page }) => {
  // Cached data is "fresh" for 30 s (staleTime) and is not refetched during that time.
  // Instead of really waiting 30 s, the test replaces the page's clock (Date and timers)
  // with one it controls. Until fastForward is called, this clock runs at normal speed.
  await page.clock.install();
  const { user, familyPath } = await signUpWithFamily(page, 'The Testers');
  await expect(page.getByText(user.email)).toBeVisible();

  // From now on every request for this family fails. The home page's list still works.
  let failedRequests = 0;
  await page.route(`**/api${familyPath}`, async (route) => {
    failedRequests += 1;
    await route.fulfill({ status: 500, json: { message: 'Simulated server failure' } });
  });

  // Jump 31 s ahead: the cached family is stale now. Stale data is refetched in the
  // background when a page that uses it opens, so leave the family page and come back.
  await page.clock.fastForward(31_000);
  await page.getByRole('link', { name: '← Home' }).click();
  await page.getByRole('link', { name: 'The Testers' }).click();

  // The family from the cache is on screen at once, while the refetch fails behind it
  await expect(page.getByText(user.email)).toBeVisible();
  // Wait until the app has given up: the first attempt and two retries
  await expect.poll(() => failedRequests, AFTER_RETRIES).toBe(3);

  // Nothing on screen changed: the members are still there, and no error card replaced them
  await expect(page.getByRole('heading', { name: 'The Testers' })).toBeVisible();
  await expect(page.getByText(`${user.name} (you)`)).toBeVisible();
  await expect(page.getByText(user.email)).toBeVisible();
  await expect(page.getByText('Could not load the family.')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeHidden();
});

test('9. the home page shows an error with "Try again" and recovers', async ({ page }) => {
  await signUp(page, newUser());

  // This pattern matches the list only, not /api/families/<id>
  await page.route('**/api/families', (route) =>
    route.fulfill({ status: 500, json: { message: 'Simulated server failure' } }),
  );
  // A reload empties the query cache, so the home page has no family list to fall back on
  await page.reload();

  await expect(page.getByText('Could not load your families.')).toBeVisible(AFTER_RETRIES);
  const tryAgain = page.getByRole('button', { name: 'Try again' });
  await expect(tryAgain).toBeVisible();

  // The server "is back": stop intercepting and ask again
  await page.unroute('**/api/families');
  await tryAgain.click();

  await expect(page.getByRole('heading', { name: 'Create your family' })).toBeVisible();
  await expect(page.getByText('Could not load your families.')).toBeHidden();
});

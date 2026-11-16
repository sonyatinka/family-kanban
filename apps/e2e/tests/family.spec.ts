import { expect, test } from '@playwright/test';
import { newUser, signUp, signUpWithFamily } from './helpers';

// Family page

test('5. the family page shows the name, my role and me in the member list', async ({ page }) => {
  const { user } = await signUpWithFamily(page, 'The Testers');

  await expect(page.getByRole('heading', { name: 'The Testers', level: 1 })).toBeVisible();
  await expect(page.getByText('Your role: Parent')).toBeVisible();

  // The creator is the only member so far
  const members = page.locator('section', {
    has: page.getByRole('heading', { name: 'Members' }),
  });
  const rows = members.getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(`${user.name} (you)`);
  await expect(rows).toContainText(user.email);
  await expect(rows.getByText('Parent', { exact: true })).toBeVisible();
});

// 'abc' is not a UUID (the API answers 400); the second id is a valid UUID that no family
// has (404). The page shows the same message for both.
for (const id of ['abc', '00000000-0000-4000-8000-000000000000']) {
  test(`6. /families/${id} shows "Family not found." without "Try again"`, async ({ page }) => {
    await signUp(page, newUser());

    await page.goto(`/families/${id}`);

    await expect(page.getByText('Family not found.')).toBeVisible();
    // Asking again would give the same answer, so there is nothing to retry
    await expect(page.getByRole('button', { name: 'Try again' })).toBeHidden();
    await expect(page.getByRole('link', { name: '← Home' })).toBeVisible();
  });
}

test('7. reloading the family page keeps the user on it', async ({ page }) => {
  const { familyPath } = await signUpWithFamily(page, 'The Testers');

  // A reload drops the access token, which lives only in memory. The app gets a new one
  // with the refresh cookie before it renders any route.
  await page.reload();

  await expect(page.getByRole('heading', { name: 'The Testers' })).toBeVisible();
  await expect(page.getByText('(you)')).toBeVisible();
  await expect(page).toHaveURL(familyPath);
});

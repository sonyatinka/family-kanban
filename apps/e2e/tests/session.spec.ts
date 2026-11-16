import { expect, test } from '@playwright/test';
import { logIn, newUser, signUp, signUpWithFamily } from './helpers';

// Logout, and another user on the same browser tab

test('10. "Log out" on the family page leads to /login without ?redirect=', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');

  await page.getByRole('button', { name: 'Log out' }).click();

  // A string must match the whole URL, so this also checks that there is no ?redirect=…
  // The next person to log in may be someone else, and the family page is not theirs.
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});

test("11. a second user who logs in next does not see the first user's family", async ({
  page,
}) => {
  // The second user only needs an account, so they sign up first and leave
  const second = newUser('Second User');
  await signUp(page, second);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');

  // The first user creates a family and logs out. There is no page reload after this, so
  // anything the app kept in memory (the query cache) would still be there.
  await signUpWithFamily(page, 'The Testers');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');

  await logIn(page, second);

  await expect(page.getByRole('heading', { name: 'Hi, Second User' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create your family' })).toBeVisible();
  await expect(page.getByText('The Testers')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Your families' })).toBeHidden();
});

test('12. a guest who opens a family page logs in and lands on that page', async ({ page }) => {
  const { user, familyPath } = await signUpWithFamily(page, 'The Testers');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');

  // page.goto loads the app from scratch, like typing the address or reloading. The
  // "logged out on purpose" flag set by the logout above lives in memory, so it is gone, and
  // the guard remembers the address again, as for any guest without a session.
  await page.goto(familyPath);

  // The guard remembers where the guest was going
  await expect(page).toHaveURL(
    (url) => url.pathname === '/login' && url.searchParams.get('redirect') === familyPath,
  );

  await logIn(page, user);

  await expect(page).toHaveURL(familyPath);
  await expect(page.getByRole('heading', { name: 'The Testers' })).toBeVisible();
  await expect(page.getByText(`${user.name} (you)`)).toBeVisible();
});

import { expect, test, type Browser, type Page } from '@playwright/test';
import { createInviteLink, newUser, signUp, signUpWithFamily } from './helpers';

// Invite links. Each test has two or three people. Every extra person gets their own browser
// context, with their own cookies, as if they were on another computer. Config options such
// as baseURL apply only to the context of the `page` fixture, so it is passed on by hand.

async function anotherPerson(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  return context.newPage();
}

// The invites card on the family page
const invitesCard = (page: Page) =>
  page.locator('section', { has: page.getByRole('heading', { name: 'Invite to the family' }) });

test('14. a parent invites a second user, who joins as a child', async ({
  page,
  browser,
  baseURL,
}) => {
  const { user: parent } = await signUpWithFamily(page, 'The Testers');
  const link = await createInviteLink(page, 'child');
  await expect(invitesCard(page).getByRole('listitem')).toHaveCount(1);

  const kidPage = await anotherPerson(browser, baseURL);
  await signUp(kidPage, newUser('Test Kid'));
  await kidPage.goto(link);

  await expect(kidPage.getByRole('heading', { name: 'Join The Testers' })).toBeVisible();
  await expect(kidPage.getByText('invites you to the family as')).toContainText(
    `${parent.name} invites you to the family as Child.`,
  );
  await kidPage.getByRole('button', { name: 'Join family' }).click();

  await expect(kidPage).toHaveURL(/\/families\/[0-9a-f-]{36}$/);
  await expect(kidPage.getByText('Your role: Child')).toBeVisible();
  // The parent and the new member
  await expect(kidPage.getByRole('listitem')).toHaveCount(2);
  // Only parents manage invites
  await expect(kidPage.getByRole('heading', { name: 'Invite to the family' })).toBeHidden();
  await kidPage.context().close();
});

test('15. a guest who opens an invite link signs up and comes back to it', async ({
  page,
  browser,
  baseURL,
}) => {
  await signUpWithFamily(page, 'The Testers');
  const link = await createInviteLink(page, 'guest');
  const invitePath = new URL(link).pathname;

  // No session in this context: the route guard sends the guest to the login page and
  // remembers the link in ?redirect=
  const guestPage = await anotherPerson(browser, baseURL);
  await guestPage.goto(link);
  await expect(guestPage).toHaveURL(
    (url) => url.pathname === '/login' && url.searchParams.get('redirect') === invitePath,
  );

  // The login page tells an invited guest that they may need an account first
  await expect(guestPage.getByText('You were invited to a family.')).toBeVisible();

  // The sign-up link keeps ?redirect=, so a new account also comes back to the invite
  await guestPage.getByRole('link', { name: 'Sign up' }).click();
  const guest = newUser('Test Guest');
  await guestPage.getByLabel('Name').fill(guest.name);
  await guestPage.getByLabel('Email').fill(guest.email);
  await guestPage.getByLabel('Password').fill(guest.password);
  await guestPage.getByRole('button', { name: 'Sign up' }).click();

  await expect(guestPage).toHaveURL(invitePath);
  await guestPage.getByRole('button', { name: 'Join family' }).click();
  await expect(guestPage.getByText('Your role: Guest')).toBeVisible();
  await guestPage.context().close();
});

test('16. a used link and a revoked link do not work', async ({ page, browser, baseURL }) => {
  await signUpWithFamily(page, 'The Testers');
  const used = await createInviteLink(page, 'child');
  const revoked = await createInviteLink(page, 'guest');

  const rows = invitesCard(page).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: 'Guest' }).getByRole('button', { name: 'Revoke' }).click();
  await expect(rows).toHaveCount(1);

  // Someone uses the first link
  const kidPage = await anotherPerson(browser, baseURL);
  await signUp(kidPage, newUser('Test Kid'));
  await kidPage.goto(used);
  await kidPage.getByRole('button', { name: 'Join family' }).click();
  await expect(kidPage.getByText('Your role: Child')).toBeVisible();

  // A third person tries both links and gets the same answer, whatever the reason
  const latePage = await anotherPerson(browser, baseURL);
  await signUp(latePage, newUser('Test Late'));
  for (const link of [used, revoked]) {
    await latePage.goto(link);
    await expect(latePage.getByText('This invite link does not work.')).toBeVisible();
    await expect(latePage.getByRole('button', { name: 'Join family' })).toBeHidden();
  }
  await kidPage.context().close();
  await latePage.context().close();
});

test('18. every link made on the page can be copied from the list until it is left', async ({
  page,
  context,
}) => {
  // Reading the clipboard in a test needs these permissions; a person just pastes
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signUpWithFamily(page, 'The Testers');
  const first = await createInviteLink(page, 'child');
  await createInviteLink(page, 'guest');

  // The first link is no longer in the box above the list, but its row can still copy it
  const childRow = invitesCard(page).getByRole('listitem').filter({ hasText: 'Child' });
  await childRow.getByRole('button', { name: 'Copy link' }).click();
  await expect(childRow.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first);

  // The links lived only in the page's memory: after a reload no row can be copied
  await page.reload();
  await expect(invitesCard(page).getByRole('listitem')).toHaveCount(2);
  await expect(invitesCard(page).getByRole('button', { name: 'Copy link' })).toHaveCount(0);
  await expect(invitesCard(page).getByText('If one is lost, revoke it')).toBeVisible();
});

test('17. a member of the family cannot use its link, and the link keeps working', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  const link = await createInviteLink(page, 'child');
  const familyPath = new URL(page.url()).pathname;

  // The parent opens a link of their own family
  await page.goto(link);
  await page.getByRole('button', { name: 'Join family' }).click();
  await expect(page.getByRole('alert')).toHaveText('You are already in this family');

  // The API rolled the transaction back, so the invite is still unused for its real recipient
  await page.goto(familyPath);
  await expect(invitesCard(page).getByRole('listitem')).toHaveCount(1);
});

test('19. someone with a family joins a second one, and the home page lists both', async ({
  page,
  browser,
  baseURL,
}) => {
  await signUpWithFamily(page, 'The Testers');
  const link = await createInviteLink(page, 'child');

  const otherPage = await anotherPerson(browser, baseURL);
  await signUpWithFamily(otherPage, 'Other Family');
  await otherPage.goto(link);
  await otherPage.getByRole('button', { name: 'Join family' }).click();
  await expect(otherPage.getByText('Your role: Child')).toBeVisible();

  // One person, two families, a different role in each
  await otherPage.getByRole('link', { name: '← Home' }).click();
  const myFamilies = otherPage
    .locator('section', { has: otherPage.getByRole('heading', { name: 'Your families' }) })
    .getByRole('listitem');
  await expect(myFamilies).toHaveCount(2);
  await expect(myFamilies.filter({ hasText: 'Other Family' })).toContainText('Parent');
  await expect(myFamilies.filter({ hasText: 'The Testers' })).toContainText('Child');
  await otherPage.context().close();
});

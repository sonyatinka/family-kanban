import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

// Every test user gets an email at this domain. global-teardown.ts deletes the users with
// such emails (and their families) after the run, so real accounts are never touched.
export const TEST_EMAIL_DOMAIN = 'claude-test.local';

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

// A new user for each test: tests don't depend on each other and can run in any order.
// The random part keeps emails unique between tests and between runs.
export function newUser(name = 'Test Parent'): TestUser {
  return {
    name,
    email: `e2e-${randomUUID()}@${TEST_EMAIL_DOMAIN}`,
    password: 'test-password-123',
  };
}

// Signs up through the form. The API logs the new user in, and the router opens the home page.
export async function signUp(page: Page, user: TestUser) {
  await page.goto('/register');
  await page.getByLabel('Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('heading', { name: `Hi, ${user.name}` })).toBeVisible();
}

// Fills the login form. The page must already be on /login (with or without ?redirect=).
export async function logIn(page: Page, user: TestUser) {
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

// Creates a family with the form on the home page and returns the path of its page,
// such as /families/6f0c…
export async function createFamily(page: Page, name: string): Promise<string> {
  await page.getByLabel('Family name').fill(name);
  await page.getByRole('button', { name: 'Create family' }).click();
  await page.waitForURL(/\/families\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

// On a parent's family page: creates an invite link for the role and returns the full link.
// The token is taken from the API response: the field on screen may still show the previous
// link for a moment, and the test must not pick that one up.
export async function createInviteLink(
  page: Page,
  role: 'parent' | 'child' | 'guest',
): Promise<string> {
  await page.getByLabel('Role').selectOption(role);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && /\/invites$/.test(r.url())),
    page.getByRole('button', { name: 'Create invite link' }).click(),
  ]);
  const { token } = (await response.json()) as { token: string };
  const link = new URL(`/invite/${token}`, page.url()).href;
  await expect(page.getByLabel('Invite link')).toHaveValue(link);
  return link;
}

// Sign up and create a family in one step, for the tests that start on the family page
export async function signUpWithFamily(page: Page, familyName: string) {
  const user = newUser();
  await signUp(page, user);
  const familyPath = await createFamily(page, familyName);
  return { user, familyPath };
}

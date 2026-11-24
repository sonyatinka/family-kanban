import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

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

// ---- Boards (stage 2) ----

// A UUID inside a URL pattern
export const UUID = '[0-9a-f-]{36}';

export interface CreatedBoard {
  id: string;
  name: string;
  columns: { id: string; name: string }[];
}

// On a family page: creates a board with the form and returns the API's answer. The board's
// id and column ids are read from the response, not guessed from the screen. The app opens
// the board screen afterwards, so the helper waits for it.
export async function createBoard(page: Page, name: string): Promise<CreatedBoard> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/families\/[^/]+\/boards$/.test(r.url()),
    ),
    (async () => {
      await page.getByLabel('New board').fill(name);
      await page.getByRole('button', { name: 'Create board' }).click();
    })(),
  ]);
  const board = (await response.json()) as CreatedBoard;
  await page.waitForURL(new RegExp(`/boards/${UUID}$`));
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  return board;
}

// The column's heading reads "To do 2": the name and the number of cards, or "To do 1 of 2"
// while a filter is on
export function columnHeading(page: Page, name: string, count: string | number) {
  return page
    .getByRole('region', { name })
    .getByRole('heading', { name: `${name} ${count}`, exact: true });
}

// Adds a card with the "+ Add a card" form and waits until it is on the board. The form stays
// open afterwards, so it is closed with Cancel to leave the column tidy for the next call
export async function addCard(page: Page, column: string, title: string) {
  const region = page.getByRole('region', { name: column });
  await region.getByRole('button', { name: '+ Add a card' }).click();
  await region.getByLabel('Card title').fill(title);
  await region.getByRole('button', { name: 'Add card' }).click();
  await expect(region.getByRole('listitem').filter({ hasText: title })).toBeVisible();
  await region.getByRole('button', { name: 'Cancel' }).click();
}

// A card tile on the board (the <li> that holds the button)
export function tile(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title });
}

// For data the UI cannot make or check, the test calls the API itself. The access token lives
// only in the page's memory, so the test logs in with the `request` fixture. It has its own
// cookie jar, so it neither reads nor rotates the page's refresh cookie. Reload the page
// afterwards to see what changed.
export async function apiLogin(request: APIRequestContext, user: TestUser) {
  const res = await request.post('/api/auth/login', {
    data: { email: user.email, password: user.password },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { accessToken: string; user: { id: string } };
  return { accessToken: body.accessToken, userId: body.user.id };
}

export async function addCardViaApi(
  request: APIRequestContext,
  accessToken: string,
  columnId: string,
  data: { title: string; assigneeId?: string; dueDate?: string },
) {
  const res = await request.post(`/api/columns/${columnId}/cards`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data,
  });
  expect(res.status()).toBe(201);
}

// Holds the matching requests until the returned release() is called, to check what the page
// does while a request is running. Then they go on to the server ('continue') or get a 500
// ('fail'). Requests with another method pass through at once.
export async function holdRequests(
  page: Page,
  url: string,
  method: string,
  answer: 'continue' | 'fail',
): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(url, async (route) => {
    if (route.request().method() !== method) return route.continue();
    await held;
    if (answer === 'continue') await route.continue();
    else await route.fulfill({ status: 500, json: { message: 'Simulated server failure' } });
  });
  return release;
}

// The id of a card on a board, found by its title through the API (the screen doesn't show ids)
export async function cardIdViaApi(
  request: APIRequestContext,
  accessToken: string,
  boardId: string,
  title: string,
): Promise<string> {
  const res = await request.get(`/api/boards/${boardId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(res.ok()).toBe(true);
  const board = (await res.json()) as { columns: { cards: { id: string; title: string }[] }[] };
  const card = board.columns.flatMap((c) => c.cards).find((c) => c.title === title);
  expect(card, `card "${title}"`).toBeDefined();
  return card!.id;
}

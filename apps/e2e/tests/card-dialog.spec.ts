import { expect, test, type Page } from '@playwright/test';
import {
  addCard,
  apiLogin,
  cardIdViaApi,
  columnHeading,
  createBoard,
  createInviteLink,
  holdRequests,
  logIn,
  newUser,
  signUp,
  signUpWithFamily,
  tile,
  UUID,
} from './helpers';

// The card dialog and the board filters (stage 2, step 4, part 2). Scenario numbers start with C.
// The open card and the filters live in Redux; the cards themselves in TanStack Query.

// The "Card" dialog. Its labels ("Title", "Assignee") also exist elsewhere on the page, so
// every dialog locator is scoped to it
function cardDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Card', exact: true });
}

async function openCard(page: Page, title: string) {
  await tile(page, title).getByRole('button').click();
  await expect(cardDialog(page)).toBeVisible();
}

// Collects the URLs of every PATCH to a card, to prove that nothing was sent
function trackCardPatches(page: Page): string[] {
  const patches: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && /\/api\/cards\//.test(r.url())) patches.push(r.url());
  });
  return patches;
}

// Runs the action and returns the JSON body of the card PATCH it caused
async function patchBody(page: Page, action: () => Promise<void>) {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'PATCH' && /\/api\/cards\/[^/]+$/.test(r.url())),
    action(),
  ]);
  return request.postDataJSON() as Record<string, unknown>;
}

// Opens a card, changes some fields and saves; waits until the dialog has closed
async function editCard(
  page: Page,
  title: string,
  changes: { description?: string; assignee?: string },
) {
  await openCard(page, title);
  const dialog = cardDialog(page);
  if (changes.description !== undefined) {
    await dialog.getByLabel('Description').fill(changes.description);
  }
  if (changes.assignee !== undefined) {
    await dialog.getByLabel('Assignee').selectOption({ label: changes.assignee });
  }
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

const filterBar = (page: Page) => page.getByRole('search');

test('C1. clicking a card opens the dialog; Save sends only the changed fields', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');

  await openCard(page, 'Wash the car');
  const dialog = cardDialog(page);
  await expect(dialog.getByLabel('Title')).toHaveValue('Wash the car');
  await expect(dialog.getByLabel('Description')).toHaveValue('');

  const body = await patchBody(page, async () => {
    await dialog.getByLabel('Title').fill('Wash the red car');
    await dialog.getByLabel('Description').fill('Use the soft sponge');
    await dialog.getByRole('button', { name: 'Save' }).click();
  });
  // The assignee and the due date were not touched, so they are not in the request: a value
  // changed by someone else meanwhile must not be overwritten with the old one
  expect(body).toEqual({ title: 'Wash the red car', description: 'Use the soft sponge' });

  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the red car')).toBeVisible();
  await expect(tile(page, 'Wash the car')).toBeHidden();

  // The saved description comes back when the card is opened again
  await openCard(page, 'Wash the red car');
  await expect(dialog.getByLabel('Description')).toHaveValue('Use the soft sponge');

  const dueBody = await patchBody(page, async () => {
    await dialog.getByLabel('Due date').fill('2030-11-30');
    await dialog.getByRole('button', { name: 'Save' }).click();
  });
  expect(dueBody).toEqual({ dueDate: '2030-11-30' });
  await expect(dialog).toBeHidden();
});

test('C2. Save with nothing changed sends no request and closes the dialog', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  const patches = trackCardPatches(page);

  await openCard(page, 'Wash the car');
  await cardDialog(page).getByRole('button', { name: 'Save' }).click();

  await expect(cardDialog(page)).toBeHidden();
  // The comparison runs in the browser before any request, so one would be counted by now
  expect(patches).toEqual([]);
  await expect(tile(page, 'Wash the car')).toBeVisible();
});

test('C3. an empty title shows "Enter a title" in the dialog and sends nothing', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  const patches = trackCardPatches(page);

  await openCard(page, 'Wash the car');
  const dialog = cardDialog(page);
  await dialog.getByLabel('Title').fill('   ');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog.getByText('Enter a title')).toBeVisible();
  // The dialog stays open so the user can fix the title
  await expect(dialog).toBeVisible();
  expect(patches).toEqual([]);
});

test('C4. a card is assigned to a member and back to nobody', async ({ page }) => {
  const { user } = await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  const dialog = cardDialog(page);

  await openCard(page, 'Wash the car');
  const assignBody = await patchBody(page, async () => {
    // The family's members are the options; selectOption waits until they are loaded
    await dialog.getByLabel('Assignee').selectOption({ label: user.name });
    await dialog.getByRole('button', { name: 'Save' }).click();
  });
  expect(assignBody).toEqual({ assigneeId: expect.stringMatching(new RegExp(`^${UUID}$`)) });
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the car')).toContainText(user.name);

  await openCard(page, 'Wash the car');
  await expect(dialog.getByLabel('Assignee')).toHaveValue(assignBody.assigneeId as string);
  const clearBody = await patchBody(page, async () => {
    await dialog.getByLabel('Assignee').selectOption({ label: 'Nobody' });
    await dialog.getByRole('button', { name: 'Save' }).click();
  });
  // null clears the assignee; it is not sent as an empty string
  expect(clearBody).toEqual({ assigneeId: null });
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the car')).toHaveText('Wash the car');
});

test('C5. a due date is sent as written in any time zone and can be removed', async ({
  browser,
  baseURL,
}) => {
  // New York is behind UTC: a date handled as a moment would slip to 29 November
  const context = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
  try {
    const page = await context.newPage();
    await signUpWithFamily(page, 'The Testers');
    await createBoard(page, 'Chores');
    await addCard(page, 'To do', 'Wash the car');
    const dialog = cardDialog(page);

    await openCard(page, 'Wash the car');
    // The "Remove the due date" button exists only while a date is set
    await expect(dialog.getByRole('button', { name: 'Remove the due date' })).toBeHidden();
    const body = await patchBody(page, async () => {
      await dialog.getByLabel('Due date').fill('2030-11-30');
      await dialog.getByRole('button', { name: 'Save' }).click();
    });
    expect(body).toEqual({ dueDate: '2030-11-30' });
    await expect(dialog).toBeHidden();
    await expect(tile(page, 'Wash the car')).toContainText('Due Sat, 30 Nov 2030');

    await openCard(page, 'Wash the car');
    await expect(dialog.getByLabel('Due date')).toHaveValue('2030-11-30');
    await dialog.getByRole('button', { name: 'Remove the due date' }).click();
    await expect(dialog.getByLabel('Due date')).toHaveValue('');
    // The button stays while the card has a saved date: it also clears a half-typed one (C20)
    const clearBody = await patchBody(page, async () => {
      await dialog.getByRole('button', { name: 'Save' }).click();
    });
    expect(clearBody).toEqual({ dueDate: null });
    await expect(dialog).toBeHidden();
    await expect(tile(page, 'Wash the car')).toHaveText('Wash the car');
  } finally {
    await context.close();
  }
});

test('C6. Escape, a click on the backdrop and Cancel close the dialog without saving', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  const patches = trackCardPatches(page);
  const dialog = cardDialog(page);

  // Escape: the typed title is thrown away
  await openCard(page, 'Wash the car');
  await dialog.getByLabel('Title').fill('Something else');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the car')).toBeVisible();
  await expect(tile(page, 'Something else')).toBeHidden();

  // The next opening starts from the saved card, not from the abandoned text
  await openCard(page, 'Wash the car');
  await expect(dialog.getByLabel('Title')).toHaveValue('Wash the car');

  // The dimmed backdrop is the <dialog> element itself; (5, 5) is far from the centered
  // content, so the click lands on the backdrop
  await dialog.getByLabel('Description').fill('Half-typed note');
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();

  await openCard(page, 'Wash the car');
  await expect(dialog.getByLabel('Description')).toHaveValue('');
  await dialog.getByLabel('Title').fill('Another change');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the car')).toBeVisible();

  expect(patches).toEqual([]);
});

test('C7. deleting a card asks first; accepting removes it and closes the dialog', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await addCard(page, 'To do', 'Mow the lawn');
  await expect(columnHeading(page, 'To do', 2)).toBeVisible();
  const dialog = cardDialog(page);

  // Dismissing the confirm keeps the card and the dialog
  await openCard(page, 'Wash the car');
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await dialog.getByRole('button', { name: 'Delete card' }).click();
  await expect.poll(() => message).toBe('Delete the card "Wash the car"?');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(columnHeading(page, 'To do', 2)).toBeVisible();

  // Accepting deletes it
  await openCard(page, 'Wash the car');
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Delete card' }).click();
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the car')).toBeHidden();
  await expect(tile(page, 'Mow the lawn')).toBeVisible();
  await expect(columnHeading(page, 'To do', 1)).toBeVisible();
});

test('C8. a failed Save shows an alert in the dialog and keeps what was typed', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  const dialog = cardDialog(page);

  // Only the PATCH: the board is reloaded with GET /api/boards/<id>, which does not match
  await page.route('**/api/cards/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, json: { message: 'Simulated server failure' } })
      : route.continue(),
  );

  await openCard(page, 'Wash the car');
  await dialog.getByLabel('Title').fill('Wash the red car');
  await dialog.getByLabel('Description').fill('Use the soft sponge');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Simulated server failure');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Title')).toHaveValue('Wash the red car');
  await expect(dialog.getByLabel('Description')).toHaveValue('Use the soft sponge');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeEnabled();

  // Once the server works again, the same dialog can be saved
  await page.unroute('**/api/cards/*');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the red car')).toBeVisible();
});

test('C9. search and assignee filters narrow the cards, with counts and "Clear filters"', async ({
  page,
}) => {
  const { user } = await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Buy milk');
  await addCard(page, 'To do', 'Milk the cow');
  await addCard(page, 'To do', 'Feed the cat');
  await addCard(page, 'In progress', 'Walk the dog');
  // "Buy milk" is mine; "Feed the cat" matches "milk" only by its description
  await editCard(page, 'Buy milk', { assignee: user.name });
  await editCard(page, 'Feed the cat', { description: 'Use the leftover milk' });

  const bar = filterBar(page);
  const search = bar.getByLabel('Search cards');
  const assignee = bar.getByLabel('Assignee');
  const status = bar.getByRole('status');
  const todo = page.getByRole('region', { name: 'To do' });
  const progress = page.getByRole('region', { name: 'In progress' });

  // No filter: no status line, plain counts
  await expect(status).toBeHidden();
  await expect(bar.getByRole('button', { name: 'Clear filters' })).toBeHidden();
  await expect(columnHeading(page, 'To do', 3)).toBeVisible();

  // Case does not matter; titles and descriptions are both searched
  await search.fill('MILK');
  await expect(todo.getByRole('listitem')).toHaveCount(3);
  await expect(status).toHaveText('Showing 3 of 4 cards');
  await expect(columnHeading(page, 'To do', '3 of 3')).toBeVisible();
  // A column that has cards but none matching says so
  await expect(columnHeading(page, 'In progress', '0 of 1')).toBeVisible();
  await expect(progress.getByText('No matching cards')).toBeVisible();
  await expect(progress.getByRole('listitem')).toHaveCount(0);

  await search.fill('cow');
  await expect(todo.getByRole('listitem')).toHaveCount(1);
  await expect(tile(page, 'Milk the cow')).toBeVisible();
  await expect(status).toHaveText('Showing 1 of 4 cards');
  await expect(columnHeading(page, 'To do', '1 of 3')).toBeVisible();

  // Only the description contains this word
  await search.fill('leftover');
  await expect(todo.getByRole('listitem')).toHaveCount(1);
  await expect(tile(page, 'Feed the cat')).toBeVisible();

  // Clear filters restores everything, including the search box
  await bar.getByRole('button', { name: 'Clear filters' }).click();
  await expect(search).toHaveValue('');
  await expect(assignee).toHaveValue('all');
  await expect(status).toBeHidden();
  await expect(columnHeading(page, 'To do', 3)).toBeVisible();
  await expect(columnHeading(page, 'In progress', 1)).toBeVisible();
  await expect(progress.getByText('No matching cards')).toBeHidden();
  await expect(page.locator('button.card-tile')).toHaveCount(4);

  // Assignee: me
  await assignee.selectOption({ label: 'Me' });
  await expect(todo.getByRole('listitem')).toHaveCount(1);
  await expect(tile(page, 'Buy milk')).toBeVisible();
  await expect(status).toHaveText('Showing 1 of 4 cards');
  await expect(progress.getByText('No matching cards')).toBeVisible();

  // Assignee: nobody
  await assignee.selectOption({ label: 'Nobody' });
  await expect(todo.getByRole('listitem')).toHaveCount(2);
  await expect(tile(page, 'Buy milk')).toBeHidden();
  await expect(tile(page, 'Walk the dog')).toBeVisible();
  await expect(status).toHaveText('Showing 3 of 4 cards');

  // Both filters together
  await search.fill('milk');
  await expect(todo.getByRole('listitem')).toHaveCount(2);
  await expect(progress.getByRole('listitem')).toHaveCount(0);
  await expect(status).toHaveText('Showing 2 of 4 cards');
});

test('C10. filters stay when the user leaves the board and comes back; another board starts clean', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Buy milk');
  await addCard(page, 'To do', 'Walk the dog');

  const bar = filterBar(page);
  await bar.getByLabel('Search cards').fill('milk');
  await bar.getByLabel('Assignee').selectOption({ label: 'Nobody' });
  await expect(bar.getByRole('status')).toHaveText('Showing 1 of 2 cards');

  // The board page unmounts, the Redux store stays
  await page.getByRole('link', { name: /^← / }).click();
  await expect(page.getByRole('link', { name: 'Chores', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Chores', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Chores', level: 1 })).toBeVisible();
  await expect(bar.getByLabel('Search cards')).toHaveValue('milk');
  await expect(bar.getByLabel('Assignee')).toHaveValue('nobody');
  await expect(bar.getByRole('status')).toHaveText('Showing 1 of 2 cards');
  await expect(tile(page, 'Walk the dog')).toBeHidden();

  // A different board does not inherit them
  await page.getByRole('link', { name: /^← / }).click();
  await createBoard(page, 'Garden');
  await expect(bar.getByLabel('Search cards')).toHaveValue('');
  await expect(bar.getByLabel('Assignee')).toHaveValue('all');
  await expect(bar.getByRole('status')).toBeHidden();
  await expect(columnHeading(page, 'To do', 0)).toBeVisible();
});

test('C11. after logout and login the board shows no filters', async ({ page }) => {
  const { user } = await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Buy milk');
  await addCard(page, 'To do', 'Walk the dog');

  const bar = filterBar(page);
  await bar.getByLabel('Search cards').fill('milk');
  await expect(bar.getByRole('status')).toHaveText('Showing 1 of 2 cards');

  // (An open dialog makes the page inert, so the top bar can't be clicked with it open;
  // this test covers the filters.)
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await logIn(page, user);
  await expect(page.getByRole('heading', { name: `Hi, ${user.name}` })).toBeVisible();

  // Navigate inside the app: a page load would empty Redux by itself and prove nothing
  await page.getByRole('link', { name: 'The Testers' }).click();
  await page.getByRole('link', { name: 'Chores', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chores', level: 1 })).toBeVisible();
  await expect(columnHeading(page, 'To do', 2)).toBeVisible();
  await expect(bar.getByLabel('Search cards')).toHaveValue('');
  await expect(bar.getByLabel('Assignee')).toHaveValue('all');
  await expect(bar.getByRole('status')).toBeHidden();
});

test('C12. a member who joined by invite can be assigned and filtered by name', async ({
  page,
  browser,
  baseURL,
}) => {
  const { user: parent } = await signUpWithFamily(page, 'The Testers');
  const link = await createInviteLink(page, 'child');

  const kid = newUser('Test Kid');
  const kidContext = await browser.newContext({ baseURL });
  try {
    const kidPage = await kidContext.newPage();
    await signUp(kidPage, kid);
    await kidPage.goto(link);
    await kidPage.getByRole('button', { name: 'Join family' }).click();
    await expect(kidPage.getByText('Your role: Child')).toBeVisible();

    // A reload empties the parent's cache, so the family is loaded again with both members
    await page.reload();
    await createBoard(page, 'Chores');
    await addCard(page, 'To do', 'Wash the car');
    await addCard(page, 'To do', 'Mow the lawn');

    await openCard(page, 'Wash the car');
    const dialog = cardDialog(page);
    const options = dialog.getByLabel('Assignee').locator('option');
    await expect(options.filter({ hasText: parent.name })).toHaveCount(1);
    await expect(options.filter({ hasText: kid.name })).toHaveCount(1);
    await dialog.getByLabel('Assignee').selectOption({ label: kid.name });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(tile(page, 'Wash the car')).toContainText(kid.name);
    await expect(tile(page, 'Mow the lawn')).toHaveText('Mow the lawn');

    // The filter lists the other member by name, and "Me" for the parent
    const assignee = filterBar(page).getByLabel('Assignee');
    await expect(assignee.locator('option').filter({ hasText: kid.name })).toHaveCount(1);
    await expect(assignee.locator('option').filter({ hasText: 'Me' })).toHaveCount(1);
    await assignee.selectOption({ label: kid.name });
    await expect(tile(page, 'Wash the car')).toBeVisible();
    await expect(tile(page, 'Mow the lawn')).toBeHidden();
  } finally {
    await kidContext.close();
  }
});

test('C13. a card deleted elsewhere keeps its dialog open with a notice and the typed text', async ({
  page,
  request,
}) => {
  const { user } = await signUpWithFamily(page, 'The Testers');
  const board = await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await addCard(page, 'To do', 'Mow the lawn');
  const dialog = cardDialog(page);

  await openCard(page, 'Wash the car');

  // Someone deletes the open card elsewhere (here: straight through the API)
  const { accessToken } = await apiLogin(request, user);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const cardId = await cardIdViaApi(request, accessToken, board.id, 'Wash the car');
  const del = await request.delete(`/api/cards/${cardId}`, { headers });
  expect(del.status()).toBe(204);

  // The dialog still shows the form (the board on screen is not reloaded yet). Saving gets a
  // 404, and the failed request reloads the board, which no longer has the card
  const answered = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && /\/api\/cards\//.test(r.url()),
  );
  await dialog.getByLabel('Title').fill('Wash the red car');
  await dialog.getByRole('button', { name: 'Save' }).click();
  expect((await answered).status()).toBe(404);

  // The reload removes the card from the board. The dialog stays, says what happened and keeps
  // the typed text (the user may want to copy it); saving and deleting are no longer possible
  await expect(dialog.getByText('This card was deleted by someone else.')).toBeVisible();
  // Only this notice: the API's 404 message would say the same thing twice
  await expect(dialog.getByRole('alert')).toHaveCount(1);
  await expect(dialog.getByLabel('Title')).toHaveValue('Wash the red car');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Delete card' })).toBeDisabled();

  // The user can still leave, and the board is fine
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the car')).toBeHidden();
  await expect(tile(page, 'Mow the lawn')).toBeVisible();
  await expect(columnHeading(page, 'To do', 1)).toBeVisible();
});

test('C14. saving one field does not undo what someone else changed in another field', async ({
  page,
  request,
}) => {
  // The board is reloaded in the background only once it is stale (30 s); the test moves the
  // page's clock instead of waiting
  await page.clock.install();
  const { user } = await signUpWithFamily(page, 'The Testers');
  const board = await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Trash');
  await openCard(page, 'Trash');
  const dialog = cardDialog(page);

  // Someone else renames the card while the dialog is open
  const { accessToken } = await apiLogin(request, user);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const cardId = await cardIdViaApi(request, accessToken, board.id, 'Trash');
  expect(
    (
      await request.patch(`/api/cards/${cardId}`, { headers, data: { title: 'Take out trash' } })
    ).ok(),
  ).toBe(true);

  // A background reload brings the new title into the board behind the dialog. Coming back to
  // the tab ("visibilitychange") refetches stale queries
  await page.clock.fastForward(31_000);
  const reloaded = page.waitForResponse(
    (r) => r.request().method() === 'GET' && r.url().endsWith(`/api/boards/${board.id}`),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await reloaded;
  await expect(tile(page, 'Take out trash')).toBeAttached();
  // The form keeps what it started with
  await expect(dialog.getByLabel('Title')).toHaveValue('Trash');

  // Only the due date is changed, so only the due date is sent: the old title in the form
  // must not travel along and undo the rename
  await dialog.getByLabel('Due date').fill('2030-11-30');
  const body = await patchBody(page, () => dialog.getByRole('button', { name: 'Save' }).click());
  expect(body).toEqual({ dueDate: '2030-11-30' });
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Take out trash')).toBeVisible();
});

test('C15. the dialog stays open while saving, and a failed save shows its error', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await openCard(page, 'Wash the car');
  const dialog = cardDialog(page);

  // Hold the PATCH, to act while it is running; then let it fail
  const release = await holdRequests(page, '**/api/cards/*', 'PATCH', 'fail');

  await dialog.getByLabel('Title').fill('Wash the red car');
  const sent = page.waitForRequest((r) => r.method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await sent;

  // Cancel is disabled and Esc does nothing while the request runs. A second Esc may still
  // close a modal dialog in Chromium (it never lets a dialog trap the user)…
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');

  // …but the error is never lost: when the save fails, the dialog is open with the message
  // and the typed title
  release();
  await expect(dialog.getByRole('alert')).toHaveText('Simulated server failure');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Title')).toHaveValue('Wash the red car');
  await expect(tile(page, 'Wash the car')).toBeAttached();
});

test('C16. selecting text with a drag that ends outside the dialog does not close it', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await openCard(page, 'Wash the car');
  const dialog = cardDialog(page);
  const description = dialog.getByLabel('Description');
  await description.fill('Inside and outside');

  // Press in the description, release on the backdrop (the top-left corner of the page)
  const box = (await description.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 5 });
  await page.mouse.up();

  await expect(dialog).toBeVisible();
  await expect(description).toHaveValue('Inside and outside');

  // The other way round: press on the backdrop, release in the description
  await page.mouse.move(5, 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 10, { steps: 5 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await expect(description).toHaveValue('Inside and outside');

  // A real click on the backdrop still closes it
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});

test('C17. focus goes back to the card tile when the dialog closes', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  const tileButton = tile(page, 'Wash the car').getByRole('button');
  const dialog = cardDialog(page);

  await openCard(page, 'Wash the car');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(tileButton).toBeFocused();

  await openCard(page, 'Wash the car');
  await dialog.getByLabel('Title').fill('Wash the red car');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the red car').getByRole('button')).toBeFocused();
});

test('C18. coming back to a board does not open the card that was open on leaving', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await filterBar(page).getByLabel('Search cards').fill('wash');
  await openCard(page, 'Wash the car');

  // The modal makes the page inert, but the browser's Back button still works
  await page.goBack();
  await expect(page).toHaveURL(/\/families\//);
  await page.getByRole('link', { name: 'Chores', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Chores', level: 1 })).toBeVisible();
  await expect(cardDialog(page)).toBeHidden();
  // The filters, unlike the open card, are kept
  await expect(filterBar(page).getByLabel('Search cards')).toHaveValue('wash');
});

test('C19. another card does not open while the open one is still saving', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await addCard(page, 'To do', 'Mow the lawn');
  await openCard(page, 'Wash the car');
  const dialog = cardDialog(page);

  const release = await holdRequests(page, '**/api/cards/*', 'PATCH', 'fail');

  await dialog.getByLabel('Title').fill('Wash the red car');
  const sent = page.waitForRequest((r) => r.method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await sent;

  // Esc twice: Chromium may close the modal dialog on the second one. Then a click on another
  // card would unmount this dialog and lose the save's result. dispatchEvent clicks the tile
  // even while the modal makes the page inert, so the test works either way
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await tile(page, 'Mow the lawn').getByRole('button').dispatchEvent('click');

  release();
  await expect(dialog.getByRole('alert')).toHaveText('Simulated server failure');
  await expect(dialog.getByLabel('Title')).toHaveValue('Wash the red car');
});

test('C20. a half-typed due date is an error, not a removed due date', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  const dialog = cardDialog(page);

  await openCard(page, 'Wash the car');
  await dialog.getByLabel('Due date').fill('2030-11-30');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the car')).toContainText('Due Sat, 30 Nov 2030');

  // Clear one part of the date (focus lands on its first part): the field's value becomes ''
  // just like an empty field, but the date is only half there
  await openCard(page, 'Wash the car');
  const patches = trackCardPatches(page);
  const due = dialog.getByLabel('Due date');
  await due.focus();
  await page.keyboard.press('Backspace');
  await expect(due).toHaveValue('');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Enter a full date, or remove the due date')).toBeVisible();
  expect(patches).toEqual([]);

  // Removing it on purpose works
  const body = await patchBody(page, async () => {
    await dialog.getByRole('button', { name: 'Remove the due date' }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
  });
  expect(body).toEqual({ dueDate: null });
  await expect(dialog).toBeHidden();
  await expect(tile(page, 'Wash the car')).not.toContainText('Due');
});

test('C21. when the tile is gone after the dialog, focus goes to its column', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await addCard(page, 'To do', 'Mow the lawn');
  const dialog = cardDialog(page);
  const todo = page.getByRole('region', { name: 'To do' });

  // A save that makes the card fail the filter: its tile disappears
  await filterBar(page).getByLabel('Search cards').fill('wash');
  await openCard(page, 'Wash the car');
  await dialog.getByLabel('Title').fill('Buy bread');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(todo).toBeFocused();

  // A deleted card
  await filterBar(page).getByLabel('Search cards').fill('');
  await openCard(page, 'Mow the lawn');
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Delete card' }).click();
  await expect(dialog).toBeHidden();
  await expect(todo).toBeFocused();
});

test('C22. every board keeps its own filters', async ({ page }) => {
  const { familyPath } = await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await filterBar(page).getByLabel('Search cards').fill('wash');

  // In-app navigation keeps the Redux store (a page load would start a new one)
  await page.getByRole('link', { name: /^← / }).click();
  await expect(page).toHaveURL(familyPath);
  await createBoard(page, 'Shopping');
  await expect(filterBar(page).getByLabel('Search cards')).toHaveValue('');
  await filterBar(page).getByLabel('Search cards').fill('milk');

  await page.getByRole('link', { name: /^← / }).click();
  await page.getByRole('link', { name: 'Chores', exact: true }).click();
  await expect(filterBar(page).getByLabel('Search cards')).toHaveValue('wash');
  await page.getByRole('link', { name: /^← / }).click();
  await page.getByRole('link', { name: 'Shopping', exact: true }).click();
  await expect(filterBar(page).getByLabel('Search cards')).toHaveValue('milk');
});

test('C23. a half-typed date on a card without one: the error is read out and can be fixed', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await openCard(page, 'Wash the car');
  const dialog = cardDialog(page);
  const patches = trackCardPatches(page);

  // Type only the first part of the date: the field's value stays ''
  const due = dialog.getByLabel('Due date');
  await due.focus();
  await page.keyboard.type('11');
  await expect(due).toHaveValue('');
  await dialog.getByRole('button', { name: 'Save' }).click();

  // The error is linked to the field (aria-describedby), so a screen reader reads it out, and
  // the button the message points to is there, although the card never had a due date
  await expect(due).toHaveAccessibleDescription('Enter a full date, or remove the due date');
  await dialog.getByRole('button', { name: 'Remove the due date' }).click();
  await expect(due).toHaveAccessibleDescription('');
  // The button went away (no date, no error) and took focus with it: the date field has it
  await expect(dialog.getByRole('button', { name: 'Remove the due date' })).toBeHidden();
  await expect(due).toBeFocused();

  // Nothing changed after all: Save sends nothing and closes
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  expect(patches).toEqual([]);
});

test('C24. a delete whose answer is lost does not blame "someone else"', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await openCard(page, 'Wash the car');
  const dialog = cardDialog(page);

  // The server deletes the card, but the answer is lost on the way (a proxy answers 502)
  await page.route('**/api/cards/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    await route.fetch();
    await route.fulfill({ status: 502, json: { message: 'Bad gateway' } });
  });
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Delete card' }).click();

  // The reload after the error finds the card gone. That was this user's own delete: the dialog
  // says the card is deleted, without blaming "someone else", and nothing more can be done to
  // a card that no longer exists
  await expect(tile(page, 'Wash the car')).toBeHidden();
  await expect(dialog.getByRole('alert')).toHaveText('This card has been deleted.');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Delete card' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('C25. the filter status is a live region that is there before any filter', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await addCard(page, 'To do', 'Mow the lawn');

  // Screen readers announce changes of a live region's text, but usually not a region that
  // appears together with its text. So it must be on the page, empty, before filtering
  const status = filterBar(page).getByRole('status');
  await expect(status).toBeAttached();
  await expect(status).toHaveText('');

  await filterBar(page).getByLabel('Search cards').fill('wash');
  await expect(status).toHaveText('Showing 1 of 2 cards');
  await filterBar(page).getByRole('button', { name: 'Clear filters' }).click();
  await expect(status).toHaveText('');
  // The button is gone with the filters; focus went to the search field, not to <body>
  await expect(filterBar(page).getByLabel('Search cards')).toBeFocused();
});

test('C27. after a delete that really failed, a later delete elsewhere blames "someone else"', async ({
  page,
  request,
}) => {
  // A background reload of the board is needed while the dialog is open: it comes when the
  // data is stale (30 s, moved with the page clock) and the tab becomes visible again
  await page.clock.install();
  const { user } = await signUpWithFamily(page, 'The Testers');
  const board = await createBoard(page, 'Chores');
  await addCard(page, 'To do', 'Wash the car');
  await openCard(page, 'Wash the car');
  const dialog = cardDialog(page);

  // The delete fails for real: the card stays
  await page.route('**/api/cards/*', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 500, json: { message: 'Simulated server failure' } })
      : route.continue(),
  );
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Delete card' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Simulated server failure');
  // The reload after the error still finds the card
  await expect(tile(page, 'Wash the car')).toBeAttached();

  // Now someone else deletes it, and a background reload brings that in
  const { accessToken } = await apiLogin(request, user);
  const cardId = await cardIdViaApi(request, accessToken, board.id, 'Wash the car');
  const del = await request.delete(`/api/cards/${cardId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(del.status()).toBe(204);
  await page.clock.fastForward(31_000);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));

  await expect(dialog.getByRole('alert')).toHaveText(
    "This card was deleted by someone else. Your changes can't be saved.",
  );
});

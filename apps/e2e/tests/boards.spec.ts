import { expect, test } from '@playwright/test';
import {
  addCardViaApi,
  apiLogin,
  columnHeading,
  createBoard,
  newUser,
  signUp,
  holdRequests,
  signUpWithFamily,
  UUID,
} from './helpers';

// Boards, columns and cards (stage 2, step 4, part 1). Scenario numbers start with B.

test('B1. creating a board opens it with three empty columns and lists it on the family page', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');

  const board = await createBoard(page, 'Chores');

  expect(board.columns.map((c) => c.name)).toEqual(['To do', 'In progress', 'Done']);
  await expect(page).toHaveURL(`/boards/${board.id}`);
  for (const name of ['To do', 'In progress', 'Done']) {
    await expect(columnHeading(page, name, 0)).toBeVisible();
  }

  await page.getByRole('link', { name: /^← / }).click();
  await expect(page.getByRole('link', { name: 'Chores', exact: true })).toHaveAttribute(
    'href',
    `/boards/${board.id}`,
  );
});

test('B2. an empty or blank board name shows "Enter a board name" and sends no request', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/boards$/.test(r.url())) posts += 1;
  });

  const create = page.getByRole('button', { name: 'Create board' });
  await create.click();
  await expect(page.getByText('Enter a board name')).toBeVisible();

  await page.getByLabel('New board').fill('   ');
  await create.click();
  await expect(page.getByText('Enter a board name')).toBeVisible();

  // The checks run in the browser, so a request would already be counted by now
  expect(posts).toBe(0);
  await expect(page).toHaveURL(/\/families\//);
});

test('B3. cards are added to the end of a column, the form stays open; Escape and Cancel close it', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  const todo = page.getByRole('region', { name: 'To do' });

  await todo.getByRole('button', { name: '+ Add a card' }).click();
  const title = todo.getByLabel('Card title');
  await title.fill('First');
  await todo.getByRole('button', { name: 'Add card' }).click();
  await expect(columnHeading(page, 'To do', 1)).toBeVisible();

  // The form is still open and empty, ready for the next card
  await expect(title).toBeVisible();
  await expect(title).toHaveValue('');
  await title.fill('Second');
  await todo.getByRole('button', { name: 'Add card' }).click();
  await expect(columnHeading(page, 'To do', 2)).toBeVisible();

  await expect(todo.getByRole('listitem')).toHaveText(['First', 'Second']);
  // The other columns are untouched
  await expect(columnHeading(page, 'In progress', 0)).toBeVisible();

  await title.press('Escape');
  await expect(title).toBeHidden();
  await expect(todo.getByRole('button', { name: '+ Add a card' })).toBeVisible();

  await todo.getByRole('button', { name: '+ Add a card' }).click();
  await todo.getByRole('button', { name: 'Cancel' }).click();
  await expect(todo.getByLabel('Card title')).toBeHidden();

  // A blank title is rejected by the shared schema, before any request
  await todo.getByRole('button', { name: '+ Add a card' }).click();
  await todo.getByLabel('Card title').fill('   ');
  await todo.getByRole('button', { name: 'Add card' }).click();
  await expect(todo.getByText('Enter a title')).toBeVisible();
  await expect(columnHeading(page, 'To do', 2)).toBeVisible();
});

test('B4. renaming the board changes the heading and the list; Cancel and Escape send nothing', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  const patches: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH') patches.push(r.url());
  });

  await page.getByRole('button', { name: 'Rename board' }).click();
  await page.getByLabel('Board name').fill('Something else');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Chores', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Rename board' }).click();
  const field = page.getByLabel('Board name');
  // The form starts from the current name, not from the abandoned text
  await expect(field).toHaveValue('Chores');
  await field.fill('Something else');
  await field.press('Escape');
  await expect(field).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Chores', level: 1 })).toBeVisible();
  expect(patches).toEqual([]);

  await page.getByRole('button', { name: 'Rename board' }).click();
  await page.getByLabel('Board name').fill('Weekend jobs');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Weekend jobs', level: 1 })).toBeVisible();
  expect(patches).toHaveLength(1);

  await page.getByRole('link', { name: /^← / }).click();
  await expect(page.getByRole('link', { name: 'Weekend jobs', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chores', exact: true })).toBeHidden();
});

test('B5. renaming a column works; an empty name shows "Enter a column name"', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');

  await page.getByRole('button', { name: 'Rename column To do' }).click();
  const field = page.getByLabel('Column name');
  await field.fill('');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Enter a column name')).toBeVisible();
  // Still editing, the column keeps its name
  await expect(field).toBeVisible();

  await field.fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Enter a column name')).toBeVisible();

  await field.fill('Backlog');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(columnHeading(page, 'Backlog', 0)).toBeVisible();
  await expect(page.getByRole('region', { name: 'To do' })).toBeHidden();
});

test('B6. a new column is added after the last one', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');

  await page.getByLabel('New column').fill('Later');
  await page.getByRole('button', { name: 'Add column' }).click();

  await expect(page.getByRole('region', { name: 'Later' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'To do 0',
    'In progress 0',
    'Done 0',
    'Later 0',
  ]);
  // The form is cleared for the next column
  await expect(page.getByLabel('New column')).toHaveValue('');

  // An empty name is rejected before any request
  await page.getByRole('button', { name: 'Add column' }).click();
  await expect(page.getByText('Enter a column name')).toBeVisible();
});

test('B7. an empty column can be deleted; a column with a card cannot', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');

  await page.getByRole('button', { name: 'Delete column Done' }).click();
  await expect(page.getByRole('region', { name: 'Done' })).toBeHidden();

  const todo = page.getByRole('region', { name: 'To do' });
  await todo.getByRole('button', { name: '+ Add a card' }).click();
  await todo.getByLabel('Card title').fill('Wash the car');
  await todo.getByRole('button', { name: 'Add card' }).click();
  await expect(columnHeading(page, 'To do', 1)).toBeVisible();

  await page.getByRole('button', { name: 'Delete column To do' }).click();
  await expect(todo.getByRole('alert')).toHaveText('Move or delete the cards first');
  // The column and its card are still there
  await expect(todo.getByRole('listitem')).toHaveText(['Wash the car']);
  await expect(columnHeading(page, 'To do', 1)).toBeVisible();
});

test('B8. deleting a board asks first; after it, going back shows "Board not found."', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  const board = await createBoard(page, 'Chores');
  const todo = page.getByRole('region', { name: 'To do' });
  await todo.getByRole('button', { name: '+ Add a card' }).click();
  await todo.getByLabel('Card title').fill('Wash the car');
  await todo.getByRole('button', { name: 'Add card' }).click();
  await expect(columnHeading(page, 'To do', 1)).toBeVisible();

  // Dismissing the confirm keeps everything
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await page.getByRole('button', { name: 'Delete board' }).click();
  await expect.poll(() => message).toBe('Delete the board "Chores" with its 1 card?');
  await expect(page).toHaveURL(`/boards/${board.id}`);
  await expect(page.getByRole('heading', { name: 'Chores', level: 1 })).toBeVisible();

  // Accepting deletes it and leads to the family page
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete board' }).click();
  await expect(page).toHaveURL(new RegExp(`/families/${UUID}$`));
  await expect(page.getByText('No boards yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chores', exact: true })).toBeHidden();

  // The deleted board must not come back from the query cache
  await page.goBack();
  await expect(page).toHaveURL(`/boards/${board.id}`);
  await expect(page.getByText('Board not found.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chores' })).toBeHidden();
});

test('B9. someone else\'s board and an invalid id show "Board not found."', async ({
  page,
  browser,
  baseURL,
}) => {
  await signUpWithFamily(page, 'The Testers');
  const board = await createBoard(page, 'Private plans');
  const boardPath = new URL(page.url()).pathname;
  expect(boardPath).toBe(`/boards/${board.id}`);

  // A second user in a separate browser context: its own cookies, so its own session
  const other = await browser.newContext({ baseURL });
  try {
    const otherPage = await other.newPage();
    await signUp(otherPage, newUser('Other User'));

    await otherPage.goto(boardPath);
    await expect(otherPage.getByText('Board not found.')).toBeVisible();
    await expect(otherPage.getByText('Private plans')).toBeHidden();
    await expect(otherPage.getByRole('button', { name: 'Try again' })).toBeHidden();

    await otherPage.goto('/boards/not-a-uuid');
    await expect(otherPage.getByText('Board not found.')).toBeVisible();
    await expect(otherPage.getByRole('link', { name: '← Home' })).toBeVisible();
  } finally {
    await other.close();
  }
});

test('B10. a due date is shown as written in any time zone; a past one is "Overdue"', async ({
  browser,
  baseURL,
  request,
}) => {
  // New York is behind UTC: new Date('2030-11-30') would be 29 November there
  const context = await browser.newContext({ baseURL, timezoneId: 'America/New_York' });
  try {
    const page = await context.newPage();
    const { user } = await signUpWithFamily(page, 'The Testers');
    const board = await createBoard(page, 'Chores');
    const { accessToken } = await apiLogin(request, user);
    const todoId = board.columns[0].id;
    await addCardViaApi(request, accessToken, todoId, { title: 'Future', dueDate: '2030-11-30' });
    await addCardViaApi(request, accessToken, todoId, { title: 'Past', dueDate: '2020-01-15' });

    await page.reload();

    const todo = page.getByRole('region', { name: 'To do' });
    // Another year than the current one: the year is shown, with a comma after the weekday
    const future = todo.getByRole('listitem').filter({ hasText: 'Future' });
    await expect(future).toContainText('Due Sat, 30 Nov 2030');
    await expect(future.locator('time')).toHaveAttribute('datetime', '2030-11-30');

    const past = todo.getByRole('listitem').filter({ hasText: 'Past' });
    await expect(past).toContainText('Overdue: Wed, 15 Jan 2020');
    await expect(future).not.toContainText('Overdue');
  } finally {
    await context.close();
  }
});

test('B11. a card shows the name of its assignee', async ({ page, request }) => {
  const { user } = await signUpWithFamily(page, 'The Testers');
  const board = await createBoard(page, 'Chores');
  const { accessToken, userId } = await apiLogin(request, user);
  await addCardViaApi(request, accessToken, board.columns[0].id, {
    title: 'Take out the trash',
    assigneeId: userId,
  });
  await addCardViaApi(request, accessToken, board.columns[0].id, { title: 'Nobody does this' });

  await page.reload();

  const todo = page.getByRole('region', { name: 'To do' });
  await expect(todo.getByRole('listitem').filter({ hasText: 'Take out the trash' })).toContainText(
    user.name,
  );
  await expect(todo.getByRole('listitem').filter({ hasText: 'Nobody does this' })).toHaveText(
    'Nobody does this',
  );
});

test('B12. a failed "Add column" shows an alert in the form and keeps the board', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');

  // Only the POST: the board is loaded with GET /api/boards/<id>, which is not matched
  await page.route('**/api/boards/*/columns', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, json: { message: 'Simulated server failure' } })
      : route.continue(),
  );

  await page.getByLabel('New column').fill('Later');
  await page.getByRole('button', { name: 'Add column' }).click();

  await expect(page.getByRole('alert')).toHaveText('Simulated server failure');
  // What the user typed is kept for another try, and the board still renders
  await expect(page.getByLabel('New column')).toHaveValue('Later');
  await expect(page.getByRole('region', { name: 'Later' })).toBeHidden();
  for (const name of ['To do', 'In progress', 'Done']) {
    await expect(columnHeading(page, name, 0)).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Chores', level: 1 })).toBeVisible();
});

test('B13. a new card clears the form only once it is on the board', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  const board = await createBoard(page, 'Chores');
  const todo = page.getByRole('region', { name: 'To do' });

  // Hold the board reload that follows the new card, to see what the form does meanwhile
  const release = await holdRequests(page, `**/api/boards/${board.id}`, 'GET', 'continue');

  await todo.getByRole('button', { name: '+ Add a card' }).click();
  const title = todo.getByLabel('Card title');
  await title.fill('Wash the car');
  const reload = page.waitForRequest(
    (r) => r.method() === 'GET' && r.url().endsWith(`/api/boards/${board.id}`),
  );
  await todo.getByRole('button', { name: 'Add card' }).click();
  await reload;

  // The card is saved, but the board is not reloaded yet: the form still waits and keeps the
  // title, so the user can't think it failed and add the same card again
  await expect(todo.getByRole('button', { name: 'Adding…' })).toBeDisabled();
  await expect(title).toHaveValue('Wash the car');
  await expect(todo.getByRole('listitem')).toHaveCount(0);

  release();
  await expect(todo.getByRole('listitem')).toHaveText(['Wash the car']);
  await expect(title).toHaveValue('');
  await expect(todo.getByRole('button', { name: 'Add card' })).toBeEnabled();
});

test('B14. a closed "Add a card" form opens again empty, without the old error', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  const todo = page.getByRole('region', { name: 'To do' });

  await todo.getByRole('button', { name: '+ Add a card' }).click();
  await todo.getByRole('button', { name: 'Add card' }).click();
  await expect(todo.getByText('Enter a title')).toBeVisible();
  await todo.getByLabel('Card title').fill('Half-typed');
  await todo.getByLabel('Card title').press('Escape');

  await todo.getByRole('button', { name: '+ Add a card' }).click();
  await expect(todo.getByLabel('Card title')).toHaveValue('');
  await expect(todo.getByText('Enter a title')).toBeHidden();
});

test('B15. deleting a board that is already gone leaves it like a successful delete', async ({
  page,
  request,
}) => {
  const { user } = await signUpWithFamily(page, 'The Testers');
  const board = await createBoard(page, 'Chores');

  // Someone deletes the board elsewhere (here: straight through the API) while it is on screen
  const { accessToken } = await apiLogin(request, user);
  const res = await request.delete(`/api/boards/${board.id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(res.status()).toBe(204);

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete board' }).click();

  // The 404 means "already deleted": no error, the user lands on the family page
  await expect(page).toHaveURL(new RegExp(`/families/${UUID}$`));
  await expect(page.getByText('No boards yet.')).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
});

test('B16. a card with an assignee says "Assigned" when the family members fail to load', async ({
  page,
  request,
}) => {
  const { user, familyPath } = await signUpWithFamily(page, 'The Testers');
  const board = await createBoard(page, 'Chores');
  const { accessToken, userId } = await apiLogin(request, user);
  await addCardViaApi(request, accessToken, board.columns[0].id, {
    title: 'Take out the trash',
    assigneeId: userId,
  });

  // A reload empties the cache, so the board screen has to load the family itself, and fails
  await page.route(`**/api${familyPath}`, (route) =>
    route.fulfill({ status: 500, json: { message: 'Simulated server failure' } }),
  );
  await page.reload();

  const card = page.getByRole('listitem').filter({ hasText: 'Take out the trash' });
  await expect(card).toContainText('Assigned');
  await expect(card).not.toContainText(user.name);
});

test('B17. "Add a card" cannot be closed while adding, so a failure is shown', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  const todo = page.getByRole('region', { name: 'To do' });

  const release = await holdRequests(page, '**/api/columns/*/cards', 'POST', 'fail');

  await todo.getByRole('button', { name: '+ Add a card' }).click();
  const title = todo.getByLabel('Card title');
  await title.fill('Wash the car');
  await todo.getByRole('button', { name: 'Add card' }).click();

  // While the request runs, Cancel is disabled and Escape does nothing
  await expect(todo.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await title.press('Escape');
  await expect(title).toBeVisible();

  release();
  await expect(todo.getByRole('alert')).toHaveText('Simulated server failure');
  await expect(title).toHaveValue('Wash the car');

  // Closed afterwards, the form opens again clean
  await title.press('Escape');
  await todo.getByRole('button', { name: '+ Add a card' }).click();
  await expect(todo.getByRole('alert')).toBeHidden();
});

test('B18. a rename cannot be cancelled while saving, so a failure is shown', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');

  const release = await holdRequests(page, '**/api/columns/*', 'PATCH', 'fail');

  await page.getByRole('button', { name: 'Rename column To do' }).click();
  const field = page.getByLabel('Column name');
  await field.fill('Backlog');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await field.press('Escape');
  await expect(field).toBeVisible();

  release();
  await expect(page.getByRole('alert')).toHaveText('Simulated server failure');
  await expect(field).toHaveValue('Backlog');
  // Now it can be cancelled, and the column keeps its name
  await field.press('Escape');
  await expect(columnHeading(page, 'To do', 0)).toBeVisible();
});

test('B19. closing a rename or "Add a card" form gives focus back to its button', async ({
  page,
}) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');
  const todo = page.getByRole('region', { name: 'To do' });
  const rename = page.getByRole('button', { name: 'Rename column To do' });

  // Saved with Enter: the form goes, the Rename button of the renamed column gets focus
  await rename.click();
  await page.getByLabel('Column name').fill('Backlog');
  await page.getByLabel('Column name').press('Enter');
  await expect(columnHeading(page, 'Backlog', 0)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename column Backlog' })).toBeFocused();

  // Cancelled with Escape
  await page.getByRole('button', { name: 'Rename board' }).click();
  await page.getByLabel('Board name').press('Escape');
  await expect(page.getByRole('button', { name: 'Rename board' })).toBeFocused();

  // "Add a card" closed with Escape
  const backlog = page.getByRole('region', { name: 'Backlog' });
  await backlog.getByRole('button', { name: '+ Add a card' }).click();
  await backlog.getByLabel('Card title').press('Escape');
  await expect(backlog.getByRole('button', { name: '+ Add a card' })).toBeFocused();
  await expect(todo).toBeHidden();
});

test('B20. deleting a column gives focus to the "New column" field', async ({ page }) => {
  await signUpWithFamily(page, 'The Testers');
  await createBoard(page, 'Chores');

  // The Delete button goes away with its column; focus must not fall to <body>
  await page.getByRole('button', { name: 'Delete column Done' }).click();
  await expect(page.getByRole('region', { name: 'Done' })).toBeHidden();
  await expect(page.getByLabel('New column')).toBeFocused();
});

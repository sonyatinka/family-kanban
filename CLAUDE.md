# CLAUDE.md

This file guides Claude Code when working in this repository.

## Project

Family kanban is a learning project for family time management on kanban boards. It is built in stages. Stage 0 (foundation) is done: a monorepo with a NestJS API whose only endpoint is a health check for Postgres and Redis, and a React page that shows the result.

The full roadmap is in `plan.txt`. Stage 1 (users and family) is done, in small steps with explanations:

1. ✅ Drizzle ORM and migrations; `users` table; health check uses Drizzle.
2. ✅ Sign-up and login (`POST /api/auth/register`, `/api/auth/login`), passwords hashed with argon2id.
3. ✅ JWT access and refresh tokens, global auth guard, `GET /api/auth/me`.
4. ✅ Creating a family: `POST /api/families`, `GET /api/families`, `GET /api/families/:familyId`.
5. ✅ Invite links with a token and expiry (one-time, parents only, 1/7/30 days); a person can be in several families.
6. ✅ Frontend: login and sign-up pages, protected routes (part 1: API client with token refresh, TanStack Router, login, sign-up, logout; part 2: family screen with TanStack Query).

**Stage 2 (boards, columns and cards) is in progress:**

1. ✅ Tables `boards`, `board_columns`, `cards` (migration `0005`); boards API.
2. ✅ Columns and cards API, moving cards and columns (fractional indexing).
3. ✅ Swagger docs at `/api/docs`, built from the Zod schemas.
4. Frontend: boards list, board screen, card dialog; Redux Toolkit for the board's UI state.
5. Drag and drop (dnd-kit) with optimistic updates.

Decisions for stage 2: any family member may do everything (roles come in stage 3); a new board gets the columns "To do", "In progress", "Done"; a column with cards can't be deleted (409); a card's due date is a `date` without time; a card has one assignee or none, and the assignee must be a member of the board's family.

## Database (Drizzle)

- Schema: `apps/api/src/db/schema.ts` is the source of truth. Columns are snake_case in SQL and camelCase in TypeScript.
- `DbModule` (global) provides the Drizzle instance under the `DB` token: `@Inject(DB) private readonly db: Database`. It owns the `pg` Pool and closes it on shutdown.
- Migrations: change the schema → `pnpm db:generate --name <what>` → review the SQL in `apps/api/drizzle/` → `pnpm db:migrate`. Commit the generated migrations; never edit them by hand.
- `drizzle.config.ts` loads the root `.env` via `process.loadEnvFile`.
- Unique-constraint conflicts: insert and catch Postgres code `23505` (Drizzle wraps the `pg` error in `DrizzleQueryError`; the code is on `err.cause`). Don't check-then-insert. Don't log a `DrizzleQueryError` message as is: it contains query params, such as password hashes.
- `drizzle-kit migrate` hides connection errors (it just exits 1 mid-spinner). Test the connection with `pg` directly to see the real error. On this Windows machine Docker Desktop port forwarding has gotten stuck before; `docker compose restart` fixed it.

**Language:** code comments, API messages, UI text, the README, `requests.http` and the skills are in **English**. Exceptions are `docs/` (theory pages and the quiz, in Russian, for the user's learning; local only, `docs/` is gitignored and must not be committed) and the Russian trigger phrases in skill descriptions. Talk to the user in Russian.

## Monorepo layout (pnpm workspaces)

```
apps/api         @family/api     NestJS 11, CommonJS, Express platform
apps/web         @family/web     React 19 + Vite 7, ESM
apps/e2e         @family/e2e     Playwright end-to-end tests for the web app
packages/shared  @family/shared  Shared types and Zod schemas (API contract)
docker-compose.yml               Postgres 17 + Redis 7, with healthchecks and named volumes
```

- Apps depend on shared through `"@family/shared": "workspace:*"`.
- `@family/shared` is consumed **from its compiled output** (`main: dist/index.js`, `types: dist/index.d.ts`). It must be built before the apps can type-check or run.
- `pnpm-workspace.yaml` sets `allowBuilds: { esbuild: true }`, because pnpm 11+ blocks dependency install scripts by default. Add entries there if a new dependency needs a postinstall step. Its `overrides` pin transitive versions that were too new when installed (`immer`, for `@reduxjs/toolkit`); drop a pin once a newer version is two weeks old.

## Commands

Run these from the repo root. You need Node 20 or newer, pnpm and Docker.

**Use pnpm 11, not 12, on this machine.** Windows Smart App Control is enforced here. pnpm 12 ships an unsigned native `pnpm.exe`, which SAC blocks ("An Application Control policy has blocked this file"). pnpm 11 is JavaScript run by the signed `node.exe`, so it works. The unsigned native parts of the project (esbuild, rollup, argon2) currently pass thanks to their cloud reputation. If something new gets blocked, check the `Microsoft-Windows-CodeIntegrity/Operational` event log (events 3033 and 3077).

```bash
cp .env.example .env   # first time only
pnpm install
pnpm db:up             # start Postgres and Redis (docker compose up -d)
pnpm dev               # build shared once, then run api and web dev servers in parallel
```

| Command                              | Purpose                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                           | `pnpm --filter @family/shared build`, then `dev` in every `apps/*`                                                        |
| `pnpm build`                         | `pnpm -r build`: shared runs `tsc`, api runs `nest build`, web runs `tsc --noEmit && vite build`, e2e runs `tsc --noEmit` |
| `pnpm lint`                          | ESLint on the whole repo (flat config: js recommended, typescript-eslint recommended, prettier)                           |
| `pnpm format`                        | Prettier `--write .`                                                                                                      |
| `pnpm test:e2e`                      | Build shared, then run the Playwright browser tests in `apps/e2e` (see below)                                             |
| `pnpm db:up` / `db:down` / `db:logs` | Manage the Docker Compose services                                                                                        |
| `pnpm db:generate` / `db:migrate`    | Generate a SQL migration from the schema / apply pending migrations                                                       |
| `pnpm db:studio`                     | Drizzle Studio (browse data)                                                                                              |
| `pnpm --filter @family/api <script>` | Run one package's script (`dev`, `build`, `start`)                                                                        |

There are **no unit tests** yet. Use `pnpm build` (which type-checks every package) and `pnpm lint` to verify changes. The project skill `verify-step` has the full checklist, including a live API run on port 3001.

### End-to-end tests (Playwright)

`pnpm test:e2e` runs the browser tests in `apps/e2e` (`@family/e2e`; specs in `tests/*.spec.ts`, shared steps in `tests/helpers.ts`). They automate the browser checklist; each test title starts with its scenario number.

- Docker must be up (`pnpm db:up`). Playwright starts its own API on port `3001` and Vite on `5174` (`webServer` in `apps/e2e/playwright.config.ts`) and stops them afterwards, so a running `pnpm dev` is not affected. The run fails if 3001 or 5174 is taken (for example by a `verify-step` API run).
- The browser is the installed Microsoft Edge (`channel: 'msedge'`). Do not run `playwright install`: it downloads unsigned browser builds, which Smart App Control may block.
- The tests use the **development database**. Every test signs up its own users with emails at `@claude-test.local` (`newUser()` in `helpers.ts`); `global-teardown.ts` deletes those users and their families after the run. Never use another email domain in a test.
- Board steps (`createBoard`, `addCard`, `tile`, `apiLogin`, `addCardViaApi`, `cardIdViaApi`) are in `helpers.ts` too. To check what the page does while a request is running, hold it with `holdRequests(page, url, method, 'continue' | 'fail')` and call the returned `release()`.
- Simulate server failures and slow answers with `page.route`, and the 30 s `staleTime` with `page.clock`; don't stop servers or wait in real time.
- One test or file: `pnpm --filter @family/e2e test tests/home.spec.ts -g "empty family name"`. Watch the browser: add `--headed` or `--ui`. A failed test leaves a trace in `apps/e2e/test-results/` (gitignored): `pnpm --filter @family/e2e exec playwright show-trace <trace.zip>`.
- When a step adds screens, add tests for them.

The same scenarios can be checked by hand in the browser: [apps/web/browser-checklist.md](apps/web/browser-checklist.md) and, in Russian, [apps/web/browser-checklist.ru.md](apps/web/browser-checklist.ru.md) (both local only, gitignored; keep them in sync). Add scenarios there when a step adds screens.

### Gotcha: changes to shared types

`pnpm dev` builds `packages/shared` **once** and does not watch it. After editing `packages/shared/src`, do one of these:

- run `pnpm --filter @family/shared build`, or
- run `pnpm --filter @family/shared dev` (`tsc --watch`) in a separate terminal.

Until then, the apps keep seeing the old `dist/` types.

## Runtime wiring

- **Ports:** API on `3000` (`PORT`), Vite on `5173`, Postgres on `5432`, Redis on `6379`.
- **API prefix:** `main.ts` calls `app.setGlobalPrefix('api')`, so every controller route lives under `/api/...`.
- **Vite proxy:** `apps/web/vite.config.ts` forwards `/api` to `http://localhost:3000` (the e2e tests override the target with the `API_PROXY_TARGET` environment variable). The frontend calls relative URLs such as `fetch('/api/health')`; never hardcode the API host. CORS is also enabled for `http://localhost:5173`, for other clients.
- **Environment:** `ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] })` reads the root `.env` (the API's working directory is `apps/api`). `NODE_ENV` is `development` locally (turns on the Swagger docs) and `production` on a server (HTTPS-only refresh cookie). Required variables are `DATABASE_URL`, `REDIS_URL` and `JWT_ACCESS_SECRET`, read with `config.getOrThrow`, so the API fails at startup if one is missing. `.env` is gitignored. Add any new variable to `.env.example` too.
- **Shutdown:** `enableShutdownHooks()` is on. Services that own connections implement `OnModuleDestroy` to close them, as `HealthService` does.

## API conventions (NestJS)

- Use one feature module per folder: `src/<feature>/<feature>.module.ts`, `.controller.ts` and `.service.ts`. Register the module in `AppModule.imports`.
- Controllers stay thin and delegate to an injectable service.
- Request validation: a Zod schema in `@family/shared` plus `@ZodBody(schema)` on the body parameter (`src/common/zod-body.decorator.ts`). It applies `ZodValidationPipe` (`src/common/zod-validation.pipe.ts`), which returns parsed and normalized data (for example, a lowercased email) or a 400 `ValidationErrorResponse` with `errors` by field, and it describes the body in Swagger from the same schema. No class-validator or DTO classes.
- Swagger docs (`src/swagger/`): Swagger UI at `/api/docs`, the OpenAPI document at `/api/docs-json`; both exist only when `NODE_ENV=development` (set in `.env`), so a server with a missing or misspelled `NODE_ENV` keeps them closed. Schemas come from Zod through `z.toJSONSchema` (`openapi-schemas.ts`): request bodies with `io: 'input'`, responses as named components. Every route gets `@ApiDoc({ summary, status, returns, errors })` (`api-doc.decorator.ts`) and every controller `@ApiTags(...)`. `status` must match what the route really answers. `returns` is a response schema or `z.array(schema)`; a new response schema must be added to `NAMES` in `openapi-schemas.ts` (the API fails at startup otherwise). The lock and the 401 are added to every route without `@Public()` after the document is built (`@Public()` leaves an `x-public` mark), so don't list 401 for protected routes.
- Response types are Zod schemas in `@family/shared` too (`cardInfoSchema` → `type CardInfo = z.infer<…>`), so the docs and later the API tests use the same contract. Write a field's meaning with `.describe()`: it shows in Swagger.
- Auth: `JwtAuthGuard` is global (`APP_GUARD` in `AuthModule`), so **every route requires a Bearer access token unless marked `@Public()`** (`src/auth/auth.decorators.ts`). Get the caller with `@CurrentUser() user: AuthUser` (only `{ id }`; load the rest from the DB). Access token: HS256 JWT, 15 min, payload `{ sub }`, never stored. Refresh token: random 32 bytes in an httpOnly `refresh_token` cookie (`SameSite=Strict`, `path=/api/auth`), stored as SHA-256 in `refresh_tokens`, rotated on every `/auth/refresh`. Reusing a revoked token more than 10 s after revocation revokes all the user's tokens (theft detection); within 10 s it is treated as a parallel-request race. `/auth/refresh` does not clear the cookie on 401, on purpose.
- Families: **a person can be in several families** (migration `0004` dropped the old one-family-per-user constraint; `family_members_user_id_idx` serves "my families"). The home page lists them and offers "Create another family". Always take `familyId` from the URL (`/families/:familyId/...`) and check membership for that family; never derive "the user's family" from the user. The role (`parent` / `child` / `guest`) lives in `family_members`, per family. A non-member gets 404, not 403, so family ids can't be probed. Leaving a family (and what happens when the last parent leaves) comes in stage 3.
- Invites (`src/invites/`): one-time links. The token is `randomToken()` (32 random bytes, base64url) and only its SHA-256 is stored (`src/common/tokens.ts`, shared with refresh tokens), so the link is shown once, in the `POST` response. Only a parent of the family creates, lists and revokes invites (`requireParent`: non-member 404, other role 403); the parent picks the role and a lifetime of 1, 7 or 30 days. `GET /api/invites/:token` and `POST /api/invites/:token/accept` need a logged-in user. Every token that doesn't work (unknown, used, revoked, expired) gets the same 404. Accepting is one transaction: a conditional `UPDATE … WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING`, then the member insert; a primary-key violation (already in this family) → 409, and the rollback leaves the invite unused.
- Boards (`src/boards/`): created and listed under the family (`/families/:familyId/boards`), but one board is addressed without it (`/boards/:boardId`, later `/columns/:id`, `/cards/:id`), so URLs don't grow with every level. The service finds the board's family itself and checks membership in the same query (`findForMember`: boards joined with `family_members` on the board's family and the caller); a missing board and someone else's board get the same 404. A card has no `board_id`: its board is its column's board, so the two links can't disagree.
- Columns and cards live in the same `src/boards/` module (one feature). `BoardAccess` (`board-access.ts`) finds a board, a column or a card together with the caller's membership in its family, in one query each; use it for every board, column and card route. Endpoints: `POST /boards/:boardId/columns`, `PATCH`/`DELETE /columns/:columnId`, `POST /columns/:columnId/move`, `POST /columns/:columnId/cards`, `PATCH`/`DELETE /cards/:cardId`, `POST /cards/:cardId/move`.
- Moving: the client sends where, never a key: `{ columnId, afterCardId }` for a card (`afterCardId: null` = first), `{ afterColumnId }` for a column. The server reads that item's key and the next one (excluding the item being moved) and puts the new key between them. An `after…` id that isn't in the target column/board → 409 "The board has changed, reload it"; a column of another board → 404. New columns and cards go to the end. Writing a key goes through `withPositionRetry` (`positions.ts`): on `23505` on the position index it reads the neighbors again, up to 3 attempts, then 409.
- Deleting a column: only when empty (409 otherwise). The service locks the column row (`SELECT … FOR UPDATE`) before counting its cards; a concurrent card insert takes `FOR KEY SHARE` on that row for its foreign key check, so one waits for the other and a card is never deleted silently by the cascade. A card write that loses the race gets a foreign key violation → 404 "Column not found".
- Reading a board (`GET /boards/:boardId`): columns and cards are read in one `REPEATABLE READ READ ONLY` transaction, so both queries share one snapshot. In READ COMMITTED a column created and a card moved into it between the two queries would make the card drop out of the answer. Read related data that must agree with each other the same way.
- Cards: `PATCH /cards/:cardId` changes only the sent fields, `null` clears `assigneeId` or `dueDate`, an empty body changes nothing (and doesn't touch `updatedAt`). The service sets `updatedAt` on every change. The assignee must be a member of the board's family: otherwise a 400 in the validation-error shape (`errors.assigneeId`). Due dates are ISO 8601 days (`2026-11-30`) in the API and the database; the web app formats them for people.
- Order of columns and cards: a fractional-indexing key in `position` (`fractional-indexing`, `generateKeyBetween`; keys like `a0`, `a0V`, `a1`). The column type is `text COLLATE "C"` (a Drizzle `customType`, since Drizzle has no collation option), so Postgres sorts the keys byte by byte, as JavaScript compares them. Our `postgres:17-alpine` image (musl) happens to sort `en_US.utf8` by bytes too, so a missing `COLLATE "C"` would not show up locally, only on a glibc or ICU database. A unique index on `(board_id, position)` / `(column_id, position)` rejects two items with the same key; retry with a fresh key on `23505`. `fractional-indexing` is ESM-only; the CommonJS API loads it through Node's `require(esm)` (Node 22.12+).
- Ids in the URL: `@Param('familyId', uuidParam('Invalid family id'))` (`src/common/uuid-param.ts`) answers 400 before any database query.
- Postgres errors: use `src/common/pg-errors.ts` (`pgError`, `isUniqueViolation(err, constraintName?)`). Match the constraint name when a table has more than one unique constraint.
- Manual API requests: `apps/api/requests.http` (VS Code REST Client).
- Never return DB rows directly. Map them to a shared response type (`toPublicUser`), so new columns such as `password_hash` can't leak.
- Testing with curl from Git Bash on Windows mangles non-ASCII text in `-d '...'`. Send Cyrillic test bodies from a UTF-8 file with `--data-binary @file`.
- Response types come from `@family/shared`. Import them with `import type`, so the API and web share one contract. When you change a response shape, change the shared type first and let the TypeScript errors show what else to fix on both sides.
- Health check behavior: `GET /api/health` runs the Postgres and Redis checks in parallel. A failed dependency becomes `'down'` and the overall `status` becomes `'degraded'`; the endpoint never throws. Redis uses `lazyConnect` with `maxRetriesPerRequest: 1`, so the API stays up when Docker is stopped.
- The TypeScript config uses `experimentalDecorators` and `emitDecoratorMetadata`, which Nest dependency injection requires. `reflect-metadata` is imported first in `main.ts`.

## Web conventions (React)

- React 19 in `StrictMode`, rendered from `src/main.tsx`; the root component is `App.tsx`.
- **Server data** goes through TanStack Query (`src/api/queryClient.ts`), not `useState` plus `useEffect`. Each feature has a file such as `src/api/families.ts` with `queryOptions` (key and fetch function together) and mutation hooks. Keys: `['families']` for the list, `['families', id]` for one family, `['families', id, 'invites']` for its active invites, `['invites', token]` for an invite preview (`staleTime: 0`), `['families', id, 'boards']` for a family's boards, `['boards', id]` for one board with its columns and cards (`src/api/boards.ts`; every column or card mutation invalidates the board through `afterBoardChange`: after a success `onSuccess` returns the reload promise, so `mutateAsync` resolves only once the reloaded board is in the cache, and a form doesn't clear while the old board is shown (React gets the new data one `setTimeout(0)` later, TanStack Query's notify scheduler, so code right after `await mutateAsync` still sees the old DOM); after an error the reload runs in the background). After deleting a board, navigate away first and then `forgetBoard()`: removing the entry while the board screen is mounted would refetch it, and leaving it would show the deleted board on Back. A mutation invalidates the queries it made out of date. A mutation that returns a family the user is now in (create, accept an invite) calls `rememberFamily()` to put it into the cache and the cached list. Defaults: `staleTime` 30 s; no retry for 4xx `ApiError`s. Render cached `data` before `isError`, so a failed background refetch doesn't replace a loaded page with an error (the health widget is the exception: there the error wins). `App.tsx` calls `resetQueries()` when a different user takes over the tab and `clear()` after a logout once the route guard has redirected, so one user never sees another's cached data. Navigate after a mutation with `await mutateAsync(...)`, not with callbacks passed to `mutate()`: those are skipped once the component has unmounted. The devtools package is not installed (35 transitive packages, some too new on 2026-11-15).
- **Interface state** that outlives a page component but means nothing to the server goes into Redux Toolkit (`src/store/`): `boardUiSlice` holds the filters of every board by board id (`byBoard`, read with `selectFilters(state, boardId)`) and the one open card (`openCardId`, closed by the board screen when it unmounts); step 5 adds the drag state. Key per-board state by board id rather than keeping one "current board" slot. Never copy server data into Redux, and don't use RTK Query: TanStack Query owns server data. Read with `useAppSelector`, write with `useAppDispatch` (typed hooks in `store.ts`). `App.tsx` dispatches `boardUiReset()` whenever the user changes or logs out, like the query cache reset. One value has one home: if the open card later moves into the URL, it leaves Redux.
- Other async UI state (app startup in `App.tsx`) is modeled as a discriminated union (`{ kind: 'loading' | 'error' | 'ready' }`).
- **New dependencies:** pick a version published at least two weeks ago and pin it exactly (`pnpm add pkg@x.y.z`), then check the publish dates of the transitive packages the lockfile gained.
- **API calls** go through `src/api/client.ts` (`api<T>(path, { method, body })`), never raw `fetch`. It adds the Bearer access token, and on a 401 it refreshes the session once and retries. The session (access token and user) lives in module memory, not in `localStorage`. `refreshSession()` shares one in-flight request between all callers (StrictMode double effects, parallel 401s), because the server treats a reused refresh token as theft. Components read the user with `useUser()` (`useSyncExternalStore`).
- **Routing:** TanStack Router with code-based routes in `src/router.tsx`. Protected pages go under the pathless `authed` route and guest-only pages (login, sign-up) under `guest`; both check the session synchronously in `beforeLoad`. `App.tsx` restores the session with `refreshSession()` before rendering the router and calls `router.invalidate()` on every session change, which performs the redirects after login and logout. `?redirect=` is passed through `safeRedirect` (same-site paths only, no open redirect).
- **Due dates** (`YYYY-MM-DD`) are days, not moments: never `new Date('2026-11-30')` in local time (it is midnight UTC, the previous day west of Greenwich). Format them with `formatDueDate` and compare them as strings with `today()` (`src/pages/format.ts`).
- **Forms** validate with the shared Zod schemas before sending (`src/pages/formErrors.ts` maps Zod and API errors to field errors), so the client and the API apply the same rules.
- **`@family/shared` in the web app** resolves to `packages/shared/src/index.ts` through a Vite alias, not to the CommonJS `dist/`: Rollup can't see named exports of a linked CommonJS package. `tsc --noEmit` still reads types from `dist/`, so `pnpm build` (which builds shared first) is the reliable type check.
- Styles: plain CSS in `src/styles.css` with color tokens and dark mode. Tailwind and shadcn/ui come later.
- TypeScript settings: `moduleResolution: "bundler"`, `noEmit`, `isolatedModules`, `jsx: react-jsx`.

## Code style

- Prettier: single quotes, trailing commas everywhere, `printWidth: 100`.
- TypeScript `strict` in every package.
- Prefer named exports, as in `export function App` and `export class HealthService`.

## Before commit

- remind me to translate all russian to english

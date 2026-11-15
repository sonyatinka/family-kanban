# CLAUDE.md

This file guides Claude Code when working in this repository.

## Project

Family kanban is a learning project for family time management on kanban boards. It is built in stages. Stage 0 (foundation) is done: a monorepo with a NestJS API whose only endpoint is a health check for Postgres and Redis, and a React page that shows the result.

The full roadmap is in `plan.txt`. **Stage 1 (users and family) is in progress**, done in small steps with explanations:

1. ✅ Drizzle ORM and migrations; `users` table; health check uses Drizzle.
2. ✅ Sign-up and login (`POST /api/auth/register`, `/api/auth/login`), passwords hashed with argon2id.
3. ✅ JWT access and refresh tokens, global auth guard, `GET /api/auth/me`.
4. ✅ Creating a family: `POST /api/families`, `GET /api/families`, `GET /api/families/:familyId`.
5. Invite links with a token and expiry.
6. Frontend: login and sign-up pages, protected routes.

Stage 2 is boards, columns and cards. TanStack Query replaces the hand-written `fetch` in the web app (an old code comment calls this "stage 2").

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
packages/shared  @family/shared  Shared types and Zod schemas (API contract)
docker-compose.yml               Postgres 17 + Redis 7, with healthchecks and named volumes
```

- Apps depend on shared through `"@family/shared": "workspace:*"`.
- `@family/shared` is consumed **from its compiled output** (`main: dist/index.js`, `types: dist/index.d.ts`). It must be built before the apps can type-check or run.
- `pnpm-workspace.yaml` sets `allowBuilds: { esbuild: true }`, because pnpm 11+ blocks dependency install scripts by default. Add entries there if a new dependency needs a postinstall step.

## Commands

Run these from the repo root. You need Node 20 or newer, pnpm and Docker.

**Use pnpm 11, not 12, on this machine.** Windows Smart App Control is enforced here. pnpm 12 ships an unsigned native `pnpm.exe`, which SAC blocks ("An Application Control policy has blocked this file"). pnpm 11 is JavaScript run by the signed `node.exe`, so it works. The unsigned native parts of the project (esbuild, rollup, argon2) currently pass thanks to their cloud reputation. If something new gets blocked, check the `Microsoft-Windows-CodeIntegrity/Operational` event log (events 3033 and 3077).

```bash
cp .env.example .env   # first time only
pnpm install
pnpm db:up             # start Postgres and Redis (docker compose up -d)
pnpm dev               # build shared once, then run api and web dev servers in parallel
```

| Command                              | Purpose                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pnpm dev`                           | `pnpm --filter @family/shared build`, then `dev` in every `apps/*`                               |
| `pnpm build`                         | `pnpm -r build`: shared runs `tsc`, api runs `nest build`, web runs `tsc --noEmit && vite build` |
| `pnpm lint`                          | ESLint on the whole repo (flat config: js recommended, typescript-eslint recommended, prettier)  |
| `pnpm format`                        | Prettier `--write .`                                                                             |
| `pnpm db:up` / `db:down` / `db:logs` | Manage the Docker Compose services                                                               |
| `pnpm db:generate` / `db:migrate`    | Generate a SQL migration from the schema / apply pending migrations                              |
| `pnpm db:studio`                     | Drizzle Studio (browse data)                                                                     |
| `pnpm --filter @family/api <script>` | Run one package's script (`dev`, `build`, `start`)                                               |

There is **no test setup** yet: no test runner and no test scripts. Use `pnpm build` (which type-checks every package) and `pnpm lint` to verify changes. The project skill `verify-step` has the full checklist, including a live API run on port 3001.

### Gotcha: changes to shared types

`pnpm dev` builds `packages/shared` **once** and does not watch it. After editing `packages/shared/src`, do one of these:

- run `pnpm --filter @family/shared build`, or
- run `pnpm --filter @family/shared dev` (`tsc --watch`) in a separate terminal.

Until then, the apps keep seeing the old `dist/` types.

## Runtime wiring

- **Ports:** API on `3000` (`PORT`), Vite on `5173`, Postgres on `5432`, Redis on `6379`.
- **API prefix:** `main.ts` calls `app.setGlobalPrefix('api')`, so every controller route lives under `/api/...`.
- **Vite proxy:** `apps/web/vite.config.ts` forwards `/api` to `http://localhost:3000`. The frontend calls relative URLs such as `fetch('/api/health')`; never hardcode the API host. CORS is also enabled for `http://localhost:5173`, for other clients.
- **Environment:** `ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] })` reads the root `.env` (the API's working directory is `apps/api`). Required variables are `DATABASE_URL`, `REDIS_URL` and `JWT_ACCESS_SECRET`, read with `config.getOrThrow`, so the API fails at startup if one is missing. `.env` is gitignored. Add any new variable to `.env.example` too.
- **Shutdown:** `enableShutdownHooks()` is on. Services that own connections implement `OnModuleDestroy` to close them, as `HealthService` does.

## API conventions (NestJS)

- Use one feature module per folder: `src/<feature>/<feature>.module.ts`, `.controller.ts` and `.service.ts`. Register the module in `AppModule.imports`.
- Controllers stay thin and delegate to an injectable service.
- Request validation: a Zod schema in `@family/shared` plus `@Body(new ZodValidationPipe(schema))` (`src/common/zod-validation.pipe.ts`). The pipe returns parsed and normalized data (for example, a lowercased email) or a 400 `ValidationErrorResponse` with `errors` by field. No class-validator or DTO classes.
- Auth: `JwtAuthGuard` is global (`APP_GUARD` in `AuthModule`), so **every route requires a Bearer access token unless marked `@Public()`** (`src/auth/auth.decorators.ts`). Get the caller with `@CurrentUser() user: AuthUser` (only `{ id }`; load the rest from the DB). Access token: HS256 JWT, 15 min, payload `{ sub }`, never stored. Refresh token: random 32 bytes in an httpOnly `refresh_token` cookie (`SameSite=Strict`, `path=/api/auth`), stored as SHA-256 in `refresh_tokens`, rotated on every `/auth/refresh`. Reusing a revoked token more than 10 s after revocation revokes all the user's tokens (theft detection); within 10 s it is treated as a parallel-request race. `/auth/refresh` does not clear the cookie on 401, on purpose.
- Families: **the API and code are multi-family; the database temporarily allows one family per user** (`UNIQUE(user_id)` named `family_members_one_family_per_user`, see `FAMILY_MEMBERS_ONE_FAMILY`). Always take `familyId` from the URL (`/families/:familyId/...`) and check membership for that family; never derive "the user's family" from the user. The role (`parent` / `child` / `guest`) lives in `family_members`, per family. A non-member gets 404, not 403, so family ids can't be probed. To allow several families later: drop the constraint, add an index on `family_members.user_id`, and add a family switcher in the web app.
- Postgres errors: use `src/common/pg-errors.ts` (`pgError`, `isUniqueViolation(err, constraintName?)`). Match the constraint name when a table has more than one unique constraint.
- Manual API requests: `apps/api/requests.http` (VS Code REST Client).
- Never return DB rows directly. Map them to a shared response type (`toPublicUser`), so new columns such as `password_hash` can't leak.
- Testing with curl from Git Bash on Windows mangles non-ASCII text in `-d '...'`. Send Cyrillic test bodies from a UTF-8 file with `--data-binary @file`.
- Response types come from `@family/shared`. Import them with `import type`, so the API and web share one contract. When you change a response shape, change the shared type first and let the TypeScript errors show what else to fix on both sides.
- Health check behavior: `GET /api/health` runs the Postgres and Redis checks in parallel. A failed dependency becomes `'down'` and the overall `status` becomes `'degraded'`; the endpoint never throws. Redis uses `lazyConnect` with `maxRetriesPerRequest: 1`, so the API stays up when Docker is stopped.
- The TypeScript config uses `experimentalDecorators` and `emitDecoratorMetadata`, which Nest dependency injection requires. `reflect-metadata` is imported first in `main.ts`.

## Web conventions (React)

- React 19 in `StrictMode`, rendered from `src/main.tsx`; the root component is `App.tsx`.
- Async UI state is modeled as a discriminated union (`{ kind: 'loading' | 'error' | 'ok' }`).
- There is no router, state library or CSS framework yet. Styles are inline.
- TypeScript settings: `moduleResolution: "bundler"`, `noEmit`, `isolatedModules`, `jsx: react-jsx`.

## Code style

- Prettier: single quotes, trailing commas everywhere, `printWidth: 100`.
- TypeScript `strict` in every package.
- Prefer named exports, as in `export function App` and `export class HealthService`.

## Before commit

- remind me to translate all russian to english

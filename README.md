# Family Kanban

A learning project: family time management on kanban boards, built in stages (see `plan.txt`).

Stage 0 (foundation) is done. Stage 1 (users and family) is in progress: sign-up and login, JWT access and refresh tokens, and families are ready; invite links and the login UI come next.

## Structure

```
family-kanban/
├── apps/
│   ├── api/          NestJS: auth, families, GET /api/health (Postgres and Redis)
│   └── web/          React + Vite: shows the API status
├── packages/
│   └── shared/       types and Zod schemas shared by api and web
├── docker-compose.yml  Postgres 17 and Redis 7
└── .env.example
```

## Prerequisites

- Node.js 20 or newer
- pnpm 11: `npm install -g pnpm@11`
- Docker Desktop (or Docker Engine with Compose)

## Getting started

```bash
cp .env.example .env     # environment variables; set JWT_ACCESS_SECRET to a random value
pnpm install             # dependencies of all packages
pnpm db:up               # Postgres and Redis in Docker
pnpm db:migrate          # apply database migrations
pnpm dev                 # API and frontend together
```

Open http://localhost:5173. If everything works, you'll see three green check marks: API, PostgreSQL, Redis.

The API directly: http://localhost:3000/api/health

To try the API by hand, open `apps/api/requests.http` in VS Code with the REST Client extension.

## Commands

| Command                  | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `pnpm dev`               | builds shared and runs api and web in development mode              |
| `pnpm build`             | builds all packages                                                 |
| `pnpm lint`              | ESLint over the whole repository                                    |
| `pnpm format`            | Prettier over the whole repository                                  |
| `pnpm db:up` / `db:down` | start or stop the containers                                        |
| `pnpm db:logs`           | container logs                                                      |
| `pnpm db:generate`       | create an SQL migration from changes in `apps/api/src/db/schema.ts` |
| `pnpm db:migrate`        | apply new migrations to the database                                |
| `pnpm db:studio`         | Drizzle Studio: browse the data                                     |

## Check yourself

Stage 0 is done if you can explain:

1. Why `packages/shared` exists and how `workspace:*` links packages.
2. What `healthcheck` does in docker-compose and where Postgres keeps its data (volume).
3. Why `.env` is in `.gitignore` while `.env.example` is in the repository.
4. How a request from the page to `/api/health` reaches NestJS (the proxy in `vite.config.ts`).
5. What the page shows after `pnpm db:down`, and why the API keeps running.

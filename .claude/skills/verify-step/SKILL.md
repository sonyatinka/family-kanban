---
name: verify-step
description: Verify a change in the family-kanban repo before calling it done — build (type-check), ESLint, Prettier, migrations, and a live run of the API with curl scenarios — then report results as a table. Use this after finishing any code step or fix in this repo, whenever the user asks to "проверить", "прогнать", "убедиться, что работает", "протестировать", or before saying a step is complete, even if they don't mention build or lint explicitly.
---

# Verifying a step in family-kanban

The project has no test runner yet, so "done" means: every package type-checks, lint and formatting are clean, the database schema matches the migrations, and the changed behavior was exercised against a real running API. Run the steps in order, from the repo root (`d:\kanban\family-kanban`), and report honestly what passed and what did not.

## 1. Build (type-check)

```bash
pnpm build
```

`pnpm -r build` builds `packages/shared` first, then `apps/api` (`nest build`) and `apps/web` (`tsc --noEmit && vite build`). If the IDE shows errors like "has no exported member" for a type that you just added to shared, they are stale: the IDE saw the old `dist/`. Trust the build output.

## 2. Lint and formatting

```bash
pnpm lint
pnpm exec prettier --check apps packages CLAUDE.md
```

- If Prettier complains about files you changed, run `pnpm exec prettier --write <those files>` and check again.
- Don't pass `.http` or `.env*` files to Prettier explicitly: it has no parser for them and errors. In a directory run it skips them silently, which is fine.
- `prettier --check .` (whole repo) currently also flags `.claude/settings.json` and the hand-written pages in `docs/` (quiz and theory). These are expected and not yours to reformat unless the user asks.

## 3. Database (only if `apps/api/src/db/schema.ts` changed)

```bash
pnpm db:generate --name <what_changed>   # then read the SQL in apps/api/drizzle/
pnpm db:migrate
```

Read the generated SQL before applying it: check constraints, foreign keys with the intended `ON DELETE`, and indexes. If `db:migrate` exits 1 with no message, see the Drizzle section of CLAUDE.md (test the connection with `pg`, maybe `docker compose restart`).

## 4. Live run of the API (when API behavior changed)

The user often has `pnpm dev` running on port 3000. Don't kill it, and don't start a second `pnpm dev`: two `nest --watch` instances fight over port 3000 and crash each other, and Vite silently moves to 5174. Check first with `netstat -ano | grep -E ":(3000|517[3-9]) .*LISTENING"`. Before stopping any process, trace its parent chain (`Get-CimInstance Win32_Process`): a process is yours only if it descends from your own shell. A process started from the user's VS Code terminal (powershell.exe under Code.exe) is theirs, even if it looks orphaned. Run the freshly built API on **port 3001** in the background:

```bash
cd apps/api && PORT=3001 node dist/main.js > <scratchpad>/api3001.log 2>&1 &
for i in $(seq 1 30); do curl -s localhost:3001/api/health >/dev/null && break; sleep 0.5; done
```

Then exercise the step with curl. Cover more than the happy path:

- the success case and its exact status code;
- each validation and auth failure (400, 401, 409, …);
- security properties the step claims, such as a tampered or `alg: none` token, a missing cookie, or a reused token;
- concurrency, when the code relies on the database for correctness: fire 5 identical requests in parallel (`for i in 1 2 3 4 5; do curl … & done; wait`) and look at the status codes.

Practicalities:

- Use a cookie jar (`-c jar.txt` / `-b jar.txt`) for refresh-cookie flows, and `-D -` to see `Set-Cookie`.
- A protected route needs `-H "Authorization: Bearer $TOKEN"`. Take the token from the JSON body with `node -e`.
- Cyrillic in `-d '...'` gets mangled by Git Bash. Send such bodies from a UTF-8 file with `--data-binary @file`.
- Check the server log (`api3001.log`) for unexpected errors and warnings.

**Test data:** use emails ending in `@claude-test.local`, never `@test.local`. The user tests manually with `@test.local` addresses (see `apps/api/requests.http`), and a cleanup by `@test.local` once deleted their account. Clean up only your own data, families first. Deleting a user removes their memberships
(`ON DELETE CASCADE`) but not the family itself, which would stay with no members. And delete
only families where every member is a test user: a test user may have joined a real family
through an invite, and that family must survive. `apps/e2e/global-teardown.ts` uses the same
query.

```bash
docker compose exec -T postgres psql -U family -d family_kanban -c "
DELETE FROM families f
WHERE EXISTS (SELECT 1 FROM family_members m JOIN users u ON u.id = m.user_id
              WHERE m.family_id = f.id AND u.email LIKE '%@claude-test.local')
  AND NOT EXISTS (SELECT 1 FROM family_members m JOIN users u ON u.id = m.user_id
                  WHERE m.family_id = f.id AND u.email NOT LIKE '%@claude-test.local');
DELETE FROM users WHERE email LIKE '%@claude-test.local';"
```

Then check that nothing is left: both counts must be 0.

```bash
docker compose exec -T postgres psql -U family -d family_kanban -t -A -c "
SELECT count(*) FROM users WHERE email LIKE '%@claude-test.local';
SELECT count(*) FROM families f WHERE NOT EXISTS
  (SELECT 1 FROM family_members m WHERE m.family_id = f.id);"
```

Stop only the process on port 3001:

```bash
for p in $(netstat -ano | grep -E ":3001 .*LISTENING" | awk '{print $NF}' | sort -u); do taskkill //PID $p //F; done
```

(The PID is the last column, hence `$NF`. Don't write `$` followed by a digit anywhere in this file: skill arguments are substituted into such placeholders.)

If a scenario fails or behaves unexpectedly, that is the most valuable result of the run. Fix the code, rebuild, and rerun the scenarios. Then tell the user what the test caught. Don't adjust the scenario to make it pass.

## 5. Keep the docs in step

- If the step changed conventions, env variables, commands or endpoints, update `CLAUDE.md`. Add new env variables to `.env.example` too.
- If the step added or changed endpoints, update `apps/api/requests.http`. The user tests with it.

## 6. Report

Report in Russian. Start with one line saying that build, lint and Prettier pass, or exactly what fails. Then give a table of the live scenarios with request and result. Mention anything you fixed because a scenario failed, and any test data you deleted.

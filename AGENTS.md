# AGENTS.md

## Commands

Bun runtime (not Node/npm). Use `bun` / `bunx` everywhere.

```bash
bun run sanity        # full check: lint -> typecheck -> bun test
bun run lint          # eslint src tests (prisma/ is ignored by config)
bun run typecheck     # tsc --noEmit
bun test tests/unit/resolvers.test.ts   # single test file
bun run dev           # GraphQL server at http://localhost:3000/graphql
```

## Setup gotchas

1. `cp .env.example .env` first — Bun auto-loads `.env`, so `DATABASE_URL`, `TEST_DATABASE_URL`, and `PORT` need no dotenv wiring.
2. Postgres runs via Docker: `docker compose up -d`. This only creates the dev DB `bookmark_manager`.
3. The test database is created automatically by `bun run test:setup` (via host `psql`, falling back to `docker compose exec db`).
4. Generate the Prisma client before dev or tests: `bun run gendb`. Missing this causes "PrismaClient is unable to run in this environment".
5. Apply migrations to dev DB: `bun run db:migrate`. For the test DB: `bun run test:setup` (runs `prisma migrate deploy` against `TEST_DATABASE_URL`).

## Testing behavior

- Integration tests go through GraphQL Yoga into real Postgres (`tests/integration/graphql.test.ts`); they need both DBs running.
- `src/db.ts` selects `TEST_DATABASE_URL` when `NODE_ENV === 'test'`. Bun sets `NODE_ENV=test` automatically during `bun test` — don't override it.
- `src/server.ts` skips `Bun.serve()` when `NODE_ENV=test`; importing it in tests won't bind port 3000.

## Architecture

- Schema-first GraphQL: edit `src/graphql/schema.graphql` and `src/graphql/resolvers.ts` together. The SDL is `readFileSync`'d at runtime from `process.cwd()` — no codegen step, but run everything from the repo root.
- Entry: `src/server.ts` (Bun.serve + Yoga) → `src/graphql/resolvers.ts` → `src/db.ts` (singleton PrismaClient) → Prisma/Postgres.
- Validation lives in `src/validation/bookmark.validation.ts`; errors are returned as GraphQL errors with exact messages like "Invalid bookmark URL" — tests assert these strings, keep them stable.
- Cursor pagination uses a composite Base64 cursor of `createdAt` + `id` (see README "Pagination") — preserve deterministic `(createdAt ASC, id ASC)` ordering if touching resolvers.

## Conventions

- Strict TypeScript, zero `any` — including tests (unit tests use typed custom Prisma mocks, no casts).
- ESLint flat config: unused vars are warnings with `^_` ignore pattern.

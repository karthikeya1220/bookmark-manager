# Implementation Walkthrough

A short guided tour of the Bookmark Manager GraphQL API — what was built, how it is structured, and the reasoning behind the key decisions. Written as a companion to the live demo; also usable as a standalone walkthrough.

## What Was Built

A schema-first GraphQL API for organizing bookmarks into folders, built with Bun, TypeScript (strict mode), GraphQL Yoga, PostgreSQL, and Prisma.

- **Queries**: `health`, `folders`, `folder(id)` (with nested bookmarks), and `bookmarks(...)` with folder filtering, case-insensitive title search, and cursor pagination.
- **Mutations**: `createFolder`, `createBookmark`, `updateBookmark`, `deleteBookmark`, `moveBookmark`.
- **Testing**: 9 unit tests over resolver logic with fully typed Prisma mocks, plus 28 integration tests that execute real GraphQL operations through Yoga into a dedicated PostgreSQL database.
- **Tooling**: one-command Docker Compose Postgres, Prisma migrations, a `bun run sanity` script (lint → typecheck → test), a Dockerfile for the service itself, and GitHub Actions CI running the full suite on every PR.

## Architecture

```
src/server.ts        Bun.serve + GraphQL Yoga; loads SDL from disk at startup
src/graphql/schema.graphql   the API contract (schema-first)
src/graphql/resolvers.ts     all resolvers + cursor encode/decode
src/graphql/context.ts       request context (typed Prisma client handle)
src/validation/bookmark.validation.ts   title/URL rules, shared by mutations
src/db.ts            singleton PrismaClient; swaps to TEST_DATABASE_URL under NODE_ENV=test
prisma/schema.prisma  Folder 1—N Bookmark, FK cascade delete, indexes on folderId & createdAt
```

The dependency direction is strictly one-way: server → resolvers → validation/db → Prisma. Nothing outside `server.ts` knows about HTTP or Bun's server APIs, which is why integration tests can drive the exact same Yoga app in-process without binding a port.

## Key Decisions

### Composite cursor pagination

`bookmarks` orders by `(createdAt ASC, id ASC)` and pages with an opaque Base64 cursor containing both fields. A timestamp-only cursor breaks when rows share a second (they do — seeds and bulk inserts), causing skipped or duplicated rows. The composite key makes the ordering total and pagination stable; the SQL boundary (`createdAt > c OR (createdAt = c AND id > c)`) is pushed into Prisma, and a `take + 1` lookahead computes `hasNextPage` without a count query. The core integration test pages through records that deliberately share timestamps and asserts no gaps or duplicates.

### Schema-first SDL

The `.graphql` file is the single source of truth for the contract, read at runtime — no codegen step to drift or forget. Resolvers stay thin: argument shaping, delegation to Prisma, and error translation only.

### Validation centralized in one module

Title and URL rules live in `bookmark.validation.ts` and are reused by `createBookmark` and `updateBookmark`, so both entry points fail identically. URLs must parse and use http/https. Failures throw `GraphQLError`s with stable messages ("Invalid bookmark URL", "Bookmark title cannot be empty") rather than leaking Prisma errors as 500s. Explicit `null`s on update fields are rejected too — GraphQL nullable inputs make `null` distinguishable from "omitted", and silently treating null as "clear this field" seemed wrong for these fields.

### Dedicated test database

Integration tests run against `TEST_DATABASE_URL`, selected inside `db.ts` when `NODE_ENV=test`. Bun sets that flag automatically under `bun test`, so tests can never touch dev data by accident. `bun run test:setup` idempotently creates the test DB (host `psql` if present, otherwise `docker compose exec`) and applies committed migrations with `migrate deploy`, so CI and fresh clones need zero undocumented steps.

### Typed mocks instead of `any`

Unit tests build mock Prisma delegates shaped by Prisma's own generated args/result types (`Prisma.FolderFindUniqueArgs`, etc.). The suite stays strict-mode clean with zero `any`.

## Tradeoffs

- **No DataLoader / batching**: nested `folder.bookmarks` resolves with a simple query per parent. At this scale that's clearer than batching machinery; a production version would batch.
- **No authentication**: out of scope per the assignment; Yoga context is already the natural seam for it.
- **`createdAt` exposed as ISO string**: avoids custom scalar plumbing while keeping clients unambiguous.
- **Search uses SQL `contains`**: fine for assignment scale; full-text indexes are the next step, not a rewrite.

## What I'd Improve With More Time

1. **AuthN/AuthZ** — JWT-verified context plus ownership checks on folders/bookmarks.
2. **Relay-style connection** — `edges { cursor node }`, `hasPreviousPage`, and forward/backward symmetry on top of the existing composite cursor.
3. **Full-text search** — `tsvector` column + GIN index behind the same `search` argument.
4. **Query complexity limits and depth limiting** before exposing publicly.
5. **Observability** — structured logging (Pino), OpenTelemetry tracing around Prisma calls.

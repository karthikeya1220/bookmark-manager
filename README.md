# Bookmark Manager GraphQL API

A robust, schema-first GraphQL API for managing folders and bookmarks, featuring cursor-based pagination, deterministic ordering, and powerful search capabilities.

## Features

- **Folder management**: Create and retrieve folders with nested bookmarks.
- **Bookmark management**: Create, update, delete, and move bookmarks between folders.
- **Bookmark search**: Case-insensitive substring search for bookmark titles.
- **Folder filtering**: Filter bookmarks by specific folder IDs.
- **Cursor pagination**: Opaque composite cursors (createdAt + id) for robust, stable pagination.
- **PostgreSQL**: Production-grade relational database persistence.
- **Prisma**: Type-safe ORM for database migrations and queries.
- **GraphQL Yoga**: Lightweight and fully-featured GraphQL server setup.
- **TypeScript/Bun**: Fast execution with strict type-safety.
- **Automated testing**: Comprehensive unit and integration test suite running against a dedicated test database.

## Tech Stack

- Bun
- TypeScript
- GraphQL Yoga
- PostgreSQL
- Prisma
- Docker Compose
- Bun test
- ESLint

## Prerequisites

Ensure you have the following installed on your machine:
- [Bun](https://bun.sh/)
- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

Verify your installations:
```bash
bun --version
docker --version
docker compose version
```

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   ```

2. **Navigate into the project**
   ```bash
   cd bookmark-manager
   ```

3. **Install dependencies**
   ```bash
   bun install
   ```

4. **Setup environment variables**
   Create a `.env` file from the example template:
   ```bash
   cp .env.example .env
   ```

5. **Start PostgreSQL in Docker**
   ```bash
   docker compose up -d
   ```

6. **Generate the Prisma Client**
   ```bash
   bun run gendb
   ```

7. **Apply database migrations**
   ```bash
   bun run db:migrate
   ```
   *(Note: This uses Prisma's migration tooling to safely apply migrations to the development database).*

8. **Start the development server**
   ```bash
   bun run dev
   ```

## Environment Variables

The application requires specific environment variables which are documented in `.env.example`.

- `DATABASE_URL`: Connection string for the development PostgreSQL instance.
  *(Example: `postgresql://postgres:postgres@localhost:5432/bookmark_manager?schema=public`)*
- `TEST_DATABASE_URL`: Connection string for the dedicated test PostgreSQL instance.
  *(Example: `postgresql://postgres:postgres@localhost:5432/bookmark_manager_test?schema=public`)*
- `PORT`: The port on which the Yoga server will run. *(Example: `3000`)*

> [!WARNING]
> Never commit your actual `.env` file. Keep secrets local.

## Database

The project uses a real **PostgreSQL** database running inside Docker.
- **Schema & Migrations**: Defined by Prisma in `prisma/schema.prisma`. Migrations are fully managed via the Prisma CLI. 
- **Development Database**: Used during `bun run dev` and `bun run db:migrate`.
- **Test Database**: A dedicated, isolated database used purely for tests. 

Before running integration tests, the test database is set up using:
```bash
bun run test:setup
```
This script explicitly utilizes `prisma migrate deploy` to safely deploy committed migrations to the test database, ensuring development and test environments match perfectly.

## Running

Start the development server:
```bash
bun run dev
```
The GraphQL endpoint and GraphiQL playground will be accessible at:
[http://localhost:3000/graphql](http://localhost:3000/graphql)

Other helpful commands:
- **Lint the codebase**: `bun run lint`
- **Check TypeScript types**: `bun run typecheck`
- **Run the test suite**: `bun test`
- **Run all checks**: `bun run sanity`

## API

### Queries

#### `health`
Returns a health check string.
```graphql
query { health }
```

#### `folders`
Retrieves all folders.
```graphql
query {
  folders {
    id
    name
  }
}
```

#### `folder(id: ID!)`
Retrieves a specific folder by ID and its nested bookmarks.
```graphql
query {
  folder(id: "123") {
    name
    bookmarks {
      title
      url
    }
  }
}
```

#### `bookmarks(folderId: ID, search: String, take: Int, cursor: String)`
Retrieves a paginated, filterable list of bookmarks.
```graphql
query {
  bookmarks(folderId: "123", search: "react", take: 10) {
    nodes {
      title
      url
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Mutations

#### `createFolder`
Creates a new folder.
```graphql
mutation {
  createFolder(name: "Engineering") {
    id
    name
  }
}
```

#### `createBookmark`
Creates a new bookmark inside a folder.
```graphql
mutation {
  createBookmark(
    title: "GraphQL Docs", 
    url: "https://graphql.org", 
    folderId: "123"
  ) {
    id
    title
  }
}
```

#### `updateBookmark`
Partially updates an existing bookmark. Omitted fields are ignored.
```graphql
mutation {
  updateBookmark(id: "456", title: "GraphQL Documentation") {
    id
    title
  }
}
```

#### `deleteBookmark`
Deletes a bookmark and returns a boolean confirming success.
```graphql
mutation {
  deleteBookmark(id: "456")
}
```

#### `moveBookmark`
Moves an existing bookmark to a new folder.
```graphql
mutation {
  moveBookmark(id: "456", folderId: "789") {
    id
    folder {
      name
    }
  }
}
```

## Pagination

The `bookmarks` query uses a highly robust **cursor-based pagination** algorithm.
- **Deterministic Ordering**: Bookmarks are ordered by `createdAt ASC`, then by `id ASC`.
- **Composite Cursor**: The opaque Base64 cursor contains both the `createdAt` timestamp and `id`. 
- **Database Pagination**: Pagination is pushed directly down to PostgreSQL via Prisma utilizing SQL `AND/OR` boundaries.
- **Lookahead**: A `take + 1` query structure is employed to determine `hasNextPage` dynamically.
- **Limits**: The `take` parameter is validated (minimum 1, maximum 100) and defaults to 20.

**Example Flow:**
1. Fetch the first page (take 2):
```graphql
query {
  bookmarks(take: 2) {
    nodes { title }
    pageInfo { endCursor }
  }
}
```
2. Fetch the next page using the `endCursor`:
```graphql
query {
  bookmarks(take: 2, cursor: "eyJjcmVhdGVkQXQiOiIyMDI0...XQ") {
    nodes { title }
    pageInfo { endCursor }
  }
}
```

## Validation and Errors

The GraphQL server strictly enforces domain constraints and returns meaningful error messages directly inside the GraphQL `errors` array payload.
- **Empty or whitespace title**: `Bookmark title cannot be empty`
- **Invalid URL format**: `Invalid bookmark URL`
- **Missing Folder**: `Folder not found`
- **Missing Bookmark**: `Bookmark not found`
- **Malformed Cursor**: `Invalid cursor`
- **Invalid Take**: `take must be between 1 and 100`

Explicit `null` values passed to update fields are also treated as validation errors.

## Testing

The project maintains a rigorous, zero-`any` TypeScript test suite.

### Unit Tests
Located at `tests/unit/resolvers.test.ts`.
These tests execute resolver behavior in isolation. They use heavily typed, custom-built Prisma mocking logic without unsafe casts, strictly validating arguments and error handling logic.

### Integration Tests
Located at `tests/integration/graphql.test.ts`.
These tests interact via the GraphQL Yoga execution path straight to Prisma, validating the actual PostgreSQL records.
The tests run against the isolated `TEST_DATABASE_URL`.

To set up the database and run tests:
```bash
bun run test:setup
bun test
```
To run the full validation suite (lint, typecheck, test):
```bash
bun run sanity
```

## Project Structure

```text
src/
  graphql/
    schema.graphql
    resolvers.ts
    context.ts
  validation/
    bookmark.validation.ts
  db.ts
  server.ts
prisma/
  schema.prisma
  test-setup.ts
  migrations/
tests/
  integration/
    graphql.test.ts
  unit/
    resolvers.test.ts
```

## How I'd Extend This

Future iterations to take this API to production scale:
- **Authentication & Authorization**: Currently omitted; could be seamlessly layered into the Yoga context using JWTs and Role-Based Access Control (RBAC).
- **Caching**: Abstract DataLoader layers for batch fetching, or Redis caching for frequent folder lists.
- **Observability**: Adding structured logging (Pino) and tracing (OpenTelemetry).
- **Search Capabilities**: Migrating title search from `contains` to PostgreSQL full-text indexing.

## Design Decisions / Tradeoffs

- **Schema-first GraphQL**: Used an `.graphql` SDL rather than code-first approaches like Pothos/Nexus to provide the clearest, most readable API contract explicitly separated from implementation logic.
- **Prisma & PostgreSQL**: Offers uncompromising type safety and easy relational modeling with predictable migration boundaries.
- **Composite Cursors**: A timestamp-only cursor fails on identical timestamps. Encoding both `createdAt` and `id` provides guaranteed pagination stability without exposing raw DB formats to clients.
- **No Caching / Loaders**: Dropped DataLoader abstraction as it would be over-engineered for a simple single-level nested resolver array fetching.

## Troubleshooting

- **"PrismaClient is unable to run in this environment"**: Ensure you have executed `bun run gendb` before starting the server.
- **"Port 5432 is already in use"**: Another PostgreSQL instance is running locally on your machine. Stop it before executing `docker compose up -d`.
- **"Connection refused"**: Verify Docker is running and the database container is healthy via `docker compose ps`.
- **"Migration failed"**: Make sure the target database isn't corrupted. If testing, ensure `TEST_DATABASE_URL` is correctly configured in `.env`.

import { $ } from "bun";

const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) {
  throw new Error("TEST_DATABASE_URL is not set in .env");
}
const dbUrl: string = testDbUrl;

const parsed = new URL(dbUrl);
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (!dbName) {
  throw new Error("Could not parse database name from TEST_DATABASE_URL");
}

async function psqlExists(args: string[]): Promise<boolean> {
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = "/postgres";
  const result = await $`${args} ${adminUrl.href} -tAc "SELECT 1 FROM pg_database WHERE datname = ${dbName}"`.quiet().nothrow();
  return result.exitCode === 0 && result.stdout.toString().trim() === "1";
}

async function dbExists(): Promise<boolean> {
  if (Bun.which("psql")) {
    return psqlExists(["psql"]);
  }
  const composeUser = parsed.username || "postgres";
  return psqlExists(["docker", "compose", "exec", "-T", "db", "psql", "-U", composeUser]);
}

async function createTestDatabase(): Promise<void> {
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = "/postgres";
  if (Bun.which("psql")) {
    await $`psql ${adminUrl.href} -c "CREATE DATABASE ${dbName}"`;
    return;
  }
  const composeUser = parsed.username || "postgres";
  await $`docker compose exec -T db createdb -U ${composeUser} ${dbName}`;
}

if (!(await dbExists())) {
  console.log(`Test database "${dbName}" does not exist. Creating it...`);
  await createTestDatabase();
}

console.log("Applying Prisma migrations to test database...");
await $`DATABASE_URL=${dbUrl} bunx prisma migrate deploy`;
console.log("Test database is ready.");

import { $ } from "bun";

const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) {
  throw new Error("TEST_DATABASE_URL is not set in .env");
}

console.log("Applying Prisma migrations to test database...");
await $`DATABASE_URL=${testDbUrl} bunx prisma migrate deploy`;
console.log("Test database is ready.");

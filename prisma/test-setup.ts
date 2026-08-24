import { $ } from "bun";

const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) {
  throw new Error("TEST_DATABASE_URL is not set in .env");
}

console.log("Pushing Prisma schema to test database...");
await $`DATABASE_URL=${testDbUrl} bunx prisma db push --accept-data-loss`;
console.log("Test database is ready.");

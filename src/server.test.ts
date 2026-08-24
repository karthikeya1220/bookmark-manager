import { expect, test, beforeAll, afterAll } from "bun:test";
import { yoga } from "./server.ts";
import { prisma } from "./db.ts";

async function executeGraphQL(query: string, variables?: Record<string, unknown>) {
  const response = await yoga.fetch("http://localhost/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  return response.json();
}

beforeAll(async () => {
  // Clean up
  await prisma.bookmark.deleteMany();
  await prisma.folder.deleteMany();

  // Create test data
  await prisma.folder.create({
    data: {
      id: "f1",
      name: "Folder 1",
      bookmarks: {
        create: [
          { id: "b1", title: "B1", url: "http://b1.com" },
          { id: "b2", title: "B2", url: "http://b2.com" }
        ]
      }
    }
  });

  await prisma.folder.create({
    data: {
      id: "f2",
      name: "Folder 2",
      bookmarks: {
        create: [
          { id: "b3", title: "B3", url: "http://b3.com" }
        ]
      }
    }
  });
});

afterAll(async () => {
  await prisma.bookmark.deleteMany();
  await prisma.folder.deleteMany();
});

test("folders returns folders persisted in PostgreSQL in deterministic order", async () => {
  const query = `
    query {
      folders {
        id
        name
        createdAt
      }
    }
  `;
  const result = await executeGraphQL(query);
  expect(result.errors).toBeUndefined();
  expect(result.data.folders.length).toBe(2);
  expect(result.data.folders[0].id).toBe("f1");
  expect(result.data.folders[1].id).toBe("f2");
});

test("folder(id) returns the correct folder and its bookmarks", async () => {
  const query = `
    query {
      folder(id: "f1") {
        id
        name
        bookmarks {
          id
          title
          url
        }
      }
    }
  `;
  const result = await executeGraphQL(query);
  expect(result.errors).toBeUndefined();
  expect(result.data.folder.id).toBe("f1");
  expect(result.data.folder.name).toBe("Folder 1");
  expect(result.data.folder.bookmarks.length).toBe(2);
  
  const bookmarkIds = result.data.folder.bookmarks.map((b: { id: string }) => b.id);
  expect(bookmarkIds).toContain("b1");
  expect(bookmarkIds).toContain("b2");
  expect(bookmarkIds).not.toContain("b3");
});

test("folder(id) returns null for nonexistent ID", async () => {
  const query = `
    query {
      folder(id: "nonexistent") {
        id
      }
    }
  `;
  const result = await executeGraphQL(query);
  expect(result.errors).toBeUndefined();
  expect(result.data.folder).toBeNull();
});

test("GraphQL accepts valid query operations for unimplemented queries", async () => {
  const query = `
    query {
      bookmarks { nodes { id } pageInfo { hasNextPage } }
    }
  `;
  const result = await executeGraphQL(query);
  expect(result.errors).toBeDefined();
  expect(result.errors[0].message).toBe("Not implemented");
});

test("GraphQL accepts valid mutation operations", async () => {
  const mutation = `
    mutation TestMutations {
      createFolder(name: "New Folder") { id }
    }
  `;
  const result = await executeGraphQL(mutation);
  
  expect(result.errors).toBeDefined();
  expect(result.errors[0].message).toBe("Not implemented");
});

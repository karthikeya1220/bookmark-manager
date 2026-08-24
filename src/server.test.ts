import { expect, test } from "bun:test";
import { yoga } from "./server.ts";

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

test("health query returns ok", async () => {
  const result = await executeGraphQL("{ health }");
  expect(result.data.health).toBe("ok");
});

test("GraphQL accepts valid query operations", async () => {
  const query = `
    query TestQueries {
      folders { id name }
      folder(id: "123") { id name }
      bookmarks(take: 10, cursor: "abc") {
        nodes { id title url }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
  const result = await executeGraphQL(query);
  
  // We expect "Not implemented" errors because resolvers are stubs,
  // but it means the schema parsed and validated the query.
  expect(result.errors).toBeDefined();
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.errors[0].message).toBe("Not implemented");
});

test("GraphQL accepts valid mutation operations", async () => {
  const mutation = `
    mutation TestMutations {
      createFolder(name: "New Folder") { id }
      createBookmark(title: "Google", url: "https://google.com", folderId: "1") { id }
      updateBookmark(id: "1", title: "Updated") { id }
      deleteBookmark(id: "1")
      moveBookmark(id: "1", folderId: "2") { id }
    }
  `;
  const result = await executeGraphQL(mutation);
  
  expect(result.errors).toBeDefined();
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.errors[0].message).toBe("Not implemented");
});

test("GraphQL rejects malformed operations", async () => {
  const query = `
    query {
      folders {
        thisFieldDoesNotExist
      }
    }
  `;
  const result = await executeGraphQL(query);
  
  expect(result.errors).toBeDefined();
  // It should be a validation error, not our resolver "Not implemented" error.
  expect(result.errors[0].message).toContain("Cannot query field");
});

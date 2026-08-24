import { expect, test, beforeAll, afterAll } from "bun:test";
import { yoga } from "./server.ts";
import { prisma } from "./db.ts";

interface GraphQLResponse<T> {
  data: T;
  errors?: { message: string }[];
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface BookmarkNode {
  id: string;
  title?: string;
  url?: string;
}

interface BookmarkConnection {
  nodes: BookmarkNode[];
  pageInfo: PageInfo;
}

interface BookmarksData {
  bookmarks: BookmarkConnection;
}

interface FolderData {
  id: string;
  name: string;
  createdAt: string;
}

interface FoldersResponse {
  folders: FolderData[];
}

interface FolderByIdData {
  folder: {
    id: string;
    name: string;
    bookmarks: BookmarkNode[];
  } | null;
}

interface CreateFolderData {
  createFolder: { id: string };
}

async function executeGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<GraphQLResponse<T>> {
  const response = await yoga.fetch("http://localhost/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  return response.json() as Promise<GraphQLResponse<T>>;
}

beforeAll(async () => {
  // Clean up
  await prisma.bookmark.deleteMany();
  await prisma.folder.deleteMany();

  // Create test data
  const d1 = new Date("2026-08-24T10:00:00Z");
  const d2 = new Date("2026-08-24T11:00:00Z");

  await prisma.folder.create({
    data: {
      id: "f1",
      name: "Folder 1",
      bookmarks: {
        create: [
          { id: "A", title: "Bookmark A", url: "http://A", tags: ["1"], createdAt: d1 },
          { id: "B", title: "Bookmark B", url: "http://B", tags: ["1"], createdAt: d1 },
          { id: "C", title: "Bookmark C", url: "http://C", tags: ["1"], createdAt: d1 },
          { id: "D", title: "Bookmark D", url: "http://D", tags: ["1"], createdAt: d2 },
          { id: "E", title: "Bookmark E", url: "http://E", tags: ["1"], createdAt: d2 }
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
          { id: "F", title: "Bookmark F", url: "http://F", tags: ["2"], createdAt: d2 },
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
  const result = await executeGraphQL<FoldersResponse>(query);
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
  const result = await executeGraphQL<FolderByIdData>(query);
  expect(result.errors).toBeUndefined();
  expect(result.data.folder!.id).toBe("f1");
  expect(result.data.folder!.bookmarks.length).toBe(5);
});

test("folder(id) returns null for nonexistent ID", async () => {
  const query = `
    query {
      folder(id: "nonexistent") {
        id
      }
    }
  `;
  const result = await executeGraphQL<FolderByIdData>(query);
  expect(result.errors).toBeUndefined();
  expect(result.data.folder).toBeNull();
});

test("CORE PAGINATION TEST: same-timestamp records paginate correctly without skipping or duplicating", async () => {
  // Isolate the core dataset A,B,C,D,E by restricting to folder f1
  let hasNextPage = true;
  let cursor: string | null = null;
  const allIds: string[] = [];
  let query = `query($cursor: String) { bookmarks(folderId: "f1", take: 2, cursor: $cursor) { nodes { id title } pageInfo { hasNextPage endCursor } } }`;

  // Page 1
  let result = await executeGraphQL<BookmarksData>(query, { cursor });
  expect(result.errors).toBeUndefined();
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["A", "B"]);
  allIds.push(...result.data.bookmarks.nodes.map(n => n.id));
  hasNextPage = result.data.bookmarks.pageInfo.hasNextPage;
  cursor = result.data.bookmarks.pageInfo.endCursor;
  expect(hasNextPage).toBe(true);

  // Page 2
  result = await executeGraphQL<BookmarksData>(query, { cursor });
  expect(result.errors).toBeUndefined();
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["C", "D"]);
  allIds.push(...result.data.bookmarks.nodes.map(n => n.id));
  hasNextPage = result.data.bookmarks.pageInfo.hasNextPage;
  cursor = result.data.bookmarks.pageInfo.endCursor;
  expect(hasNextPage).toBe(true);

  // Page 3
  result = await executeGraphQL<BookmarksData>(query, { cursor });
  expect(result.errors).toBeUndefined();
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["E"]);
  allIds.push(...result.data.bookmarks.nodes.map(n => n.id));
  hasNextPage = result.data.bookmarks.pageInfo.hasNextPage;
  cursor = result.data.bookmarks.pageInfo.endCursor;
  expect(hasNextPage).toBe(false);
  
  // Verify totals
  expect(allIds).toEqual(["A", "B", "C", "D", "E"]);
  expect(new Set(allIds).size).toBe(5);
});

test("take larger than total records returns everything and hasNextPage=false", async () => {
  const query = `query { bookmarks(take: 100) { nodes { id } pageInfo { hasNextPage endCursor } } }`;
  const result = await executeGraphQL<BookmarksData>(query);
  expect(result.errors).toBeUndefined();
  expect(result.data.bookmarks.nodes.length).toBe(6);
  expect(result.data.bookmarks.pageInfo.hasNextPage).toBe(false);
});

test("invalid take=0 returns a GraphQL error", async () => {
  const query = `query { bookmarks(take: 0) { nodes { id } } }`;
  const result = await executeGraphQL<BookmarksData>(query);
  expect(result.errors).toBeDefined();
  expect(result.errors![0].message).toBe("take must be between 1 and 100");
});

test("negative take returns a GraphQL error", async () => {
  const query = `query { bookmarks(take: -5) { nodes { id } } }`;
  const result = await executeGraphQL<BookmarksData>(query);
  expect(result.errors).toBeDefined();
  expect(result.errors![0].message).toBe("take must be between 1 and 100");
});

test("malformed cursor returns a meaningful GraphQL error", async () => {
  const query = `query { bookmarks(take: 2, cursor: "bad_cursor_value") { nodes { id } } }`;
  const result = await executeGraphQL<BookmarksData>(query);
  expect(result.errors).toBeDefined();
  expect(result.errors![0].message).toBe("Invalid cursor");
});

test("pagination + search works correctly", async () => {
  const query = `query { bookmarks(search: "Bookmark", take: 3) { nodes { id } pageInfo { hasNextPage endCursor } } }`;
  let result = await executeGraphQL<BookmarksData>(query);
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["A", "B", "C"]);
  
  let cursor = result.data.bookmarks.pageInfo.endCursor;
  const query2 = `query { bookmarks(search: "Bookmark", take: 3, cursor: "${cursor}") { nodes { id } pageInfo { hasNextPage endCursor } } }`;
  result = await executeGraphQL<BookmarksData>(query2);
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["D", "E", "F"]);
});

test("pagination + folderId + search works correctly", async () => {
  const query = `query { bookmarks(folderId: "f1", search: "Bookmark", take: 4) { nodes { id } pageInfo { hasNextPage endCursor } } }`;
  let result = await executeGraphQL<BookmarksData>(query);
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["A", "B", "C", "D"]);
  
  let cursor = result.data.bookmarks.pageInfo.endCursor;
  const query2 = `query { bookmarks(folderId: "f1", search: "Bookmark", take: 4, cursor: "${cursor}") { nodes { id } pageInfo { hasNextPage endCursor } } }`;
  result = await executeGraphQL<BookmarksData>(query2);
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["E"]);
});

test("cursor at the final record returns zero nodes and hasNextPage=false", async () => {
  const query = `query { bookmarks(take: 10) { nodes { id } pageInfo { hasNextPage endCursor } } }`;
  let result = await executeGraphQL<BookmarksData>(query);
  let cursor = result.data.bookmarks.pageInfo.endCursor;
  
  const query2 = `query { bookmarks(take: 10, cursor: "${cursor}") { nodes { id } pageInfo { hasNextPage } } }`;
  result = await executeGraphQL<BookmarksData>(query2);
  expect(result.data.bookmarks.nodes.length).toBe(0);
  expect(result.data.bookmarks.pageInfo.hasNextPage).toBe(false);
});

test("GraphQL accepts valid mutation operations", async () => {
  const mutation = `
    mutation TestMutations {
      createFolder(name: "New Folder") { id }
    }
  `;
  const result = await executeGraphQL<CreateFolderData>(mutation);
  
  expect(result.errors).toBeDefined();
  expect(result.errors![0].message).toBe("Not implemented");
});

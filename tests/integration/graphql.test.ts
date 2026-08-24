import { expect, test, beforeAll, afterAll } from "bun:test";
import { yoga } from "../../src/server.ts";
import { prisma } from "../../src/db.ts";

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
  createFolder: { id: string; name: string };
}

interface CreateBookmarkData {
  createBookmark: { id: string; title: string; url: string; tags: string[] };
}

interface UpdateBookmarkData {
  updateBookmark: { title: string; url: string; tags: string[] };
}

interface DeleteBookmarkData {
  deleteBookmark: boolean;
}

interface MoveBookmarkData {
  moveBookmark: { id: string };
}

type GenericResponse = Record<string, unknown>;

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
  let cursor: string | null = null;
  const allIds: string[] = [];
  const query = `query($cursor: String) { bookmarks(folderId: "f1", take: 2, cursor: $cursor) { nodes { id title } pageInfo { hasNextPage endCursor } } }`;

  // Page 1
  let result = await executeGraphQL<BookmarksData>(query, { cursor });
  expect(result.errors).toBeUndefined();
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["A", "B"]);
  allIds.push(...result.data.bookmarks.nodes.map(n => n.id));
  cursor = result.data.bookmarks.pageInfo.endCursor;

  // Page 2
  result = await executeGraphQL<BookmarksData>(query, { cursor });
  expect(result.errors).toBeUndefined();
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["C", "D"]);
  allIds.push(...result.data.bookmarks.nodes.map(n => n.id));
  cursor = result.data.bookmarks.pageInfo.endCursor;

  // Page 3
  result = await executeGraphQL<BookmarksData>(query, { cursor });
  expect(result.errors).toBeUndefined();
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["E"]);
  allIds.push(...result.data.bookmarks.nodes.map(n => n.id));
  
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
  
  const cursor = result.data.bookmarks.pageInfo.endCursor;
  const query2 = `query { bookmarks(search: "Bookmark", take: 3, cursor: "${cursor}") { nodes { id } pageInfo { hasNextPage endCursor } } }`;
  result = await executeGraphQL<BookmarksData>(query2);
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["D", "E", "F"]);
});

test("pagination + folderId + search works correctly", async () => {
  const query = `query { bookmarks(folderId: "f1", search: "Bookmark", take: 4) { nodes { id } pageInfo { hasNextPage endCursor } } }`;
  let result = await executeGraphQL<BookmarksData>(query);
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["A", "B", "C", "D"]);
  
  const cursor = result.data.bookmarks.pageInfo.endCursor;
  const query2 = `query { bookmarks(folderId: "f1", search: "Bookmark", take: 4, cursor: "${cursor}") { nodes { id } pageInfo { hasNextPage endCursor } } }`;
  result = await executeGraphQL<BookmarksData>(query2);
  expect(result.data.bookmarks.nodes.map(n => n.id)).toEqual(["E"]);
});

test("cursor at the final record returns zero nodes and hasNextPage=false", async () => {
  const query = `query { bookmarks(take: 10) { nodes { id } pageInfo { hasNextPage endCursor } } }`;
  let result = await executeGraphQL<BookmarksData>(query);
  const cursor = result.data.bookmarks.pageInfo.endCursor;
  
  const query2 = `query { bookmarks(take: 10, cursor: "${cursor}") { nodes { id } pageInfo { hasNextPage } } }`;
  result = await executeGraphQL<BookmarksData>(query2);
  expect(result.data.bookmarks.nodes.length).toBe(0);
  expect(result.data.bookmarks.pageInfo.hasNextPage).toBe(false);
});

// CREATE FOLDER
test("createFolder creates folder successfully and trims name", async () => {
  const q = `mutation { createFolder(name: "  New Folder  ") { id name } }`;
  const result = await executeGraphQL<CreateFolderData>(q);
  expect(result.errors).toBeUndefined();
  expect(result.data.createFolder.name).toBe("New Folder");
});

test("createFolder rejects empty or whitespace name", async () => {
  const q = `mutation { createFolder(name: "   ") { id } }`;
  const result = await executeGraphQL<GenericResponse>(q);
  expect(result.errors).toBeDefined();
  expect(result.errors![0].message).toBe("Folder name cannot be empty");
});

// CREATE BOOKMARK
test("createBookmark creates valid bookmark and defaults tags", async () => {
  const q = `mutation { createBookmark(title: "  Valid Title ", url: "https://example.com", folderId: "f1") { id title url tags } }`;
  const result = await executeGraphQL<CreateBookmarkData>(q);
  expect(result.errors).toBeUndefined();
  expect(result.data.createBookmark.title).toBe("Valid Title");
  expect(result.data.createBookmark.url).toBe("https://example.com/");
  expect(result.data.createBookmark.tags).toEqual([]);
});

test("createBookmark stores supplied tags", async () => {
  const q = `mutation { createBookmark(title: "A", url: "http://a", tags: ["t1", "t2"], folderId: "f1") { id title url tags } }`;
  const result = await executeGraphQL<CreateBookmarkData>(q);
  expect(result.errors).toBeUndefined();
  expect(result.data.createBookmark.tags).toEqual(["t1", "t2"]);
});

test("createBookmark rejects empty title", async () => {
  const q = `mutation { createBookmark(title: "   ", url: "http://a", folderId: "f1") { id } }`;
  const result = await executeGraphQL<GenericResponse>(q);
  expect(result.errors).toBeDefined();
  expect(result.errors![0].message).toBe("Bookmark title cannot be empty");
});

test("createBookmark rejects malformed URL", async () => {
  const q = `mutation { createBookmark(title: "A", url: "not-a-url", folderId: "f1") { id } }`;
  const result = await executeGraphQL<GenericResponse>(q);
  expect(result.errors).toBeDefined();
  expect(result.errors![0].message).toBe("Invalid bookmark URL");
});

test("createBookmark rejects nonexistent folder", async () => {
  const q = `mutation { createBookmark(title: "A", url: "http://a", folderId: "bad-id") { id } }`;
  const result = await executeGraphQL<GenericResponse>(q);
  expect(result.errors).toBeDefined();
  expect(result.errors![0].message).toBe("Folder not found");
});

// UPDATE BOOKMARK
test("updateBookmark updates fields selectively", async () => {
  const createQ = `mutation { createBookmark(title: "Old", url: "http://old", tags: ["old"], folderId: "f1") { id title url tags } }`;
  const createRes = await executeGraphQL<CreateBookmarkData>(createQ);
  const id = createRes.data.createBookmark.id;

  const updateTitleQ = `mutation { updateBookmark(id: "${id}", title: "  New Title ") { title url tags } }`;
  let res = await executeGraphQL<UpdateBookmarkData>(updateTitleQ);
  expect(res.errors).toBeUndefined();
  expect(res.data.updateBookmark.title).toBe("New Title");
  expect(res.data.updateBookmark.url).toBe("http://old/");
  
  const updateUrlQ = `mutation { updateBookmark(id: "${id}", url: "https://new") { title url tags } }`;
  res = await executeGraphQL<UpdateBookmarkData>(updateUrlQ);
  expect(res.data.updateBookmark.url).toBe("https://new/");
  
  const updateTagsQ = `mutation { updateBookmark(id: "${id}", tags: ["new"]) { title url tags } }`;
  res = await executeGraphQL<UpdateBookmarkData>(updateTagsQ);
  expect(res.data.updateBookmark.tags).toEqual(["new"]);
});

test("updateBookmark rejects update with no fields", async () => {
  const q = `mutation { updateBookmark(id: "B") { id } }`;
  const res = await executeGraphQL<GenericResponse>(q);
  expect(res.errors).toBeDefined();
  expect(res.errors![0].message).toBe("No fields to update");
});

test("updateBookmark rejects explicit nulls", async () => {
  const q = `mutation { updateBookmark(id: "B", title: null) { id } }`;
  const res = await executeGraphQL<GenericResponse>(q);
  expect(res.errors).toBeDefined();
  expect(res.errors![0].message).toBe("Bookmark title cannot be empty");
});

test("updateBookmark rejects invalid title", async () => {
  const q = `mutation { updateBookmark(id: "B", title: "   ") { id } }`;
  const res = await executeGraphQL<GenericResponse>(q);
  expect(res.errors).toBeDefined();
  expect(res.errors![0].message).toBe("Bookmark title cannot be empty");
});

test("updateBookmark rejects nonexistent bookmark", async () => {
  const q = `mutation { updateBookmark(id: "bad-id", title: "New") { id } }`;
  const res = await executeGraphQL<GenericResponse>(q);
  expect(res.errors).toBeDefined();
  expect(res.errors![0].message).toBe("Bookmark not found");
});

// DELETE BOOKMARK
test("deleteBookmark deletes existing bookmark and returns true", async () => {
  const q = `mutation { deleteBookmark(id: "C") }`;
  const res = await executeGraphQL<DeleteBookmarkData>(q);
  expect(res.errors).toBeUndefined();
  expect(res.data.deleteBookmark).toBe(true);

  const q2 = `query { folder(id: "f1") { id name bookmarks { id } } }`;
  const res2 = await executeGraphQL<FolderByIdData>(q2);
  const ids = res2.data.folder!.bookmarks.map(b => b.id);
  expect(ids.includes("C")).toBe(false);
});

test("deleteBookmark rejects nonexistent bookmark", async () => {
  const q = `mutation { deleteBookmark(id: "bad-id") }`;
  const res = await executeGraphQL<GenericResponse>(q);
  expect(res.errors).toBeDefined();
  expect(res.errors![0].message).toBe("Bookmark not found");
});

// MOVE BOOKMARK
test("moveBookmark moves bookmark to existing folder", async () => {
  const q = `mutation { moveBookmark(id: "D", folderId: "f2") { id } }`;
  const res = await executeGraphQL<MoveBookmarkData>(q);
  expect(res.errors).toBeUndefined();

  const q1 = `query { folder(id: "f1") { id name bookmarks { id } } }`;
  const res1 = await executeGraphQL<FolderByIdData>(q1);
  expect(res1.data.folder!.bookmarks.map(b => b.id).includes("D")).toBe(false);

  const q2 = `query { folder(id: "f2") { id name bookmarks { id } } }`;
  const res2 = await executeGraphQL<FolderByIdData>(q2);
  expect(res2.data.folder!.bookmarks.map(b => b.id).includes("D")).toBe(true);
});

test("moveBookmark rejects nonexistent bookmark", async () => {
  const q = `mutation { moveBookmark(id: "bad-id", folderId: "f2") { id } }`;
  const res = await executeGraphQL<GenericResponse>(q);
  expect(res.errors).toBeDefined();
  expect(res.errors![0].message).toBe("Bookmark not found");
});

test("moveBookmark rejects nonexistent folder", async () => {
  const q = `mutation { moveBookmark(id: "E", folderId: "bad-id") { id } }`;
  const res = await executeGraphQL<GenericResponse>(q);
  expect(res.errors).toBeDefined();
  expect(res.errors![0].message).toBe("Folder not found");
  
  const q1 = `query { folder(id: "f1") { id name bookmarks { id } } }`;
  const res1 = await executeGraphQL<FolderByIdData>(q1);
  expect(res1.data.folder!.bookmarks.map(b => b.id).includes("E")).toBe(true);
});

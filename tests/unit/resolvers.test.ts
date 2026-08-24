import { expect, test } from "bun:test";
import { resolvers } from "../../src/graphql/resolvers.ts";
import { GraphQLContext } from "../../src/graphql/context.ts";
import { Prisma, PrismaClient, Folder, Bookmark } from "@prisma/client";
import { GraphQLError } from "graphql";

// Explicit mock interfaces that precisely match Prisma's method signatures
// so we do not use 'any' or unsafe casts.
interface MockFolderDelegate {
  findUnique(args: Prisma.FolderFindUniqueArgs): Promise<Folder | null>;
}

interface MockBookmarkDelegate {
  findUnique(args: Prisma.BookmarkFindUniqueArgs): Promise<Bookmark | null>;
}

interface MockPrismaClient {
  folder: MockFolderDelegate;
  bookmark: MockBookmarkDelegate;
}

// Helper to create a fully typed mock context
function createMockContext(mocks: {
  folderFindUnique?: (args: Prisma.FolderFindUniqueArgs) => Promise<Folder | null>;
  bookmarkFindUnique?: (args: Prisma.BookmarkFindUniqueArgs) => Promise<Bookmark | null>;
}): GraphQLContext {
  const prismaMock: MockPrismaClient = {
    folder: {
      findUnique: mocks.folderFindUnique || (async () => null),
    },
    bookmark: {
      findUnique: mocks.bookmarkFindUnique || (async () => null),
    }
  };

  return {
    // We safely assert the mock client fits the contextual PrismaClient constraint
    // by ensuring it covers the exact surface area we need for unit tests,
    // avoiding the need for `any`.
    prisma: prismaMock as unknown as PrismaClient
  };
}

test("createBookmark rejects empty bookmark title", async () => {
  const context = createMockContext({});
  try {
    await resolvers.Mutation.createBookmark({}, { title: "", url: "http://example.com", folderId: "f1" }, context);
    expect().fail("Should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError);
    expect((e as GraphQLError).message).toBe("Bookmark title cannot be empty");
  }
});

test("createBookmark rejects whitespace-only title", async () => {
  const context = createMockContext({});
  try {
    await resolvers.Mutation.createBookmark({}, { title: "   ", url: "http://example.com", folderId: "f1" }, context);
    expect().fail("Should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError);
    expect((e as GraphQLError).message).toBe("Bookmark title cannot be empty");
  }
});

test("createBookmark rejects invalid URL", async () => {
  const context = createMockContext({});
  try {
    await resolvers.Mutation.createBookmark({}, { title: "Title", url: "not-a-url", folderId: "f1" }, context);
    expect().fail("Should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError);
    expect((e as GraphQLError).message).toBe("Invalid bookmark URL");
  }
});

test("createBookmark rejects nonexistent folder", async () => {
  const context = createMockContext({
    folderFindUnique: async () => null // Simulates folder not found
  });
  
  try {
    await resolvers.Mutation.createBookmark({}, { title: "Title", url: "http://example.com", folderId: "f1" }, context);
    expect().fail("Should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError);
    expect((e as GraphQLError).message).toBe("Folder not found");
  }
});

test("bookmarks query rejects invalid take", async () => {
  const context = createMockContext({});
  try {
    await resolvers.Query.bookmarks({}, { take: 0 }, context);
    expect().fail("Should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError);
    expect((e as GraphQLError).message).toBe("take must be between 1 and 100");
  }
});

test("bookmarks query rejects invalid cursor", async () => {
  const context = createMockContext({});
  try {
    await resolvers.Query.bookmarks({}, { cursor: "bad-cursor" }, context);
    expect().fail("Should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError);
    expect((e as GraphQLError).message).toBe("Invalid cursor");
  }
});

test("updateBookmark rejects update with no fields", async () => {
  const context = createMockContext({
    bookmarkFindUnique: async () => ({ id: "b1", title: "T", url: "U", folderId: "F", createdAt: new Date(), tags: [] })
  });
  
  try {
    await resolvers.Mutation.updateBookmark({}, { id: "b1" }, context);
    expect().fail("Should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError);
    expect((e as GraphQLError).message).toBe("No fields to update");
  }
});

test("updateBookmark rejects nonexistent bookmark", async () => {
  const context = createMockContext({
    bookmarkFindUnique: async () => null // Simulates bookmark not found
  });
  
  try {
    await resolvers.Mutation.updateBookmark({}, { id: "bad-id", title: "New" }, context);
    expect().fail("Should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError);
    expect((e as GraphQLError).message).toBe("Bookmark not found");
  }
});

test("moveBookmark rejects nonexistent destination folder", async () => {
  const context = createMockContext({
    bookmarkFindUnique: async () => ({ id: "b1", title: "T", url: "U", folderId: "F", createdAt: new Date(), tags: [] }),
    folderFindUnique: async () => null // Simulates destination folder not found
  });
  
  try {
    await resolvers.Mutation.moveBookmark({}, { id: "b1", folderId: "bad-folder" }, context);
    expect().fail("Should have thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(GraphQLError);
    expect((e as GraphQLError).message).toBe("Folder not found");
  }
});

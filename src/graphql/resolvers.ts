import { GraphQLError } from 'graphql';
import { GraphQLContext } from './context.ts';
import { Folder, Bookmark, Prisma } from '@prisma/client';

type ParentFolder = Folder & { bookmarks?: Bookmark[] };
type ParentBookmark = Bookmark & { folder?: Folder };

const notImplemented = () => {
  throw new GraphQLError('Not implemented');
};

function encodeCursor(createdAt: Date, id: string): string {
  const payload = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function decodeCursor(cursor: string): { createdAt: Date, id: string } {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    if (!payload.createdAt || !payload.id) {
      throw new Error();
    }
    const createdAt = new Date(payload.createdAt);
    if (isNaN(createdAt.getTime())) {
      throw new Error();
    }
    return { createdAt, id: payload.id };
  } catch (e) {
    throw new GraphQLError('Invalid cursor');
  }
}

export const resolvers = {
  Query: {
    health: (_parent: unknown, _args: unknown, _context: GraphQLContext): string => {
      return 'ok';
    },
    folders: (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      return context.prisma.folder.findMany({
        orderBy: [
          { createdAt: 'asc' },
          { id: 'asc' }
        ]
      });
    },
    folder: (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      return context.prisma.folder.findUnique({
        where: { id: args.id }
      });
    },
    bookmarks: async (_parent: unknown, args: { folderId?: string, search?: string, take?: number, cursor?: string }, context: GraphQLContext) => {
      let take = args.take;
      if (take === undefined || take === null) {
        take = 20;
      }
      if (take <= 0 || take > 100) {
        throw new GraphQLError('take must be between 1 and 100');
      }

      const existingFilters: Prisma.BookmarkWhereInput = {};
      
      if (args.folderId) {
        existingFilters.folderId = args.folderId;
      }
      if (args.search) {
        existingFilters.title = {
          contains: args.search,
          mode: 'insensitive',
        };
      }

      let where: Prisma.BookmarkWhereInput = { ...existingFilters };

      if (args.cursor) {
        const decoded = decodeCursor(args.cursor);
        where = {
          AND: [
            existingFilters,
            {
              OR: [
                { createdAt: { gt: decoded.createdAt } },
                {
                  createdAt: decoded.createdAt,
                  id: { gt: decoded.id }
                }
              ]
            }
          ]
        };
      }

      const nodes = await context.prisma.bookmark.findMany({
        where,
        orderBy: [
          { createdAt: 'asc' },
          { id: 'asc' }
        ],
        take: take + 1
      });

      const hasNextPage = nodes.length > take;
      if (hasNextPage) {
        nodes.pop();
      }

      let endCursor: string | null = null;
      if (nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        endCursor = encodeCursor(lastNode.createdAt, lastNode.id);
      }

      return {
        nodes,
        pageInfo: {
          hasNextPage,
          endCursor
        }
      };
    },
  },
  Folder: {
    createdAt: (parent: Folder) => parent.createdAt.toISOString(),
    bookmarks: (parent: ParentFolder, _args: unknown, context: GraphQLContext) => {
      if (parent.bookmarks) {
        return parent.bookmarks;
      }
      return context.prisma.folder.findUnique({ where: { id: parent.id } }).bookmarks();
    }
  },
  Bookmark: {
    createdAt: (parent: Bookmark) => parent.createdAt.toISOString(),
    folder: (parent: ParentBookmark, _args: unknown, context: GraphQLContext) => {
      if (parent.folder) {
        return parent.folder;
      }
      return context.prisma.bookmark.findUnique({ where: { id: parent.id } }).folder();
    }
  },
  Mutation: {
    createFolder: notImplemented,
    createBookmark: notImplemented,
    updateBookmark: notImplemented,
    deleteBookmark: notImplemented,
    moveBookmark: notImplemented,
  }
};

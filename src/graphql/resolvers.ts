import { GraphQLError } from 'graphql';
import { GraphQLContext } from './context.ts';
import { Folder, Bookmark, Prisma } from '@prisma/client';

type ParentFolder = Folder & { bookmarks?: Bookmark[] };
type ParentBookmark = Bookmark & { folder?: Folder };

const notImplemented = () => {
  throw new GraphQLError('Not implemented');
};

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
      const where: Prisma.BookmarkWhereInput = {};
      
      if (args.folderId) {
        where.folderId = args.folderId;
      }
      if (args.search) {
        where.title = {
          contains: args.search,
          mode: 'insensitive',
        };
      }

      const nodes = await context.prisma.bookmark.findMany({
        where,
        orderBy: [
          { createdAt: 'asc' },
          { id: 'asc' }
        ]
      });

      return {
        nodes,
        pageInfo: {
          hasNextPage: false,
          endCursor: null
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

import { GraphQLError } from 'graphql';
import { GraphQLContext } from './context.ts';
import { Folder, Bookmark } from '@prisma/client';

type ParentFolder = Folder & { bookmarks?: Bookmark[] };

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
    bookmarks: notImplemented,
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
  },
  Mutation: {
    createFolder: notImplemented,
    createBookmark: notImplemented,
    updateBookmark: notImplemented,
    deleteBookmark: notImplemented,
    moveBookmark: notImplemented,
  }
};

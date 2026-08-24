import { GraphQLError } from 'graphql';
import { GraphQLContext } from './context.ts';

const notImplemented = () => {
  throw new GraphQLError('Not implemented');
};

export const resolvers = {
  Query: {
    health: (_parent: unknown, _args: unknown, _context: GraphQLContext): string => {
      return 'ok';
    },
    folders: notImplemented,
    folder: notImplemented,
    bookmarks: notImplemented,
  },
  Mutation: {
    createFolder: notImplemented,
    createBookmark: notImplemented,
    updateBookmark: notImplemented,
    deleteBookmark: notImplemented,
    moveBookmark: notImplemented,
  }
};

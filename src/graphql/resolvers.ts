import { GraphQLError } from 'graphql';
import { GraphQLContext } from './context.ts';
import { Folder, Bookmark, Prisma } from '@prisma/client';
import { validateTitle, validateUrl } from '../validation/bookmark.validation.ts';

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
    createFolder: async (_parent: unknown, args: { name: string }, context: GraphQLContext) => {
      let trimmed = '';
      if (args.name === null || args.name === undefined || (trimmed = args.name.trim()) === '') {
        throw new GraphQLError('Folder name cannot be empty');
      }
      return context.prisma.folder.create({
        data: { name: trimmed }
      });
    },
    
    createBookmark: async (_parent: unknown, args: { title: string, url: string, tags?: string[] | null, folderId: string }, context: GraphQLContext) => {
      const title = validateTitle(args.title);
      const url = validateUrl(args.url);
      
      const folder = await context.prisma.folder.findUnique({ where: { id: args.folderId } });
      if (!folder) {
        throw new GraphQLError('Folder not found');
      }
      
      return context.prisma.bookmark.create({
        data: {
          title,
          url,
          tags: args.tags || [],
          folderId: args.folderId
        }
      });
    },
    
    updateBookmark: async (_parent: unknown, args: { id: string, title?: string | null, url?: string | null, tags?: string[] | null }, context: GraphQLContext) => {
      const bookmark = await context.prisma.bookmark.findUnique({ where: { id: args.id } });
      if (!bookmark) {
        throw new GraphQLError('Bookmark not found');
      }

      if (args.title === undefined && args.url === undefined && args.tags === undefined) {
        throw new GraphQLError('No fields to update');
      }

      const data: Prisma.BookmarkUpdateInput = {};

      if (args.title !== undefined) {
        if (args.title === null) {
          throw new GraphQLError('Bookmark title cannot be empty');
        }
        data.title = validateTitle(args.title);
      }

      if (args.url !== undefined) {
        if (args.url === null) {
          throw new GraphQLError('Invalid bookmark URL');
        }
        data.url = validateUrl(args.url);
      }

      if (args.tags !== undefined) {
        if (args.tags === null) {
          throw new GraphQLError('Tags cannot be null');
        }
        data.tags = args.tags;
      }

      return context.prisma.bookmark.update({
        where: { id: args.id },
        data
      });
    },
    
    deleteBookmark: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      const bookmark = await context.prisma.bookmark.findUnique({ where: { id: args.id } });
      if (!bookmark) {
        throw new GraphQLError('Bookmark not found');
      }
      await context.prisma.bookmark.delete({ where: { id: args.id } });
      return true;
    },
    
    moveBookmark: async (_parent: unknown, args: { id: string, folderId: string }, context: GraphQLContext) => {
      const bookmark = await context.prisma.bookmark.findUnique({ where: { id: args.id } });
      if (!bookmark) {
        throw new GraphQLError('Bookmark not found');
      }
      
      const folder = await context.prisma.folder.findUnique({ where: { id: args.folderId } });
      if (!folder) {
        throw new GraphQLError('Folder not found');
      }

      return context.prisma.bookmark.update({
        where: { id: args.id },
        data: { folderId: args.folderId }
      });
    }
  }
};

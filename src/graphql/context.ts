import { PrismaClient } from '@prisma/client';
import { prisma } from '../db.ts';

export interface GraphQLContext {
  prisma: PrismaClient;
}

export function createContext(): GraphQLContext {
  return {
    prisma,
  };
}

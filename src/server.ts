import { createYoga, createSchema } from 'graphql-yoga';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolvers } from './graphql/resolvers.ts';
import { createContext } from './graphql/context.ts';

const schemaPath = join(process.cwd(), 'src', 'graphql', 'schema.graphql');
const typeDefs = readFileSync(schemaPath, 'utf8');

export const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
  context: createContext,
});

if (process.env.NODE_ENV !== 'test') {
  const server = Bun.serve({
    fetch: yoga,
    port: Number(process.env.PORT) || 3000,
  });

  console.info(
    `Server is running on ${new URL(
      yoga.graphqlEndpoint,
      `http://${server.hostname}:${server.port}`
    )}`
  );
}
